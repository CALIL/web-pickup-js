/*

 カーリル APIライブラリ

 Copyright (c) 2016 CALIL Inc.
 This software is released under the MIT License.
 http://opensource.org/licenses/mit-license.php

 */

// Todo: タイムアウトの実装

var ENDPOINT = 'https://api.calil.jp/';

/**
 * カーリル APIにアクセスするための共通関数
 * @param command APIのコマンド
 * @returns {Object}
 * @private
 */
function _request(command, params) {
  const url = new URL(ENDPOINT + command);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]))
  return fetch(url, params);
}

/** 蔵書検索APIクラス  */
export class check {
  /**
   * 蔵書検索API起動
   * @param callback - コールバック関数
   */
  constructor(appkey, isbns, sytemids, callback) {
    this.appkey = appkey;
    this.callback = callback;
    this.killed = false;
    this.data = null;
    this.session = null;
    this.pollingInterval = 1000; // ポーリング間隔
    this.pollingStart = Date.now(); // ポーリング開始時刻(エポックms)
    this.pollingTimeout = 300000; // タイムアウト
    this.retryCount = 0; // 連続失敗回数
    this.maxRetries = 5; // 連続失敗の上限。超えたら timeout として通知して止める
    // ページ離脱による実行中fetchの中断は正常系。リトライしない
    window.addEventListener('pagehide', () => this.kill());
    this.search(isbns, sytemids);
  }

  /**
   * 検索の中止
   */
  kill() {
    this.killed = true;
  }

  /**
   * リトライ共通処理
   * 上限までは指数バックオフ(1s,2s,4s,8s,16s)で再試行し、超えたら timeout として callback に通知して止める
   */
  retry(fn) {
    if (this.killed) return;
    if (this.retryCount >= this.maxRetries) {
      this.giveUp();
      return;
    }
    const delay = this.pollingInterval * Math.pow(2, this.retryCount);
    this.retryCount++;
    setTimeout(fn, delay);
  }

  /**
   * 諦めて timeout として通知する
   */
  giveUp() {
    this.kill();
    const data = this.data || {};
    data.status = 'timeout';
    data.continue = 0;
    this.callback(data);
  }

  search(isbns, systemids) {
    if (!this.killed) {
      _request('check', {
        appkey : this.appkey,
        isbn: isbns,
        systemid: systemids,
        format: 'json',
        callback: 'no'
      }).then((r) => {
        if (r.status===200) {
          this.retryCount = 0;
          r.json().then((data) => this.receive(data));
        } else {
          this.retry(() => this.search(isbns, systemids));
        }
      }).catch(() => {
        // 通信断・バックグラウンド化など。未処理の拒否にせずリトライする
        this.retry(() => this.search(isbns, systemids));
      })
    }
  }

  polling() {
    if (!this.killed) {
      _request('check', {
        appkey: this.appkey,
        session: this.session,
        callback: 'no'
      }).then((r) => {
        if (r.status===200) {
          this.retryCount = 0;
          r.json().then((data) => this.receive(data));
        } else {
          this.retry(() => this.polling());
        }
      }).catch(() => {
        this.retry(() => this.polling());
      })
    }
  }

  receive(data) {
    if (!this.killed) {
      this.data = data;
      if (Date.now() - this.pollingStart >= this.pollingTimeout) {
        this.data.status = 'timeout';
      }
      if(this.data.session) {
        this.session = this.data.session;
      }
      this.callback(this.data);
      if (this.data.continue === 1) {
        console.log('[Calil] continue...');
        setTimeout(()=> this.polling(), this.pollingInterval);
      } else {
        console.log('[Calil] complete.');
      }
    }
  }
}
