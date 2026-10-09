import {useEffect,useRef,useState} from 'react';
import PdfThumbnail from './PdfThumbnail.jsx';
import Menu from './Menu.jsx';
import Icon from './Icon.jsx';
// A bounded window avoids thousands of mounted canvases and observers.
export default function PdfPageRail({pdf,page,open,onOpen,drawing,canEdit,onAction,objects=[]}){
 const root=useRef(null),[top,setTop]=useState(0),[height,setHeight]=useState(600),row=126;
 useEffect(()=>{const observer=new ResizeObserver(()=>setHeight(root.current.clientHeight));observer.observe(root.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(!open)return;const el=root.current,y=(page-1)*row;if(y<el.scrollTop||y+row>el.scrollTop+el.clientHeight){el.scrollTop=y;setTop(y);}},[page,open]);
 const first=Math.max(0,Math.floor(top/row)-1),last=Math.min(pdf.numPages,first+Math.ceil(height/row)+3);
 return <div className="pdf-page-manager">{drawing?<button className="drawing-add-page" title="페이지 추가" aria-label="페이지 추가" disabled={!canEdit||pdf.numPages>=500} onClick={()=>onAction('add')}><Icon name="plus"/>페이지 추가</button>:null}<div className="pdf-page-window" ref={root} onScroll={event=>setTop(event.currentTarget.scrollTop)}><div style={{height:pdf.numPages*row,position:'relative'}}>{open?Array.from({length:last-first},(_,i)=>{const n=first+i+1;return <PageRow key={n} drawing={drawing} number={n} count={pdf.numPages} canEdit={canEdit} onAction={onAction} style={{position:'absolute',top:(n-1)*row,height:row,width:'100%'}}><PdfThumbnail objects={objects.filter(o=>o.page===n)} pdf={pdf} number={n} active={page===n} open={open} onOpen={()=>onOpen(n)}/></PageRow>;}):null}</div></div></div>;
}
function PageRow({children,drawing,number,count,canEdit,onAction,style}){
 const root=useRef(null),hold=useRef(null),start=useRef(null),opened=useRef(false);
 useEffect(()=>()=>clearTimeout(hold.current),[]);
 return <div ref={root} style={style} onPointerDown={event=>{if(!drawing||event.pointerType!=='touch'||event.target.closest('.page-actions'))return;start.current={x:event.clientX,y:event.clientY};opened.current=false;hold.current=setTimeout(()=>{opened.current=true;root.current?.querySelector('.menu-trigger')?.click();},550);}} onPointerMove={event=>{if(start.current&&Math.hypot(event.clientX-start.current.x,event.clientY-start.current.y)>8)clearTimeout(hold.current);}} onPointerUp={()=>clearTimeout(hold.current)} onPointerCancel={()=>clearTimeout(hold.current)} onClickCapture={event=>{if(opened.current&&!event.target.closest('.page-actions')){event.preventDefault();event.stopPropagation();opened.current=false;}}}>{children}{drawing?<Menu className="page-actions" label={`${number}쪽 관리`} trigger={<Icon name="more"/>} disabled={!canEdit}>{close=><><button role="menuitem" disabled={count>=500} onClick={()=>{close();onAction('duplicate',number);}}><Icon name="copy"/>페이지 복제하기</button><div className="action-menu-divider" role="separator"/><button role="menuitem" className="danger" disabled={count<=1} onClick={()=>{close();onAction('delete',number);}}><Icon name="trash"/>페이지 삭제하기</button></>}</Menu>:null}</div>;
}
