// Some iOS Safari versions have ReadableStream.getReader, but no async iterator.
// PDF.js 6 getTextContent uses `for await`; read its public text stream directly.
const cache=new Map();
export function forgetPdfText(){cache.clear();}
export function readPdfText(page){if(cache.has(page))return cache.get(page);const request=collect(page).catch(e=>{cache.delete(page);throw e;});cache.set(page,request);while(cache.size>6)cache.delete(cache.keys().next().value);return request;}
async function collect(page) {
  const reader = page.streamTextContent().getReader();
  const text = { items:[], styles:Object.create(null), lang:null };
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) return text;
      text.lang ??= value.lang;
      Object.assign(text.styles,value.styles);
      text.items.push(...value.items);
    }
  } finally { reader.releaseLock(); }
}
