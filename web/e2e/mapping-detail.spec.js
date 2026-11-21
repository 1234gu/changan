import {expect,test} from '@playwright/test';

const created=1795000000;
const tab=(page,name)=>page.getByRole('tab',{name,exact:true});
const artifact=(name)=>({name,bytes:4,sha256:'f'.repeat(64),url:`/api/tasks/map-test/artifacts/try-merge/${name}`});
function fixture(mode='collaborative',status='SUCCEEDED') {
  const id='map-test', coop=mode==='collaborative', queued=status==='QUEUED';
  const work_units=(coop?['prepare','reconstruct','merge']:['photo_reconstruction']).map((phase,i)=>({
    id:`unit-${phase}`,kind:coop?`mapping_${phase}`:phase,...(coop?{phase}:{}),
    submodel:phase==='reconstruct'?'submodel_0000':null,ordinal:i,status:queued?'PENDING':status,
    active_attempt:queued?null:`try-${phase}`,dependencies:i?[`unit-${i===1?'prepare':'reconstruct'}`]:[],
  }));
  const decision={at:created+.1,algorithm:{method:'resource_aware',version:1},duration_ms:.025,target_node:queued?null:'thor2',
    input:{segment_id:work_units[0].id},candidates:[{node_id:'thor2',eligible:!queued,score:0,reasons:queued?['资源池采集离线']:[],
      snapshot:{capacity:1,active:0,available_memory_mb:32768},estimate_source:'建图计算耗时尚未校准'},
    {node_id:'thor3',eligible:false,reasons:['不在指定节点范围']}]};
  const attempts=queued?[]:work_units.map((u,i)=>({id:u.active_attempt,segment_id:u.id,node_id:'thor2',
    actual_node:i===1?'thor3':'thor2',status,created:created+i*20,started:created+1+i*20,finished:created+16+i*20,
    updated:created+16+i*20,decision,cleanup_state:'DONE',workload:{job_name:`job-${u.id}`,
      pod_name:`job-${u.id}-pod`,pod_uid:`uid-${u.id}`,image:'registry/odx@sha256:'+ 'b'.repeat(64),
      cpu_cores:4,memory_mb:16384,pods:[{name:`job-${u.id}-pod`,uid:`uid-${u.id}`,phase:'Succeeded'}]}}));
  const task={id,name:'建图分栏测试记录',created,started:queued?null:created,finished:queued?null:created+80,status,
    total:work_units.length,completed:status==='SUCCEEDED'?work_units.length:0,error:status==='CANCELED'?'用户取消':null,
    metadata:{input:{id:'dataset_test',name:'原始照片.zip',image_count:18,sha256:'a'.repeat(64),bytes:102400},
      application:{engine:'ODX',engine_version:'3.8.6',gpu_access:false,image:'registry/odx@sha256:'+'b'.repeat(64)}},
    params:{workflow_id:'aerial-mapping-odx',execution_mode:mode,algorithm:'resource_aware',resolution_cm:10,concurrency:4,
      preset:'standard',max_nodes:2,submodel_size:9,split_overlap_m:25,min_registered_ratio:.9,node_ids:['thor2']},
    work_units,attempts,result:status==='SUCCEEDED'?{quality:{registered:18,images:18,width:1324,height:1293,epsg:'32615'},
      attempt_id:attempts.at(-1).id,artifacts:[artifact('preview.jpg'),artifact('orthophoto.tif')]}:null};
  const events=[];
  const add=(type,payload,at,attempt_id=null)=>events.push({id:events.length+1,type,payload,at,attempt_id});
  add('created',{stage:'submit',state:'SUCCEEDED'},created);
  if(queued) add('no_candidate',{stage:'schedule',state:'PENDING',decision,message:'等待可行节点'},created+2);
  for(const a of attempts) {
    add('job_submitted',{stage:'execute',state:'SUBMITTED'},a.created,a.id);
    add('pod_observed',{pods:a.workload.pods},a.created+.5,a.id);
    add('dispatch_ack',{identity_matched:true,task_id:id,segment_id:a.segment_id,attempt_id:a.id,
      actual_node:a.actual_node,execution_id:a.workload.pod_uid},a.started,a.id);
    add('mapping_stage',{stage:'download',state:'RUNNING'},a.started+1,a.id);
    add('mapping_stage',{stage:'download',state:'SUCCEEDED'},a.started+2,a.id);
    if(coop&&status==='SUCCEEDED') add('mapping_unit_complete',{unit_id:a.segment_id,state:'SUCCEEDED',metrics:{
      download_bytes:1048576,download_seconds:1,upload_bytes:0,upload_seconds:0,compute_seconds:4}},a.finished,a.id);
  }
  return {task,events};
}

async function openFixture(page,fixture,{initialTab,extraEvents=0}={}) {
  const {task,events}=fixture,errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const records=[...events,...Array.from({length:extraEvents},(_,i)=>({id:events.length+i+1,type:'audit_test',at:created+100+i,payload:{message:'paginates'}}))];
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname;
    if(path.includes('/artifacts/')) return route.fulfill({body:'test',contentType:'application/octet-stream'});
    if(path.endsWith('/export')) return route.fulfill({json:{...task,events},headers:{'content-disposition':'attachment; filename="mapping.json"'}});
    const body=path==='/api/tasks'? [task] : path===`/api/tasks/${task.id}`?task : path.endsWith('/events')?
      records.filter(e=>e.id>Number(url.searchParams.get('after')||0)).slice(0,1000) : path==='/api/overview'?
      {totals:{[task.status]:1},nodes:[]} : path==='/api/alerts'?{summary:{},items:[]} : [];
    return route.fulfill({json:body});
  });
  await page.goto(`/?page=detail&task=${task.id}${initialTab?'&tab='+initialTab:''}`);
  await expect(page.getByRole('heading',{name:task.name})).toBeVisible();
  return errors;
}

test('collaborative history: eight scoped tabs, evidence cross-links, measurements, results and replay', async ({page})=>{
  const errors=await openFixture(page,fixture(),{extraEvents:1000});
  await expect(page.getByRole('tab')).toHaveCount(8);
  await expect(page.getByRole('heading',{name:'同图多节点协同进程'})).toBeVisible();
  await page.getByRole('button',{name:/空间分组.*已完成|空间分组.*成功/}).first().click();
  await page.getByRole('button',{name:'查看该单元回执'}).click();
  await expect(tab(page,'下发与确认')).toHaveAttribute('aria-selected','true');
  await expect(page.getByLabel('查看尝试')).toHaveValue('try-prepare');
  await expect(page.getByRole('region',{name:'工作单元 / 尝试明细'}).getByText(/已匹配/)).toHaveCount(3);
  await page.getByRole('button',{name:'查看本次 Job 与 Pod'}).click();
  await expect(page.getByRole('heading',{name:'K3s Job 与 Pod'})).toBeVisible();
  await expect(page.getByLabel('查看尝试')).toHaveValue('try-prepare');
  await expect(page.getByText('未启用（CPU 建图）')).toBeVisible();
  await tab(page,'容器与镜像').press('ArrowLeft');
  await expect(tab(page,'照片与参数')).toBeFocused();
  await expect(page.getByText('原始照片.zip')).toBeVisible();
  await expect(page.getByText('空间重叠半径')).toBeVisible();
  await tab(page,'阶段与传输').click();
  await expect(page.locator('.md-fields dd').filter({hasText:'3 MiB'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'实际阶段耗时'})).toBeVisible();
  await tab(page,'调度决策').click();
  await expect(page.getByLabel('选择调度记录')).toHaveValue('try-prepare');
  await expect(page.getByRole('cell',{name:'不在指定节点范围'})).toBeVisible();
  await tab(page,'地图成果').click();
  await expect(page.getByRole('img',{name:'本次建图生成的正射影像缩略图'})).toBeVisible();
  const download=page.waitForEvent('download');
  await page.getByRole('link',{name:'下载 orthophoto.tif'}).click();
  expect((await download).suggestedFilename()).toBe('orthophoto.tif');
  await tab(page,'事件与回放').click();
  await expect(page.getByText('实时事件 · 1019 / 1019')).toBeVisible();
  await page.getByRole('button',{name:'从第一条回放'}).click();
  await expect(page.getByText('历史回放 · 1 / 1019')).toBeVisible();
  await page.getByRole('button',{name:'下一事件'}).click();
  await expect(page.getByText('历史回放 · 2 / 1019')).toBeVisible();
  await page.getByRole('button',{name:'返回实时'}).click();
  await page.getByLabel('事件类别').selectOption('schedule');
  await expect(page.getByText('当前筛选或回放位置没有事件。')).toBeVisible();
  expect(errors).toEqual([]);
});

test('old single-node record keeps stage timing without fake metrics and no collaborative settings',async ({page})=>{
  const old=fixture('single');delete old.task.params.execution_mode;
  const errors=await openFixture(page,old,{initialTab:'metrics'});
  await expect(tab(page,'阶段与传输')).toHaveAttribute('aria-selected','true');
  await expect(page.getByText(/没有结构化传输实测/)).toBeVisible();
  await expect(page.getByRole('region',{name:'阶段明细'}).getByText('1 s')).toBeVisible();
  await tab(page,'照片与参数').click();
  await expect(page.getByText('每组目标照片数')).toHaveCount(0);
  await tab(page,'工作流与执行').click();
  await expect(page.getByRole('heading',{name:'建图执行进程'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('queued and canceled history: honest empty states, fallback decisions and usable mobile overflow',async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  const errors=await openFixture(page,fixture('collaborative','QUEUED'),{initialTab:'bad-tab'});
  await expect(tab(page,'工作流与执行')).toHaveAttribute('aria-selected','true');
  await tab(page,'容器与镜像').click();
  await expect(page.getByText(/还没有执行尝试/)).toBeVisible();
  await tab(page,'调度决策').click();
  await expect(page.getByRole('cell',{name:/资源池采集离线/})).toBeVisible();
  await expect(page.getByText('无可行节点',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.unroute('**/api/**');
  await openFixture(page,fixture('collaborative','CANCELED'),{initialTab:'result'});
  await expect(page.getByText('当前任务没有已发布的地图成果。')).toBeVisible();
  await expect(page.getByRole('link',{name:/下载 orthophoto/})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'重新运行'})).toBeEnabled();
  expect(errors).toEqual([]);
});
