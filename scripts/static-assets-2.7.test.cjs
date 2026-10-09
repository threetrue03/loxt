const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{gunzipSync}=require('node:zlib');
const {serveStatic}=require('../electron/static-assets.cjs');
test('hashed assets gzip/etag/head and HTML revalidation; gzip-disabled requests use identity',async()=>{
 const root=await fs.mkdtemp(path.resolve('test-results/assets-2.7-')),file=path.join(root,'sample.js');await fs.writeFile(file,'const sample=1;'.repeat(1000));
 const response=()=>({writeHead(status,headers){this.status=status;this.headers=headers;},end(data){this.data=data;}});
 try{const r=response();await serveStatic({method:'GET',headers:{'accept-encoding':'gzip'}},r,file,'assets/sample-ABCDEFGH.js');assert.equal(r.headers['Cache-Control'],'public, max-age=31536000, immutable');assert.equal(r.headers['Content-Encoding'],'gzip');assert.equal(gunzipSync(r.data).length,15000);assert.equal(r.headers['Content-Length'],r.data.length);
  const same=response();await serveStatic({method:'GET',headers:{'accept-encoding':'gzip','if-none-match':r.headers.ETag}},same,file,'assets/sample-ABCDEFGH.js');assert.equal(same.status,304);
  const html=response();await serveStatic({method:'HEAD',headers:{}},html,file,'web.html');assert.equal(html.headers['Cache-Control'],'no-cache');assert.equal(html.headers['Content-Length'],15000);assert.equal(html.data,undefined);
  const disabled=response();await serveStatic({method:'HEAD',headers:{'accept-encoding':'br, gzip;q=0'}},disabled,file,'assets/sample-ABCDEFGH.js');assert.equal(disabled.headers['Content-Encoding'],undefined);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
