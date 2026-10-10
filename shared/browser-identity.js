// A display name, never a browser/device identifier.
export function browserIdentity({userAgent='',maxTouchPoints=0}={}){
 const name=/iPhone/.test(userAgent)?'아이폰':/iPad/.test(userAgent)||/Macintosh/.test(userAgent)&&maxTouchPoints>1?'아이패드':/Android/.test(userAgent)?'Android':/Windows/.test(userAgent)?'Windows PC':/Macintosh/.test(userAgent)?'Mac':'웹 기기';
 const browser=/Edg(?:e|A|iOS)?\//.test(userAgent)?'Edge':/CriOS|Chrome/.test(userAgent)?'Chrome':/FxiOS|Firefox/.test(userAgent)?'Firefox':/Safari/.test(userAgent)?'Safari':'브라우저';
 return {name,browser};
}
