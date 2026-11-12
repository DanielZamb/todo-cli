import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Schema } from "effect";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import { RecordingExport, RecordingReceipt, RecordingShow, validateRecordingBatch } from "../../../../packages/domain/src/diagnostic-recordings.ts";
import { event } from "../../../../packages/domain/test/fixtures/diagnostic-recording.ts";

const evidence=resolve(process.argv[2]??"docs/evidence/ui-speed/recordings-durability/lifecycle");mkdirSync(evidence,{recursive:true});
const rows: object[]=[];
const points=["before_mark","mark_temp","after_mark","data_temp","after_data","after_ack","fail_mark","fail_data"] as const;
const origin=await diagnosticFixture(true,0),id=randomUUID(),a={...event,run_id:id};
const h={Authorization:`Bearer ${origin.credential}`,"Content-Type":"application/json"};
const first={schema_version:1,batch_id:randomUUID(),run:{run_id:id,app:"macos",build_id:event.build_id,contract_id:event.contract_id},events:[a,{...a,sequence:2,name:"ui.result.committed",monotonic_ms:18,duration_ms:8,outcome:"completed",correct:true,render_stage:"layout_complete"},{...a,sequence:3,name:"process.terminated",monotonic_ms:30,reason:"clean"}]};
let batch: ReturnType<typeof validateRecordingBatch>;
try {
  const post=(body:unknown)=>fetch(origin.url+"/diagnostics/profiler/ingest",{method:"POST",headers:h,body:JSON.stringify(body)});
  assert.equal((await post(first)).status,200);
  const b={...a,action_id:randomUUID(),sequence:4,monotonic_ms:40};
  assert.equal((await post({...first,batch_id:randomUUID(),events:[{...a,action_id:randomUUID()},b,{...b,sequence:5,name:"ui.result.committed",monotonic_ms:10040,duration_ms:10000,outcome:"completed",correct:true,render_stage:"layout_complete"}]})).status,400);
  const exported=Schema.decodeUnknownSync(RecordingExport)(await(await fetch(origin.url+`/diagnostics/profiler/runs/${id}/export`,{headers:h})).json());
  const one=exported.batches[0];assert.ok(one);batch=validateRecordingBatch(one);assert.equal(batch.run.admission?.refused_batches,1);
  writeFileSync(join(evidence,"genuine-export.json"),JSON.stringify(exported,null,2));
}finally{await origin.close();}

type Outcome={http:number|null;exit:number;accepted:boolean|null;body:unknown};
for(const mode of ["producer","import"] as const) for(const point of points){
  const f=await diagnosticFixture(true,1,[resolve(".scratch/bin/durability-server"),"--durability-point",point,"--durability-run",id]);
  const headers={Authorization:`Bearer ${f.credential}`,"Content-Type":"application/json"},file=join(f.scratch,"genuine-export.json");writeFileSync(file,JSON.stringify(batch));
  let restarted: ReturnType<typeof spawn>|undefined;
  const killed=async()=>{if(f.server.exitCode===null&&f.server.signalCode===null){const done=new Promise<void>(r=>f.server.once("exit",()=>r()));f.server.kill("SIGKILL");await done;}};
  const upload=(url:string):Promise<Outcome>=>{
    if(mode==="producer")return fetch(url+"/diagnostics/profiler/ingest",{method:"POST",headers,body:JSON.stringify(batch)}).then(async response=>{
      const body:unknown=await response.json();return{http:response.status,exit:response.ok?0:1,accepted:response.ok?Schema.decodeUnknownSync(RecordingReceipt)(body).accepted:null,body};
    }).catch(()=>({http:0,exit:1,accepted:null,body:null}));
    return new Promise((resolve,reject)=>{
      const cli=spawn(resolvePath(".scratch/bin/todo"),["--profile","work","diagnostics","import","--file",file,"--server",url,"--format","json"],{env:f.env,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";
      cli.stdout.on("data",x=>stdout+=x);cli.stderr.on("data",x=>stderr+=x);cli.once("error",reject);cli.once("exit",exit=>{try{assert.equal(stderr,"");assert.notEqual(exit,null);const body:unknown=JSON.parse(stdout);resolve({http:null,exit:exit??-1,accepted:exit===0,body});}catch(error){reject(error);}});
    });
  };
  const resolvePath=(path:string)=>resolve(path);
  const disk=()=>({data:readdirSync(join(f.scratch,"diagnostic-recordings")).filter(name=>/^\d{13}-.*\.json$/u.test(name)),mark:existsSync(join(f.scratch,"diagnostic-recordings",`${id}.admission.json`))});
  try {
    const pending=upload(f.url);
    const paused=!["after_ack","fail_mark","fail_data"].includes(point);
    if(paused){const deadline=performance.now()+60000;while(!existsSync(join(f.scratch,"durability-barrier.json"))&&performance.now()<deadline){assert.equal(f.server.exitCode,null,f.log());await Bun.sleep(20);}assert.ok(existsSync(join(f.scratch,"durability-barrier.json")),f.log());}
    let initial:Outcome|undefined;
    if(!paused){initial=await pending;assert.equal(initial.exit,point==="after_ack"?0:mode==="import"||point==="fail_mark"?1:0);if(point==="fail_mark")assert.equal(initial.http,mode==="producer"?500:null);if(point==="fail_data")assert.equal(initial.accepted,false);}
    const before=disk();
    assert.equal(before.data.length,point==="after_data"||point==="after_ack"?1:0);
    assert.equal(before.mark,!["before_mark","mark_temp","fail_mark"].includes(point));
    if(before.data.length){const stored=Schema.decodeUnknownSync(Schema.Struct({batch:Schema.Unknown}))(JSON.parse(readFileSync(join(f.scratch,"diagnostic-recordings",before.data[0]??""),"utf8")));assert.equal(validateRecordingBatch(stored.batch).run.admission?.incomplete,true);}
    if(point==="fail_mark"||point==="fail_data"){
      const shown=Schema.decodeUnknownSync(RecordingShow)(await(await fetch(f.url+`/diagnostics/profiler/runs/${id}`,{headers})).json());assert.equal(shown.summary.length,0);assert.equal(shown.run.admission?.incomplete,true);
      const exported=Schema.decodeUnknownSync(RecordingExport)(await(await fetch(f.url+`/diagnostics/profiler/runs/${id}/export`,{headers})).json());assert.equal(exported.batches[0]?.events.length,0);
      writeFileSync(join(f.scratch,"durability-repaired"),"repaired");const retry=await upload(f.url);assert.equal(retry.exit,0);assert.equal(retry.accepted,true);assert.equal(disk().data.length,1);
    }
    await killed();if(paused){initial=await pending;assert.equal(initial.exit,1);}
    let log="";restarted=spawn(resolve(".scratch/bin/todo-server"),[],{env:f.env,stdio:["ignore","pipe","pipe"]});restarted.stdout?.on("data",x=>log+=x);restarted.stderr?.on("data",x=>log+=x);
    let url="";const deadline=performance.now()+60000;while(!url&&performance.now()<deadline){assert.equal(restarted.exitCode,null,log);url=/Listening on (http:\/\/127\.0\.0\.1:\d+)/u.exec(log)?.[1]??"";if(!url)await Bun.sleep(20);}assert.ok(url,log);
    const response=await fetch(url+`/diagnostics/profiler/runs/${id}`,{headers});
    const absent=point==="before_mark"||point==="mark_temp";
    assert.equal(response.status,absent?400:200);
    let summary:unknown=null;
    if(!absent){const shown=Schema.decodeUnknownSync(RecordingShow)(await response.json());summary=shown;assert.equal(shown.run.admission?.incomplete,true);assert.equal(shown.summary.length,["after_mark","data_temp"].includes(point)?0:1);for(const row of shown.summary){assert.equal(row.fraction_by_20_ms,null);assert.equal(row.fraction_by_300_ms,null);assert.equal(row.p50_ms,8);}}
    const exportedResponse=await fetch(url+`/diagnostics/profiler/runs/${id}/export`,{headers});assert.equal(exportedResponse.status,absent?400:200);
    if(!absent){const exported=Schema.decodeUnknownSync(RecordingExport)(await exportedResponse.json());assert.equal(exported.batches[0]?.run.admission?.incomplete,true);assert.equal(exported.batches[0]?.events.length,["after_mark","data_temp"].includes(point)?0:3);}
    const retry=await upload(url);assert.equal(retry.exit,0);assert.equal(retry.accepted,true);assert.equal(disk().data.length,1);
    const final=Schema.decodeUnknownSync(RecordingShow)(await(await fetch(url+`/diagnostics/profiler/runs/${id}`,{headers})).json());assert.equal(final.summary[0]?.starts,1);assert.equal(final.summary[0]?.fraction_by_20_ms,null);assert.equal(final.run.admission?.incomplete,true);
    const tasks=Schema.decodeUnknownSync(Schema.Array(Schema.Struct({title:Schema.String})))(await(await fetch(url+"/profiles/work/tasks",{headers})).json());assert.deepEqual(tasks.map(task=>task.title),["Benchmark Task 000"]);
    rows.push({mode,point,initial,before_kill:before,after_restart:summary,final:final.run.admission,task_read_passed:true});
    writeFileSync(join(evidence,"result.json"),JSON.stringify({result:rows.length===16?"PASS":"RUNNING",cases:rows.length,rows},null,2));
  } finally {
    if(restarted&&restarted.exitCode===null&&restarted.signalCode===null){const done=new Promise<void>(r=>restarted?.once("exit",()=>r()));restarted.kill("SIGTERM");await done;}
    await killed();await f.close();
  }
}
