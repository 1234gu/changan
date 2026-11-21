import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mappingDetailData,measuredTotal,stageSpans} from '../src/mappingDetailData.js';

test('separates target and actual node, verifies receipts and retains retries and latest wait per unit',()=>{
  const task={id:'t',work_units:[{id:'u'}],attempts:[{id:'a',segment_id:'u',node_id:'target'},
    {id:'b',segment_id:'u',node_id:'target',actual_node:'confirmed',status:'SUCCEEDED'}]};
  const wait=id=>({id,type:'no_candidate',payload:{decision:{input:{segment_id:'u'}}}});
  const ack=(id,attempt_id,task_id,segment_id)=>({id,attempt_id,type:'dispatch_ack',payload:{identity_matched:true,task_id,attempt_id,segment_id}});
  const data=mappingDetailData(task,[wait(1),wait(2),ack(3,'a','t','wrong-unit'),
    ack(4,'b','wrong-task','u'),ack(5,'b','t','u'),ack(6,'b','t','u')]);
  assert.deepEqual(data.waits.map(e=>e.id),[2]);
  assert.deepEqual(data.actualNodes,['confirmed']);
  assert.equal(data.retries,1);
  assert.equal(data.rows[0].ack,null);
  assert.equal(data.rows[1].ack.id,5);
});

test('includes structured samples once per validated attempt, leaves missing metrics null, keeps actual zero',()=>{
  const task={id:'t',attempts:[{id:'a',segment_id:'u',status:'SUCCEEDED'},
    {id:'b',segment_id:'u',status:'FAILED'},{id:'c',segment_id:'v',status:'SUCCEEDED'}]};
  const complete=(attempt_id,unit_id,metrics)=>({attempt_id,type:'mapping_unit_complete',payload:{unit_id,state:'SUCCEEDED',metrics}});
  const data=mappingDetailData(task,[complete('a','u',{download_bytes:10}),complete('a','u',{download_bytes:10}),
    complete('b','u',{download_bytes:999}),complete('c','wrong',{download_bytes:888}),complete('c','v',{upload_bytes:0})]);
  assert.equal(data.measured.length,2);
  assert.deepEqual(measuredTotal(data.measured,'download_bytes'),{value:10,samples:1});
  assert.deepEqual(measuredTotal(data.measured,'upload_bytes'),{value:0,samples:1});
  assert.deepEqual(measuredTotal(data.measured,'compute_seconds'),{value:null,samples:0});
});

test('pairs recorded stages, including nested same-name phases; ignores duplicate sequence and missing end',()=>{
  const stage=(stage,state,at,seq)=>({at,payload:{stage,state,seq}});
  assert.deepEqual(stageSpans([stage('download','SUCCEEDED',1,1),stage('merge','RUNNING',2,2),
    stage('merge','RUNNING',3,2),stage('merge','RUNNING',4,3),stage('merge','SUCCEEDED',5,4),
    stage('merge','SUCCEEDED',6,5),stage('upload','UPLOADING',7,6),stage('opensfm','RUNNING',9,7)]),
  [{stage:'merge',state:'SUCCEEDED',start:2,end:6,depth:0},{stage:'merge',state:'SUCCEEDED',start:4,end:5,depth:1}]);
});
