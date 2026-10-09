import {memo} from 'react';
function PdfInkObject({object:o,viewport,selected}){
 const z=viewport.scale,p=o.points.map(v=>viewport.convertToViewportPoint(...v)),a=p[0],b=p.at(-1);if(!a)return null;
 const props={'data-object':o.id,stroke:o.color,strokeWidth:o.width*z,fill:'none',strokeLinecap:'round',strokeLinejoin:'round'};let shape;
 if(o.type==='text'){const size=(o.fontSize||Math.max(8,o.width*6))*z;shape=<text {...props} fill={o.color} stroke="none" x={a[0]} y={a[1]} fontSize={size}>{(o.text||'').split('\n').map((line,i)=><tspan x={a[0]} dy={i?size:0} key={i}>{line}</tspan>)}</text>;}
 else if(o.type==='rect')shape=<rect {...props} x={Math.min(a[0],b[0])} y={Math.min(a[1],b[1])} width={Math.abs(b[0]-a[0])} height={Math.abs(b[1]-a[1])}/>;
 else if(o.type==='ellipse')shape=<ellipse {...props} cx={(a[0]+b[0])/2} cy={(a[1]+b[1])/2} rx={Math.abs(b[0]-a[0])/2} ry={Math.abs(b[1]-a[1])/2}/>;
 else if(p.length===1)shape=<circle {...props} stroke="none" fill={o.color} opacity={o.type==='highlight'?.3:1} cx={a[0]} cy={a[1]} r={o.width*z*(o.type==='highlight'?2.5:.5)}/>;
 else shape=<polyline {...props} points={p.map(v=>v.join(',')).join(' ')} strokeWidth={o.width*z*(o.type==='highlight'?5:1)} opacity={o.type==='highlight'?.3:1}/>;
 const arrow=o.type==='arrow'?[-.5,.5].map(delta=>{const angle=Math.atan2(b[1]-a[1],b[0]-a[0])+delta;return <line key={delta} {...props} x1={b[0]} y1={b[1]} x2={b[0]-12*z*Math.cos(angle)} y2={b[1]-12*z*Math.sin(angle)}/>;}):null;
 return <g>{shape}{arrow}{selected?<><rect className="pdf-object-selection" x={Math.min(...p.map(v=>v[0]))-5} y={Math.min(...p.map(v=>v[1]))-5} width={Math.max(10,Math.max(...p.map(v=>v[0]))-Math.min(...p.map(v=>v[0]))+10)} height={Math.max(10,Math.max(...p.map(v=>v[1]))-Math.min(...p.map(v=>v[1]))+10)}/><rect data-object={o.id} data-resize="true" x={b[0]-7} y={b[1]-7} width="14" height="14" fill="var(--blue)"/></>:null}</g>;
}
export default memo(PdfInkObject);
