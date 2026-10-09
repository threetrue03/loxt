export const clampZoom=z=>Math.max(.1,Math.min(4,z));
export function pointDistance(p,a,b=a){const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
export function touchesObject(o,p,radius){
 const [a,b=a]=o.points;if(!a)return false;
 if(o.type==='rect')return [[a,[a[0],b[1]]],[[a[0],b[1]],b],[b,[b[0],a[1]]],[[b[0],a[1]],a]].some(([x,y])=>pointDistance(p,x,y)<=radius+o.width/2);
 if(o.type==='ellipse'){const rx=Math.max(.1,Math.abs(b[0]-a[0])/2),ry=Math.max(.1,Math.abs(b[1]-a[1])/2);return Math.abs(Math.hypot((p[0]-(a[0]+b[0])/2)/rx,(p[1]-(a[1]+b[1])/2)/ry)-1)*Math.min(rx,ry)<=radius+o.width/2;}
 if(o.type==='text'){const size=o.fontSize||Math.max(8,o.width*6);return p[0]>=a[0]-radius&&p[0]<=a[0]+(o.text||'').length*size*.7+radius&&p[1]<=a[1]+size+radius&&p[1]>=a[1]-size*(o.text||'').split('\n').length-radius;}
 return o.points.some((v,i)=>pointDistance(p,v,o.points[i+1]||v)<=radius+o.width*(o.type==='highlight'?2.5:.5));
}
export function appendPoint(stroke,p){const last=stroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])<.35)return;if(stroke.points.length<50000)stroke.points.push(p);}
export function matchingItems(items,query){const needle=query.trim().toLocaleLowerCase();if(!needle)return [];const text=items.map(i=>i.str||'').join(' ').toLocaleLowerCase(),matches=[];let start=0;for(let at=text.indexOf(needle);at>=0;at=text.indexOf(needle,at+needle.length)){const indexes=[];let offset=0;items.forEach((item,i)=>{const end=offset+(item.str||'').length;if(end>at&&offset<at+needle.length)indexes.push(i);offset=end+1;});matches.push({at,indexes,context:text.slice(Math.max(0,at-20),at+needle.length+40)});if(++start>=10000)break;}return matches;}
