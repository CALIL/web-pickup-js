import { resolve } from 'node:path'
import { transformAsync } from '@babel/core'
import presetEnv from '@babel/preset-env'
import { defineConfig } from 'vite'

// 配布物は calil.jp の本番ページに <script> で読み込まれるため、
// Parcel v1 の出力と同じ ES5 まで下げる。Vite の build.target は es2015 が下限で、
// @vitejs/plugin-legacy はライブラリモード非対応なので、
// バンドル後のチャンクを Babel で ES5 に変換する。
// core-js / whatwg-fetch は src/api_calil.js で明示 import しているため
// useBuiltIns は false（Parcel v1 と同じ、ポリフィルの自動注入はしない）。
const babelToEs5 = {
  name: 'caliljp-babel-es5',
  apply: 'build',
  async renderChunk(code, chunk) {
    const result = await transformAsync(code, {
      filename: chunk.fileName,
      babelrc: false,
      configFile: false,
      compact: false,
      sourceMaps: true,
      presets: [
        [
          presetEnv,
          {
            targets: { chrome: '58', ie: '11' },
            useBuiltIns: false,
          },
        ],
      ],
    })
    return { code: result.code, map: result.map }
  },
}

export default defineConfig({
  // 開発サーバーは src/index.html をそのまま開く（旧 `parcel src/index.html` 相当）
  root: 'src',
  build: {
    // GitHub Pages が docs/ を配信しているため出力先は docs/ 固定。
    // docs/index.html と docs/index.css は手で管理しているので消さない。
    outDir: resolve(import.meta.dirname, 'docs'),
    emptyOutDir: false,
    target: 'es2015',
    minify: 'terser',
    sourcemap: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.js'),
      name: 'yomitai',
      formats: ['iife'],
      // 旧 `parcel build src/index.js --out-dir docs` と同じ docs/index.js を出す
      fileName: () => 'index.js',
    },
  },
  plugins: [babelToEs5],
})
