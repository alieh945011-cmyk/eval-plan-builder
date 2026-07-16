// 평가계획 상태 모델 — localStorage 자동저장, JSON 내보내기/불러오기
const KEY = 'evalPlan.v1';

export function newArea(name = '') {
  return {
    name, type: '논술형', points: 15, ratio: 15, isEssay: false, period: '',
    task: '', methods: [], codes: [],
    elements: [newElement()],
    basePoint: 5, nonParticipation: 4, longAbsence: 3
  };
}

export function newElement() {
  return { name: '', points: 8, levels: [{ score: 8, desc: '' }, { score: 6, desc: '' }, { score: 4, desc: '' }, { score: 2, desc: '' }] };
}

export function newExam(name) {
  return { name, select: 90, essay: 10, ratio: 25, codes: [], elements: '', period: '' };
}

export function defaultPlan() {
  return {
    version: 1,
    meta: { schoolYear: '2026', semester: 2, grade: 2, curriculum: '2022', subject: '', teacher: '' },
    standards: [],           // 선택된 성취기준 코드
    written: { ratio: 50, exams: [newExam('1차'), newExam('2차')], prevSchoolReflect: '' },
    performance: { ratio: 50, areas: [newArea('영역1')] },
    semesterLevels: {},      // 2022 학기 단위 성취수준 {A:.., B:..}
    generated: {}            // AI 생성 결과 보관
  };
}

export function loadPlan() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return Object.assign(defaultPlan(), JSON.parse(raw));
  } catch { /* 손상된 저장본은 무시 */ }
  return defaultPlan();
}

let saveTimer = null;
export function savePlan(plan) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(KEY, JSON.stringify(plan));
  }, 300);
}

export function resetPlan() {
  localStorage.removeItem(KEY);
}

export function exportPlanFile(plan) {
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const m = plan.meta;
  a.download = `평가계획_${m.schoolYear}-${m.semester}학기_${m.grade}학년_${m.subject || '과목'}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importPlanFile(file, onLoad) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const plan = Object.assign(defaultPlan(), JSON.parse(reader.result));
      onLoad(plan);
    } catch {
      alert('JSON 파일을 읽을 수 없습니다.');
    }
  };
  reader.readAsText(file, 'utf-8');
}

// ── 검증 룰 (양식 셀 주석 + 성취평가 방법론 유래) ──────────────
export function validatePlan(plan, subjectData) {
  const issues = [];  // {level: 'error'|'warn', msg}
  const w = plan.written, p = plan.performance;

  if (w.ratio + p.ratio !== 100)
    issues.push({ level: 'error', msg: `정기시험(${w.ratio}%) + 수행평가(${p.ratio}%) = ${w.ratio + p.ratio}% — 합계가 100%가 되어야 합니다.` });

  const examRatioSum = w.exams.reduce((s, e) => s + Number(e.ratio || 0), 0);
  if (w.exams.length && Math.abs(examRatioSum - w.ratio) > 0.01)
    issues.push({ level: 'error', msg: `정기시험 회차 비율 합(${examRatioSum}%)이 정기시험 반영비율(${w.ratio}%)과 다릅니다.` });

  const areaRatioSum = p.areas.reduce((s, a) => s + Number(a.ratio || 0), 0);
  if (p.areas.length && Math.abs(areaRatioSum - p.ratio) > 0.01)
    issues.push({ level: 'error', msg: `수행평가 영역 비율 합(${areaRatioSum}%)이 수행평가 반영비율(${p.ratio}%)과 다릅니다.` });

  p.areas.forEach(a => {
    if (Number(a.ratio) > 30)
      issues.push({ level: 'warn', msg: `[${a.name}] 반영비율 ${a.ratio}% — 한 영역이 30%를 초과하면 두 개 이상의 세부 영역으로 나누는 것이 권장됩니다.` });
    if (/\s/.test(a.name))
      issues.push({ level: 'warn', msg: `[${a.name}] 영역명에 띄어쓰기가 있습니다 — 양식 규칙상 띄어쓰기 없이 씁니다.` });
    const elemSum = a.elements.reduce((s, el) => s + Number(el.points || 0), 0);
    if (elemSum !== Number(a.points))
      issues.push({ level: 'error', msg: `[${a.name}] 평가요소 배점 합(${elemSum}점)이 영역 만점(${a.points}점)과 다릅니다.` });
    const bpMin = a.points * 0.2, bpMax = a.points * 0.4;
    if (a.basePoint < bpMin || a.basePoint > bpMax)
      issues.push({ level: 'warn', msg: `[${a.name}] 기본점수 ${a.basePoint}점 — 영역 만점의 20~40%(${Math.ceil(bpMin)}~${Math.floor(bpMax)}점) 범위가 권장됩니다.` });
    if (Number(a.nonParticipation) !== Number(a.basePoint) - 1 || Number(a.longAbsence) !== Number(a.basePoint) - 2)
      issues.push({ level: 'warn', msg: `[${a.name}] 미참여(기본점수-1)·장기결석(기본점수-2) 관례와 다릅니다.` });
    a.elements.forEach(el => {
      if (el.name && !/하기$/.test(el.name.trim()))
        issues.push({ level: 'warn', msg: `[${a.name}] 평가요소 "${el.name}" — 평가요소는 성취기준에서 추출해 "~하기" 형태로 씁니다.` });
      const scores = el.levels.map(l => Number(l.score));
      const gaps = scores.slice(1).map((s, i) => scores[i] - s);
      if (gaps.length > 1 && new Set(gaps).size > 1)
        issues.push({ level: 'warn', msg: `[${a.name}] "${el.name}" 급간 간격(${gaps.join(',')})이 균등하지 않습니다.` });
      if (scores.length && scores[0] !== Number(el.points))
        issues.push({ level: 'error', msg: `[${a.name}] "${el.name}" 최고 수준 점수(${scores[0]})가 요소 배점(${el.points})과 다릅니다.` });
    });
    if (!a.codes.length)
      issues.push({ level: 'warn', msg: `[${a.name}] 연결된 성취기준이 없습니다 — 4번 표와 6번 세부기준의 성취기준은 일치해야 합니다.` });
  });

  if (plan.meta.curriculum === '2022' && subjectData) {
    const banned = /(매우|다소|비교적)/;
    Object.entries(plan.semesterLevels).forEach(([lv, txt]) => {
      if (txt && banned.test(txt))
        issues.push({ level: 'warn', msg: `학기 단위 성취수준 ${lv}에 "매우/다소/비교적" — 주관적 부사로 수준을 구분하지 말고 빈도·정확성·일관성으로 진술합니다.` });
    });
  }
  return issues;
}
