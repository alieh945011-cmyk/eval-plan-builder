// 데이터 검수 화면 — 추출된 성취기준·성취수준을 과목별로 훑어보는 숨은 페이지 (#review)
import { loadIndex, loadSubject } from './data.js';

export async function renderReview(el) {
  const index = await loadIndex();
  el.innerHTML = `
    <div class="card">
      <h2>데이터 검수 (내부용)</h2>
      <p>hwp·xlsx·pdf 원본에서 추출한 데이터를 원문과 대조하기 위한 화면입니다.</p>
      <label class="field">교육과정
        <select id="rv-cur">
          <option value="2022">2022 개정 (1·2학년)</option>
          <option value="2015">2015 개정 (3학년)</option>
        </select>
      </label>
      <label class="field">과목 <select id="rv-subj"></select></label>
      <div id="rv-body"></div>
    </div>`;

  const curSel = el.querySelector('#rv-cur');
  const subjSel = el.querySelector('#rv-subj');
  const body = el.querySelector('#rv-body');

  function fillSubjects() {
    subjSel.innerHTML = index[curSel.value]
      .map(s => `<option value="${s.subject}">${s.subject} (영역 ${s.domains} · 성취기준 ${s.standards} · ${s.levels.join('')})</option>`)
      .join('');
    show();
  }

  async function show() {
    if (!subjSel.value) { body.innerHTML = ''; return; }
    const data = await loadSubject(curSel.value, subjSel.value);
    const is2022 = data.curriculum === '2022';
    body.innerHTML = data.domains.map(dom => `
      <h3 style="color:var(--navy-700);margin:22px 0 8px">${dom.name || '(영역명 없음)'}</h3>
      <div class="tbl-wrap"><table class="plan">
        <tr><th style="width:220px">성취기준</th><th style="width:36px">수준</th><th>진술</th></tr>
        ${dom.standards.map(s => {
          const levels = is2022 ? Object.entries(s.levels) : Object.entries(s.criteria);
          const label = `${s.code ? `[${s.code}]` : ''}${s.subLabel ? ` 평가준거${s.subLabel}` : ''} ${s.text}`;
          return levels.map(([lv, txt], i) => `
            <tr>${i === 0 ? `<td class="left" rowspan="${levels.length}">${label}${s.unit ? `<br><small style="color:var(--gray-600)">단원: ${s.unit}</small>` : ''}${s.mergedUp ? `<br><small style="color:var(--amber-600)">원자료 병합: ${s.mergedUp.join(',')}</small>` : ''}</td>` : ''}
            <td><b>${lv}</b></td><td class="left">${txt}</td></tr>`).join('');
        }).join('')}
      </table></div>`).join('');
  }

  curSel.onchange = fillSubjects;
  subjSel.onchange = show;
  fillSubjects();
}
