// 영역별 평가요소·채점기준(루브릭) AI 도우미 — 추천 → 새로고침(채점기준만) → 저장 → 저장본 선택 적용
import { buildRubricPrompt, buildRubricRefreshPrompt } from './prompts.js';
import { aiGenerate, getGasUrl } from './ai.js';
import { esc } from './editor.js';

const RUBRIC_SCHEMA = {
  type: 'OBJECT',
  properties: {
    elements: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: '평가요소 — "~하기" 형태' },
          points: { type: 'INTEGER', description: '평가요소 배점(최고 점수와 동일)' },
          levels: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                score: { type: 'INTEGER' },
                desc: { type: 'STRING', description: '수행수준(채점기준) 문장' }
              },
              required: ['score', 'desc']
            }
          }
        },
        required: ['name', 'points', 'levels']
      }
    }
  },
  required: ['elements']
};

function normalizeElements(elements) {
  return (elements || []).map(el => ({
    name: String(el.name || '').trim(),
    points: Number(el.points) || 0,
    levels: (el.levels || []).map(lv => ({ score: Number(lv.score) || 0, desc: String(lv.desc || '').trim() }))
  }));
}

// 전체 추천: 평가요소 이름·배점·채점기준을 새로 생성
export async function generateRubric(plan, area, subjectData) {
  const out = await aiGenerate(buildRubricPrompt(plan, area, subjectData), RUBRIC_SCHEMA, 0.7);
  return { elements: normalizeElements(JSON.parse(out.text).elements), model: out.model };
}

// 새로고침: 뼈대(이름·배점·점수) 유지, desc만 교체
export async function refreshRubric(plan, area, subjectData, draftElements) {
  const out = await aiGenerate(
    buildRubricRefreshPrompt(plan, area, subjectData, draftElements), RUBRIC_SCHEMA, 0.85);
  const fresh = normalizeElements(JSON.parse(out.text).elements);
  // 이름·배점·점수는 원본 유지, desc만 이름/점수 매칭으로 덮어씀
  const elements = draftElements.map((el, ei) => {
    const match = fresh.find(f => f.name === el.name) || fresh[ei] || { levels: [] };
    return {
      name: el.name, points: el.points,
      levels: el.levels.map((lv, li) => {
        const fl = match.levels.find(x => x.score === lv.score) || match.levels[li];
        return { score: lv.score, desc: fl ? fl.desc : lv.desc };
      })
    };
  });
  return { elements, model: out.model };
}

// ── 패널 HTML (편집기 area 카드 안에 삽입) ─────────────────
export function rubricPanelHtml(area, i) {
  const draft = area.rubricDraft;
  const saved = area.savedRubrics || [];
  const connected = !!getGasUrl();
  return `
  <div style="border:1.5px dashed var(--navy-500);border-radius:10px;padding:12px;margin:6px 0 14px;background:#f7fbff">
    <div style="font-weight:700;color:var(--navy-700);margin-bottom:4px">🤖 AI 채점기준 도우미</div>
    <p style="font-size:13px;color:var(--gray-600);margin:0 0 8px">
      이 영역의 수행과제·성취기준·배점을 근거로 평가요소와 채점기준을 추천합니다.
      채점기준 문장만 새로 뽑아 비교하고, 마음에 드는 초안을 저장했다가 골라 표에 적용하세요.
      ${connected ? '' : '<b style="color:#7a5200">— AI 서버(GAS) 미연결: 아래 연결 설정을 먼저 완료하세요.</b>'}
    </p>
    <p style="margin:0 0 6px">
      <button class="btn btn-primary" data-act="rubricGen" data-i="${i}">평가요소·채점기준 추천받기</button>
      ${saved.length ? `<button class="btn btn-ghost" data-act="rubricToggleSaved" data-i="${i}">저장한 내용 보기 (${saved.length})</button>` : ''}
      <span data-rubric-status="${i}" style="font-size:13px;margin-left:6px"></span>
    </p>

    ${draft ? draftHtml(draft, i) : ''}
    ${area._showSaved ? savedHtml(saved, i) : ''}
  </div>`;
}

function draftHtml(draft, i) {
  return `
  <div style="border:1px solid var(--gray-300);border-radius:8px;padding:10px;margin-top:8px;background:var(--white)">
    <div style="font-weight:600;color:var(--navy-700);margin-bottom:4px">추천 초안 (표에 아직 적용 안 됨)</div>
    ${draft.elements.map(el => `
      <div style="font-size:13px;margin:4px 0">
        <b>· ${esc(el.name)}</b> <span style="color:var(--gray-600)">(${el.points}점)</span>
        <ul style="margin:2px 0 4px 20px;padding:0">
          ${el.levels.map(lv => `<li>${lv.score}점 — ${esc(lv.desc)}</li>`).join('')}
        </ul>
      </div>`).join('')}
    <p style="margin:6px 0 0">
      <button class="btn btn-ghost" data-act="rubricRefresh" data-i="${i}">채점기준만 새로고침</button>
      <button class="btn btn-ghost" data-act="rubricSave" data-i="${i}">이 초안 저장</button>
      <button class="btn btn-primary" data-act="rubricApply" data-i="${i}">이 초안을 표에 적용</button>
    </p>
  </div>`;
}

function savedHtml(saved, i) {
  if (!saved.length) return '<p style="font-size:13px;color:var(--gray-600);margin-top:8px">저장된 초안이 없습니다.</p>';
  return `
  <div style="border:1px solid var(--gray-300);border-radius:8px;padding:10px;margin-top:8px;background:var(--white)">
    <div style="font-weight:600;color:var(--navy-700);margin-bottom:4px">저장한 초안 ${saved.length}개</div>
    ${saved.map((sv, si) => `
      <div style="border-top:1px solid var(--gray-100);padding:6px 0">
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <b style="font-size:13px">${esc(sv.label)}</b>
          <span>
            <button class="btn btn-primary" data-act="rubricApplySaved" data-i="${i}" data-si="${si}">이 표로 적용</button>
            <button class="btn btn-ghost" data-act="rubricDelSaved" data-i="${i}" data-si="${si}">삭제</button>
          </span>
        </div>
        ${sv.elements.map(el => `<div style="font-size:12px;color:var(--gray-600);margin-top:2px">· ${esc(el.name)} (${el.points}점): ${el.levels.map(lv => `${lv.score}—${esc(lv.desc)}`).join(' / ')}</div>`).join('')}
      </div>`).join('')}
  </div>`;
}
