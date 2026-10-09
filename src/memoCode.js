import {codeBlockOptions} from '@blocknote/code-block';
import {SyntaxHighlightingExtension,createCodeBlockSpec} from '@blocknote/core';
import {createBundledHighlighter} from '@shikijs/core';
import {createJavaScriptRegexEngine} from '@shikijs/engine-javascript';
export const memoCodeOptions={...codeBlockOptions,supportedLanguages:{...codeBlockOptions.supportedLanguages,...{"docker":{"name":"Docker","aliases":["dockerfile"]},"go":{"name":"Go","aliases":["golang"]},"powershell":{"name":"PowerShell","aliases":["ps1"]},"toml":{"name":"TOML","aliases":[]},"ini":{"name":"INI","aliases":[]},"diff":{"name":"Diff","aliases":["patch"]},"bat":{"name":"Batch","aliases":["cmd"]},"makefile":{"name":"Makefile","aliases":["make"]},"nginx":{"name":"Nginx","aliases":[]},"protobuf":{"name":"Protocol Buffers","aliases":["proto"]},"zig":{"name":"Zig","aliases":[]}}}};
const createHighlighter=createBundledHighlighter({langs:{"c": () => import('@shikijs/langs-precompiled/c'),
"cpp": () => import('@shikijs/langs-precompiled/cpp'),
"css": () => import('@shikijs/langs-precompiled/css'),
"glsl": () => import('@shikijs/langs-precompiled/glsl'),
"graphql": () => import('@shikijs/langs-precompiled/graphql'),
"haml": () => import('@shikijs/langs-precompiled/haml'),
"html": () => import('@shikijs/langs-precompiled/html'),
"java": () => import('@shikijs/langs-precompiled/java'),
"javascript": () => import('@shikijs/langs-precompiled/javascript'),
"json": () => import('@shikijs/langs-precompiled/json'),
"jsonc": () => import('@shikijs/langs-precompiled/jsonc'),
"jsonl": () => import('@shikijs/langs-precompiled/jsonl'),
"jsx": () => import('@shikijs/langs-precompiled/jsx'),
"julia": () => import('@shikijs/langs-precompiled/julia'),
"less": () => import('@shikijs/langs-precompiled/less'),
"markdown": () => import('@shikijs/langs-precompiled/markdown'),
"mdx": () => import('@shikijs/langs-precompiled/mdx'),
"php": () => import('@shikijs/langs-precompiled/php'),
"postcss": () => import('@shikijs/langs-precompiled/postcss'),
"pug": () => import('@shikijs/langs-precompiled/pug'),
"python": () => import('@shikijs/langs-precompiled/python'),
"r": () => import('@shikijs/langs-precompiled/r'),
"regexp": () => import('@shikijs/langs-precompiled/regexp'),
"sass": () => import('@shikijs/langs-precompiled/sass'),
"scss": () => import('@shikijs/langs-precompiled/scss'),
"shellscript": () => import('@shikijs/langs-precompiled/shellscript'),
"sql": () => import('@shikijs/langs-precompiled/sql'),
"svelte": () => import('@shikijs/langs-precompiled/svelte'),
"typescript": () => import('@shikijs/langs-precompiled/typescript'),
"vue": () => import('@shikijs/langs-precompiled/vue'),
"vue-html": () => import('@shikijs/langs-precompiled/vue-html'),
"wasm": () => import('@shikijs/langs-precompiled/wasm'),
"wgsl": () => import('@shikijs/langs-precompiled/wgsl'),
"xml": () => import('@shikijs/langs-precompiled/xml'),
"yaml": () => import('@shikijs/langs-precompiled/yaml'),
"tsx": () => import('@shikijs/langs-precompiled/tsx'),
"haskell": () => import('@shikijs/langs-precompiled/haskell'),
"csharp": () => import('@shikijs/langs-precompiled/csharp'),
"latex": () => import('@shikijs/langs-precompiled/latex'),
"lua": () => import('@shikijs/langs-precompiled/lua'),
"mermaid": () => import('@shikijs/langs-precompiled/mermaid'),
"ruby": () => import('@shikijs/langs-precompiled/ruby'),
"rust": () => import('@shikijs/langs-precompiled/rust'),
"scala": () => import('@shikijs/langs-precompiled/scala'),
"swift": () => import('@shikijs/langs-precompiled/swift'),
"kotlin": () => import('@shikijs/langs-precompiled/kotlin'),
"objective-c": () => import('@shikijs/langs-precompiled/objective-c'),
"docker": () => import('@shikijs/langs-precompiled/docker'),
"go": () => import('@shikijs/langs-precompiled/go'),
"powershell": () => import('@shikijs/langs-precompiled/powershell'),
"toml": () => import('@shikijs/langs-precompiled/toml'),
"ini": () => import('@shikijs/langs-precompiled/ini'),
"diff": () => import('@shikijs/langs-precompiled/diff'),
"bat": () => import('@shikijs/langs-precompiled/bat'),
"makefile": () => import('@shikijs/langs-precompiled/makefile'),
"nginx": () => import('@shikijs/langs-precompiled/nginx'),
"protobuf": () => import('@shikijs/langs-precompiled/protobuf'),
"zig": () => import('@shikijs/langs-precompiled/zig')},themes:{'github-dark':()=>import('@shikijs/themes/github-dark'),'github-light':()=>import('@shikijs/themes/github-light')},engine:()=>createJavaScriptRegexEngine()});
export const memoSyntaxHighlighter=SyntaxHighlightingExtension({createHighlighter:()=>createHighlighter({themes:['github-dark','github-light'],langs:[]})});
export function memoLanguage(value){const q=value.trim().toLowerCase();return Object.entries(memoCodeOptions.supportedLanguages).find(([id,entry])=>id===q||entry.name.toLowerCase()===q||entry.aliases?.includes(q))?.[0]||'text';}
export function filterMemoLanguages(query){const q=query.trim().toLowerCase();return Object.entries(memoCodeOptions.supportedLanguages).filter(([id,entry])=>[id,entry.name,...entry.aliases||[]].some(value=>value.toLowerCase().includes(q)));}
export const memoCodeSpec=createCodeBlockSpec(memoCodeOptions);
const baseRender=memoCodeSpec.implementation.render;
memoCodeSpec.implementation.render=function(block,editor){
 const rendered=baseRender.call(this,{...block,props:{...block.props,language:memoLanguage(block.props.language)}},editor);
 const native=rendered.dom.querySelector('select');if(!native)return rendered;
 const wrapper=native.parentElement;native.remove();wrapper.className='memo-code-language';
 const trigger=document.createElement('button');trigger.type='button';trigger.className='memo-code-language-trigger';trigger.textContent=(memoCodeOptions.supportedLanguages[block.props.language]?.name||'Plain Text')+' ▾';trigger.setAttribute('aria-label','코드 언어 선택');trigger.setAttribute('aria-expanded','false');trigger.disabled=!editor.isEditable;wrapper.append(trigger);
 let popup,abort,observer;const close=(restore=false)=>{observer?.disconnect();popup?.remove();popup=null;abort?.abort();trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus();};
 trigger.addEventListener('click',()=>{if(popup){close();return;}abort=new AbortController();const signal=abort.signal;popup=document.createElement('div');popup.className='memo-code-language-menu unified-menu';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','코드 언어 찾기');const input=document.createElement('input');input.placeholder='언어 검색';input.setAttribute('aria-label','코드 언어 검색');const list=document.createElement('div');list.className='memo-code-language-results';popup.append(input,list);(wrapper.closest('.document-fullscreen')||document.body).append(popup);trigger.setAttribute('aria-expanded','true');const place=()=>{if(!popup)return;const anchor=trigger.getBoundingClientRect(),box=popup.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(anchor.left,innerWidth-box.width-8))+'px';const below=anchor.bottom+6,above=anchor.top-box.height-6;popup.style.top=Math.max(8,Math.min(below+box.height>innerHeight-8&&above>=8?above:below,innerHeight-box.height-8))+'px';};observer=new ResizeObserver(place);observer.observe(popup);window.addEventListener('resize',place,{signal});document.addEventListener('scroll',event=>{if(popup&&!popup.contains(event.target))close();},{capture:true,signal});
 const update=()=>{list.replaceChildren();for(const [value,{name}]of filterMemoLanguages(input.value)){const option=document.createElement('button');option.type='button';option.textContent=name+(value===block.props.language?' ✓':'');option.setAttribute('aria-label',name);option.addEventListener('click',()=>{close();editor.updateBlock(block.id,{props:{language:value}});editor.focus();});list.append(option);}if(!list.childElementCount){const empty=document.createElement('p');empty.textContent='검색 결과가 없습니다';list.append(empty);}};update();place();input.addEventListener('input',update,{signal});input.focus();
 popup.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close(true);}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const items=[input,...list.querySelectorAll('button')],index=items.indexOf(document.activeElement);items[(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}if(event.key==='Enter'&&event.target===input){event.preventDefault();list.querySelector('button')?.click();}if(event.key==='Tab'){event.preventDefault();const items=[input,...list.querySelectorAll('button')],index=items.indexOf(document.activeElement);items[(index+(event.shiftKey?-1:1)+items.length)%items.length].focus();}},{signal});document.addEventListener('pointerdown',event=>{if(!wrapper.contains(event.target)&&!popup?.contains(event.target))close();},{signal});
 });return {...rendered,ignoreMutation:mutation=>wrapper.contains(mutation.target)||rendered.ignoreMutation?.(mutation)||false,stopEvent:event=>wrapper.contains(event.target),destroy:()=>{close();rendered.destroy?.();}};
};
