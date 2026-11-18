import test from 'node:test';import assert from 'node:assert/strict';import {computeWindows} from '../src/mappingIntervals.js';
const units=['a','b','c'].map(id=>({id,phase:'reconstruct'}));
const attempts=['a','b','c'].map((id,i)=>({id,segment_id:id,actual_node:i===2?'n1':`n${i+1}`,finished:100}));
const mark=(id,at,state)=>({type:'mapping_stage',attempt_id:id,at,payload:{stage:'reconstruct',state}});
test('union of time with two distinct confirmed nodes, not sum of pairs or pod duration',()=>{
 const events=[mark('a',10,'RUNNING'),mark('b',15,'RUNNING'),mark('c',16,'RUNNING'),mark('a',20,'SUCCEEDED'),mark('b',30,'SUCCEEDED'),mark('c',22,'SUCCEEDED')];const x=computeWindows(units,attempts,events,100);assert.equal(x.peak,2);assert.equal(x.overlap,7);
});
test('missing failed-end or missing actual node never proves overlap',()=>{const events=[mark('a',10,'RUNNING'),mark('b',10,'RUNNING'),mark('c',10,'RUNNING'),mark('c',20,'SUCCEEDED')];const x=computeWindows(units,attempts,events,99);assert.equal(x.peak,1);assert.equal(x.overlap,0)});
