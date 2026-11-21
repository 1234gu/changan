// Read-only presentation model. Keep target, observed Pod, and confirmed
// execution separate; never manufacture a receipt or parameter for old runs.
export const stages = {
  submit:'提交', schedule:'调度', execute:'执行', aggregate:'结果校验',
  prepare:'空间分组', reconstruct:'子模型稀疏重建', align:'统一对齐', toolchain:'子模型地理成果',
  merge:'融合发布', photo_reconstruction:'整体重建', split:'空间分组', download:'下载与校验',
  dataset:'准备照片集', opensfm:'相机配准与稀疏重建', openmvs:'稠密重建',
  odm_filterpoints:'点云滤波', odm_meshing:'生成网格', mvs_texturing:'生成纹理',
  odm_georeferencing:'地理参考', odm_dem:'高程处理', odm_orthophoto:'生成正射影像',
  odm_report:'生成质量报告', odm_postprocess:'整理成果', upload:'上传成果', complete:'结果核验',
};
export const states = {
  QUEUED:'等待准备', PREPARING:'准备照片集', PENDING:'等待调度', DISPATCHING:'正在下发',
  SUBMITTED:'Job 已提交', POD_PENDING:'Pod 等待启动', PULLING:'拉取镜像',
  IMAGE_PULLING:'拉取镜像', CONTAINER_STARTING:'容器已启动', STARTING:'正在启动',
  RUNNING:'执行中', ACCEPTED:'已接收', UPLOADING:'上传成果', FINALIZING:'核验结果',
  SUCCEEDED:'已完成', FAILED:'失败', TIMED_OUT:'超时', CANCELED:'已取消', UNKNOWN:'待核对',
  CLEANING:'等待清理', DONE:'已清理', RETRY:'等待重试',
};
export const algorithms = {resource_aware:'资源与网络感知', round_robin:'可行节点轮询'};
export const terminal = status => ['SUCCEEDED','FAILED','TIMED_OUT','CANCELED'].includes(status);
export const stageName = stage => stages[stage] || stage || '—';
export const stateName = state => states[state] || state || '—';
export const unitName = unit => unit
  ? [stageName(unit.phase || unit.kind), unit.submodel?.replace('submodel_', '子模型 ')].filter(Boolean).join(' · ')
  : '—';

export function mappingDetailData(task, events) {
  const units = task.work_units || [];
  const unitById = new Map(units.map(unit => [unit.id, unit]));
  const attempts = task.attempts || [];
  const byAttempt = new Map(attempts.map(attempt => [attempt.id, {
    attempt, unit: unitById.get(attempt.segment_id), submitted: null, ack: null,
    observed: null, stages: [], measure: null,
  }]));
  const waits = new Map();
  const batches = [];
  for (const event of events) {
    const row = byAttempt.get(event.attempt_id);
    const payload = event.payload || {};
    switch (event.type) {
      case 'no_candidate':
        if (payload.decision) waits.set(payload.decision.input?.segment_id || '', event);
        break;
      case 'dispatch_batch': batches.push(event); break;
      case 'job_submitted': if (row && !row.submitted) row.submitted = event; break;
      case 'pod_observed': if (row && !row.observed && payload.pods?.length) row.observed = event; break;
      case 'dispatch_ack':
        if (row && !row.ack && payload.identity_matched === true && payload.task_id === task.id &&
          payload.attempt_id === row.attempt.id && payload.segment_id === row.attempt.segment_id) row.ack = event;
        break;
      case 'mapping_stage': if (row) row.stages.push(event); break;
      case 'mapping_unit_complete':
        if (row && row.attempt.status === 'SUCCEEDED' && payload.state === 'SUCCEEDED' &&
          payload.unit_id === row.attempt.segment_id && payload.metrics) row.measure = payload.metrics;
        break;
      default: break;
    }
  }
  const rows = [...byAttempt.values()];
  const measured = rows.filter(row => row.measure);
  return {units, unitById, attempts, byAttempt, rows, measured, batches,
    waits: [...waits.values()].sort((a,b) => a.id - b.id),
    actualNodes: [...new Set(attempts.map(a => a.actual_node).filter(Boolean))],
    retries: rows.length - new Set(attempts.map(a => a.segment_id)).size,
  };
}

export function stageSpans(events) {
  const open = new Map(), seen = new Set(), spans = [];
  for (const {payload, at} of events) {
    if (!payload?.stage || !Number.isFinite(at)) continue;
    if (payload.seq != null) {
      if (seen.has(payload.seq)) continue;
      seen.add(payload.seq);
    }
    const {stage,state} = payload;
    // Some ODX subphases share the wrapper name (e.g. merge). Pair the
    // innermost interval first, then close the wrapper with its own event.
    const stack = open.get(stage) || [];
    if (state === 'RUNNING') {
      stack.push(at);
      open.set(stage,stack);
    } else if (['SUCCEEDED','FAILED','CANCELED','TIMED_OUT'].includes(state) && stack.length) {
      const start = stack.pop();
      if (at >= start) spans.push({stage,state,start,end:at,depth:stack.length});
    }
  }
  return spans.sort((a,b)=>a.start-b.start || b.end-a.end);
}

export function measuredTotal(rows, key) {
  const values = rows.map(row => row.measure?.[key]).filter(value => Number.isFinite(value) && value >= 0);
  return {value: values.length ? values.reduce((a,b) => a+b, 0) : null, samples: values.length};
}
