// Same clock for both endpoints: gateway receive times, not Pod-local clocks.
// Do not infer computing time from Pod lifetime (pulls, transfer and queueing).
export function computeWindows(units, attempts, events, end){
 const lookup=new Map(units.map(u=>[u.id,u]));const ranges=[];
 for(const a of attempts){const u=lookup.get(a.segment_id);if(!a.actual_node||!['reconstruct','toolchain'].includes(u?.phase))continue;
  const marks=events.filter(e=>e.type==='mapping_stage'&&e.attempt_id===a.id&&e.payload.stage===u.phase);
  const start=marks.find(e=>e.payload.state==='RUNNING')?.at;
  const finish=marks.find(e=>e.payload.state==='SUCCEEDED')?.at;
  if(start!=null&&(finish!=null||!a.finished))ranges.push({id:a.id,phase:u.phase,node:a.actual_node,start,end:finish??end,observed:finish!=null});
 }
 const points=ranges.flatMap(x=>[{at:x.start,d:1,node:x.node},{at:x.end,d:-1,node:x.node}]).sort((a,b)=>a.at-b.at||a.d-b.d);
 const active=new Map();let last=points[0]?.at||0,overlap=0,peak=0;
 for(const p of points){if(active.size>=2)overlap+=Math.max(0,p.at-last);const n=(active.get(p.node)||0)+p.d;if(n>0)active.set(p.node,n);else active.delete(p.node);peak=Math.max(peak,active.size);last=p.at}
 return {ranges,overlap,peak};
}
