import {useEffect,useRef,useState} from 'react';
import PdfThumbnail from './PdfThumbnail.jsx';
// A bounded window avoids thousands of mounted canvases and observers.
export default function PdfPageRail({pdf,page,open,onOpen}){
 const root=useRef(null),[top,setTop]=useState(0),[height,setHeight]=useState(600),row=126;
 useEffect(()=>{const observer=new ResizeObserver(()=>setHeight(root.current.clientHeight));observer.observe(root.current);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(!open)return;const el=root.current,y=(page-1)*row;if(y<el.scrollTop||y+row>el.scrollTop+el.clientHeight){el.scrollTop=y;setTop(y);}},[page,open]);
 const first=Math.max(0,Math.floor(top/row)-1),last=Math.min(pdf.numPages,first+Math.ceil(height/row)+3);
 return <div className="pdf-page-window" ref={root} onScroll={event=>setTop(event.currentTarget.scrollTop)}><div style={{height:pdf.numPages*row,position:'relative'}}>{open?Array.from({length:last-first},(_,i)=>{const n=first+i+1;return <div key={n} style={{position:'absolute',top:(n-1)*row,height:row,width:'100%'}}><PdfThumbnail pdf={pdf} number={n} active={page===n} open={open} onOpen={()=>onOpen(n)}/></div>;}):null}</div></div>;
}
