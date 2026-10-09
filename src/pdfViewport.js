// PDF.js viewport-compatible coordinate mapping for PC-rendered pages.
export function pageViewport({viewBox,scale,rotation=0,offsetX=0,offsetY=0,dontFlip=false}){
 const angle=((rotation%360)+360)%360,[a,b,c,d]=angle===90?[0,1,1,0]:angle===180?[-1,0,0,1]:angle===270?[0,-1,-1,0]:[1,0,0,-1];
 const sy=dontFlip?-1:1,points=[[viewBox[0],viewBox[1]],[viewBox[2],viewBox[3]]].map(([x,y])=>[a*x+c*sy*y,b*x+d*sy*y]),x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1])),transform=[a*scale,b*scale,c*sy*scale,d*sy*scale,offsetX-x*scale,offsetY-y*scale];
 const v={viewBox,scale,rotation,offsetX,offsetY,transform,width:Math.abs(points[1][0]-points[0][0])*scale,height:Math.abs(points[1][1]-points[0][1])*scale,rawDims:{pageWidth:viewBox[2]-viewBox[0],pageHeight:viewBox[3]-viewBox[1],pageX:viewBox[0],pageY:viewBox[1]}};
 v.convertToViewportPoint=(x,y)=>[transform[0]*x+transform[2]*y+transform[4],transform[1]*x+transform[3]*y+transform[5]];
 v.convertToPdfPoint=(x,y)=>{const [a,b,c,d,e,f]=transform,det=a*d-b*c;return [(d*(x-e)-c*(y-f))/det,(-b*(x-e)+a*(y-f))/det];};
 v.convertToViewportRectangle=r=>[...v.convertToViewportPoint(r[0],r[1]),...v.convertToViewportPoint(r[2],r[3])];v.clone=options=>pageViewport({viewBox,scale,rotation,offsetX,offsetY,dontFlip,...options});return v;
}
