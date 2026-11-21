import React,{useState} from 'react';
import {amount,Badge,Fields,list,Note,number,Panel,seconds,size,stamp,Table} from './MappingDetailUi';
import {algorithms,measuredTotal,stageName,stageSpans,stateName,unitName} from './mappingDetailData';

const attemptLabel = row => `${unitName(row.unit)} · ${row.attempt.node_id || '未指派'} · ${row.attempt.id}`;
const loc = a => `${a.node_id || '—'} / ${a.actual_node || '未确认'}`;
function AttemptSelect({rows,selection,setSelection}) {
  const selected=rows.find(row=>row.attempt.id===selection)||rows.at(-1);
  return selected&&<label className="md-select">查看尝试<select value={selected.attempt.id} onChange={e=>setSelection(e.target.value)}>
    {rows.map(row=><option key={row.attempt.id} value={row.attempt.id}>{attemptLabel(row)}</option>)}
  </select></label>;
}

export function MappingContainers({task,data,selection,setSelection}) {
  const app=task.metadata?.application || {};
  const row=data.rows.find(r=>r.attempt.id===selection)||data.rows.at(-1);
  const a=row?.attempt, w=a?.workload || {}, pods=w.pods || [];
  return <>
    <Panel title="应用与容器镜像" description="建图由独立 K3s 批处理 Job 执行，不复用视频推理会话。">
      <Fields items={[
        ['执行后端',task.metadata?.execution_backend || a?.backend],['引擎',[app.engine,app.engine_version].filter(Boolean).join(' ')||null],
        ['应用版本',app.version],['流水线协议',app.pipeline_version ?? app.protocol_version],['镜像架构',app.architecture],
        ['GPU 访问',typeof app.gpu_access==='boolean'?(app.gpu_access?'启用':'未启用（CPU 建图）'):null],['提交镜像',app.image&&<code>{app.image}</code>],
      ]}/>
    </Panel>
    <Panel title="K3s Job 与 Pod" description="这是平台保存的最近运行观测；已回收的 Pod 不表示当前仍在运行。"
      action={<AttemptSelect rows={data.rows} selection={selection} setSelection={setSelection}/> }>
      {!a?<Note>还没有执行尝试。依赖未满足或没有可行节点时不会创建 Job。</Note>:<>
        <Fields items={[
          ['工作单元',unitName(row.unit)],['尝试状态',<Badge status={a.status}/>],['目标 / 实际节点',loc(a)],
          ['集群 / 命名空间',[w.cluster,w.namespace].filter(Boolean).join(' / ')||null],['Job 名称',w.job_name],['Job UID',w.job_uid],
          ['已确认 Pod',w.pod_name],['Pod UID',w.pod_uid],['请求 CPU',amount(w.cpu_cores,'核')],['请求内存',amount(w.memory_mb,'MiB',0)],
          ['容器清理状态',stateName(a.cleanup_state)],['Job 镜像',w.image&&<code>{w.image}</code>],
        ]}/>
        {(w.admission_message||w.failure||a.error)&&<Note>{[w.admission_message,w.failure||a.error].filter(Boolean).join('；')}</Note>}
        {pods.length?<Table headers={['已观测 Pod','落点','阶段','容器回执 / 原因','镜像 ID']}>
          {pods.map(p=><tr key={p.uid||p.name}><td>{p.name}<small>{p.uid}</small></td><td>{p.node_name||'—'}</td>
            <td>{p.phase||'—'}</td><td>{list(p.reasons)}</td><td><code>{p.image_id||'—'}</code></td></tr>)}
        </Table>:<Note>此尝试没有已记录的 Pod 列表。</Note>}
      </>}
    </Panel>
  </>;
}

export function MappingDispatch({data,selection,setSelection,onOpenAttempt}) {
  const chosen=data.rows.find(r=>r.attempt.id===selection)||data.rows.at(-1);
  const batch=data.batches.at(-1)?.payload;
  return <>
    <Panel title="下发与身份确认" description="提交 Job、观测 Pod、收到身份匹配回执是三个不同环节；未收到回执时不推断已执行。">
      {data.rows.length?<Table headers={['工作单元 / 尝试','目标 / 实际节点','Job 提交','首次观测 Pod','身份匹配回执','状态']}>
        {data.rows.map(row=>{const a=row.attempt;return <tr key={a.id} className={chosen===row?'md-highlight':undefined}>
          <td><button className="link" onClick={()=>setSelection(a.id)}>{unitName(row.unit)}</button><small>{a.id}</small></td>
          <td>{loc(a)}</td><td>{stamp(row.submitted?.at)}</td><td>{stamp(row.observed?.at)}</td>
          <td>{row.ack?<strong>已匹配 · {stamp(row.ack.at)}</strong>:'未见匹配回执'}<small>{row.ack?.payload.execution_id}</small></td>
          <td><Badge status={a.status}/></td></tr>})}
      </Table>:<Note>尚无下发尝试。</Note>}
      {batch&&<Note>最近一批：已分配 {number(batch.assigned,0)} 项 / 批次开始时待分配 {number(batch.pending_at_start,0)} 项。批次决策耗时 {amount(batch.duration_ms,'ms',3)}，不等于容器启动时间。</Note>}
    </Panel>
    {chosen&&<Panel title="执行回执明细" action={<AttemptSelect rows={data.rows} selection={selection} setSelection={setSelection}/> }>
      <Fields items={[
        ['工作单元 ID',chosen.attempt.segment_id],['尝试 ID',chosen.attempt.id],['回执实际节点',chosen.ack?.payload.actual_node],
        ['Job 提交到身份确认',seconds(chosen.ack?.at>=chosen.submitted?.at?chosen.ack.at-chosen.submitted.at:null)],
        ['回执执行 ID',chosen.ack?.payload.execution_id],['回执 Job',chosen.ack?.payload.job_name],['回执 Pod',chosen.ack?.payload.pod_name],
        ['控制面创建尝试',stamp(chosen.attempt.created)],['执行开始',stamp(chosen.attempt.started)],['尝试结束',stamp(chosen.attempt.finished)],
      ]}/>
      <div className="button-row md-actions"><button onClick={()=>onOpenAttempt('containers',chosen.attempt.id)}>查看本次 Job 与 Pod</button>
        {chosen.attempt.decision&&<button onClick={()=>onOpenAttempt('decision',chosen.attempt.id)}>查看本次调度决策</button>}</div>
    </Panel>}
  </>;
}

export function MappingDecision({data,selection,setSelection}) {
  const choices=[...data.rows.filter(r=>r.attempt.decision).map(row=>({key:row.attempt.id,
    label:attemptLabel(row), decision:row.attempt.decision})),...data.waits.map(event=>({key:`wait-${event.id}`,
    label:`无可行节点 · ${unitName(data.unitById.get(event.payload.decision.input?.segment_id))} · ${stamp(event.at)}`,
    decision:event.payload.decision,event}))];
  const choice=choices.find(x=>x.key===selection)||choices.filter(x=>!x.event).at(-1)||choices.at(-1);
  const d=choice?.decision, candidates=d?.candidates || [];
  return <Panel title="调度快照与选择依据" description="按历史调度快照展示本次可行性、评分和排除原因，不以节点当前状态替代。"
    action={choice&&<label className="md-select">选择调度记录<select value={choice.key} onChange={e=>setSelection(e.target.value)}>
      {choices.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
    </select></label>}>
    {!d?<Note>还没有调度决策记录。</Note>:<>
      <Fields items={[
        ['决策时刻',stamp(d.at ?? choice.event?.at)],['算法',algorithms[d.algorithm?.method]||d.algorithm?.method],
        ['算法版本',d.algorithm?.version],['决策耗时',amount(d.duration_ms,'ms',3)],
        ['决策选中节点',d.target_node || '无可行节点'],['候选节点',`${candidates.filter(n=>n.eligible).length} / ${candidates.length} 可选`],
      ]}/>
      {choice.event?.payload.message&&<Note>{choice.event.payload.message}</Note>}
      {candidates.length>0&&<Table headers={['候选节点','是否可选','调度分值','可用内存','活动 / 容量','原因与估算依据']}>
        {candidates.map(n=><tr key={n.node_id} className={d.target_node===n.node_id?'md-highlight':undefined}>
          <td><strong>{n.node_id}</strong>{d.target_node===n.node_id&&<small>本次选中</small>}</td><td>{n.eligible?'可选':'排除'}</td>
          <td>{n.eligible?number(n.score,4):'—'}</td><td>{amount(n.snapshot?.available_memory_mb,'MiB',0)}</td>
          <td>{number(n.snapshot?.active,0)} / {number(n.snapshot?.capacity,0)}</td>
          <td>{n.reasons?.length?n.reasons.join('；'):'—'}{n.estimate_source&&<small>{n.estimate_source}</small>}</td></tr>)}
      </Table>}
      <Note>调度分值只用于候选排序，不是建图实测时间；视频 FPS 预测不适用于建图。</Note>
      <details><summary>查看原始决策、算法权重与资源快照</summary><pre>{JSON.stringify(d,null,2)}</pre></details>
    </>}
  </Panel>;
}

const metricNames=[['download_bytes','下载量',size],['upload_bytes','上传量',size],['compute_seconds','计算累计',seconds],
  ['download_seconds','下载累计',seconds],['upload_seconds','上传累计',seconds],['pack_seconds','归档累计',seconds]];
export function MappingMeasures({data}) {
  const rows=data.rows.flatMap(row=>stageSpans(row.stages).map((span,index)=>({row,span,index})));
  return <>
    <Panel title="阶段传输与计算实测" description="只汇总已核验成功且上报指标的工作单元；累计节点耗时不是端到端时间，也不是加速比。">
      {data.measured.length?<>
        <Fields items={metricNames.map(([key,label,format])=>{const {value,samples}=measuredTotal(data.measured,key);
          return [label,<>{format(value)}{samples>0&&<small>{samples} 个已测单元</small>}</>];})}/>
        <Table headers={['工作单元','实际节点','下载 / 用时','上传 / 用时','计算耗时','归档耗时']}>
          {data.measured.map(({attempt,unit,measure:m})=><tr key={attempt.id}><td>{unitName(unit)}<small>{attempt.id}</small></td>
            <td>{attempt.actual_node||'未确认'}</td><td>{size(m.download_bytes)} / {seconds(m.download_seconds)}</td>
            <td>{size(m.upload_bytes)} / {seconds(m.upload_seconds)}</td><td>{seconds(m.compute_seconds)}</td><td>{seconds(m.pack_seconds)}</td></tr>)}
        </Table>
      </>:<Note>该运行没有结构化传输实测。本栏不把源 ZIP 大小、最终文件大小或视频吞吐当成建图传输量；仍可查看下方有成对回执的阶段耗时。</Note>}
    </Panel>
    <Panel title="实际阶段耗时" description="由同一次尝试的阶段开始和结束事件配对，按控制面收到事件的时间计算；缺少任一事件不估算。">
      {rows.length?<Table headers={['阶段','工作单元 / 尝试','实际节点','开始','结束','耗时','状态']}>
        {rows.map(({row,span,index})=><tr key={`${row.attempt.id}-${index}`}><td>{stageName(span.stage)}{span.depth>0&&<small>同名内层阶段</small>}</td>
          <td>{unitName(row.unit)}<small>{row.attempt.id}</small></td><td>{row.attempt.actual_node||'未确认'}</td>
          <td>{stamp(span.start)}</td><td>{stamp(span.end)}</td><td>{seconds(span.end-span.start)}</td><td><Badge status={span.state}/></td></tr>)}
      </Table>:<Note>尚无可配对的阶段开始与结束记录。</Note>}
    </Panel>
  </>;
}

const eventTypes={
  created:['创建任务','task'],stage:['任务阶段','task'],task_terminal:['任务结束','task'],mapping_plan:['生成分组与依赖','stage'],
  mapping_stage:['建图阶段','stage'],mapping_unit_complete:['工作单元通过核验','stage'],decision:['节点选择','schedule'],
  no_candidate:['暂无可行节点','schedule'],dispatch_batch:['批次分配','schedule'],job_submitted:['Job 提交','runtime'],
  pod_observed:['Pod 观测','runtime'],container_stage:['容器状态','runtime'],dispatch_ack:['执行确认','runtime'],
  container_cleaned:['容器清理','runtime'],attempt_failed:['尝试失败','runtime'],
};
export function MappingEvents({events,data}) {
  const [cursor,setCursor]=useState(null),[category,setCategory]=useState('all'),[attempt,setAttempt]=useState('all'),[limit,setLimit]=useState(30);
  const count=events.length, position=Math.min(cursor??count,count), current=events[position-1];
  const shown=events.slice(0,position).filter(e=>(category==='all'||(eventTypes[e.type]?.[1]||'other')===category)&&
    (attempt==='all'||(attempt==='task'?!e.attempt_id:e.attempt_id===attempt))).reverse();
  return <Panel title="事件与回放" description="只回放已记录事件，不重新触发执行，也不改变顶部的实时任务状态。">
    <div className="md-event-controls">
      <label className="md-select">事件类别<select value={category} onChange={e=>{setCategory(e.target.value);setLimit(30)}}>
        <option value="all">全部事件</option><option value="task">任务</option><option value="stage">建图阶段</option>
        <option value="schedule">调度</option><option value="runtime">容器与回执</option><option value="other">其他</option>
      </select></label>
      <label className="md-select">执行尝试<select value={attempt} onChange={e=>{setAttempt(e.target.value);setLimit(30)}}>
        <option value="all">全部尝试</option><option value="task">仅任务级</option>{data.rows.map(row=><option key={row.attempt.id} value={row.attempt.id}>{attemptLabel(row)}</option>)}
      </select></label>
    </div>
    <div className="md-replay">
      <div className="button-row"><strong>{cursor==null?'实时事件':'历史回放'} · {position} / {count}</strong>
        {cursor==null?<button disabled={!count} onClick={()=>setCursor(1)}>从第一条回放</button>:<>
          <button disabled={position<=1} onClick={()=>setCursor(position-1)}>上一事件</button>
          <button disabled={position>=count} onClick={()=>setCursor(position+1)}>下一事件</button>
          <button onClick={()=>setCursor(null)}>返回实时</button>
        </>}
      </div>
      {cursor!=null&&count>0&&<><label>回放位置<input type="range" min="1" max={count} value={position} onChange={e=>setCursor(Number(e.target.value))}/></label>
        <Note>事件 #{current.id} · {stamp(current.at)} · {eventTypes[current.type]?.[0]||current.type}</Note></>}
    </div>
    {shown.length?<Table headers={['记录时间','事件 / 阶段','工作单元 / 实际节点','状态或消息','载荷']}>
      {shown.slice(0,limit).map(e=>{const row=data.byAttempt.get(e.attempt_id),p=e.payload || {};
        const confirmed=row?.ack?.id<=e.id?row.ack.payload.actual_node:null;
        return <tr key={e.id}>
        <td>{stamp(e.at)}<small>#{e.id}</small></td><td>{eventTypes[e.type]?.[0]||e.type}<small>{stageName(p.stage)}</small></td>
        <td>{row?`${unitName(row.unit)} / ${confirmed||'未确认'}`:'任务级'}<small>{e.attempt_id}</small></td>
        <td>{p.state&&<Badge status={p.state}/>}<small>{p.message}</small></td>
        <td><details><summary>事件数据</summary><pre>{JSON.stringify(p,null,2)}</pre></details></td></tr>})}
    </Table>:<Note>当前筛选或回放位置没有事件。</Note>}
    <div className="button-row md-actions"><span>显示 {Math.min(limit,shown.length)} / {shown.length} 条匹配记录</span>
      {shown.length>limit&&<button onClick={()=>setLimit(limit+30)}>查看更多</button>}</div>
  </Panel>;
}
