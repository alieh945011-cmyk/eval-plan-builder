// 미리보기·내보내기 화면 (#preview) — 3~6번 표 렌더, 표 단위 복사(한글 붙여넣기용), XLSX 다운로드
import { getPlan, getSubjectData, esc } from './editor.js';
import { loadSubject } from './data.js';
import { downloadXlsx } from './export-xlsx.js';
import { downloadHwpx } from './export-hwpx.js';

const TD = 'border:1px solid #333;padding:4px 8px;text-align:center;vertical-align:middle;font-size:10pt';
const TH = TD + ';background:#d9e5f1;font-weight:bold';
const TL = TD + ';text-align:left';

function selectedStandards(plan, subjectData) {
  return subjectData.domains.flatMap(d =>
    d.standards.filter(s => plan.standards.includes(s.code + (s.subLabel ? `-${s.subLabel}` : ''))));
}

export async function renderPreview(el) {
  const plan = getPlan();
  let subjectData = getSubjectData();
  if (!subjectData && plan.meta.subject) {
    subjectData = await loadSubject(plan.meta.curriculum, plan.meta.subject);
  }
  if (!subjectData) {
    el.innerHTML = `<div class="card"><h2>미리보기</h2>
      <div class="notice notice-warn">먼저 편집기에서 과목을 선택하세요.</div><p><a href="#editor">← 편집기</a></p></div>`;
    return;
  }
  const is2022 = plan.meta.curriculum === '2022';
  const stds = selectedStandards(plan, subjectData);

  const sections = [];
  if (is2022) {
    sections.push(['3-가. 성취기준별 성취수준', tblStandards2022(stds, subjectData)]);
    sections.push(['3-나. 학기 단위 성취수준', tblSemester(plan, subjectData)]);
  } else {
    sections.push(['3. 성취기준 및 평가기준', tblStandards2015(stds)]);
  }
  sections.push(['4. 평가의 종류와 반영비율', tblRatio(plan, is2022)]);
  sections.push(['5. 성취율과 성취도', tblGrades(subjectData)]);
  plan.performance.areas.forEach((a, i) =>
    sections.push([`6. 수행평가 세부기준 — ${a.name || `영역${i + 1}`}`, tblAreaDetail(plan, a, stds, is2022)]));

  el.innerHTML = `
    <div class="card">
      <h2>미리보기·내보내기 — ${esc(plan.meta.schoolYear)}학년도 ${plan.meta.semester}학기 ${plan.meta.grade}학년 ${esc(plan.meta.subject)}</h2>
      <p>각 표의 "복사" 버튼을 누르면 서식이 유지된 채 복사되어, 한글(HWP) 문서에 표로 붙여넣을 수 있습니다.</p>
      <p><button class="btn btn-primary" id="pv-xlsx">엑셀(xlsx) 다운로드 — 총괄표+채점기준표</button>
      <button class="btn btn-navy" id="pv-hwpx">한글(HWPX) 다운로드 — 4·5·6번 표만 담은 문서</button>
      <span id="pv-status" style="font-size:14px"></span></p>
      <p style="font-size:13px;color:var(--gray-600)">HWPX는 학교 양식 서식 그대로 4·5·6번 표만 담은 문서입니다(자간 축소 해제). 본 계획서의 해당 위치에 복사해 넣으세요. 4번 표는 양식 구조상 정기시험 2회·수행평가 3영역까지 지원하며, 생성 후 반드시 한글에서 열어 확인하세요.</p>
    </div>
    ${sections.map(([title, html], i) => `
      <div class="card">
        <h2 style="display:flex;justify-content:space-between;align-items:center">${esc(title)}
          <button class="btn btn-ghost" data-copy="${i}">이 표 복사</button></h2>
        <div class="tbl-wrap" id="pv-tbl-${i}">${html}</div>
      </div>`).join('')}
    <div class="card"><p><a href="#editor">← 편집기</a> · <a href="#semester">학기 단위 성취수준</a> · <a href="#ai">AI 추천</a></p></div>`;

  el.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const html = el.querySelector(`#pv-tbl-${btn.dataset.copy}`).innerHTML;
      try {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([html.replace(/<[^>]+>/g, ' ')], { type: 'text/plain' })
        })]);
        btn.textContent = '복사됨';
        setTimeout(() => (btn.textContent = '이 표 복사'), 1500);
      } catch (e) {
        alert('복사 실패: ' + e.message);
      }
    });
  });

  el.querySelector('#pv-xlsx').addEventListener('click', () => {
    downloadXlsx(plan, subjectData, stds);
    el.querySelector('#pv-status').textContent = 'xlsx 파일이 다운로드되었습니다.';
  });

  el.querySelector('#pv-hwpx').addEventListener('click', async () => {
    const st = el.querySelector('#pv-status');
    st.textContent = 'HWPX 생성 중…';
    try {
      await downloadHwpx(plan, subjectData, stds);
      st.textContent = 'HWPX 다운로드 완료 — 한글에서 열어 확인하세요.';
    } catch (e) {
      st.textContent = `HWPX 생성 실패: ${e.message}`;
    }
  });
}

// ── 3번 (2022): 성취기준별 성취수준 ──
function tblStandards2022(stds, subjectData) {
  const levels = subjectData.levels;
  return stds.map(s => `
    <table style="border-collapse:collapse;width:100%;margin-bottom:8px">
      <tr><th style="${TH};width:34%">성취기준</th><th style="${TH}" colspan="2">성취기준별 성취수준</th></tr>
      ${levels.filter(lv => s.levels[lv]).map((lv, i, arr) => `
        <tr>${i === 0 ? `<td style="${TL}" rowspan="${arr.length}">[${s.code}] ${esc(s.text)}</td>` : ''}
        <td style="${TD};width:36px"><b>${lv}</b></td><td style="${TL}">${esc(s.levels[lv])}</td></tr>`).join('')}
    </table>`).join('');
}

// ── 3번 (2015): 성취기준·평가기준 ──
function tblStandards2015(stds) {
  return `
    <table style="border-collapse:collapse;width:100%">
      <tr><th style="${TH};width:14%">단원</th><th style="${TH};width:34%">교육과정 성취기준</th><th style="${TH}" colspan="2">평가기준</th></tr>
      ${stds.map(s => ['상', '중', '하'].filter(lv => s.criteria[lv]).map((lv, i, arr) => `
        <tr>${i === 0 ? `<td style="${TD}" rowspan="${arr.length}">${esc(s.unit || '')}</td>
          <td style="${TL}" rowspan="${arr.length}">[${s.code}]${s.subLabel ? ` (평가준거 ${s.subLabel})` : ''} ${esc(s.text)}</td>` : ''}
        <td style="${TD};width:36px"><b>${lv}</b></td><td style="${TL}">${esc(s.criteria[lv])}</td></tr>`).join('')).join('')}
    </table>`;
}

// ── 3-나 (2022): 학기 단위 성취수준 ──
function tblSemester(plan, subjectData) {
  const levels = subjectData.levels;
  return `
    <table style="border-collapse:collapse;width:100%">
      <tr><th style="${TH};width:60px">성취수준</th><th style="${TH}">진술</th></tr>
      ${levels.map(lv => `
        <tr><td style="${TD}"><b>${lv}</b></td><td style="${TL}">${esc(plan.semesterLevels[lv] || '(미작성 — 학기 단위 성취수준 화면에서 생성)')}</td></tr>`).join('')}
    </table>`;
}

// ── 4번: 평가의 종류와 반영비율 ──
function tblRatio(plan, is2022) {
  const w = plan.written, p = plan.performance;
  const nW = w.exams.length * 2;   // 회차 × (선택형+논술형)
  const nP = p.areas.length;
  const essayTotal = w.exams.reduce((s, e) => s + e.ratio * e.essay / (Number(e.select) + Number(e.essay) || 1), 0)
    + p.areas.filter(a => a.isEssay).reduce((s, a) => s + Number(a.ratio), 0);
  const codeCell = codes => codes.length ? codes.map(c => `[${c.split('-').length > 2 && c.match(/[①-⑧]$/) ? c.slice(0, -2) : c}]`).join(' ') : '';
  return `
    <table style="border-collapse:collapse;width:100%">
      <tr><th style="${TH}">평가 종류</th><th style="${TH}" colspan="${nW}">정기시험</th><th style="${TH}" colspan="${nP}">수행평가</th><th style="${TH}">합계</th></tr>
      <tr><th style="${TH}">반영비율</th><td style="${TD}" colspan="${nW}">${w.ratio}%</td><td style="${TD}" colspan="${nP}">${p.ratio}%</td><td style="${TD}">100%</td></tr>
      <tr><th style="${TH}" rowspan="2">시기/영역</th>
        ${w.exams.map(e => `<td style="${TD}" colspan="2">${esc(e.name)}</td>`).join('')}
        ${p.areas.map(a => `<td style="${TD}" rowspan="2">${esc(a.name)}(${esc(a.type)})</td>`).join('')}
        <td style="${TD}" rowspan="2"></td></tr>
      <tr>${w.exams.map(() => `<td style="${TD}">선택형</td><td style="${TD}">논술형</td>`).join('')}</tr>
      <tr><th style="${TH}">영역 만점(반영비율)</th>
        ${w.exams.map(e => {
          const t = Number(e.select) + Number(e.essay) || 1;
          return `<td style="${TD}">${e.select}점(${(e.ratio * e.select / t).toFixed(1)}%)</td>
                  <td style="${TD}">${e.essay}점(${(e.ratio * e.essay / t).toFixed(1)}%)</td>`;
        }).join('')}
        ${p.areas.map(a => `<td style="${TD}">${a.points}점(${a.ratio}%)</td>`).join('')}
        <td style="${TD}">100%</td></tr>
      <tr><th style="${TH}">논술형 평가반영비율</th>
        ${w.exams.map(e => {
          const t = Number(e.select) + Number(e.essay) || 1;
          return `<td style="${TD}" colspan="2">${(e.ratio * e.essay / t).toFixed(1)}%</td>`;
        }).join('')}
        ${p.areas.map(a => `<td style="${TD}">${a.isEssay ? a.ratio + '%' : '-'}</td>`).join('')}
        <td style="${TD}">${essayTotal.toFixed(1)}%</td></tr>
      ${is2022 ? '' : `<tr><th style="${TH}">전기학교반영여부</th>
        ${w.exams.map(() => `<td style="${TD}" colspan="2">${esc(plan.written.prevSchoolReflect || '')}</td>`).join('')}
        ${p.areas.map(() => `<td style="${TD}"></td>`).join('')}<td style="${TD}"></td></tr>`}
      <tr><th style="${TH}">성취기준</th>
        ${w.exams.map(e => `<td style="${TL}" colspan="2">${codeCell(e.codes || [])}</td>`).join('')}
        ${p.areas.map(a => `<td style="${TL}">${codeCell(a.codes)}</td>`).join('')}
        <td style="${TD}"></td></tr>
      <tr><th style="${TH}">평가요소</th>
        ${w.exams.map(e => `<td style="${TL}" colspan="2">${esc(e.elements || '')}</td>`).join('')}
        ${p.areas.map(a => `<td style="${TL}">${a.elements.filter(el2 => el2.name).map(el2 => '∘' + esc(el2.name)).join('<br>')}</td>`).join('')}
        <td style="${TD}"></td></tr>
      <tr><th style="${TH}">평가시기</th>
        ${w.exams.map(e => `<td style="${TD}" colspan="2">${esc(e.period)}</td>`).join('')}
        ${p.areas.map(a => `<td style="${TD}">${esc(a.period)}</td>`).join('')}
        <td style="${TD}"></td></tr>
    </table>`;
}

// ── 5번: 성취율과 성취도 ──
function tblGrades(subjectData) {
  const five = subjectData.levels.length >= 5;
  const rows = five
    ? [['90% 이상 ~ 100%', 'A'], ['80% 이상 ~ 90% 미만', 'B'], ['70% 이상 ~ 80% 미만', 'C'], ['60% 이상 ~ 70% 미만', 'D'], ['60% 미만', 'E']]
    : [['80% 이상 ~ 100%', 'A'], ['60% 이상 ~ 80% 미만', 'B'], ['60% 미만', 'C']];
  return `
    <table style="border-collapse:collapse;width:60%">
      <tr><th style="${TH}">성취율(원점수)</th><th style="${TH}">성취도</th></tr>
      ${rows.map(([r, g]) => `<tr><td style="${TD}">${r}</td><td style="${TD}"><b>${g}</b></td></tr>`).join('')}
    </table>`;
}

// ── 6번: 수행평가 세부기준 (영역별) ──
function tblAreaDetail(plan, a, stds, is2022) {
  const areaStds = stds.filter(s => a.codes.includes(s.code + (s.subLabel ? `-${s.subLabel}` : '')) || a.codes.includes(s.code));
  const methodRows = chunk(['논술', '구술·발표', '토의·토론', '프로젝트', '실험·실습', '포트폴리오', '기타', '교사관찰및기록', '자기평가', '동료평가'], 4);
  return `
    <table style="border-collapse:collapse;width:100%">
      <tr><th style="${TH};width:110px">평가 영역명</th><td style="${TD}" colspan="3">${esc(a.name)}(${esc(a.type)})</td>
        <th style="${TH}">영역 만점</th><td style="${TD}">${a.points}점</td>
        <th style="${TH}">학기</th><td style="${TD}">${plan.meta.semester}학기</td></tr>
      ${is2022 ? `<tr><th style="${TH}">수행과제</th><td style="${TL}" colspan="7">${esc(a.task).replace(/\n/g, '<br>')}</td></tr>` : ''}
      <tr><th style="${TH}">성취기준</th><th style="${TH}" colspan="7">${is2022 ? '성취기준별 성취수준' : '평가기준'}</th></tr>
      ${areaStds.map(s => {
        const entries = is2022
          ? Object.keys(s.levels).sort().map(lv => [lv, s.levels[lv]])
          : ['상', '중', '하'].filter(lv => s.criteria[lv]).map(lv => [lv, s.criteria[lv]]);
        return entries.map(([lv, txt], i) => `
          <tr>${i === 0 ? `<td style="${TL}" rowspan="${entries.length}" colspan="1">[${s.code}] ${esc(s.text)}</td>` : ''}
          <td style="${TD};width:36px"><b>${lv}</b></td><td style="${TL}" colspan="6">${esc(txt)}</td></tr>`).join('');
      }).join('')}
      <tr><th style="${TH}">평가방법</th>
        <td style="${TL}" colspan="7">${methodRows.map(row =>
          row.map(mth => `${a.methods.includes(mth) ? '■' : '□'} ${mth}`).join('&nbsp;&nbsp; ')).join('<br>')}</td></tr>
      <tr><th style="${TH}">평가요소</th><th style="${TH}" colspan="6">수행수준(채점기준)</th><th style="${TH};width:56px">배점</th></tr>
      ${a.elements.map(el2 => el2.levels.map((lv, i) => `
        <tr>${i === 0 ? `<td style="${TL}" rowspan="${el2.levels.length}">${esc(el2.name)}<br>(${el2.points}점)</td>` : ''}
        <td style="${TL}" colspan="6">${esc(lv.desc)}</td><td style="${TD}">${lv.score}</td></tr>`).join('')).join('')}
      <tr><td style="${TL}" colspan="7">기본점수 (모든 평가요소에서 최저점)</td><td style="${TD}">${a.basePoint}</td></tr>
      <tr><td style="${TL}" colspan="7">본인 의사에 의한 미참여 (자발적 미참여·백지 답안 포함)</td><td style="${TD}">${a.nonParticipation}</td></tr>
      <tr><td style="${TL}" colspan="7">장기 미인정 결석자</td><td style="${TD}">${a.longAbsence}</td></tr>
      <tr><td style="${TL}" colspan="8">&lt;AI 활용 관련 유의사항 안내&gt;<br>
        ∘ 본 수행평가에서 생성형 AI를 활용하여 산출물을 대필·생성하는 행위는 금지되며, 적발 시 부정행위로 간주함.<br>
        ∘ AI 활용이 허용된 과정에서는 사용 기록(AI 종류, 질문 내용, 출처)을 반드시 표기하여야 함.<br>
        ∘ 사용 기록 없이 제출하거나 교사의 질의에 답변하지 못하는 경우 채점에서 제외될 수 있음.</td></tr>
    </table>`;
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
