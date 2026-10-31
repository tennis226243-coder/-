import { defineConfig } from 'vite';

export default defineConfig({
  // 相対パスで出力し、GitHub Pages などのサブディレクトリでも動くようにする
  base: './',
  build: { chunkSizeWarningLimit: 1000 },
});
