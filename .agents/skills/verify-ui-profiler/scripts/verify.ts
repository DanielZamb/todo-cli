import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";

const evidence=resolve(process.argv[2] ?? "docs/evidence/ui-speed/recordings/compiled");mkdirSync(evidence,{recursive:true});
const fixture=await diagnosticFixture(true,1,[resolve(process.env.TODO_PROFILER_SERVER ?? ".scratch/bin/todo-server")]);
const fileRoot=mkdtempSync(join(tmpdir(),"todo-recording-input-"));
const actions:object[]=[];
const headers={Authorization:`Bearer ${fixture.credential}`,"Content-Type":"application/json"};
const id=randomUUID();
const base={schema_version:1,run_id:id,process_role:"macos",build_id:"a".repeat(40),contract_id:"b".repeat(64),category:{inventory_id:"I07",subtype:"task.selection.pointer"},mode:"full",input_kind:"pointer",workload:"warm",sequence:1,monotonic_ms:10,clock_unit:"ms",trace_id:randomUUID(),span_id:randomUUID(),action_id:randomUUID(),name:"ui.action.started",profile_ordinal:2,input_timing:{basis:"release",hold_ms:120,derived_from_native_selection:true},selection_context:{list_rows:15,refresh_in_flight:true,process_uptime_ms:1000,journal_bytes:4096}};
const run={run_id:id,app:"macos",build_id:base.build_id,contract_id:base.contract_id,comparison:{fixture_hash:"c".repeat(64),script_hash:"d".repeat(64),environment_hash:"e".repeat(64),configuration:"release",render_stage:"layout_complete",concurrency:1}};
const batch={schema_version:1,batch_id:randomUUID(),run,events:[base,{...base,sequence:2,name:"ui.result.committed",duration_ms:8,outcome:"completed",correct:true,render_stage:"layout_complete"},{...base,sequence:3,action_id:randomUUID(),monotonic_ms:30}]};
const http=async(path:string,body?:unknown,auth=true,extra:Record<string,string>={})=>{const response=await fetch(fixture.url+path,{method:body?"POST":"GET",headers:{...(auth?headers:{"Content-Type":"application/json"}),...extra},...(body?{body:JSON.stringify(body)}:{})});actions.push({path,status:response.status});return response;};
const cli=(args:string[])=>JSON.parse(fixture.cli(["diagnostics",...args,"--server",fixture.url,"--format","json"]));
try {
  assert.equal((await http("/diagnostics/profiler/runs",undefined,false)).status,401);
  const ingested=await http("/diagnostics/profiler/ingest",batch);assert.equal(ingested.status,200);assert.equal((await ingested.json()).accepted,true);
  const runs=cli(["runs"]);assert.equal(runs.runs.length,1);assert.equal(runs.runs[0].events,3);
  const show=cli(["show","--run",id]);assert.equal(show.summary[0].starts,2);assert.equal(show.summary[0].p50_ms,8);assert.equal(show.summary[0].fraction_by_20_ms,0.5);assert.equal(show.summary[0].by_outcome.pending,1);
  const exported=cli(["export","--run",id]);assert.equal(exported.batches[0].events.length,3);assert.equal(exported.batches[0].events[0].profile_ordinal,2);
  const file=join(fileRoot,"recording.json");writeFileSync(file,JSON.stringify(exported),{mode:0o600});
  const preview=cli(["import","--file",file,"--dry-run"]);assert.equal(preview.dry_run,true);assert.equal(preview.events,3);assert.equal(cli(["runs"]).runs[0].events,3);
  assert.equal(cli(["import","--file",file]).accepted_batches,1);assert.equal(cli(["runs"]).runs[0].events,3);
  for(const key of ["title","task_id","profile_name","search_text","path","token"]) {
    const response=await http("/diagnostics/profiler/ingest",{...batch,batch_id:randomUUID(),events:[{...base,metadata:{[key]:"PRIVATE_CONTENT_NEVER_ECHO"}}]});assert.equal(response.status,400);assert.ok(!(await response.text()).includes("PRIVATE_CONTENT"));
  }
  assert.equal((await http("/diagnostics/profiler/runs",undefined,true,{"X-Forwarded-For":"127.0.0.1"})).status,403);
  const tokenResponse=await http("/auth/tokens",{name:"profiler-agent",scope:"read-write",profile:null});assert.equal(tokenResponse.status,200);const token=await tokenResponse.json();
  assert.equal((await http("/diagnostics/profiler/runs",undefined,true,{Authorization:`Bearer ${token.credential}`})).status,403);
  const second=randomUUID();const b={...batch,batch_id:randomUUID(),run:{...run,run_id:second,build_id:"f".repeat(40)},events:batch.events.map(e=>({...e,run_id:second,build_id:"f".repeat(40)}))};
  assert.equal((await http("/diagnostics/profiler/ingest",b)).status,200);assert.equal(cli(["compare","--before",id,"--after",second]).comparable,true);
  const third=randomUUID();const c={...batch,batch_id:randomUUID(),run:{...run,run_id:third,comparison:{...run.comparison,environment_hash:"f".repeat(64)}},events:batch.events.map(e=>({...e,run_id:third}))};await http("/diagnostics/profiler/ingest",c);assert.equal((await http(`/diagnostics/profiler/compare?before=${id}&after=${third}`)).status,400);
  const tasks=await http("/profiles/work/tasks");assert.equal(tasks.status,200);assert.equal((await tasks.json()).length,1);assert.match(tasks.headers.get("server-timing") ?? "",/todo-encode;dur=/u);
  const snapshot=await (await http("/diagnostics?detail=true")).json();assert.ok(snapshot.profiler.detail.recent.some((s:{stage:string})=>s.stage==="history_decode"));assert.ok(snapshot.profiler.detail.recent.some((s:{stage:string})=>s.stage==="task_materialization"));
  assert.ok(!fixture.log().includes("PRIVATE_CONTENT"));
  const multi={...batch,batch_id:randomUUID(),events:[{...base,sequence:4,name:"ui.action.ended",duration_ms:20,outcome:"cancelled",action_id:batch.events[2]?.action_id}]};
  assert.equal((await http("/diagnostics/profiler/ingest",multi)).status,200);
  const lines=fixture.cli(["diagnostics","export","--run",id,"--ndjson","--server",fixture.url]).trim().split("\n").map(line=>JSON.parse(line));assert.equal(lines.length,2);assert.ok(lines.every(line=>line.batches.length===1));
  const journal=join(fixture.scratch,"diagnostic-recordings");assert.equal(statSync(journal).mode&0o777,0o700);
  for(const name of readdirSync(journal)){assert.equal(statSync(join(journal,name)).mode&0o777,0o600);const text=readFileSync(join(journal,name),"utf8");assert.ok(!text.includes("PRIVATE_CONTENT"));assert.ok(!text.includes("Benchmark Task"));assert.ok(!text.includes(fixture.credential));}
  if(process.env.TODO_PROFILER_STRESS==="1") {
    const stressId=randomUUID();let accepted=0;
    for(let n=0;n<700;n++) {
      const value={schema_version:1,batch_id:randomUUID(),run:{...run,run_id:stressId},events:Array.from({length:64},(_,index)=>({...base,run_id:stressId,sequence:n*64+index,name:"span.finished",stage:"ipc",duration_ms:1,outcome:"completed"}))};
      const response=await http("/diagnostics/profiler/ingest",value);assert.equal(response.status,200);const receipt=await response.json();if(receipt.accepted)accepted++;
      if(n%10===0){const drained=await http("/diagnostics/profiler/runs");assert.equal(drained.status,200);await drained.text();const tasks=await http("/profiles/work/tasks");assert.equal(tasks.status,200);assert.equal((await tasks.json()).length,1);}
    }
    assert.equal(accepted,700);
    const final=cli(["runs"]);assert.ok(final.status.bytes<=33554432);assert.ok(final.status.segments<=4096);assert.ok(final.status.loss.capacity_events>0);
    const allocated=readdirSync(journal).reduce((sum,name)=>sum+statSync(join(journal,name)).blocks*512,0);assert.ok(allocated<=268435456);
    writeFileSync(join(evidence,"stress.json"),JSON.stringify({accepted,attempted:700,allocated,status:final.status},null,2));
  }
  writeFileSync(join(evidence,"result.json"),JSON.stringify({result:"PASS",show,runs,actions},null,2));
} finally {writeFileSync(join(evidence,"actions.json"),JSON.stringify(actions,null,2));await fixture.close();rmSync(fileRoot,{recursive:true,force:true});}
