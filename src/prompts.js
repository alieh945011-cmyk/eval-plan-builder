// AI 프롬프트 템플릿 — 학기 단위 성취수준 생성, 수행평가 추천, 외부 AI용 프롬프트 조립
// 근거: 『중학교 성취평가 이렇게 실천해요』(경기도교육청) 방법론 + 학교 양식 셀 주석 규칙

export const STATEMENT_MODES = {
  standard: '성취기준별 통합 — 같은 수준(A끼리, B끼리…)의 성취기준별 진술을 내용 요소 중심으로 통합',
  merge: '범주별 병합 — 지식·이해/과정·기능/가치·태도 세 범주 내용을 그대로 병합',
  restructure: '재구성 — 동일한 문장 구조는 한 문장으로 결합하고 중복 표현을 1회로 병합',
  competency: '교과 역량 중심 — 내용 요소를 교과 역량별로 재조직'
};

const COMMON_RULES = `[진술 원칙 — 반드시 지킬 것]
1. 성취기준이 제시한 범위를 벗어나지 않는다. 원문에 없는 내용을 만들지 않는다.
2. 관찰 가능한 외현 동사로 진술하고, 모든 문장은 "~할 수 있다" 계열로 종결한다.
3. "매우/다소/비교적" 같은 주관적 부사로 수준을 구분하지 않는다. 수행의 빈도·정확성·일관성·자율성(안내된 절차에 따라 등)으로 구분한다.
4. 상위 수준일수록 통합 범위·주체성·창의성이 커지고, 하위 수준(D·E)은 "부분적으로/제한적으로/간단한/안내된 절차에 따라"로 범위를 좁힌다.
5. 인접 수준 간 질적 차이가 분명해야 하며, 수준 간 위계가 단조적으로 유지되어야 한다.
6. 등급 표현("매우 우수함" 등)은 쓰지 않는다.`;

export function buildSemesterLevelPrompt(plan, subjectData, mode = 'standard') {
  const levels = subjectData.levels;
  const selected = subjectData.domains.flatMap(d =>
    d.standards.filter(s => plan.standards.includes(s.code + (s.subLabel ? `-${s.subLabel}` : '')))
      .map(s => ({ ...s, domain: d.name })));
  const list = selected.map((s, i) => {
    const lv = Object.entries(s.levels || {}).map(([k, v]) => `  ${k}: ${v}`).join('\n');
    return `${i + 1}. [${s.code}] ${s.text}\n${lv}`;
  }).join('\n\n');

  return `당신은 2022 개정 교육과정과 성취평가제 전문가입니다.
중학교 ${plan.meta.grade}학년 ${plan.meta.subject} ${plan.meta.semester}학기의 "학기 단위 성취수준"을 작성합니다.

[과업]
아래 ${selected.length}개 성취기준의 성취기준별 성취수준을 종합하여, 학기 전체를 포괄하는 학기 단위 성취수준을 ${levels.join('·')} ${levels.length}단계로 작성하세요.

[작성 방식]
${STATEMENT_MODES[mode]}

[성취기준별 성취수준 (원문)]
${list}

${COMMON_RULES}

[출력 형식 — 정확히 지킬 것]
JSON 객체 하나만 출력합니다. 키는 ${levels.map(l => `"${l}"`).join(', ')}이고 값은 해당 수준의 진술문(등급당 4~8문장, 하나의 자연스러운 문단)입니다. JSON 외 다른 텍스트를 출력하지 마세요.`;
}

export function buildRecommendPrompt(plan, subjectData) {
  const m = plan.meta;
  const areas = plan.performance.areas.map((a, i) =>
    `${i + 1}. ${a.name || `영역${i + 1}`} — 유형: ${a.type}, 만점 ${a.points}점, 반영 ${a.ratio}%, 논술형 ${a.isEssay ? '포함' : '미포함'}, 시기 ${a.period || '미정'}, 연결 성취기준: ${a.codes.join(', ') || '(미지정 — 추천 시 지정할 것)'}`).join('\n');
  const stds = subjectData.domains.flatMap(d =>
    d.standards.filter(s => plan.standards.includes(s.code + (s.subLabel ? `-${s.subLabel}` : '')))
      .map(s => `- [${s.code}] ${s.text}`)).join('\n');

  return `당신은 중학교 ${m.subject} 교사의 수행평가 설계를 돕는 전문가입니다. (${m.curriculum} 개정 교육과정, ${m.grade}학년 ${m.semester}학기)

[이번 학기 성취기준]
${stds}

[수행평가 영역 구조 (점수 구조는 확정, 과제 내용을 추천할 것)]
${areas}

[과업]
각 영역에 대해 수행평가 과제를 2~3개씩 추천하세요. 각 추천은 다음을 포함합니다.
1. 과제명과 개요 (학생이 무엇을 수행하는지 구체적으로)
2. 연결 성취기준 코드
3. 평가요소 목록 — 반드시 성취기준에서 추출하고 "~하기" 형태로 표현
4. 평가요소별 채점기준 초안 — 급간은 균등하게, 관찰 가능한 산출물·정확도 기준으로 수준 구분
5. E수준(최소 성취) 학생도 일정 수준 수행 가능한 설계인지 확인

[제약]
- 평가요소는 성취기준 범위를 벗어나지 않는다.
- 부차적 기능(과한 읽기량, 도구 사용 등)을 요구하지 않는다.
- AI 대필이 어려운, 수업 중 과정 확인이 가능한 과제를 우선한다.`;
}

// 구상 단계 프롬프트 — 점수 구조가 정해지기 전, 과제 아이디어 자체를 탐색
export function buildIdeatePrompt(plan, subjectData, memo) {
  const m = plan.meta;
  const stds = subjectData.domains.flatMap(d =>
    d.standards.filter(s => plan.standards.includes(s.code + (s.subLabel ? `-${s.subLabel}` : '')))
      .map(s => `- [${s.code}] ${s.text}`)).join('\n');

  return `당신은 중학교 ${m.subject} 교사의 수행평가 구상을 돕는 전문가입니다. (${m.curriculum} 개정 교육과정, ${m.grade}학년 ${m.semester}학기)
아직 평가 횟수·배점은 정하지 않았습니다. 지금은 "어떤 수행평가를 할지" 아이디어를 넓게 탐색하는 단계입니다.

[이번 학기 성취기준]
${stds || '(성취기준 미선택 — 과목 전체에서 적합한 것을 골라 제안할 것)'}

[교사가 생각하는 방향·조건]
${memo || '(특별한 조건 없음)'}

[과업]
서로 성격이 다른 수행평가 과제 후보를 5개 제안하세요. 후보마다 다음을 포함합니다.
1. 과제명 (띄어쓰기 없이 짧게, 예: 순환소수탐구보고서)
2. 개요 — 학생이 무엇을 수행하고 무엇을 제출하는지 2~3문장
3. 평가 유형 (논술형/프로젝트/포트폴리오/실험·실습/구술·발표/토의·토론 중)
4. 연결 성취기준 코드
5. 추천 이유 — 이 성취기준 도달의 증거로 왜 적합한지 1~2문장

[제약]
- 과제는 성취기준 범위를 벗어나지 않는다.
- AI 대필이 어렵고 수업 중 과정 확인이 가능한 과제를 우선한다.
- E수준(최소 성취) 학생도 일정 수준 수행 가능해야 한다.
- 다섯 후보는 유형·활동 방식이 겹치지 않게 다양하게 구성한다.`;
}

// 외부 AI(ChatGPT·Claude·Gemini)용 완성 프롬프트 — 벤치마킹 앱의 2단계 워크플로 확장
export function buildExternalPrompt(plan, subjectData) {
  const rec = buildRecommendPrompt(plan, subjectData);
  return `${rec}

[진행 방식 — 2단계]
1단계: 위 추천을 번호 목록으로 제시하세요.
2단계: 제가 영역별로 원하는 번호를 고르면(예: "1영역=2번, 2영역=1번"), 선택된 과제만으로 아래 산출물을 완성하세요.
- 평가계획 총괄표 (영역·성취기준·평가요소·배점·시기)
- 영역별 채점기준표 (평가요소 | 수행수준(채점기준) | 배점) — 기본점수·미참여·장기결석 보정점수 행 포함
- 셀 서식 없는 표 형태로, 한글(HWP)에 붙여넣기 좋게 출력

${COMMON_RULES}`;
}

// 보완 프롬프트 — 추천이 마음에 들지 않을 때 다른 AI에 이어서 물어볼 후속 프롬프트
export function buildRefinePrompt(plan, subjectData, previousResult, complaints) {
  return `${buildRecommendPrompt(plan, subjectData)}

[이전 AI의 추천 결과]
${previousResult}

[위 결과에서 보완할 점 (교사 피드백)]
${complaints}

[과업]
교사 피드백을 반영하여 수행평가 과제를 다시 추천하세요. 이전 결과에서 유지할 만한 부분은 유지하되, 피드백과 충돌하는 부분은 반드시 수정하세요. 무엇을 왜 바꿨는지 한 줄씩 밝혀 주세요.`;
}
