import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub PagesのプロジェクトURL配下でも、ローカル開発でも動く相対パス。
  base: './',
  server: {
    host: '127.0.0.1',
  },
});
