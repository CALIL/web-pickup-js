import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  // 開発サーバーは src/index.html をそのまま開く（旧 `parcel src/index.html` 相当）
  root: 'src',
  build: {
    // GitHub Pages が docs/ を配信しているため出力先は docs/ 固定。
    // docs/index.html と docs/index.css は手で管理しているので消さない。
    outDir: resolve(import.meta.dirname, 'docs'),
    emptyOutDir: false,
    // IE11 対応をやめたのでポリフィルは同梱しない。構文は Vite の下限の es2015 に
    // 下げておく。src が使う fetch / URL / URLSearchParams / Object.values は
    // いずれも Chrome 54・Safari 10.1・Firefox 47 以降でネイティブに揃っている。
    target: 'es2015',
    sourcemap: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.js'),
      name: 'yomitai',
      formats: ['iife'],
      // 旧 `parcel build src/index.js --out-dir docs` と同じ docs/index.js を出す
      fileName: () => 'index.js',
    },
  },
})
