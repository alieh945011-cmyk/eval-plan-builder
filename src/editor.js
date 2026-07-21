// 평가계획 편집기 — 기본정보 → 성취기준 선택 → 반영비율(4번) → 세부기준(6번) 위저드
import { loadIndex, loadSubject } from './data.js';
import {
  loadPlan, savePlan, resetPlan, exportPlanFile, importPlanFile,
  newArea, newElement, newExam, validatePlan
} from './state.js';
import { gasSettingsHtml, bindGasSettings, getGasUrl } from './ai.js';
import { rubricPanelHtml, generateRubric, refreshRubric } from './rubric.js';

let plan = loadPlan();
let index = null;
let subjectData = null;   // 현재 과목의 성취기준 데이터
let rootEl = null;

const METHOD_LIST = ['논술', '구술·발표', '토의·토론', '프로젝트', '실험·실습', '포트폴리오', '기타', '교사관찰및기록', '자기평가', '동료평가'];
const GRADE_CURRICULUM = { 1: '2022', 2: '2022', 3: '2015' };

// 사용자 입력을 HTML 속성/본문에 안전하게 넣기 위한 이스케이프
export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function renderEditor(el) {
  rootEl = el;
  if (!index) index = await loadIndex();
  await ensureSubjectData();
  render();
}

async function ensureSubjectData() {
  const { curriculum, subject } = plan.meta;
  if (subject && index[curriculum].some(s => s.subject === subject)) {
    subjectData = await loadSubject(curriculum, subject);
  } else {
    subjectData = null;
  }
}

function allStandards() {
  if (!subjectData) return [];
  return subjectData.domains.flatMap(d =>
    d.standards.map(s => ({ ...s, domain: d.name })));
}

function stdKey(s) {
  return s.code + (s.subLabel ? `-${s.subLabel}` : '');
}

function commit(structural = false) {
  savePlan(plan);
  if (structural) render();
  else renderValidation();
}

// ── 렌더 ────────────────────────────────────────────────
function render() {
  const m = plan.meta;
  const subjects = index[m.curriculum];
  rootEl.innerHTML = `
    ${cardBasics(m, subjects)}
    ${subjectData ? cardStandards() : ''}
    ${subjectData ? cardRatio() : ''}
    ${subjectData && plan.performance.areas.length ? `<div class="card"><h3 style="margin:0 0 8px;color:var(--navy-700)">AI 채점기준 도우미 연결 (선택)</h3>
      <p style="font-size:13px;color:var(--gray-600);margin:0 0 8px">아래 각 영역에서 AI로 평가요소·채점기준을 추천받으려면 한 번만 연결하세요.</p>
      ${gasSettingsHtml()}</div>` : ''}
    ${subjectData ? plan.performance.areas.map((a, i) => cardAreaDetail(a, i)).join('') : ''}
    <div id="validation"></div>
    ${subjectData ? `<div class="card"><h2>다음 단계</h2>
      <p>
        <a class="btn btn-navy" href="#semester">학기 단위 성취수준 생성 (2022)</a>
        <a class="btn btn-navy" href="#ai">AI 추천·프롬프트</a>
        <a class="btn btn-primary" href="#preview">미리보기·내보내기</a>
      </p></div>` : ''}
  `;
  bindEvents();
  bindGasSettings(rootEl);
  renderValidation();
}

function cardBasics(m, subjects) {
  return `
  <div class="card">
    <h2><span class="step-no">1</span>기본 정보</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
      <label class="field">학년 (교육과정 자동 결정)
        <select data-k="grade">
          ${[1, 2, 3].map(g => `<option value="${g}" ${m.grade == g ? 'selected' : ''}>${g}학년 (${GRADE_CURRICULUM[g]} 개정)</option>`).join('')}
        </select>
      </label>
      <label class="field">학기
        <select data-k="semester">
          <option value="1" ${m.semester == 1 ? 'selected' : ''}>1학기</option>
          <option value="2" ${m.semester == 2 ? 'selected' : ''}>2학기</option>
        </select>
      </label>
      <label class="field">과목
        <select data-k="subject">
          <option value="">과목 선택…</option>
          ${subjects.map(s => `<option value="${s.subject}" ${m.subject === s.subject ? 'selected' : ''}>${s.subject}</option>`).join('')}
        </select>
      </label>
      <label class="field">학년도
        <input type="text" data-k="schoolYear" value="${esc(m.schoolYear)}">
      </label>
    </div>
    ${subjectData ? `<div class="notice notice-ok">${m.curriculum} 개정 · ${m.subject} · 성취수준 ${subjectData.levels.join('/')} (${subjectData.levels.length}단계)</div>` : `<div class="notice notice-warn">과목을 선택하면 성취기준을 불러옵니다.</div>`}
    <p>
      <button class="btn btn-ghost" data-act="export">계획 JSON 저장</button>
      <label class="btn btn-ghost" style="cursor:pointer">JSON 불러오기<input type="file" accept=".json" data-act="import" style="display:none"></label>
      <button class="btn btn-ghost" data-act="reset">초기화</button>
    </p>
  </div>`;
}

function cardStandards() {
  const sel = new Set(plan.standards);
  return `
  <div class="card">
    <h2><span class="step-no">2</span>이번 학기 성취기준 선택 <span style="font-size:14px;color:var(--gray-600)">(${plan.standards.length}개 선택)</span></h2>
    <p>이번 학기에 다루는 성취기준을 모두 선택하세요. 4번 표·6번 세부기준·학기 단위 성취수준의 재료가 됩니다.</p>
    ${subjectData.domains.map((d, di) => `
      <details ${d.standards.some(s => sel.has(stdKey(s))) ? 'open' : ''}>
        <summary style="font-weight:700;color:var(--navy-700);padding:6px 0;cursor:pointer">${d.name || '(영역)'} — ${d.standards.length}개</summary>
        ${d.standards.map(s => `
          <label style="display:flex;gap:8px;padding:5px 4px;align-items:flex-start;font-size:14px">
            <input type="checkbox" data-std="${stdKey(s)}" ${sel.has(stdKey(s)) ? 'checked' : ''} style="margin-top:3px">
            <span><b>[${s.code}]${s.subLabel ? ` 평가준거${s.subLabel}` : ''}</b> ${s.text}${s.unit ? ` <small style="color:var(--gray-600)">(${s.unit})</small>` : ''}</span>
          </label>`).join('')}
      </details>`).join('')}
  </div>`;
}

function cardRatio() {
  const w = plan.written, p = plan.performance;
  return `
  <div class="card">
    <h2><span class="step-no">3</span>평가의 종류와 반영비율 (4번 표)</h2>
    <div style="display:flex;gap:16px;flex-wrap:wrap">
      <label class="field" style="flex:1;min-width:140px">정기시험 반영비율(%)
        <input type="number" data-k="writtenRatio" value="${w.ratio}" min="0" max="100">
      </label>
      <label class="field" style="flex:1;min-width:140px">수행평가 반영비율(%)
        <input type="number" data-k="perfRatio" value="${p.ratio}" min="0" max="100">
      </label>
    </div>
    <div style="background:var(--gray-100);border-radius:8px;height:18px;overflow:hidden;display:flex;margin:4px 0 16px">
      <div style="width:${w.ratio}%;background:var(--navy-700)"></div>
      <div style="width:${p.ratio}%;background:var(--amber-500)"></div>
    </div>

    <h3 style="margin:10px 0 6px">정기시험 회차</h3>
    <div class="tbl-wrap"><table class="plan">
      <tr><th>회차</th><th>선택형 만점</th><th>논술형 만점</th><th>반영비율(%)</th><th>평가시기</th><th></th></tr>
      ${w.exams.map((e, i) => `
        <tr>
          <td><input type="text" data-exam="${i}" data-f="name" value="${esc(e.name)}" style="width:70px"></td>
          <td><input type="number" data-exam="${i}" data-f="select" value="${e.select}" style="width:70px"></td>
          <td><input type="number" data-exam="${i}" data-f="essay" value="${e.essay}" style="width:70px"></td>
          <td><input type="number" data-exam="${i}" data-f="ratio" value="${e.ratio}" step="0.5" style="width:70px"></td>
          <td><input type="text" data-exam="${i}" data-f="period" value="${esc(e.period)}" placeholder="예) 4월5주" style="width:100px"></td>
          <td><button class="btn btn-ghost" data-act="delExam" data-i="${i}">삭제</button></td>
        </tr>`).join('')}
    </table></div>
    <p><button class="btn btn-ghost" data-act="addExam">회차 추가</button></p>

    <h3 style="margin:16px 0 6px">수행평가 영역</h3>
    <div class="tbl-wrap"><table class="plan">
      <tr><th>영역명(띄어쓰기 없이)</th><th>평가유형</th><th>만점</th><th>반영비율(%)</th><th>논술형 포함</th><th>평가시기</th><th></th></tr>
      ${p.areas.map((a, i) => `
        <tr>
          <td><input type="text" data-area="${i}" data-f="name" value="${esc(a.name)}" style="width:130px"></td>
          <td><input type="text" data-area="${i}" data-f="type" value="${esc(a.type)}" placeholder="논술형/프로젝트…" style="width:110px"></td>
          <td><input type="number" data-area="${i}" data-f="points" value="${a.points}" style="width:60px"></td>
          <td><input type="number" data-area="${i}" data-f="ratio" value="${a.ratio}" step="0.5" style="width:70px"></td>
          <td><input type="checkbox" data-area="${i}" data-f="isEssay" ${a.isEssay ? 'checked' : ''}></td>
          <td><input type="text" data-area="${i}" data-f="period" value="${esc(a.period)}" placeholder="예) 5월2주" style="width:100px"></td>
          <td><button class="btn btn-ghost" data-act="delArea" data-i="${i}">삭제</button></td>
        </tr>`).join('')}
    </table></div>
    <p><button class="btn btn-ghost" data-act="addArea">영역 추가</button></p>
    <div class="notice notice-warn">논술형 총 반영비율:
      ${(w.exams.reduce((s, e) => s + e.ratio * e.essay / (Number(e.select) + Number(e.essay) || 1), 0)
       + p.areas.filter(a => a.isEssay).reduce((s, a) => s + Number(a.ratio), 0)).toFixed(1)}%
    </div>
  </div>`;
}

function cardAreaDetail(a, i) {
  const stds = allStandards().filter(s => plan.standards.includes(stdKey(s)));
  return `
  <div class="card">
    <h2><span class="step-no">4</span>수행평가 세부기준 — ${a.name || `영역${i + 1}`} <small style="color:var(--gray-600)">(${a.points}점 · ${a.ratio}%)</small></h2>

    <label class="field">수행과제 (무엇을 하는 평가인지)
      <textarea data-area="${i}" data-f="task" rows="2" placeholder="∘ 순환소수를 분수로 나타내는 과정을 논술형으로 평가함">${esc(a.task)}</textarea>
    </label>

    <div class="field">평가방법 (해당 항목 체크)
      <div style="display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:6px">
        ${METHOD_LIST.map(mth => `
          <label style="font-weight:400;font-size:14px"><input type="checkbox" data-area="${i}" data-f="method" value="${mth}" ${a.methods.includes(mth) ? 'checked' : ''}> ${mth}</label>`).join('')}
      </div>
    </div>

    <div class="field">이 영역이 평가하는 성취기준
      <div style="margin-top:6px">
        ${stds.length ? stds.map(s => `
          <label style="display:flex;gap:8px;padding:3px 4px;font-weight:400;font-size:14px;align-items:flex-start">
            <input type="checkbox" data-area="${i}" data-f="code" value="${stdKey(s)}" ${a.codes.includes(stdKey(s)) ? 'checked' : ''} style="margin-top:3px">
            <span>[${s.code}]${s.subLabel ? ` 준거${s.subLabel}` : ''} ${s.text.slice(0, 60)}${s.text.length > 60 ? '…' : ''}</span>
          </label>`).join('') : '<span style="color:var(--gray-600);font-size:14px">2단계에서 성취기준을 먼저 선택하세요.</span>'}
      </div>
    </div>

    <h3 style="margin:14px 0 6px">평가요소와 채점기준</h3>
    ${rubricPanelHtml(a, i)}
    ${a.elements.map((el, ei) => `
      <div style="border:1.5px solid var(--gray-300);border-radius:10px;padding:12px;margin-bottom:10px">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
          <label class="field" style="flex:2;min-width:200px;margin-bottom:6px">평가요소 (성취기준에서 추출, "~하기")
            <input type="text" data-area="${i}" data-elem="${ei}" data-f="name" value="${esc(el.name)}" placeholder="예) 순환소수를 분수로 나타내기">
          </label>
          <label class="field" style="width:90px;margin-bottom:6px">배점
            <input type="number" data-area="${i}" data-elem="${ei}" data-f="points" value="${el.points}">
          </label>
          <button class="btn btn-ghost" data-act="delElem" data-i="${i}" data-ei="${ei}" style="margin-bottom:6px">요소 삭제</button>
        </div>
        <table class="plan">
          <tr><th style="width:70px">점수</th><th>수행수준(채점기준) — 관찰 가능한 산출물·정확도로 구분</th><th style="width:60px"></th></tr>
          ${el.levels.map((lv, li) => `
            <tr>
              <td><input type="number" data-area="${i}" data-elem="${ei}" data-lv="${li}" data-f="score" value="${lv.score}" style="width:60px"></td>
              <td><input type="text" data-area="${i}" data-elem="${ei}" data-lv="${li}" data-f="desc" value="${esc(lv.desc)}" placeholder="예) 세 개 모두 정확하게 구하였다."></td>
              <td><button class="btn btn-ghost" data-act="delLevel" data-i="${i}" data-ei="${ei}" data-li="${li}">−</button></td>
            </tr>`).join('')}
        </table>
        <p style="margin:6px 0 0"><button class="btn btn-ghost" data-act="addLevel" data-i="${i}" data-ei="${ei}">급간 추가</button></p>
      </div>`).join('')}
    <p><button class="btn btn-ghost" data-act="addElem" data-i="${i}">평가요소 추가</button></p>

    <div style="display:flex;gap:12px;flex-wrap:wrap">
      <label class="field" style="flex:1;min-width:150px">기본점수 (만점의 20~40%)
        <input type="number" data-area="${i}" data-f="basePoint" value="${a.basePoint}">
      </label>
      <label class="field" style="flex:1;min-width:150px">본인 의사 미참여 (기본점수−1)
        <input type="number" data-area="${i}" data-f="nonParticipation" value="${a.nonParticipation}">
      </label>
      <label class="field" style="flex:1;min-width:150px">장기 미인정 결석 (기본점수−2)
        <input type="number" data-area="${i}" data-f="longAbsence" value="${a.longAbsence}">
      </label>
    </div>
  </div>`;
}

function renderValidation() {
  const el = rootEl.querySelector('#validation');
  if (!el) return;
  if (!subjectData) { el.innerHTML = ''; return; }
  const issues = validatePlan(plan, subjectData);
  el.innerHTML = `
    <div class="card">
      <h2>검증 결과</h2>
      ${issues.length === 0 ? '<div class="notice notice-ok">모든 검증 규칙을 통과했습니다.</div>'
        : issues.map(i => `<div class="notice ${i.level === 'error' ? 'notice-error' : 'notice-warn'}">${i.msg}</div>`).join('')}
    </div>`;
}

// ── 이벤트 ──────────────────────────────────────────────
function bindEvents() {
  rootEl.querySelectorAll('[data-k]').forEach(inp => {
    inp.addEventListener('change', async () => {
      const k = inp.dataset.k;
      if (k === 'grade') {
        plan.meta.grade = Number(inp.value);
        plan.meta.curriculum = GRADE_CURRICULUM[plan.meta.grade];
        plan.meta.subject = '';
        plan.standards = [];
        await ensureSubjectData();
        commit(true);
      } else if (k === 'subject') {
        plan.meta.subject = inp.value;
        plan.standards = [];
        plan.performance.areas.forEach(a => a.codes = []);
        await ensureSubjectData();
        commit(true);
      } else if (k === 'semester') { plan.meta.semester = Number(inp.value); commit(); }
      else if (k === 'schoolYear') { plan.meta.schoolYear = inp.value; commit(); }
      else if (k === 'writtenRatio') { plan.written.ratio = Number(inp.value); commit(true); }
      else if (k === 'perfRatio') { plan.performance.ratio = Number(inp.value); commit(true); }
    });
  });

  rootEl.querySelectorAll('[data-std]').forEach(cb => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.std;
      if (cb.checked) { if (!plan.standards.includes(key)) plan.standards.push(key); }
      else {
        plan.standards = plan.standards.filter(c => c !== key);
        plan.performance.areas.forEach(a => a.codes = a.codes.filter(c => c !== key));
      }
      savePlan(plan);
      renderValidation();
    });
  });

  rootEl.querySelectorAll('[data-exam]').forEach(inp => {
    inp.addEventListener('change', () => {
      const e = plan.written.exams[Number(inp.dataset.exam)];
      const f = inp.dataset.f;
      e[f] = (f === 'name' || f === 'period') ? inp.value : Number(inp.value);
      commit();
    });
  });

  rootEl.querySelectorAll('[data-area]').forEach(inp => {
    inp.addEventListener('change', () => {
      const a = plan.performance.areas[Number(inp.dataset.area)];
      const f = inp.dataset.f;
      if (inp.dataset.elem !== undefined) {
        const el = a.elements[Number(inp.dataset.elem)];
        if (inp.dataset.lv !== undefined) {
          const lv = el.levels[Number(inp.dataset.lv)];
          lv[f] = f === 'score' ? Number(inp.value) : inp.value;
        } else {
          el[f] = f === 'points' ? Number(inp.value) : inp.value;
        }
        commit();
      } else if (f === 'method') {
        if (inp.checked) { if (!a.methods.includes(inp.value)) a.methods.push(inp.value); }
        else a.methods = a.methods.filter(mv => mv !== inp.value);
        commit();
      } else if (f === 'code') {
        if (inp.checked) { if (!a.codes.includes(inp.value)) a.codes.push(inp.value); }
        else a.codes = a.codes.filter(c => c !== inp.value);
        commit();
      } else if (f === 'isEssay') { a.isEssay = inp.checked; commit(true); }
      else if (['points', 'ratio', 'basePoint', 'nonParticipation', 'longAbsence'].includes(f)) {
        a[f] = Number(inp.value); commit();
      } else { a[f] = inp.value; commit(); }
    });
  });

  rootEl.querySelectorAll('[data-act]').forEach(btn => {
    const act = btn.dataset.act;
    if (act === 'import') {
      btn.addEventListener('change', () => {
        if (btn.files[0]) importPlanFile(btn.files[0], async p => {
          plan = p; await ensureSubjectData(); commit(true);
        });
      });
      return;
    }
    btn.addEventListener('click', async () => {
      const i = Number(btn.dataset.i), ei = Number(btn.dataset.ei), li = Number(btn.dataset.li);
      if (act.startsWith('rubric')) return handleRubric(act, btn);
      if (act === 'export') return exportPlanFile(plan);
      if (act === 'reset') {
        if (!confirm('작성 중인 계획을 모두 지울까요?')) return;
        resetPlan(); plan = loadPlan(); await ensureSubjectData(); return render();
      }
      if (act === 'addExam') plan.written.exams.push(newExam(`${plan.written.exams.length + 1}차`));
      if (act === 'delExam') plan.written.exams.splice(i, 1);
      if (act === 'addArea') plan.performance.areas.push(newArea(`영역${plan.performance.areas.length + 1}`));
      if (act === 'delArea') plan.performance.areas.splice(i, 1);
      if (act === 'addElem') plan.performance.areas[i].elements.push(newElement());
      if (act === 'delElem') plan.performance.areas[i].elements.splice(ei, 1);
      if (act === 'addLevel') plan.performance.areas[i].elements[ei].levels.push({ score: 0, desc: '' });
      if (act === 'delLevel') plan.performance.areas[i].elements[ei].levels.splice(li, 1);
      commit(true);
    });
  });
}

// ── AI 채점기준 도우미 액션 ─────────────────────────────
async function handleRubric(act, btn) {
  const i = Number(btn.dataset.i);
  const area = plan.performance.areas[i];
  const clone = els => els.map(el => ({
    name: el.name, points: el.points,
    levels: el.levels.map(lv => ({ score: lv.score, desc: lv.desc }))
  }));
  const status = () => rootEl.querySelector(`[data-rubric-status="${i}"]`);

  if (act === 'rubricToggleSaved') { area._showSaved = !area._showSaved; return render(); }
  if (act === 'rubricSave') {
    if (!area.rubricDraft) return;
    area.savedRubrics = area.savedRubrics || [];
    area.savedRubrics.push({ label: `초안 ${area.savedRubrics.length + 1}`, elements: clone(area.rubricDraft.elements) });
    area._showSaved = true;
    return commitStructural();
  }
  if (act === 'rubricApply') {
    if (area.rubricDraft) area.elements = clone(area.rubricDraft.elements);
    return commitStructural();
  }
  if (act === 'rubricApplySaved') {
    const sv = (area.savedRubrics || [])[Number(btn.dataset.si)];
    if (sv) area.elements = clone(sv.elements);
    return commitStructural();
  }
  if (act === 'rubricDelSaved') {
    (area.savedRubrics || []).splice(Number(btn.dataset.si), 1);
    return commitStructural();
  }

  // AI 호출 (rubricGen / rubricRefresh)
  if (!getGasUrl()) { if (status()) status().textContent = '먼저 위의 AI 서버(GAS) 연결 설정을 완료하세요.'; return; }
  if (act === 'rubricRefresh' && !area.rubricDraft) return;
  btn.disabled = true;
  if (status()) status().textContent = act === 'rubricRefresh' ? '채점기준 새로 뽑는 중…' : '평가요소·채점기준 생성 중… (10~30초)';
  try {
    const res = act === 'rubricRefresh'
      ? await refreshRubric(plan, area, subjectData, area.rubricDraft.elements)
      : await generateRubric(plan, area, subjectData);
    area.rubricDraft = { elements: res.elements };
    commitStructural();
  } catch (e) {
    if (status()) status().textContent = `실패: ${e.message}`;
    btn.disabled = false;
  }
}

function commitStructural() { savePlan(plan); render(); }

export function getPlan() { return plan; }
export function getSubjectData() { return subjectData; }
