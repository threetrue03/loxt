export default function ScriptSkeleton() {
  return <div className="script-skeleton" role="status" aria-label="스크립트 변환 중"><span className="hidden">스크립트를 변환하고 있습니다.</span>{[84,96,72,91,65,88].map((width,index) => <div className="skeleton-row" key={index} aria-hidden="true"><i/><div><i style={{width:`${width}%`}}/><i style={{width:`${Math.max(40,width-17)}%`}}/></div></div>)}</div>;
}
