/*
 Lightness js
 Copyright (c) 2020 CALIL Inc.
 This software is released under the MIT License.
 http://opensource.org/licenses/mit-license.php

 図書館API仕様書 | カーリル
 https://calil.jp/doc/api_ref.html
*/

export default class Lightness {
    constructor(props) {
        this.props = props
        this.check()
    }
    check() {
        fetch('https://asia-northeast1-libmuteki2.cloudfunctions.net/api-image-lightness?isbns='+this.props.isbns.join(',')).then((r) => r.json()).then((r) => {
            this.props.callback(r)
        })
    }
}