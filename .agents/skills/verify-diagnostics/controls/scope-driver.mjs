import {Database} from 'bun:sqlite';
import {setSystemTime} from 'bun:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {Effect,Exit,Cause,Schema} from 'effect';
import {openStore,TaskCommands} from '../../../../packages/domain/src/store/store.ts';
import {ProfileId,TaskId} from '../../../../packages/domain/src/ids.ts';
setSystemTime(new Date('2026-11-11T18:00:00Z'));
const [manifest,mode='proof',key='owner']=process.argv.slice(2);
const fixture=JSON.parse(readFileSync(manifest,'utf8'));
const store=Effect.runSync(openStore({path:fixture.path})),db=Reflect.get(store,'db');
const credential=key==='none'?'':fixture.credentials?.[key]??fixture.credential;
let uses=0;const used=store.diagnostics.credentialUsed.bind(store.diagnostics);
Object.defineProperty(store.diagnostics,'credentialUsed',{value:(...args)=>{uses++;return used(...args)},configurable:true});
const invoke=(value)=>Reflect.apply(Reflect.get(store.diagnostics,'readWithin'),store.diagnostics,[value]);
const refusal=(value,message)=>{const result=Effect.runSyncExit(invoke(value));assert.ok(Exit.isFailure(result),message);assert.equal(Cause.squash(result.cause).message,'Error: Invalid read authority',message)};
const trace=()=>({physical:[]});
try{
 if(mode==='proof'){
  refusal({},'Diagnostics must reject a forged owner authority');
  uses=0;const state=trace();Reflect.set(globalThis,Symbol.for('todo.diag-structure'),state);
  const result=Effect.runSyncExit(store.diagnostics.read({credential}));
  assert.ok(Exit.isSuccess(result),'Diagnostics must materialize before its owner lease closes');
  assert.equal(result.value.storage.tables.find(x=>x.name==='tasks')?.count,1427);
  assert.equal(state.physical.length,1,'Diagnostics must use one physical transaction');
  assert.equal(uses,1,'Diagnostics must record credential use once');
  assert.equal(db.inTransaction,false,'Diagnostics must release its transaction before returning');
  const retained=Effect.runSync(store.auth.ownerRead({credential},Schema.Struct({}),{}));
  Effect.runSync(store.diagnostics.read({credential}));
  refusal(retained,'Diagnostics must reject a retained owner authority');
  console.log(JSON.stringify({mode,status:'PASS',physical:1,credentialUsed:1,retainedRefused:true}));
 } else if(mode==='refusal'){
  const start=db.query('SELECT coalesce(max(seq),0) AS seq FROM op_log').get().seq;
  const result=Effect.runSyncExit(store.diagnostics.read({credential}));
  const rows=db.query("SELECT actor,profile,outcome,reason,event FROM op_log WHERE seq>? ORDER BY seq").all(start).map(x=>({...x,event:JSON.parse(x.event)}));
  if(key==='owner'){assert.ok(Exit.isSuccess(result));assert.equal(uses,1);assert.equal(rows.length,0)}
  else {assert.ok(Exit.isFailure(result));assert.equal(uses,0);assert.equal(rows.length,1,'Diagnostics refusal must record exactly one History row');assert.equal(rows[0].profile,null);assert.equal(rows[0].event.action,'authenticate')}
  console.log(JSON.stringify({key,uses,rows,error:Exit.isFailure(result)?(()=>{const error=Cause.squash(result.cause);return{tag:error._tag,detail:error.detail,actor:error.actor,message:error.message}})():null}));
 } else if(mode==='profile'){
  for(let i=0;i<10;i++)Effect.runSync(store.diagnostics.read({credential}));
  const rows=[],query=db.query.bind(db);
  Object.defineProperty(db,'query',{value:(sql,...args)=>{const statement=query(sql,...args);return new Proxy(statement,{get(target,key){const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;if(['all','get','run','values'].includes(String(key)))return(...bindings)=>{const begin=performance.now();const result=Reflect.apply(value,target,bindings);rows.push({sql,ms:performance.now()-begin});return result};return value.bind(target)}})},configurable:true});
  const start=performance.now();Effect.runSync(store.diagnostics.read({credential}));
  console.log(JSON.stringify({elapsed:performance.now()-start,queries:rows.sort((a,b)=>b.ms-a.ms)}));
 } else {
  console.log(JSON.stringify({ready:true,mode}));
  for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
   const command=JSON.parse(line);if(command.mode==='quit')break;
   const state=trace();if(mode==='writer'){state.attemptFile=command.attemptFile;state.admissionFile=command.admissionFile;}
   Reflect.set(globalThis,Symbol.for('todo.diag-structure'),state);
   if(mode==='reader'){
    const original=Reflect.get(store.diagnostics,'snapshot');
    Object.defineProperty(store.diagnostics,'snapshot',{configurable:true,value:(...args)=>{
     assert.equal(db.inTransaction,true,'Paused Diagnostics materialization must hold its owner lease');
     writeFileSync(command.holdingFile,JSON.stringify({at:String(process.hrtime.bigint())}));
     const deadline=performance.now()+4000;
     while(!existsSync(command.releaseFile)){assert.ok(performance.now()<deadline,'Paused read must be released by its controller');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1)}
     return Reflect.apply(original,store.diagnostics,args);
    }});
    const start=process.hrtime.bigint();Effect.runSync(store.diagnostics.read({credential}));const end=process.hrtime.bigint();
    Object.defineProperty(store.diagnostics,'snapshot',{value:original});
    assert.equal(db.inTransaction,false);assert.equal(state.physical.length,1);
    console.log(JSON.stringify({mode,start:String(start),end:String(end),physical:state.physical,inTransaction:false}));
   }else{
    const result=Effect.runSync(new TaskCommands(store).create({credential,profile:Schema.decodeUnknownSync(ProfileId)('p0')},{title:'Writer after Diagnostics'},{task_id:Schema.decodeUnknownSync(TaskId)('ab-writer-after-diagnostics')}));
    assert.equal(result.outcome,'committed');
    console.log(JSON.stringify({mode,outcome:result.outcome,physical:state.physical}));
   }
  }
 }
}finally{Effect.runSync(store.close())}
