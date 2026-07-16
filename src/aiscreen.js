// AI 추천·프롬프트 화면 (#ai) — ① 웹앱 직접 추천 ② 외부 AI용 프롬프트 ③ 보완 프롬프트
import { getPlan, getSubjectData, esc } from './editor.js';
import { savePlan } from './state.js';
import { buildRecommendPrompt, buildExternalPrompt, buildRefinePrompt } from './prompts.js';
import { aiGenerate, gasSettingsHtml, bindGasSettings, getGasUrl } from './ai.js';
import { loadSubject } from './data.js';

const REC_SCHEMA = {
  type: 'OBJECT',
  properties: {
    recommendations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          areaIndex: { type: 'INTEGER', description: '수행평가 영역 번호 (1부터)' },
          title: { type: 'STRING', description: '과제명' },
          overview: { type: 'STRING', description: '학생이 무엇을 수행하는지 2~3문장' },
          codes: { type: 'ARRAY', items: { type: 'STRING' }, description: '연결 성취기준 코드' },
          elements: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING', description: '평가요소 — ~하기 형태' },
                levels: { type: 'ARRAY', items: { type: 'STRING' }, description: '상위→하위 순 채점기준 진술' }
              },
              required: ['name', 'levels']
            }
          }
        },
        required: ['areaIndex', 'title', 'overview', 'codes', 'elements']
      }
    }
  },
  required: ['recommendations']
};

export async function renderAiScreen(el) {
  const plan = getPlan();
  let subjectData = getSubjectData();
  if (!subjectData && plan.meta.subject) {
    subjectData = await loadSubject(plan.meta.curriculum, plan.meta.subject);
  }
  if (!subjectData || !plan.standards.length) {
    el.innerHTML = `<div class="card"><h2>AI 추천·프롬프트</h2>
      <div class="notice notice-warn">먼저 편집기에서 과목·성취기준·수행평가 영역을 설정하세요.</div>
      ${gasSettingsHtml()}
      <p><a href="#">← 편집기로 돌아가기</a></p></div>`;
    bindGasSettings(el);
    return;
  }

  el.innerHTML = `
    <div class="card">
      <h2>수행평가 AI 추천</h2>
      <p>현재 설계(영역·배점·성취기준)를 근거로 수행평가 과제를 추천받고, 마음에 들면 바로 6번 세부기준에 반영합니다.</p>
      ${gasSettingsHtml()}
      <p>
        <button class="btn btn-primary" id="ai-rec">이 웹앱에서 바로 추천받기</button>
        <span id="ai-status" style="font-size:14px"></span>
      </p>
      <div id="ai-recs"></div>
    </div>

    <div class="card">
      <h2>외부 생성형 AI 활용</h2>
      <p>ChatGPT·Claude·Gemini 등 쓰시던 AI에 붙여넣을 완성 프롬프트를 만들어 드립니다. 2단계 워크플로(추천 → 선택 → 채점기준표 생성)가 포함됩니다.</p>
      <p><button class="btn btn-navy" id="ai-copy-ext">외부 AI용 프롬프트 복사</button></p>
      <h3 style="margin:18px 0 6px">추천이 마음에 안 들 때 — 보완 프롬프트</h3>
      <p style="font-size:14px;color:var(--gray-600)">이전 AI의 결과와 아쉬운 점을 적으면, 다른 AI에 이어서 물어볼 후속 프롬프트를 조립합니다.</p>
      <label class="field">이전 AI가 준 추천 결과 (붙여넣기)
        <textarea id="ai-prev" rows="4" placeholder="이전 결과를 그대로 붙여넣으세요"></textarea>
      </label>
      <label class="field">아쉬운 점·바꾸고 싶은 방향
        <textarea id="ai-complaint" rows="3" placeholder="예) 모둠활동 말고 개인 과제로. 채점기준이 너무 추상적임. 수업 2차시 안에 끝나는 과제로."></textarea>
      </label>
      <p><button class="btn btn-navy" id="ai-copy-refine">보완 프롬프트 복사</button>
      <span id="ai-status2" style="font-size:14px"></span></p>
      <p><a href="#">← 편집기</a> · <a href="#preview">미리보기·내보내기 →</a></p>
    </div>`;

  bindGasSettings(el);
  const status = el.querySelector('#ai-status');

  el.querySelector('#ai-copy-ext').addEventListener('click', async () => {
    await navigator.clipboard.writeText(buildExternalPrompt(plan, subjectData));
    el.querySelector('#ai-status2').textContent = '복사됨 — 사용 중인 AI에 붙여넣으세요.';
  });

  el.querySelector('#ai-copy-refine').addEventListener('click', async () => {
    const prev = el.querySelector('#ai-prev').value.trim();
    const complaint = el.querySelector('#ai-complaint').value.trim();
    if (!complaint) { el.querySelector('#ai-status2').textContent = '아쉬운 점을 먼저 적어주세요.'; return; }
    await navigator.clipboard.writeText(
      buildRefinePrompt(plan, subjectData, prev || '(이전 결과 미첨부)', complaint));
    el.querySelector('#ai-status2').textContent = '보완 프롬프트 복사됨.';
  });

  el.querySelector('#ai-rec').addEventListener('click', async () => {
    if (!getGasUrl()) { status.textContent = '먼저 AI 서버(GAS) 연결 설정을 완료하세요.'; return; }
    status.textContent = '추천 생성 중… (10~40초)';
    el.querySelector('#ai-rec').disabled = true;
    try {
      const prompt = buildRecommendPrompt(plan, subjectData)
        + '\n\n각 영역(areaIndex)마다 2~3개의 추천을 recommendations 배열로 출력하세요. levels 배열은 상위 수준부터 하위 수준 순서입니다.';
      const out = await aiGenerate(prompt, REC_SCHEMA, 0.7);
      const recs = JSON.parse(out.text).recommendations || [];
      plan.generated.recommendations = recs;
      savePlan(plan);
      renderRecs(el, plan, recs);
      status.textContent = `추천 ${recs.length}건 생성 (${out.model})`;
    } catch (e) {
      status.textContent = `실패: ${e.message}`;
    } finally {
      el.querySelector('#ai-rec').disabled = false;
    }
  });

  if (plan.generated.recommendations) renderRecs(el, plan, plan.generated.recommendations);
}

function renderRecs(el, plan, recs) {
  const box = el.querySelector('#ai-recs');
  box.innerHTML = recs.map((r, ri) => `
    <div style="border:1.5px solid var(--gray-300);border-radius:10px;padding:14px;margin-bottom:10px">
      <div style="font-weight:700;color:var(--navy-700)">
        [${r.areaIndex}영역] ${esc(r.title)}
      </div>
      <p style="margin:6px 0;font-size:14px">${esc(r.overview)}</p>
      <p style="margin:6px 0;font-size:13px;color:var(--gray-600)">성취기준: ${r.codes.map(esc).join(', ')}</p>
      ${r.elements.map(e2 => `
        <div style="font-size:14px;margin:4px 0"><b>· ${esc(e2.name)}</b>
          <ol style="margin:2px 0 6px 22px;padding:0">${e2.levels.map(lv => `<li>${esc(lv)}</li>`).join('')}</ol>
        </div>`).join('')}
      <button class="btn btn-primary" data-adopt="${ri}">이 추천을 6번 세부기준에 반영</button>
    </div>`).join('');

  box.querySelectorAll('[data-adopt]').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = recs[Number(btn.dataset.adopt)];
      const area = plan.performance.areas[r.areaIndex - 1];
      if (!area) { alert(`영역 ${r.areaIndex}이(가) 없습니다. 편집기에서 영역을 먼저 만드세요.`); return; }
      area.task = `∘ ${r.title} — ${r.overview}`;
      area.codes = r.codes.map(c => c.replace(/[\[\]]/g, ''));
      area.elements = r.elements.map(e2 => {
        // 배점은 교사 몫 — 급간 수에 맞춰 균등 분할 초안만 제공
        const n = e2.levels.length;
        const top = Math.max(4, n * 2);
        return {
          name: e2.name,
          points: top,
          levels: e2.levels.map((d, i2) => ({ score: top - i2 * 2, desc: d }))
        };
      });
      savePlan(plan);
      btn.textContent = '반영 완료 — 편집기에서 배점을 다듬어 주세요';
      btn.disabled = true;
    });
  });
}
