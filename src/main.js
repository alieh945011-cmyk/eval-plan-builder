// 앱 진입점 — 셸(헤더·메인·푸터) 렌더와 해시 라우팅
import { renderReview } from './review.js';
import { renderEditor } from './editor.js';
import { renderSemester } from './semester.js';
import { renderAiScreen } from './aiscreen.js';

const app = document.getElementById('app');

app.innerHTML = `
  <header class="app-header">
    <div class="inner">
      <h1>수행평가 평가계획 도우미</h1>
      <span class="badge">2015·2022 개정 동시 지원</span>
      <p class="subtitle">교수학습 및 평가운영계획 3~6번(성취기준·반영비율·수행평가 세부기준)을 설계하고 HWPX·엑셀로 내보냅니다.</p>
    </div>
  </header>
  <main class="app-main" id="main"></main>
  <footer class="app-footer">
    수행평가 평가계획 도우미 · 입력 정보는 브라우저 안에서만 처리됩니다 (AI 생성 요청 시에만 서버 경유)
  </footer>
`;

const main = document.getElementById('main');

async function route() {
  const hash = location.hash.replace('#', '');
  try {
    if (hash === 'review') {
      await renderReview(main);
    } else if (hash === 'semester') {
      await renderEditor(document.createElement('div'));  // plan·subjectData 초기화 보장
      await renderSemester(main);
    } else if (hash === 'ai') {
      await renderEditor(document.createElement('div'));
      await renderAiScreen(main);
    } else if (hash === 'preview') {
      main.innerHTML = `<div class="card"><h2>준비 중</h2>
        <p>이 기능은 다음 단계에서 열립니다. <a href="#">← 편집기로 돌아가기</a></p></div>`;
    } else {
      await renderEditor(main);
    }
  } catch (e) {
    main.innerHTML = `<div class="notice notice-error">오류: ${e.message}</div>`;
  }
}

window.addEventListener('hashchange', route);
route();
