// GitHub Pages 하위 경로 배포를 위한 Vite 설정
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/eval-plan-builder/',
  build: {
    outDir: 'dist',
    target: 'es2019'
  }
});
