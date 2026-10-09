const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {DeviceServer}=require('../electron/device-server.cjs');
test('site personal URL: LAN HTTPS only and never persist pairing fragments',async()=>{
 const {connectionURL}=await import('../landing/src/connection.mjs');
 for(const host of ['10.0.0.2','192.168.1.2','172.16.0.2','172.31.255.2','127.0.0.1','localhost']){
  const {first,base}=connectionURL(` https://${host}:1234/web.html#pair=${'a'.repeat(48)} `);
  assert.ok(first.endsWith('#pair='+'a'.repeat(48)));assert.equal(base,`https://${host}:1234/web.html`);
 }
 assert.equal(connectionURL('https://192.168.0.1:1234/').base,'https://192.168.0.1:1234/web.html');
 assert.throws(()=>connectionURL('https://192.168.0.1:1234/web.html',{requirePair:true}),/#pair/);assert.ok(connectionURL('https://192.168.0.1:1234/web.html#pair='+'b'.repeat(48),{requirePair:true}).first.endsWith('b'.repeat(48)));
 for(const value of ['javascript:alert(1)','http://192.168.0.1:1234/web.html','https://example.com/web.html','https://192.168.1.999/web.html','https://172.32.1.1/web.html','https://user:pass@10.0.0.1/web.html','https://10.0.0.1/api/session','https://10.0.0.1/web.html?token=secret','https://10.0.0.1/web.html#other=secret','not a URL'])assert.throws(()=>connectionURL(value));
});
test('copyable pairing address lifecycle: QR token, expiration renewal, stopped addresses cleared',async()=>{
 const parent=path.resolve('test-results/connection-unit');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'profile-'));const server=new DeviceServer({root,dist:path.resolve('dist'),rpc:async()=>{},asset:async()=>{throw Error('unused');}});
 await server.initialize();await assert.rejects(()=>server.copyAddress('pair'));await assert.rejects(()=>server.newQR());
 try{
  await server.configure(true);const initial=await server.copyAddress('pair');assert.equal(initial,server.snapshot().pairURL);assert.equal(new URL(initial).hash,'#pair='+server.pairToken);
  assert.equal(server.pending.get(server.pairToken).expires,server.snapshot().pairExpires);assert.ok(server.snapshot().qr.startsWith('data:image/png;'));
  if(server.snapshot().addresses.length){assert.equal(await server.copyAddress('reconnect'),server.snapshot().addresses[0]);assert.ok(!(await server.copyAddress('reconnect')).includes('#'));assert.equal(await server.copyAddress('bootstrap'),server.snapshot().bootstrap[0]);}
  await assert.rejects(()=>server.copyAddress('unsafe'));await assert.rejects(()=>server.copyAddress('reconnect',-1));
  server.pending.get(server.pairToken).expires=Date.now()-1;assert.equal(server.snapshot().pairURL,'');assert.equal(server.snapshot().qr,'');const renewed=await server.copyAddress('pair');assert.notEqual(initial,renewed);
  server.pending.delete(server.pairToken);assert.equal(server.snapshot().pairURL,'');assert.notEqual(await server.copyAddress('pair'),renewed);
 }finally{await server.configure(false);}
 assert.deepEqual(server.snapshot().addresses,[]);assert.deepEqual(server.snapshot().bootstrap,[]);assert.equal(server.snapshot().pairURL,'');await assert.rejects(()=>server.copyAddress('pair'));
 assert.ok(!(await fs.readFile(path.join(root,'devices.json'),'utf8')).includes('#pair='));
});
