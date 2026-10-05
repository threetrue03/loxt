import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
const destination=path.resolve('build/editor-licenses'); await mkdir(destination,{recursive:true});
const records=[];
for(const [location, metadata] of Object.entries(lock.packages)) {
  if (!location.startsWith('node_modules/') || metadata.dev) continue;
  const pkg=JSON.parse(await readFile(path.join(location,'package.json'),'utf8'));
  const files=(await readdir(location,{withFileTypes:true})).filter(entry=>entry.isFile()&&/^(licen[cs]e|copying|notice)(\.|-|$)/i.test(entry.name));
  const parts=[];
  for(const file of files) parts.push(`--- ${file.name} ---\n${await readFile(path.join(location,file.name),'utf8')}`);
  records.push({name:pkg.name,version:pkg.version,license:pkg.license||metadata.license,source:pkg.repository?.url||pkg.repository||pkg.homepage||metadata.resolved,files:files.map(file=>file.name)});
  await writeFile(path.join(destination,pkg.name.replace(/[\/@]/g,'_')+'.txt'),`${pkg.name} ${pkg.version}\nLicense: ${pkg.license||metadata.license}\nSource: ${JSON.stringify(records.at(-1).source)}\n\n${parts.join('\n\n')}`);
}
await writeFile(path.join(destination,'index.json'),JSON.stringify(records,null,2));
await mkdir('docs/licenses',{recursive:true});await writeFile('docs/licenses/editor-packages.json',JSON.stringify(records,null,2));
console.log(`License notices: ${records.length} production packages. No XL/GPL editor packages included.`);
