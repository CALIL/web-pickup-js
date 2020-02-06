import Yomitai from './yomitai';
import Lightness from './lightness';

window.initYomitai = (appkey, systemids, isbns, callback) => {
    return new Yomitai({
        appkey: appkey,
        isbns: isbns,
        systemids: systemids,
        callback: callback
    })
}

window.initLightness = (isbns, callback) => {
    return new Lightness({
        isbns: isbns,
        callback: callback
    })
}