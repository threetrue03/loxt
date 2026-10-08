// Some iOS Safari versions have ReadableStream.getReader, but no async iterator.
// PDF.js 6 getTextContent uses `for await`; read its public text stream directly.
export async function readPdfText(page) {
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
