import React,{useId,useMemo,useRef,useState} from 'react';
import {ArrowRight,Box,Clock3,Download,FileImage,GitBranch,History,Layers,ListChecks,Pause,RefreshCw,Send} from 'lucide-react';
import MappingProgress from './MappingProgress';
import {MappingContainers,MappingDecision,MappingDispatch,MappingEvents,MappingMeasures} from './MappingEvidence';
import {algorithms,mappingDetailData,terminal,unitName} from './mappingDetailData';
import {amount,Badge,Fields,list,Note,number,Panel,seconds,size,stamp,Table} from './MappingDetailUi';
import './mappingDetail.css';

const tabs = [
  ['flow','工作流与执行',GitBranch], ['input','照片与参数',FileImage], ['containers','容器与镜像',Box],
  ['dispatch','下发与确认',Send], ['metrics','阶段与传输',Clock3], ['decision','调度决策',ListChecks],
  ['result','地图成果',Layers], ['events','事件与回放',History],
];
const artifactNames = {'preview.jpg':'正射预览','orthophoto.tif':'正射影像','point_cloud.laz':'地理配准点云',
  'cloud.laz':'地理配准点云','engine.json':'引擎记录','shots.geojson':'相机位置',
  'dsm.tif':'数字表面模型','report.pdf':'质量报告','collaboration.json':'协同覆盖报告',
  'manifest.json':'成果清单','quality.json':'质量指标'};
function InputPane({task}) {
  const p=task.params, input=task.metadata?.input || {}, coop=p.execution_mode==='collaborative';
  const algorithm=task.metadata?.algorithm_snapshot;
  return <>
    <Panel title="输入数据集" description="以提交时保存的照片包信息为准，不从当前数据集目录回填旧任务。">
      <Fields items={[
        ['照片包',input.name],['数据集 ID',input.id || p.source || task.source],['源照片数',amount(input.image_count,'张',0)],
        ['ZIP 大小',size(input.bytes)],['SHA-256',input.sha256&&<code>{input.sha256}</code>],
      ]}/>
    </Panel>
    <Panel title="建图参数与提交约束">
      <Fields items={[
        ['执行模式',coop?'同图多节点协同':'单节点执行'],['成果预设',p.preset==='standard'?'标准建图':p.preset==='preview'?'快速预览':p.preset],
        ['目标分辨率',amount(p.resolution_cm,'cm/px')],['CPU 并行度',amount(p.concurrency,'核 / 节点',0)],
        ['内存门槛',amount(p.min_memory_mb,'MiB',0)],['临时存储预算',amount(p.workspace_gb,'GiB')],
        ['调度算法',algorithms[p.algorithm]||p.algorithm],['算法快照版本',algorithm?.version],
        ['限制节点',p.node_ids?.length?list(p.node_ids):'自动选择'],['处理器架构',p.architecture],
        ['资源池集群',p.pool_cluster_id],['资源池标签',list(p.pool_labels)],['节点能力标签',list(p.required_tags)],
        ['任务截止时限',seconds(p.deadline_seconds)],['单次尝试超时',seconds(p.attempt_timeout)],
        ['最大重试次数',p.max_retries],['优先级',p.priority],
        ...(coop?[
          ['最大同时参与节点',p.max_nodes],['每组目标照片数',p.submodel_size],
          ['空间重叠半径',amount(p.split_overlap_m,'m')],
          ['最低配准比例',Number.isFinite(p.min_registered_ratio)?amount(p.min_registered_ratio*100,'%'):null],
        ]:[]),
      ]}/>
    </Panel>
  </>;
}

function ResultsPane({task}) {
  const result=task.status==='SUCCEEDED'?task.result:null;
  const files=(result?.artifacts || []).filter(file => file.url);
  const preview=files.find(file=>file.name==='preview.jpg'), q=result?.quality || {};
  return <>
    <Panel title="地图成果" description="只展示通过平台核验并正式发布的最终产物，不把中间检查点或失败尝试当作成果。">
      {!result?<Note>当前任务没有已发布的地图成果。</Note>:<>
        {preview&&<figure className="md-map-preview"><img src={preview.url} alt="本次建图生成的正射影像缩略图"/><figcaption>正射影像预览 · 原始精度以下载的 GeoTIFF 为准</figcaption></figure>}
        <Fields items={[
          ['配准照片 / 源照片',Number.isFinite(q.registered)&&Number.isFinite(q.images)?`${q.registered} / ${q.images} 张`:null],
          ['影像尺寸',Number.isFinite(q.width)&&Number.isFinite(q.height)?`${q.width} × ${q.height} px`:null],
          ['坐标系',[q.crs,q.epsg&&`EPSG:${q.epsg}`].filter(Boolean).join(' · ')||null],
          ['实际像元大小',q.pixel_size?.length===2?q.pixel_size.map(n=>number(n,4)).join(' × ')+'（坐标系单位 / px）':null],
          ['点云点数',amount(q.points,'个',0)],['结果发布节点',result.actual_node],['发布尝试',result.attempt_id&&<code>{result.attempt_id}</code>],
          ...(result.collaboration?[['计算节点',list(result.collaboration.compute_nodes)],['参与融合子模型',list(q.submodels)]]:[]),
        ]}/>
        {!files.length&&<Note>此运行未记录可下载文件。</Note>}
      </>}
    </Panel>
    {!!files.length&&<Panel title="产物下载与校验">
      <Table headers={['成果','大小','SHA-256','下载']}>
        {files.map(file=><tr key={file.name}><td><strong>{artifactNames[file.name]||file.name}</strong><small>{file.name}</small></td>
          <td>{size(file.bytes)}</td><td><code>{file.sha256 || '—'}</code></td>
          <td><a className="button" href={file.url} download={file.name} aria-label={`下载 ${file.name}`}><Download size={14}/>下载</a></td></tr>)}
      </Table>
    </Panel>}
  </>;
}

export default function MappingDetail({task,events,request,action,open,busy}) {
  const search = new URLSearchParams(location.search);
  const [tab,setTab]=useState(()=>search.get('task')===task.id&&tabs.some(([id])=>id===search.get('tab'))?search.get('tab'):'flow');
  const [selection,setSelection]=useState(null), scoped=useId(), tabList=useRef(null);
  const data=useMemo(()=>mappingDetailData(task,events),[task,events]);
  const p=task.params, coop=p.execution_mode==='collaborative', done=terminal(task.status);
  const selectAttempt=(pane,id)=>{setSelection(id);setTab(pane);tabList.current?.querySelector(`[data-pane="${pane}"]`)?.focus()};
  function selectTabFromKey(e,index) {
    const next=({ArrowLeft:(index+tabs.length-1)%tabs.length,ArrowRight:(index+1)%tabs.length,Home:0,End:tabs.length-1})[e.key];
    if(next==null)return;
    e.preventDefault();
    const id=tabs[next][0];setTab(id);tabList.current?.querySelector(`[data-pane="${id}"]`)?.focus();
  }
  return <div className="mapping-detail">
    <div className="page-title"><div><span className="eyebrow">航拍建图 · {task.id}</span><h1>{task.name}</h1>
      <p>{stamp(task.created)} · {task.trigger_type==='periodic'?'周期触发':'服务触发'} · {algorithms[p.algorithm]||p.algorithm}</p></div>
      <div className="button-row">
        <a className="button" href={`/api/tasks/${task.id}/export`} download><Download size={15}/>导出证据</a>
        {!done?<button disabled={busy} onClick={()=>action(()=>request(`/api/tasks/${task.id}/cancel`,{method:'POST'}),'已请求取消')}><Pause size={15}/>取消任务</button>:
          <button disabled={busy} onClick={()=>action(async()=>{const result=await request(`/api/tasks/${task.id}/rerun`,{method:'POST'});open(result.id)},'已创建新运行')}><RefreshCw size={15}/>重新运行</button>}
      </div>
    </div>
    <div className="task-summary" aria-label="建图运行摘要"><Badge status={task.status}/><span>{coop?'同图多节点协同':'单节点执行'}</span>
      <span><strong>{task.completed ?? 0}</strong> / {task.total || '—'} 工作单元已核验</span><span>实际参与 {data.actualNodes.length} 个节点</span>
      <span>{task.finished?`端到端 ${seconds(task.finished-task.created)}`:'尚未结束'}</span><span>{data.retries} 次额外尝试</span>
    </div>
    {task.error&&<p className="error">{task.error}</p>}
    <div className="tabs task-detail-tabs md-tabs" role="tablist" aria-label="航拍建图任务详情" ref={tabList}>
      {tabs.map(([id,label,Icon],index)=><button type="button" role="tab" id={`${scoped}-${id}-tab`} aria-controls={`${scoped}-${id}-pane`}
        aria-selected={tab===id} tabIndex={tab===id?0:-1} data-pane={id} className={tab===id?'selected':''} key={id}
        onClick={()=>setTab(id)} onKeyDown={e=>selectTabFromKey(e,index)}><Icon size={15} aria-hidden="true"/>{label}</button>)}
    </div>
    {tabs.map(([id])=><div key={id} className="md-tab-panel" role="tabpanel" id={`${scoped}-${id}-pane`}
      aria-labelledby={`${scoped}-${id}-tab`} tabIndex={0} hidden={tab!==id}>{tab===id&&<>
      {tab==='flow'&&<>
        <MappingProgress task={task} events={events} onOpenAttempt={selectAttempt}/>
        <Panel title="运行记录与工作单元" description="目标节点是调度落点，实际节点来自执行回执；未确认时不会用目标节点代替。">
          <Fields items={[["提交时间",stamp(task.created)],["开始时间",stamp(task.started)],["结束时间",stamp(task.finished)],["实际节点",list(data.actualNodes)]]}/>
          {data.units.length?<Table headers={['工作单元','依赖项','目标 / 实际节点','状态','尝试次数','执行证据']}>
            {data.units.map(unit=>{const rows=data.rows.filter(row=>row.unit?.id===unit.id), a=rows.find(row=>row.attempt.id===unit.active_attempt)?.attempt;
              return <tr key={unit.id}><td><strong>{unitName(unit)}</strong><small>{unit.id}</small></td>
                <td>{unit.dependencies?.length?unit.dependencies.map(id=>data.unitById.has(id)?unitName(data.unitById.get(id)):id).join('、'):'无'}</td>
                <td>{a?.node_id||'—'} / {a?.actual_node||'未确认'}</td><td><Badge status={unit.status}/></td><td>{rows.length}</td>
                <td>{rows.length?<button className="link" onClick={()=>selectAttempt('dispatch',a?.id || rows.at(-1).attempt.id)}>查看回执 <ArrowRight size={13}/></button>:'—'}</td></tr>})}
          </Table>:<Note>尚未生成工作单元。</Note>}
        </Panel>
      </>}
      {tab==='input'&&<InputPane task={task}/>}
      {tab==='containers'&&<MappingContainers task={task} data={data} selection={selection} setSelection={setSelection}/>}
      {tab==='dispatch'&&<MappingDispatch data={data} selection={selection} setSelection={setSelection} onOpenAttempt={selectAttempt}/>}
      {tab==='metrics'&&<MappingMeasures data={data}/>}
      {tab==='decision'&&<MappingDecision data={data} selection={selection} setSelection={setSelection}/>}
      {tab==='result'&&<ResultsPane task={task}/>}
      {tab==='events'&&<MappingEvents events={events} data={data}/>}
    </>}</div>)}
  </div>;
}
