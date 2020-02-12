import Yomitai from './yomitai';

window.initYomitai = (appkey, systemids, isbns, callback) => {
    return new Yomitai({
        appkey: appkey,
        isbns: isbns,
        systemids: systemids,
        callback: callback
    })
}