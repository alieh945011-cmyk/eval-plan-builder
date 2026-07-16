// 학기 단위 성취수준 화면 (#semester) — 성취기준별 성취수준을 모아 AI로 종합, 검증 후 채택
import { getPlan, getSubjectData, esc } from './editor.js';
import { savePlan } from './state.js';
import { buildSemesterLevelPrompt, STATEMENT_MODES } from './prompts.js';
import { aiGenerate, gasSettingsHtml, bindGasSettings, getGasUrl } from './ai.js';
import { loadSubject } from './data.js';

const BANNED = /(매우|다소|비교적)/g;       // 하이라이트용 (replace)
const BANNED_TEST = /(매우|다소|비교적)/;   // 감지용 — g 플래그는 test()에서 상태를 남겨 오작동

export async function renderSemester(el) {
  const plan = getPlan();
  let subjectData = getSubjectData();
  if (!subjectData && plan.meta.subject) {
    subjectData = await loadSubject(plan.meta.curriculum, plan.meta.subject);
  }
  if (plan.meta.curriculum !== '2022') {
    el.innerHTML = `<div class="card"><h2>학기 단위 성취수준</h2>
      <div class="notice notice-warn">학기 단위 성취수준은 2022 개정(1·2학년) 전용입니다. 3학년(2015 개정)은 상·중·하 평가기준을 그대로 사용합니다.</div>
      <p><a href="#">← 편집기로 돌아가기</a></p></div>`;
    return;
  }
  if (!subjectData || !plan.standards.length) {
    el.innerHTML = `<div class="card"><h2>학기 단위 성취수준</h2>
      <div class="notice notice-warn">먼저 편집기에서 과목과 이번 학기 성취기준을 선택하세요.</div>
      <p><a href="#">← 편집기로 돌아가기</a></p></div>`;
    return;
  }

  const levels = subjectData.levels;
  const selected = subjectData.domains.flatMap(d =>
    d.standards.filter(s => plan.standards.includes(s.code + (s.subLabel ? `-${s.subLabel}` : ''))));

  el.innerHTML = `
    <div class="card">
      <h2>학기 단위 성취수준 (3-나) — ${plan.meta.subject} ${plan.meta.semester}학기 · ${selected.length}개 성취기준 종합</h2>
      <p>성취기준별 성취수준을 같은 수준끼리(A끼리, B끼리…) 모아 종합합니다. 아래에서 진술 방식을 고르고 생성하세요.</p>
      ${gasSettingsHtml()}
      <label class="field">진술 방식
        <select id="sem-mode">
          ${Object.entries(STATEMENT_MODES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
      </label>
      <p>
        <button class="btn btn-primary" id="sem-gen">AI로 생성 (약 10~30초)</button>
        <button class="btn btn-ghost" id="sem-copy-prompt">외부 AI용 프롬프트 복사</button>
        <span id="sem-status" style="font-size:14px"></span>
      </p>
      <div id="sem-result">${resultHtml(plan, levels)}</div>
      <div class="notice notice-warn" style="margin-top:12px">
        생성 결과는 초안입니다. ① 성취기준 범위 이탈 여부 ② 수준 간 위계 ③ 진술 일관성 ④ 명료성(관찰 가능 동사, "~할 수 있다" 종결)을 검토·수정 후 사용하세요.
        <mark style="background:#ffe08a">노란 표시</mark>는 "매우/다소/비교적" — 수준 구분에 쓰지 말아야 할 표현입니다.
      </div>
    </div>

    <div class="card">
      <h2>성취기준별 성취수준 (근거 자료)</h2>
      <div class="tbl-wrap"><table class="plan">
        <tr><th style="width:200px">성취기준</th><th style="width:36px">수준</th><th>진술</th></tr>
        ${selected.map(s => {
          const entries = levels.filter(lv => s.levels[lv]).map(lv => [lv, s.levels[lv]]);
          return entries.map(([lv, txt], i) => `
            <tr>${i === 0 ? `<td class="left" rowspan="${entries.length}"><b>[${s.code}]</b> ${esc(s.text)}</td>` : ''}
            <td><b>${lv}</b></td><td class="left">${esc(txt)}</td></tr>`).join('');
        }).join('')}
      </table></div>
      <p><a href="#">← 편집기</a> · <a href="#preview">미리보기·내보내기 →</a></p>
    </div>`;

  bindGasSettings(el);

  el.querySelector('#sem-copy-prompt').addEventListener('click', async () => {
    const mode = el.querySelector('#sem-mode').value;
    const prompt = buildSemesterLevelPrompt(plan, subjectData, mode)
      + '\n\n(참고: JSON 대신 "A: …" 형식의 일반 텍스트로 답해도 됩니다.)';
    await navigator.clipboard.writeText(prompt);
    el.querySelector('#sem-status').textContent = '프롬프트가 복사되었습니다. ChatGPT·Claude 등에 붙여넣으세요.';
  });

  el.querySelector('#sem-gen').addEventListener('click', async () => {
    const status = el.querySelector('#sem-status');
    if (!getGasUrl()) { status.textContent = '먼저 위의 AI 서버(GAS) 연결 설정을 완료하세요.'; return; }
    const mode = el.querySelector('#sem-mode').value;
    const prompt = buildSemesterLevelPrompt(plan, subjectData, mode);
    const schema = {
      type: 'OBJECT',
      properties: Object.fromEntries(levels.map(lv => [lv, { type: 'STRING' }])),
      required: levels
    };
    status.textContent = '생성 중… (모델 응답을 기다리는 중)';
    el.querySelector('#sem-gen').disabled = true;
    try {
      const out = await aiGenerate(prompt, schema, 0.6);
      const parsed = JSON.parse(out.text);
      levels.forEach(lv => { if (parsed[lv]) plan.semesterLevels[lv] = parsed[lv]; });
      savePlan(plan);
      el.querySelector('#sem-result').innerHTML = resultHtml(plan, levels);
      bindResult(el, plan);
      status.textContent = `생성 완료 (${out.model}) — 아래에서 검토·수정하세요.`;
    } catch (e) {
      status.textContent = `실패: ${e.message}`;
    } finally {
      el.querySelector('#sem-gen').disabled = false;
    }
  });

  bindResult(el, plan);
}

function resultHtml(plan, levels) {
  return levels.map(lv => {
    const txt = plan.semesterLevels[lv] || '';
    const marked = esc(txt).replace(BANNED, m => `<mark style="background:#ffe08a">${m}</mark>`);
    return `
      <div style="display:flex;gap:10px;margin-bottom:10px;align-items:stretch">
        <div style="min-width:44px;display:flex;align-items:center;justify-content:center;background:var(--grade-${lv.toLowerCase()});color:#fff;font-weight:800;border-radius:8px">${lv}</div>
        <div style="flex:1">
          <textarea data-sem="${lv}" rows="3" placeholder="${lv} 수준 진술 (생성 전)">${esc(txt)}</textarea>
          ${BANNED_TEST.test(txt) ? `<div style="font-size:13px;color:#7a5200;margin-top:2px">금지어 감지: ${marked}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function bindResult(el, plan) {
  el.querySelectorAll('[data-sem]').forEach(ta => {
    ta.addEventListener('change', () => {
      plan.semesterLevels[ta.dataset.sem] = ta.value;
      savePlan(plan);
    });
  });
}
