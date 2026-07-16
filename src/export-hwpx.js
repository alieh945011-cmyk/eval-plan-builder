// HWPX 완성본 생성 — 학교 빈 양식(hwpx)을 템플릿으로 3~6번을 채워 내려받는다
import JSZip from 'jszip';

const HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph';

export function templateName(plan) {
  return plan.meta.curriculum === '2022' ? `2022-g${plan.meta.grade}` : '2015-g3';
}

// ── 진입점(브라우저) ───────────────────────────────────
export async function downloadHwpx(plan, subjectData, stds) {
  // 상대 경로 — 앱이 /eval-plan-builder/ 하위에서 서빙되므로 base 설정 불필요
  const res = await fetch(`templates/${templateName(plan)}.hwpx`);
  if (!res.ok) throw new Error(`템플릿 로드 실패: ${templateName(plan)}`);
  const outZip = await buildHwpx(await res.arrayBuffer(), plan, subjectData, stds);
  const blob = await outZip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const m = plan.meta;
  save(blob, `${m.schoolYear}학년도 ${m.semester}학기 ${m.grade}학년 교수학습 및 평가운영계획_(${m.subject}).hwpx`);
}

// 템플릿 바이트를 받아 완성 JSZip을 돌려준다 — Node 테스트에서도 사용 (DOMParser/XMLSerializer는 globalThis에서)
export async function buildHwpx(templateBytes, plan, subjectData, stds) {
  const is2022 = plan.meta.curriculum === '2022';
  const zip = await JSZip.loadAsync(templateBytes);
  const xmlText = await zip.file('Contents/section0.xml').async('string');
  const doc = new globalThis.DOMParser().parseFromString(xmlText, 'application/xml');
  if (typeof doc.querySelector === 'function' && doc.querySelector('parsererror')) {
    throw new Error('템플릿 XML 파싱 실패');
  }

  fillDocument(doc, plan, subjectData, stds, is2022);

  const out = new globalThis.XMLSerializer().serializeToString(doc);
  // 자간 축소(음수 spacing) 해제 — 양식이 칸에 맞추려 좁힌 자간을 0으로 되돌림
  const header = (await zip.file('Contents/header.xml').async('string'))
    .replace(/<hh:spacing([^>]*)\/>/g, (m2, attrs) => `<hh:spacing${attrs.replace(/"-\d+"/g, '"0"')}/>`);
  const outZip = new JSZip();
  // hwpx는 OWPML 컨테이너 — mimetype을 무압축 선두 엔트리로 유지
  const mime = zip.file('mimetype');
  if (mime) outZip.file('mimetype', await mime.async('uint8array'), { compression: 'STORE' });
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir || name === 'mimetype') continue;
    const content = name === 'Contents/section0.xml' ? out
      : name === 'Contents/header.xml' ? header
      : await entry.async('uint8array');
    outZip.file(name, content);
  }
  return outZip;
}

function save(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ── 채우기 본체 — 4·5·6번만 담은 문서를 만든다 ─────────
function fillDocument(doc, plan, subjectData, stds, is2022) {
  const three = subjectData.levels.length === 3;

  stripMemos(doc);

  // (교과명)·◯◯과 전역 치환 (문서 제목용)
  for (const t of tags(doc, 't')) {
    const cur = t.textContent;
    let v = cur;
    if (v.includes('(교과명)')) v = v.replaceAll('(교과명)', `(${plan.meta.subject})`);
    if (v.includes('◯◯과')) v = v.replaceAll('◯◯과', `${plan.meta.subject}과`);
    if (v !== cur) writeT(t, v);
  }

  const tables = tags(doc, 'tbl');
  const sig = tbl => rowCells(tbl, 0).map(c => text(c).slice(0, 8)).join('|');

  let ratioTbl = null, grade5Tbl = null, grade3Tbl = null, areaTbl = null;
  for (const tbl of tables) {
    const s = sig(tbl);
    const n = rows(tbl).length;
    const first = text(rowCells(tbl, 0)[0] || null);
    if (first === '평가 종류') ratioTbl = tbl;
    else if (s.startsWith('성취율(원점수')) { if (n >= 6) grade5Tbl = tbl; else grade3Tbl = tbl; }
    else if (first === '평가 영역명' || first === '평가영역명') areaTbl = tbl;
  }

  fillRatioTable(ratioTbl, plan, is2022);
  const areaTbls = fillAreaTables(doc, areaTbl, plan, stds, is2022, subjectData.levels);

  const keep = new Set([ratioTbl, three ? grade3Tbl : grade5Tbl, ...areaTbls].filter(Boolean));
  pruneToSections(doc, keep);
}

// 4·5·6번 표와 그 제목·문서 제목·페이지 설정만 남기고 최상위 문단을 정리
function pruneToSections(doc, keepTables) {
  const sec = tags(doc, 'p')[0]?.parentNode;
  if (!sec) return;
  const headingRe = /^\s*[456]\s*\.\s*(평가의 종류|성취율|수행평가)/;
  for (const p of kids(sec)) {
    if (p.localName !== 'p') continue;
    const tbls = tags(p, 'tbl');
    if (tbls.length) {
      if (tbls.some(t => keepTables.has(t))) continue;   // 대상 표
    } else {
      if (tags(p, 'secPr').length) continue;             // 페이지 설정
      const txt = tags(p, 't').map(t => t.textContent).join('').trim();
      if (headingRe.test(txt)) continue;                 // 4/5/6 제목
      if (txt.includes('평가 운영 계획') || txt.includes('평가운영계획')) continue; // 문서 제목
    }
    sec.removeChild(p);
  }
}

// 양식의 작성 안내 메모(MEMO 필드)를 문서 전체에서 제거 — 완성본에 주석이 남지 않도록
function stripMemos(doc) {
  const ids = new Set();
  for (const fb of tags(doc, 'fieldBegin')) {
    if (fb.getAttribute('type') !== 'MEMO') continue;
    ids.add(fb.getAttribute('id'));
    const ctrl = fb.parentNode;           // hp:ctrl
    ctrl.parentNode.removeChild(ctrl);
  }
  for (const fe of tags(doc, 'fieldEnd')) {
    if (!ids.has(fe.getAttribute('beginIDRef'))) continue;
    const ctrl = fe.parentNode;
    ctrl.parentNode.removeChild(ctrl);
  }
}

// ── XML 유틸 ──────────────────────────────────────────
// Array.from — xmldom(Node 테스트)의 NodeList는 이터러블이 아님
function tags(node, name) { return Array.from(node.getElementsByTagNameNS(HP, name)); }
function kids(node) { return Array.from(node.childNodes || []); }
function rows(tbl) { return kids(tbl).filter(n => n.localName === 'tr'); }
function rowCells(tbl, ri) { const r = rows(tbl)[ri]; return r ? cells(r) : []; }
function cells(tr) { return kids(tr).filter(n => n.localName === 'tc'); }
function text(tc) { return tc ? tags(tc, 't').map(t => t.textContent).join('') : ''; }
function span(tc) { return tags(tc, 'cellSpan')[0]; }
function addr(tc) { return tags(tc, 'cellAddr')[0]; }

// 셀 내용을 문자열(배열이면 줄 단위 문단)로 교체 — 첫 문단을 서식 원형으로 재사용
function setText(tc, value) {
  const lines = Array.isArray(value) ? value : String(value ?? '').split('\n');
  // 반드시 셀 직속 subList만 — 자손 검색은 메모/중첩 객체의 subList를 잘못 잡는다
  const sub = kids(tc).find(n => n.localName === 'subList') || tc;
  const ps = kids(sub).filter(n => n.localName === 'p');
  if (!ps.length) return;
  const proto = ps[0];
  ps.slice(1).forEach(p => sub.removeChild(p));
  ensureT(proto);
  clearT(proto, lines[0] || '');
  let prev = proto;
  for (const line of lines.slice(1)) {
    const p = proto.cloneNode(true);
    clearT(p, line);
    sub.insertBefore(p, prev.nextSibling);
    prev = p;
  }
}

// 문단 안 첫 hp:t만 남기고 텍스트 지정, 나머지 hp:t는 비움
function clearT(p, value) {
  const ts = tags(p, 't');
  ts.forEach((t, i) => writeT(t, i === 0 ? value : ''));
}

// textContent 세터 대신 자식 교체 — xmldom(Node 테스트)에서도 동일 동작 보장
function writeT(node, value) {
  while (node.firstChild) node.removeChild(node.firstChild);
  if (value !== '') node.appendChild(node.ownerDocument.createTextNode(value));
}

function ensureT(p) {
  if (tags(p, 't').length) return;
  const run = tags(p, 'run')[0];
  if (run) run.appendChild(p.ownerDocument.createElementNS(HP, 'hp:t'));
}

// 행 전체 rowAddr 재계산 + rowCnt 갱신
function renumber(tbl) {
  const rs = rows(tbl);
  rs.forEach((tr, ri) => cells(tr).forEach(tc => addr(tc)?.setAttribute('rowAddr', String(ri))));
  tbl.setAttribute('rowCnt', String(rs.length));
}

// 표를 감싸는 최상위 문단 찾기/제거 (sec > p > run > tbl)
function anchorParagraph(tbl) {
  let n = tbl;
  while (n && !(n.localName === 'p' && n.parentNode?.localName === 'sec')) n = n.parentNode;
  return n;
}
// ── 4번: 평가의 종류와 반영비율 (고정 9열 그리드: 정기 2회 × 2 + 수행 3영역) ──
function fillRatioTable(tbl, plan, is2022) {
  if (!tbl) return;
  const w = plan.written, p = plan.performance;
  const grid = {};
  rows(tbl).forEach(tr => cells(tr).forEach(tc => {
    grid[`${addr(tc).getAttribute('colAddr')},${addr(tc).getAttribute('rowAddr')}`] = tc;
  }));
  const put = (c, r, v) => { if (grid[`${c},${r}`]) setText(grid[`${c},${r}`], v); };
  const exams = w.exams.slice(0, 2);
  const areas = p.areas.slice(0, 3);
  const overflow = p.areas.length > 3 ? p.areas.slice(2) : null;

  // 미사용 열(정기 2회·수행 3영역 그리드의 빈 자리)은 양식 예시 텍스트를 지운다
  const blankRows = is2022 ? [2, 4, 5, 6, 7, 8] : [2, 4, 5, 6, 7, 8, 9];
  for (let i = exams.length; i < 2; i++) {
    blankRows.forEach(r => { put(1 + i * 2, r, ''); put(2 + i * 2, r, ''); });
  }
  for (let i = areas.length; i < 3; i++) {
    blankRows.forEach(r => put(5 + i, r, ''));
  }

  put(5, 0, '수행평가');
  put(1, 1, `${w.ratio}%`); put(5, 1, `${p.ratio}%`); put(8, 1, '100%');
  exams.forEach((e, i) => put(1 + i * 2, 2, e.name));
  areas.forEach((a, i) => put(5 + i, 2, `${a.name}(${a.type})`));
  put(8, 2, '');

  const essay = [];
  exams.forEach((e, i) => {
    const t = Number(e.select) + Number(e.essay) || 1;
    put(1 + i * 2, 4, `${e.select}점(${fx(e.ratio * e.select / t)}%)`);
    put(2 + i * 2, 4, `${e.essay}점(${fx(e.ratio * e.essay / t)}%)`);
    essay.push(e.ratio * e.essay / t);
  });
  areas.forEach((a, i) => put(5 + i, 4, `${a.points}점(${a.ratio}%)`));
  put(8, 4, '100%');

  const rEssay = is2022 ? 5 : 6;
  exams.forEach((e, i) => put(1 + i * 2, rEssay, `${fx(essay[i])}%`));
  areas.forEach((a, i) => put(5 + i, rEssay, a.isEssay ? `${a.ratio}%` : '-'));
  const essayTotal = essay.reduce((s2, v) => s2 + v, 0)
    + p.areas.filter(a => a.isEssay).reduce((s2, a) => s2 + Number(a.ratio), 0);
  put(8, rEssay, `${fx(essayTotal)}%`);

  if (!is2022) {  // 전기학교반영여부 행 (라벨 셀에 안내문이 들어 있어 함께 교체)
    put(0, 5, '전기학교반영여부');
    exams.forEach((e, i) => put(1 + i * 2, 5, plan.written.prevSchoolReflect || ''));
    areas.forEach((a, i) => put(5 + i, 5, ''));
    put(8, 5, '');
  }

  const rStd = is2022 ? 6 : 7;
  exams.forEach((e, i) => put(1 + i * 2, rStd, (e.codes || []).map(c => `[${c}]`).join(', ')));
  areas.forEach((a, i) => put(5 + i, rStd, a.codes.map(c => `[${c}]`).join(', ')));
  put(8, rStd, '-');

  const rEl = rStd + 1;
  exams.forEach((e, i) => put(1 + i * 2, rEl, e.elements || ''));
  areas.forEach((a, i) => put(5 + i, rEl,
    a.elements.filter(el => el.name).map(el => `∘${el.name}`)));
  const rWhen = rEl + 1;
  exams.forEach((e, i) => put(1 + i * 2, rWhen, e.period || ''));
  areas.forEach((a, i) => put(5 + i, rWhen, a.period || ''));

  // 3영역 초과분은 마지막 열에 병기 (템플릿 그리드 한계 — 안내)
  if (overflow) {
    put(7, 2, overflow.map(a => `${a.name}(${a.type})`).join(' / '));
    put(7, 4, overflow.map(a => `${a.points}점(${a.ratio}%)`).join(' / '));
  }
}

function fx(v) { return (Math.round(v * 10) / 10).toString().replace(/\.0$/, ''); }

// ── 6번: 수행평가 세부기준 — 영역 수만큼 표 복제 ──
const AI_NOTICE = [
  '<AI 활용 관련 유의사항 안내>',
  '∘ 본 수행평가에서 생성형 AI를 활용하여 산출물을 대필·생성하는 행위는 금지되며, 적발 시 부정행위로 간주함.',
  '∘ AI 활용이 허용된 과정에서는 사용 기록(AI 종류, 질문 내용, 출처)을 반드시 표기하여야 함.',
  '∘ 사용 기록 없이 제출하거나 교사의 질의에 답변하지 못하는 경우 채점에서 제외될 수 있음.'
];

// 채우기 전에 원형 문단을 먼저 N개로 복제 — 채워진 표를 복제하면 행 구조가 어긋난다
function clonePristine(tpl, count) {
  const anchor = anchorParagraph(tpl);
  const paras = [anchor];
  let after = anchor;
  for (let i = 1; i < count; i++) {
    const p = anchor.cloneNode(true);
    after.parentNode.insertBefore(p, after.nextSibling);
    after = p;
    paras.push(p);
  }
  return paras;
}

function fillAreaTables(doc, tpl, plan, stds, is2022, levels) {
  if (!tpl) return [];
  const paras = clonePristine(tpl, plan.performance.areas.length);
  return plan.performance.areas.map((area, i) => {
    const tbl = tags(paras[i], 'tbl')[0];
    const areaStds = stds.filter(s =>
      area.codes.includes(s.code + (s.subLabel ? `-${s.subLabel}` : '')) || area.codes.includes(s.code));
    if (is2022) fillAreaTable2022(tbl, plan, area, areaStds, levels);
    else fillAreaTable2015(tbl, plan, area, areaStds);
    return tbl;
  });
}

// 성취기준/평가요소 블록을 원형 행 복제로 재구성하는 공용 루틴
function rebuildBlock(tbl, firstRow, lastRow, blocks) {
  // blocks: [{anchorText, rows:[{label?, text, score?}]}] — 원형: firstRow(앵커 포함), 그 다음 행(후속)
  const rs = rows(tbl);
  const protoFirst = rs[firstRow], protoNext = rs[firstRow + 1] || rs[firstRow];
  const before = rs[firstRow].previousSibling;
  for (let ri = firstRow; ri <= lastRow; ri++) tbl.removeChild(rs[ri]);
  let prev = before;
  for (const b of blocks) {
    b.rows.forEach((row, li) => {
      const tr = (li === 0 ? protoFirst : protoNext).cloneNode(true);
      const cs = cells(tr);
      if (li === 0) {
        setText(cs[0], b.anchorText);
        span(cs[0])?.setAttribute('rowSpan', String(b.rows.length));
        if (row.label !== undefined) setText(cs[1], row.label);
        setText(cs[row.label !== undefined ? 2 : 1], row.text);
        if (row.score !== undefined) setText(cs[cs.length - 1], String(row.score));
      } else {
        if (row.label !== undefined) setText(cs[0], row.label);
        setText(cs[row.label !== undefined ? 1 : 0], row.text);
        if (row.score !== undefined) setText(cs[cs.length - 1], String(row.score));
      }
      if (prev) tbl.insertBefore(tr, prev.nextSibling);
      else tbl.insertBefore(tr, tbl.firstChild);
      prev = tr;
    });
  }
}

function flipMethods(tbl, methods) {
  const norm = s => s.replace(/[\s·]/g, '');
  const sel = new Set(methods.map(norm));
  for (const t of tags(tbl, 't')) {
    const m = t.textContent.match(/□\s*(.+)$/);
    if (m && sel.has(norm(m[1]))) writeT(t, t.textContent.replace('□', '■'));
  }
}

function fillAreaTable2022(tbl, plan, area, areaStds, levels) {
  let rs = rows(tbl);
  const put = (r, c, v) => setText(cells(rs[r])[c], v);
  put(0, 1, `${area.name}(${area.type})`);
  put(0, 3, `${area.points}점`);
  put(0, 5, `${plan.meta.semester}학기`);
  put(1, 1, area.task || '');
  put(2, 1, '성취기준별 성취수준');

  // 평가요소 블록(뒤쪽부터 재구성해야 행 인덱스가 안 밀림): r12~r23
  const elBlocks = area.elements.filter(el => el.name).map(el => ({
    anchorText: `${el.name}\n(${el.points}점)`,
    rows: el.levels.map(lv => ({ text: lv.desc || '', score: lv.score }))
  }));
  if (elBlocks.length) rebuildBlock(tbl, 12, 23, elBlocks);

  // 성취기준 블록: r3~r7
  const stdBlocks = (areaStds.length ? areaStds : [null]).map(s => ({
    anchorText: s ? `[${s.code}] ${s.text}` : '',
    rows: levels.map(lv => ({ label: lv, text: s ? (s.levels[lv] || '') : '' }))
  }));
  rebuildBlock(tbl, 3, 7, stdBlocks);

  rs = rows(tbl);
  const n = rs.length;
  // 헤더·하단 고정 셀 (재구성 후 인덱스 재계산: 뒤에서부터)
  setText(cells(rs[n - 1])[0], AI_NOTICE);
  setText(cells(rs[n - 2])[0], '기본점수-2\n장기 미인정 결석자');
  setText(cells(rs[n - 2])[1], String(area.longAbsence));
  setText(cells(rs[n - 3])[0], '기본점수-1\n본인 의사에 의한 미참여(자발적 미참여, 백지 답안 포함)');
  setText(cells(rs[n - 3])[1], String(area.nonParticipation));
  setText(cells(rs[n - 4])[0], '기본점수(모든 평가요소에서 최저점)');
  setText(cells(rs[n - 4])[1], String(area.basePoint));
  // 평가요소 헤더 행: 요소 블록 시작 직전
  const hdrIdx = n - 4 - elBlocks.reduce((s2, b) => s2 + b.rows.length, 0) - 1;
  if (rs[hdrIdx]) {
    setText(cells(rs[hdrIdx])[0], '평가요소');
    setText(cells(rs[hdrIdx])[1], '수행수준(채점기준)');
    setText(cells(rs[hdrIdx])[2], '배점');
  }
  flipMethods(tbl, area.methods);
  renumber(tbl);
}

function fillAreaTable2015(tbl, plan, area, areaStds) {
  let rs = rows(tbl);
  setText(cells(rs[0])[1], `${area.name}(${area.type})`);
  setText(cells(rs[0])[3], `${area.points}점`);

  // 평가요소 블록: r9~r20
  const elBlocks = area.elements.filter(el => el.name).map(el => ({
    anchorText: `${el.name}\n(${el.points}점)`,
    rows: el.levels.map(lv => ({ text: lv.desc || '', score: lv.score }))
  }));
  if (elBlocks.length) rebuildBlock(tbl, 9, 20, elBlocks);

  // 성취기준+평가기준 블록: r1~r4 (성취기준 1행 + 상중하 3행) — 첫 기준만 원형 활용
  const s = areaStds[0];
  rs = rows(tbl);
  setText(cells(rs[1])[0], '교육과정 성취기준');
  setText(cells(rs[1])[1], areaStds.map(x => `[${x.code}] ${x.text}`).join('\n') || '');
  if (s) ['상', '중', '하'].forEach((lv, i) => {
    const cs = cells(rs[2 + i]);
    setText(cs[cs.length - 1], s.criteria[lv] || '');
  });

  rs = rows(tbl);
  const n = rs.length;
  setText(cells(rs[n - 1])[0], AI_NOTICE);
  setText(cells(rs[n - 2])[0], '기본점수-2\n장기 미인정 결석자');
  setText(cells(rs[n - 2])[1], String(area.longAbsence));
  setText(cells(rs[n - 3])[0], '기본점수-1\n본인 의사에 의한 미참여(자발적 미참여, 백지 답안 포함)');
  setText(cells(rs[n - 3])[1], String(area.nonParticipation));
  setText(cells(rs[n - 4])[0], '기본점수(모든 평가요소에서 최저점)');
  setText(cells(rs[n - 4])[1], String(area.basePoint));
  const hdrIdx = n - 4 - elBlocks.reduce((s2, b) => s2 + b.rows.length, 0) - 1;
  if (rs[hdrIdx]) {
    const cs = cells(rs[hdrIdx]);
    setText(cs[0], '평가요소');
    setText(cs[1], '채점기준');
    setText(cs[cs.length - 1], '배점');
  }
  flipMethods(tbl, area.methods);
  renumber(tbl);
}
