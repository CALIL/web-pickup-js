# ポーリングの fetch 失敗をリトライし、諦めたら timeout として通知する

## 背景（Context）

このライブラリのビルド成果物 `docs/index.js` は `npm run deploy` で web4 の `public/yomitai/index.js` に
コピーされ、カーリルのトップページ（`https://calil.jp/`）の「みんなが読みたい」の蔵書状況表示に使われている。

web4 のクライアントサイド Sentry（プロジェクト `web4-js`）で、このバンドル発の
`TypeError: Failed to fetch` / `TypeError: Load failed (api.calil.jp)` が **直近30日で約1,300件**
記録されている（WEB4-JS-8 が1,122件、ほかに 54 / 55 / 53 / E）。web4-js の全イベントの約2割を占め、
実ユーザーに影響する issue を埋もれさせている。スタックトレースのない Safari 由来の
`Load failed`（WEB4-JS-A、約450件）も同じ出所と見ている。

2026-09-02 の web4 側の棚卸し記録: web4 リポジトリ `docs/plans/2026-09-02-web4-js-sentry-noise.md`。

### 機構

`src/api_calil.js` の `check` クラスは `search()` と `polling()` で `_request(...).then(...)` を呼ぶが、
どちらにも `.catch` がなかった。通信断・機内モード・ページのバックグラウンド化・ページ遷移中の中断で
`fetch` が reject すると、そのまま **未処理の Promise 拒否**になり、Sentry の
`onunhandledrejection` ハンドラが `handled: no` の error として記録する。

Sentry のイベントは Android の Chrome Mobile が7割で、モバイル回線の切断が主因。

### ユーザー体験の問題

fetch が reject した時点でポーリングのチェーンが途切れるため、回線が復帰しても検索は再開しない。
初回の `check` で失敗すると全冊が `nostatus` のまま、ポーリング途中で失敗すると `Yomitai.new()` が
最大3冊に付けた「検索中」がページを再読み込みするまで消えない。モバイルでの一時的な切断で
この状態になるのは体験として悪い。

## 方針

yomitai リポジトリの `ui/src/CalilAPI.ts` と同じ **上限付き指数バックオフのリトライ**を入れる。

- fetch の reject と非 200 応答はどちらもリトライ対象。待ち時間は 1s, 2s, 4s, 8s, 16s の5回（合計約31秒）
- 成功（200）したら連続失敗回数をリセットする。長いポーリングの途中で断続的に切れても耐える
- 上限に達したら `kill()` して、`status: 'timeout'` と `continue: 0` を立てたデータで callback を1回呼ぶ。
  `src/yomitai.js` の既存分岐で全冊が「タイムアウト」表示になり、「検索中」のまま固まらない
- `pagehide` で `kill()` する。ページ遷移中の fetch 中断はリトライしない
- タイムアウト判定は `pollingTime += pollingInterval` の累積ではなく、開始時刻からの経過時間で行う。
  リトライの待ち時間を数えられないため

### `CalilAPI.ts` から変えた点

- Sentry への報告は入れない。このライブラリに `@sentry/browser` の依存はなく、web4 側の方針
  （想定内の事象は記録しない）に合わせる
- 上限到達時に黙って止めるのではなく callback へ timeout を通知する
- 500 を「セッション期限切れ」として握る分岐は入れない。yomitai 固有の判断なので、ここでは他の非 200 と同じくリトライする

### 副産物として直る既存バグ

旧 `search()` は非 200 時に `this.search()` を引数なしで呼び直しており `isbn` が undefined になっていた。
リトライのクロージャで `isbns, systemids` を保持するので、この問題は消える。

### 触らないもの

- `r.json()` のパース失敗（2xx なのに JSON でない）は起きる根拠がないので握らない
- 受信データが `pollingTimeout` を超えて timeout 判定されても `continue: 1` ならポーリングを続ける
  既存挙動はそのまま

## 変更内容

`src/api_calil.js` の `check` クラス。

- コンストラクタに `pollingStart`, `retryCount`, `maxRetries` を追加し、`pagehide` リスナを登録
- `retry(fn)` を追加。`killed` なら何もしない。上限なら `giveUp()`。それ以外は指数バックオフで `setTimeout(fn, delay)`
- `giveUp()` を追加。`kill()` してから `this.data`（null なら空オブジェクト）に `status: 'timeout'`,
  `continue: 0` を立てて callback を呼ぶ
- `search()` / `polling()` の非 200 分岐と `.catch` で `retry()` を呼び、200 で `retryCount = 0`
- `receive()` の timeout 判定を `Date.now() - this.pollingStart >= this.pollingTimeout` に変更し、
  `pollingTime` を廃止

## テスト

`test/api_calil.test.mjs` に Node 標準の `node:test` で書く。`fetch` と `window` をグローバルに差し込む
だけで jsdom は使わない。`npm test` が `node --test` を呼び、CI（`.github/workflows/ci.yml`）の Test
ステップでも走る。

1. 最初の `check` の fetch が reject し続けたとき、`unhandledRejection` が発生せず、5回リトライした後に
   `status: 'timeout'` で callback が1回だけ呼ばれ、`killed` が true になる
2. 1回目が `continue: 1` で成功し、2回目のポーリングの fetch が1回 reject して次に成功したとき、
   callback に結果が届き `retryCount` が 0 に戻る
3. fetch が成功したときは従来どおり callback に本の状態が届く
4. `pagehide` 後は fetch が reject してもリトライされない

## デプロイ

1. `npm run build` で `docs/index.js` を再生成
2. `npm run deploy` で web4 の `public/yomitai/index.js` にコピー
3. web4 側でコミット・デプロイ。`public/` 配下は nginx とブラウザで最大20分キャッシュされるが、
   このファイルは HTML から新しい関数を呼ぶ変更ではないので新旧混在で壊れない

## 確認

デプロイの翌週、web4-js の WEB4-JS-8 / 54 / 55 / 53 / E に新規イベントが増えないこと。
WEB4-JS-A（スタックなしの `Load failed`）も減れば同じ出所だったことが確定する。

## 追記（2026-09-04）: 反映後も残る Failed to fetch

2026-09-02 の反映で web4-js の WEB4-JS-8 は 38件/日 → 15件/日 に減ったが止まっていない。
WEB4-JS-A（スタックなしの `Load failed`）は 16件/日 → 1.6件/日 に減り、同じ出所だったことは確定した。
WEB4-JS-8 の最新イベントのスタックには新バンドルの `retryCount` / `giveUp` が写っており、新コードで起きている。

### 原因

`search()` / `polling()` は `_request(...).then(...).catch(...)` で **fetch 自体の reject** は拾うが、
200 応答の本文を読む `r.json()` は

```js
r.json().then((data) => this.receive(data));
```

と別の Promise チェーンで、catch がない。Chrome は本文の受信中に回線が切れると `json()` を
`TypeError: Failed to fetch` で reject するため、ここが未処理の拒否として残る。
Sentry の分布が Android の Chrome Mobile 中心で変わっていないのも整合する。

### 追加修正

`json()` の失敗だけをリトライに乗せる。`receive()` やその先の callback で起きた例外まで握らないよう、
`.catch` ではなく `then` の第2引数で受ける。`search()` と `polling()` の両方。

```js
        if (r.status===200) {
          r.json().then(
            (data) => { this.retryCount = 0; this.receive(data); },  // リセットは本文が読めてから
            () => this.retry(() => this.polling())   // search() 側は () => this.search(isbns, systemids)
          );
        } else {
```

### テスト

`test/api_calil.test.mjs` に追加: 200 応答だが `json()` が reject するとき、`unhandledRejection` が
発生せず、`retryCount` が増えてリトライが予約されること。

### 確認

web4 に取り込んで反映後、WEB4-JS-8 の新規イベントが 0 になること。
