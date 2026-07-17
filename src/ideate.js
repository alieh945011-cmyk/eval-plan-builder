// 수행평가 구상 화면 (첫 화면) — 배점·양식 이전에 "무엇을 평가할지" 아이디어를 탐색한다
import { loadIndex, loadSubject } from './data.js';
import { savePlan, newArea } from './state.js';
import { getPlan, esc } from './editor.js';
import { buildIdeatePrompt } from './prompts.js';
import { aiGenerate, gasSettingsHtml, bindGasSettings, getGasUrl } from './ai.js';

const GRADE_CURRICULUM = { 1: '2022', 2: '2022', 3: '2015' };
const TYPES = ['논술형', '프로젝트', '포트폴리오', '실험·실습', '구술·발표', '토의·토론', '기타'];

const IDEA_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ideas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: '과제명 — 띄어쓰기 없이 짧게' },
          overview: { type: 'STRING', description: '학생이 무엇을 수행·제출하는지 2~3문장' },
          evalType: { type: 'STRING', description: '논술형/프로젝트/포트폴리오/실험·실습/구술·발표/토의·토론 중 하나' },
          codes: { type: 'ARRAY', items: { type: 'STRING' }, description: '연결 성취기준 코드' },
          rationale: { type: 'STRING', description: '추천 이유 1~2문장' }
        },
        required: ['title', 'overview', 'evalType', 'codes', 'rationale']
      }
    }
  },
  required: ['ideas']
};

let plan = null;
let index = null;
let subjectData = null;
let rootEl = null;

export async function renderIdeate(el) {
  rootEl = el;
  plan = getPlan();
  plan.ideas ||= [];
  plan.ideaMemo ||= '';
  if (!index) index = await loadIndex();
  const { curriculum, subject } = plan.meta;
  subjectData = subject && index[curriculum].some(s => s.subject === subject)
    ? await loadSubject(curriculum, subject) : null;
  render();
}

function stdKey(s) { return s.code + (s.subLabel ? `-${s.subLabel}` : ''); }

function render() {
  const m = plan.meta;
  const subjects = index[m.curriculum];
  rootEl.innerHTML = `
  <div class="card">
    <h2><span class="step-no">⓪</span>수행평가 구상 — 무엇을 평가할지 먼저 고민하기</h2>
    <p>배점·비율은 나중입니다. 이번 학기 성취기준을 보며 과제 아이디어를 넓게 모으고, 마음에 드는 것을 채택하면 그대로 편집기의 수행평가 영역이 됩니다.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
      <label class="field">학년
        <select id="id-grade">${[1, 2, 3].map(g =>
          `<option value="${g}" ${m.grade === g ? 'selected' : ''}>${g}학년 (${GRADE_CURRICULUM[g]} 개정)</option>`).join('')}</select>
      </label>
      <label class="field">학기
        <select id="id-sem">${[1, 2].map(s2 =>
          `<option value="${s2}" ${m.semester === s2 ? 'selected' : ''}>${s2}학기</option>`).join('')}</select>
      </label>
      <label class="field">과목
        <select id="id-subject">
          <option value="">과목 선택…</option>
          ${subjects.map(s2 => `<option ${m.subject === s2.subject ? 'selected' : ''}>${s2.subject}</option>`).join('')}
        </select>
      </label>
    </div>
    ${subjectData ? standardsHtml() : '<div class="notice notice-warn">과목을 선택하면 성취기준이 나타납니다.</div>'}
    <label class="field" style="margin-top:10px">어떤 방향이면 좋을지 자유롭게 메모 (선택)
      <textarea id="id-memo" rows="2" placeholder="예) 모둠 말고 개인 과제로, 2차시 안에 끝나게, 실생활 소재로, 글쓰기 부담은 낮게…">${esc(plan.ideaMemo)}</textarea>
    </label>
  </div>

  <div class="card">
    <h2>아이디어 모으기</h2>
    ${gasSettingsHtml()}
    <p>
      <button class="btn btn-primary" id="id-ai" ${subjectData ? '' : 'disabled'}>이 웹앱 AI에게 후보 5개 받기</button>
      <button class="btn btn-navy" id="id-copy" ${subjectData ? '' : 'disabled'}>외부 AI용 구상 프롬프트 복사</button>
      <span id="id-status" style="font-size:14px"></span>
    </p>
    <details style="margin:8px 0">
      <summary style="cursor:pointer;font-weight:600;color:var(--navy-700)">외부 AI 답변 붙여넣기 → 후보 카드로 자동 변환 (GAS 연결 필요)</summary>
      <textarea id="id-paste" rows="5" placeholder="ChatGPT 등에서 받은 추천 답변을 통째로 붙여넣으세요"></textarea>
      <p><button class="btn btn-ghost" id="id-structure">카드로 변환</button></p>
    </details>
    <details style="margin:8px 0">
      <summary style="cursor:pointer;font-weight:600;color:var(--navy-700)">직접 후보 추가 (AI 없이)</summary>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
        <label class="field">과제명(띄어쓰기 없이) <input type="text" id="id-new-title"></label>
        <label class="field">유형 <select id="id-new-type">${TYPES.map(t => `<option>${t}</option>`).join('')}</select></label>
      </div>
      <label class="field">개요 <textarea id="id-new-overview" rows="2"></textarea></label>
      <p><button class="btn btn-ghost" id="id-add">후보 추가</button></p>
    </details>
  </div>

  <div class="card">
    <h2>후보 카드 (${plan.ideas.length}개 · 채택 ${plan.ideas.filter(i => i.status === 'adopted').length}개)</h2>
    ${plan.ideas.length ? '' : '<p style="color:var(--gray-600)">아직 후보가 없습니다. 위에서 AI에게 받거나 직접 추가하세요.</p>'}
    <div id="id-cards">${plan.ideas.map((idea, i) => cardHtml(idea, i)).join('')}</div>
    <p style="margin-top:14px">
      <a class="btn btn-primary" href="#editor">채택한 구성으로 편집기 시작 →</a>
      <span style="font-size:13px;color:var(--gray-600)">채택한 카드가 수행평가 영역으로 만들어집니다. 배점·비율은 편집기에서 정합니다.</span>
    </p>
  </div>`;
  bind();
}

function standardsHtml() {
  return `
  <details style="margin-top:6px" ${plan.standards.length ? '' : 'open'}>
    <summary style="cursor:pointer;font-weight:600;color:var(--navy-700)">이번 학기 성취기준 선택 (${plan.standards.length}개) — 아이디어의 재료</summary>
    <div style="max-height:260px;overflow-y:auto;border:1.5px solid var(--gray-300);border-radius:8px;padding:8px;margin-top:6px">
      ${subjectData.domains.map(d => `
        <div style="font-weight:700;color:var(--navy-700);margin:6px 0 2px">${esc(d.name)}</div>
        ${d.standards.map(s => `
          <label style="display:block;font-size:14px;margin:2px 0;font-weight:400">
            <input type="checkbox" data-idstd="${stdKey(s)}" ${plan.standards.includes(stdKey(s)) ? 'checked' : ''}>
            [${s.code}] ${esc(s.text)}
          </label>`).join('')}`).join('')}
    </div>
  </details>`;
}

function cardHtml(idea, i) {
  const adopted = idea.status === 'adopted';
  return `
  <div style="border:1.5px solid ${adopted ? 'var(--green-600)' : 'var(--gray-300)'};border-radius:10px;padding:12px;margin-bottom:10px;${adopted ? 'background:#f4fbf7' : ''}">
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
      <b style="color:var(--navy-700)">${esc(idea.title)} <span style="font-weight:400;color:var(--gray-600)">(${esc(idea.evalType)})</span></b>
      <span>
        ${adopted
          ? `<button class="btn btn-ghost" data-unadopt="${i}">채택 취소</button>`
          : `<button class="btn btn-primary" data-adopt="${i}">채택</button>`}
        <button class="btn btn-ghost" data-del="${i}">삭제</button>
      </span>
    </div>
    <p style="margin:6px 0;font-size:14px">${esc(idea.overview)}</p>
    ${idea.codes?.length ? `<p style="margin:2px 0;font-size:13px;color:var(--gray-600)">성취기준: ${idea.codes.map(esc).join(', ')}</p>` : ''}
    ${idea.rationale ? `<p style="margin:2px 0;font-size:13px;color:var(--gray-600)">추천 이유: ${esc(idea.rationale)}</p>` : ''}
    ${adopted ? '<p style="margin:4px 0 0;font-size:13px;color:var(--green-600)">채택됨 — 편집기의 수행평가 영역으로 생성됩니다.</p>' : ''}
  </div>`;
}

function bind() {
  bindGasSettings(rootEl);
  const $ = id => rootEl.querySelector(id);

  $('#id-grade').addEventListener('change', async e => {
    plan.meta.grade = Number(e.target.value);
    plan.meta.curriculum = GRADE_CURRICULUM[plan.meta.grade];
    plan.meta.subject = '';
    plan.standards = [];
    subjectData = null;
    savePlan(plan); render();
  });
  $('#id-sem').addEventListener('change', e => { plan.meta.semester = Number(e.target.value); savePlan(plan); });
  $('#id-subject').addEventListener('change', async e => {
    plan.meta.subject = e.target.value;
    plan.standards = [];
    subjectData = plan.meta.subject ? await loadSubject(plan.meta.curriculum, plan.meta.subject) : null;
    savePlan(plan); render();
  });
  $('#id-memo').addEventListener('change', e => { plan.ideaMemo = e.target.value; savePlan(plan); });

  rootEl.querySelectorAll('[data-idstd]').forEach(cb => cb.addEventListener('change', () => {
    const k = cb.dataset.idstd;
    if (cb.checked) { if (!plan.standards.includes(k)) plan.standards.push(k); }
    else plan.standards = plan.standards.filter(x => x !== k);
    savePlan(plan);
  }));

  $('#id-copy')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(buildIdeatePrompt(plan, subjectData, plan.ideaMemo));
    $('#id-status').textContent = '구상 프롬프트 복사됨 — 쓰시던 AI에 붙여넣으세요.';
  });

  $('#id-ai')?.addEventListener('click', () => runAi(
    buildIdeatePrompt(plan, subjectData, plan.ideaMemo)
    + '\n\n[출력 형식] ideas 배열의 JSON만 출력하세요.'));

  $('#id-structure')?.addEventListener('click', () => {
    const pasted = $('#id-paste').value.trim();
    if (!pasted) { $('#id-status').textContent = '먼저 외부 AI의 답변을 붙여넣으세요.'; return; }
    runAi(`아래는 중학교 ${plan.meta.subject} 수행평가 과제 추천에 대한 AI 답변입니다. 이 답변에 담긴 과제 후보들을 구조화하세요. 내용을 창작하지 말고 답변에 있는 것만 추출합니다. 과제명은 띄어쓰기 없이 만듭니다.\n\n---\n${pasted}`);
  });

  $('#id-add')?.addEventListener('click', () => {
    const title = $('#id-new-title').value.trim().replace(/\s+/g, '');
    if (!title) { $('#id-status').textContent = '과제명을 입력하세요.'; return; }
    plan.ideas.push({
      title, overview: $('#id-new-overview').value.trim(),
      evalType: $('#id-new-type').value, codes: [...plan.standards], rationale: '', status: 'candidate'
    });
    savePlan(plan); render();
  });

  rootEl.querySelectorAll('[data-adopt]').forEach(b => b.addEventListener('click', () => adopt(Number(b.dataset.adopt))));
  rootEl.querySelectorAll('[data-unadopt]').forEach(b => b.addEventListener('click', () => unadopt(Number(b.dataset.unadopt))));
  rootEl.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    unadopt(Number(b.dataset.del));
    plan.ideas.splice(Number(b.dataset.del), 1);
    savePlan(plan); render();
  }));
}

async function runAi(prompt) {
  const status = rootEl.querySelector('#id-status');
  if (!getGasUrl()) { status.textContent = '먼저 위의 AI 서버(GAS) 연결 설정을 완료하세요.'; return; }
  status.textContent = '후보 생성 중… (10~30초)';
  try {
    const out = await aiGenerate(prompt, IDEA_SCHEMA, 0.8);
    const ideas = JSON.parse(out.text).ideas || [];
    ideas.forEach(x => plan.ideas.push({ ...x, title: (x.title || '').replace(/\s+/g, ''), status: 'candidate' }));
    savePlan(plan); render();
    rootEl.querySelector('#id-status').textContent = `후보 ${ideas.length}개 추가 (${out.model})`;
  } catch (e) {
    status.textContent = `실패: ${e.message}`;
  }
}

// 채택: 아이디어 → 수행평가 영역으로 변환 (배점·비율은 편집기 기본값)
function adopt(i) {
  const idea = plan.ideas[i];
  idea.status = 'adopted';
  idea.codes?.forEach(c => { if (!plan.standards.includes(c)) plan.standards.push(c); });
  plan.performance.areas = plan.performance.areas.filter(a => a.name || a.elements.some(el => el.name));
  const a = newArea(idea.title);
  a.type = idea.evalType;
  a.isEssay = idea.evalType === '논술형';
  a.task = `∘ ${idea.overview}`;
  a.codes = [...(idea.codes || [])];
  a.fromIdea = idea.title;   // 채택 취소 시 이 영역만 제거하기 위한 표식
  plan.performance.areas.push(a);
  savePlan(plan); render();
}

function unadopt(i) {
  const idea = plan.ideas[i];
  if (idea.status !== 'adopted') return;
  idea.status = 'candidate';
  plan.performance.areas = plan.performance.areas.filter(a => a.fromIdea !== idea.title);
  if (!plan.performance.areas.length) plan.performance.areas.push(newArea(''));
  savePlan(plan); render();
}
