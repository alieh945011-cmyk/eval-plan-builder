// 앱 진입점 — 셸(헤더·메인·푸터) 렌더와 화면 라우팅의 시작점
const app = document.getElementById('app');

app.innerHTML = `
  <header class="app-header">
    <div class="inner">
      <h1>수행평가 평가계획 도우미</h1>
      <span class="badge">2015·2022 개정 동시 지원</span>
      <p class="subtitle">교수학습 및 평가운영계획 3~6번(성취기준·반영비율·수행평가 세부기준)을 설계하고 HWPX·엑셀로 내보냅니다.</p>
    </div>
  </header>
  <main class="app-main" id="main">
    <div class="card">
      <h2><span class="step-no">1</span>기본 정보</h2>
      <p>학년을 고르면 교육과정(2015/2022 개정)이 자동으로 결정되고, 과목을 고르면 성취기준이 불러와집니다.</p>
      <div class="notice notice-warn">공사 중 — 데이터 파이프라인(Phase 1) 완료 후 이 자리에 위저드가 들어갑니다.</div>
    </div>
  </main>
  <footer class="app-footer">
    수행평가 평가계획 도우미 · 입력 정보는 브라우저 안에서만 처리됩니다 (AI 생성 요청 시에만 서버 경유)
  </footer>
`;
