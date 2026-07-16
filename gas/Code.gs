// Gemini API 프록시 (Google Apps Script) — API 키를 서버에만 두고 웹앱에서 호출
// 배포: 웹 앱으로 배포, 액세스 권한 "모든 사용자". 키는 프로젝트 설정 → 스크립트 속성 →
// GEMINI_API_KEY 로 저장한다. 코드에 키를 적지 않는다.

var MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'];

// 헬스체크 — 배포 URL을 브라우저로 열면 상태가 보인다
function doGet() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  return json_({ ok: true, service: 'eval-plan-builder-proxy', keySet: !!key });
}

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    if (req.action === 'generate') {
      var out = callGemini_(req.prompt, req.schema || null, req.temperature);
      return json_({ ok: true, model: out.model, text: out.text });
    }
    return json_({ ok: false, error: '알 수 없는 action: ' + req.action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function callGemini_(prompt, schema, temperature) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY가 스크립트 속성에 없습니다.');
  var lastErr = '';
  for (var i = 0; i < MODELS.length; i++) {
    var model = MODELS[i];
    var body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: temperature || 0.6, maxOutputTokens: 8192 }
    };
    if (schema) {
      body.generationConfig.responseMimeType = 'application/json';
      body.generationConfig.responseSchema = schema;
    }
    var res = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key,
      { method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true }
    );
    var code = res.getResponseCode();
    if (code === 404 || code === 429 || code === 403) { lastErr = model + ': HTTP ' + code; continue; }
    if (code !== 200) throw new Error(model + ': HTTP ' + code + ' — ' + res.getContentText().slice(0, 300));
    var data = JSON.parse(res.getContentText());
    var text = data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0].text;
    if (text) return { model: model, text: text };
    lastErr = model + ': 빈 응답';
  }
  throw new Error('모든 모델 실패 — ' + lastErr);
}

// GAS 편집기에서 실행해 키·모델을 점검하는 자체 진단
function selfTest() {
  var out = callGemini_('한 단어로 답하세요: 안녕', null, 0.1);
  Logger.log('모델: %s / 응답: %s', out.model, out.text);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
