import assert from 'node:assert/strict';
import {MODELS,makePlan,reuseNewGroups} from './browser-recovery-plan.mjs';
const empty=()=>Object.fromEntries(MODELS.map(model=>[model,[]]));
const base=empty(),current=empty(),desired=empty();
base.group=[{id:'g',name:'Work'}];current.group=[{id:'g',name:'Work'}];desired.group=[{id:'g',name:'Work'}];
base.project=[{id:'p',groupId:'g',name:'Old'}];current.project=[{id:'p',groupId:'g',name:'New owner name'}];desired.project=[{id:'p',groupId:'g',name:'Browser name'}];
base.weeklyTask=[{id:'t',projectId:'p',title:'Old',isDone:false,note:null}];
current.weeklyTask=[{id:'t',projectId:'p',title:'Old',isDone:false,note:'new note'},
  {id:'added-after-move',projectId:'p',title:'New task'}];
desired.weeklyTask=[{id:'t',projectId:'p',title:'Recovered',isDone:true,note:null},
  {id:'browser-new',projectId:'p',title:'Browser task'}];
let plan=makePlan(desired,base,current);
assert.equal(plan.operations.find(o=>o.where?.id==='t').data.title,'Recovered');
assert.equal(plan.operations.find(o=>o.where?.id==='t').data.isDone,true);
assert.equal(plan.operations.find(o=>o.where?.id==='t').data.note,undefined);
assert.equal(plan.conflicts[0].field,'name');
assert.equal(plan.stats.weeklyTask.keptAdditional,1);
assert.equal(plan.stats.weeklyTask.created,1);
assert.equal(plan.operations.some(o=>o.action==='delete'),false);
// Deletion made after migration wins; absent browser sections never clear DB.
current.weeklyTask=current.weeklyTask.filter(row=>row.id!=='t');
plan=makePlan(desired,base,current);
assert.equal(plan.preservedDeletions.length,1);
assert.equal(plan.operations.some(o=>o.data.id==='t'),false);
assert.equal(plan.operations.some(o=>o.model==='projectNote'),false);
desired.weeklyTask.push({...desired.weeklyTask[1]});
assert.throws(()=>makePlan(desired,base,current),/Duplicate/);
const snapshot=empty();snapshot.group=[{id:'browser-group',name:'Same group'}];
snapshot.project=[{id:'browser-project',groupId:'browser-group'}];
const after=empty();after.group=[{id:'new-group',name:'Same group',archivedAt:null}];
const reused=reuseNewGroups(snapshot,empty(),after);
assert.equal(reused.desired.group[0].id,'new-group');
assert.equal(reused.desired.project[0].groupId,'new-group');
assert.equal(reused.aliases['browser-group'],'new-group');
console.log('Three-way recovery merge passed: new edits/deletions preserved, browser changes recovered, no deletes or note writes.');
