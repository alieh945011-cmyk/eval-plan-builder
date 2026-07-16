// GAS 프록시 호출 클라이언트 — GAS 배포 URL은 localStorage에 저장
const URL_KEY = 'evalPlan.gasUrl';

export function getGasUrl() {
  return localStorage.getItem(URL_KEY) || '';
}

export function setGasUrl(url) {
  localStorage.setItem(URL_KEY, url.trim());
}

export async function checkGas() {
  const url = getGasUrl();
  if (!url) throw new Error('GAS 배포 URL이 설정되지 않았습니다.');
  const res = await fetch(url, { method: 'GET' });
  return res.json();
}

// Content-Type을 text/plain으로 보내 CORS preflight를 피한다 (GAS 웹앱 호환 패턴)
export async function aiGenerate(prompt, schema = null, temperature = 0.6) {
  const url = getGasUrl();
  if (!url) throw new Error('GAS 배포 URL이 설정되지 않았습니다. 설정에서 입력하세요.');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'generate', prompt, schema, temperature })
  });
  if (!res.ok) throw new Error(`프록시 오류: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'AI 호출 실패');
  return data;  // {ok, model, text}
}

// GAS URL 설정 폼 조각 — 여러 화면에서 재사용
export function gasSettingsHtml() {
  return `
    <details ${getGasUrl() ? '' : 'open'} style="margin-bottom:14px">
      <summary style="cursor:pointer;font-weight:600;color:var(--navy-700)">AI 서버(GAS) 연결 설정 ${getGasUrl() ? '— 연결됨' : '— 미설정'}</summary>
      <div style="padding:10px 0">
        <label class="field">Apps Script 웹 앱 배포 URL
          <input type="text" id="gas-url" value="${getGasUrl()}" placeholder="https://script.google.com/macros/s/…/exec">
        </label>
        <button class="btn btn-ghost" id="gas-save">저장 후 연결 확인</button>
        <span id="gas-status" style="margin-left:8px;font-size:14px"></span>
      </div>
    </details>`;
}

export function bindGasSettings(rootEl) {
  const btn = rootEl.querySelector('#gas-save');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const status = rootEl.querySelector('#gas-status');
    setGasUrl(rootEl.querySelector('#gas-url').value);
    status.textContent = '확인 중…';
    try {
      const r = await checkGas();
      status.textContent = r.keySet ? '연결됨 · API 키 설정 확인' : '연결됐지만 GEMINI_API_KEY가 스크립트 속성에 없습니다.';
    } catch (e) {
      status.textContent = `연결 실패: ${e.message}`;
    }
  });
}
