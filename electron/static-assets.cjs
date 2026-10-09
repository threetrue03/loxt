const fs=require('node:fs/promises'),path=require('node:path'),{createReadStream}=require('node:fs');
const {promisify}=require('node:util'),gzip=promisify(require('node:zlib').gzip);
const cache=new Map();let bytes=0;
async function serveStatic(req,res,filename,relative){
 const stat=await fs.lstat(filename);if(!stat.isFile())throw Error('페이지를 찾지 못했습니다.');
 const ext=path.extname(filename),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.json':'application/json','.webmanifest':'application/manifest+json'}[ext]||'application/octet-stream';
 const compressed=(req.headers['accept-encoding']||'').split(',').some(part=>/^gzip(?:\s*;|$)/i.test(part.trim())&&!/;\s*q\s*=\s*0(?:\.0*)?(?:\s*;|\s*$)/i.test(part))&&['.js','.mjs','.css','.svg','.html','.json','.webmanifest'].includes(ext)&&stat.size>=1024&&stat.size<=8*1024*1024;
 const etag=`W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}-${compressed?'gzip':'identity'}"`;
 const immutable=/^assets\/.+-[a-zA-Z0-9_-]{8,}\.[^/]+$/.test(relative.replaceAll('\\','/'));
 const headers={'Content-Type':mime,'Cache-Control':immutable?'public, max-age=31536000, immutable':'no-cache','ETag':etag,'Vary':'Accept-Encoding'};
 if(req.headers['if-none-match']?.split(',').map(v=>v.trim()).includes(etag)){res.writeHead(304,headers);res.end();return;}
 let data;if(compressed){const key=filename+etag;if(cache.has(key)){data=cache.get(key);cache.delete(key);cache.set(key,data);}else{data=await gzip(await fs.readFile(filename),{level:4});if(cache.has(key)){data=cache.get(key);cache.delete(key);cache.set(key,data);}else{cache.set(key,data);bytes+=data.length;}while(cache.size>128||bytes>32*1024*1024){const oldest=cache.keys().next().value;bytes-=cache.get(oldest).length;cache.delete(oldest);}}headers['Content-Encoding']='gzip';}
 headers['Content-Length']=data?.length??stat.size;res.writeHead(200,headers);
 if(req.method==='HEAD')res.end();else if(data)res.end(data);else createReadStream(filename).on('error',()=>res.destroy()).pipe(res);
}
module.exports={serveStatic};
