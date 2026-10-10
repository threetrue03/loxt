import {useLayoutEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {clampOverlay,visibleViewport,watchPlacement} from './viewportPlacement.js';

export default function PdfTextEditor({text,viewport,sheet,root,onChange,onFinish,onCancel}){
 const panel=useRef(null);
 useLayoutEffect(()=>{
  const editor=panel.current,page=sheet.current;if(!editor||!page)return;
  return watchPlacement(page,editor,()=>{
   if(!editor.isConnected)return;const bounds=visibleViewport(),box=page.getBoundingClientRect(),p=viewport.convertToViewportPoint(...text.point);
   const scale=box.width/viewport.width,width=Math.min(280,Math.max(1,bounds.width-16));
   editor.style.width=width+'px';editor.style.maxHeight=Math.max(1,bounds.height-16)+'px';
   const placed=clampOverlay({left:box.left+p[0]*scale,top:box.top+(p[1]-text.fontSize*viewport.scale)*scale},{width,height:editor.offsetHeight},bounds);
   editor.style.left=placed.left+'px';editor.style.top=placed.top+'px';
  });
 },[viewport,text.point,text.fontSize,sheet]);
 return createPortal(<div ref={panel} className="pdf-text-editor" aria-label="PDF 텍스트 편집"><textarea autoFocus aria-label="PDF 텍스트 입력" title="Ctrl+Enter: 완료 · Esc: 취소" value={text.value} style={{fontSize:Math.max(16,text.fontSize*viewport.scale)}} onChange={event=>onChange({...text,value:event.target.value})} onBlur={onFinish} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onCancel();}else if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();onFinish();}}}/><div className="pdf-text-controls" onPointerDown={event=>event.preventDefault()}><button className="primary" title="완료 · Ctrl + Enter" onClick={onFinish}>완료</button><button title="취소 · Esc" onClick={onCancel}>취소</button></div></div>,root.current?.closest('.document-fullscreen')||document.body);
}
