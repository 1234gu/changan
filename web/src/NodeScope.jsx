import React,{useEffect,useMemo,useState} from 'react';
import './nodeScope.css';

/*
 * Node scope for task creation, shared by both templates.
 * Ownership: the resource pool (节点管理) decides which nodes are admitted (stage 1:
 * approval, pool membership, admin pause, cluster/labels/hard capacity); the scheduler
 * checks runtime feasibility and places work (stage 2). The preview calls
 * /api/scheduling/candidates with the same body that will be submitted, so the table
 * shows exactly the two-stage verdict the scheduler will apply. node_ids=[] means
 * automatic selection among all eligible nodes; a non-empty list is a hard scope.
 */
const poolReason=r=>r.startsWith('资源池');
const splitList=v=>v.split(/[，,\s]+/).map(s=>s.trim()).filter(Boolean);

export default function NodeScope({request,params,setField,duration=4,inputBytes=0,single=false,minManual=1,showCapacity=true,poolLinks=true,onMode}){
 const [mode,setMode]=useState(params.node_ids?.length?'manual':'auto');
 useEffect(()=>{onMode?.(mode)},[mode,onMode]);
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[clusters,setClusters]=useState([]);
 const [labels,setLabels]=useState((params.pool_labels||[]).join(', '));
 useEffect(()=>{request('/api/v1/clusters').then(r=>setClusters(r.items||[])).catch(()=>setClusters([]))},[request]);
 // Preview without the manual scope so every node shows its own verdict.
 const probe=useMemo(()=>JSON.stringify({params:{...params,node_ids:[]},duration_seconds:duration,input_bytes:inputBytes}),[params,duration,inputBytes]);
 useEffect(()=>{
  if(params.workflow_id==='aerial-mapping-odx'&&!params.source){setData(null);return}
  let live=true;const h=setTimeout(async()=>{setBusy(true);try{const r=await request('/api/scheduling/candidates',{method:'POST',body:probe});if(live){setData(r);setError('')}}catch(e){if(live)setError(e.message)}finally{if(live)setBusy(false)}},350);
  return()=>{live=false;clearTimeout(h)};
 },[probe,request,params.workflow_id,params.source]);
 const chosen=params.node_ids||[];
 const pick=(id,on)=>setField('node_ids',single?(on?[id]:[]):on?[...new Set([...chosen,id])]:chosen.filter(x=>x!==id));
 const switchMode=m=>{setMode(m);if(m==='auto')setField('node_ids',[])};
 const rows=data?.candidates||[];
 const eligible=rows.filter(r=>r.eligible).map(r=>r.node_id);
 const selectedEligible=chosen.filter(id=>eligible.includes(id));
 const manualShort=mode==='manual'&&chosen.length<minManual;
 return <section className="node-scope" aria-label="执行节点选定">
  <div className="node-scope-head">
   <div><strong>执行节点</strong><small>资源池准入 → 调度可行性 → 算法选点</small></div>
   <div className="segmented" role="radiogroup" aria-label="选点方式">
    <button type="button" role="radio" aria-checked={mode==='auto'} className={mode==='auto'?'on':''} onClick={()=>switchMode('auto')}>自动选点</button>
    <button type="button" role="radio" aria-checked={mode==='manual'} className={mode==='manual'?'on':''} onClick={()=>switchMode('manual')}>手动指定</button>
   </div>
  </div>
  <div className="form-grid node-scope-constraints">
   <label>资源池集群<select value={params.pool_cluster_id||''} onChange={e=>setField('pool_cluster_id',e.target.value||null)}><option value="">不限集群</option>{clusters.map(c=><option key={c.id} value={c.id}>{c.name||c.id}</option>)}</select></label>
   <label>能力标签<input placeholder="逗号分隔，须全部满足" value={labels} onChange={e=>{setLabels(e.target.value);setField('pool_labels',splitList(e.target.value))}}/></label>
   {showCapacity&&<label>CPU 核数 ≥<input type="number" min="1" max="1024" placeholder="不限" value={params.min_cpu_cores??''} onChange={e=>setField('min_cpu_cores',e.target.value?+e.target.value:null)}/></label>}
   {showCapacity&&<label>GPU 数量 ≥<input type="number" min="0" max="64" placeholder="不限" value={params.min_gpu_count??''} onChange={e=>setField('min_gpu_count',e.target.value===''?null:+e.target.value)}/></label>}
  </div>
  {error&&<div className="error">{error}</div>}
  <div className="table-scroll"><table className="node-scope-table"><thead><tr>{mode==='manual'&&<th aria-label="选择"/>}<th>节点</th><th>结论</th><th>排除原因 / 依据</th><th>评分</th></tr></thead><tbody>
   {rows.map(r=>{const pool=r.pool||{};const checked=chosen.includes(r.node_id);return <tr key={r.node_id} className={(mode==='auto'&&data.target_node===r.node_id)||checked?'highlight':''}>
    {mode==='manual'&&<td><input type={single?'radio':'checkbox'} name="node-scope" aria-label={`指定 ${r.node_id}`} checked={checked} onChange={e=>pick(r.node_id,e.target.checked)}/></td>}
    <td><strong>{r.node_id}</strong>{pool.pool_node_id&&poolLinks?<a className="node-scope-link" href={`/pool/nodes/${pool.pool_node_id}`}>{pool.node_name||'资源池节点'}</a>:<small>{pool.state==='BOUND'?pool.node_name:pool.state?'资源池未绑定':''}</small>}</td>
    <td>{r.eligible?<span className="scope-ok">满足{mode==='auto'&&data.target_node===r.node_id&&'·当前首选'}</span>:<span className="scope-no">不参与</span>}</td>
    <td>{r.reasons.length?<div className="scope-reasons">{r.reasons.map(x=><span key={x} className={poolReason(x)?'pool':'exec'}>{poolReason(x)?'资源池':'执行侧'} · {x.replace(/^资源池：/,'')}</span>)}</div>:<small>{r.estimate_source}</small>}{pool.mode&&pool.mode!=='enforce'&&pool.reasons?.length>0&&<small className="scope-observe">资源池 {pool.mode} 模式：{pool.reasons.join('；')}（仅观察）</small>}</td>
    <td>{r.eligible?r.score:'—'}</td>
   </tr>})}
   {!rows.length&&<tr><td colSpan={mode==='manual'?5:4}>{busy?'正在核对候选节点…':params.workflow_id==='aerial-mapping-odx'&&!params.source?'选择照片数据集后核对候选节点':'暂无执行节点'}</td></tr>}
  </tbody></table></div>
  <p className={'note'+(manualShort||(mode==='manual'&&chosen.length&&!selectedEligible.length)?' caution':'')}>
   {mode==='auto'
    ?`自动：在 ${eligible.length} / ${rows.length} 个满足条件的节点中由调度算法逐单元选点；首选随资源快照变化，以任务详情中的调度决策为准。`
    :manualShort?`手动：至少指定 ${minManual} 个节点。`
    :selectedEligible.length<chosen.length?`手动：已指定 ${chosen.length} 个，其中 ${chosen.length-selectedEligible.length} 个当前不满足条件；任务只会在条件恢复后使用它们，可能排队等待。`
    :`手动：任务只在已指定的 ${chosen.length} 个节点内调度，并在执行前再次核对准入。`}
   {busy&&rows.length>0&&' 正在刷新…'}
  </p>
 </section>
}
