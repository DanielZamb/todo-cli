import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync,readFileSync,readdirSync,statSync,writeFileSync } from "node:fs";
import { join,resolve } from "node:path";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import { event } from "../../../../packages/domain/test/fixtures/diagnostic-recording.ts";
const evidence=resolve(process.argv[2]??"docs/evidence/ui-speed/recordings-completeness/compiled");mkdirSync(evidence,{recursive:true});
const source=await diagnosticFixture(true,1);let destination:Awaited<ReturnType<typeof diagnosticFixture>>|undefined;
const start=(run_id:string,sequence=1,action_id:string=event.action_id)=>({...event,run_id,sequence,action_id,monotonic_ms:sequence*10});
const run=randomUUID(),a=start(run),slow=start(run,4,randomUUID());
const conditions={fixture_hash:"c".repeat(64),script_hash:"d".repeat(64),environment_hash:"e".repeat(64),configuration:"release",render_stage:"layout_complete",concurrency:1};
const batch=(id:string,events:unknown[])=>({schema_version:1,batch_id:randomUUID(),run:{run_id:id,app:"macos",build_id:event.build_id,contract_id:event.contract_id,comparison:conditions},events});
type Start = ReturnType<typeof start>;
const result=(start:Start,sequence:number,ms:number)=>({...start,sequence,name:"ui.result.committed",monotonic_ms:start.monotonic_ms+ms,duration_ms:ms,outcome:"completed",correct:true,render_stage:"layout_complete"});
const headers=(f:typeof source)=>({Authorization:`Bearer ${f.credential}`,"Content-Type":"application/json"});
const upload=(f:typeof source,value:unknown,dry=false)=>fetch(f.url+`/diagnostics/profiler/ingest${dry?"?dry_run=true":""}`,{method:"POST",headers:headers(f),body:JSON.stringify(value)});
const cli=(f:typeof source,args:string[])=>JSON.parse(f.cli(["diagnostics",...args,"--server",f.url,"--format","json"]));
const negative=(f:typeof source,args:string[])=>{const r=spawnSync(resolve(".scratch/bin/todo"),["--profile","work","diagnostics",...args,"--server",f.url,"--format","json"],{env:f.env,encoding:"utf8"});assert.equal(r.stderr,"");return {exit:r.status,body:JSON.parse(r.stdout)};};
const record:object[]=[];
try {
 const first=batch(run,[a,result(a,2,8),{...a,sequence:3,monotonic_ms:30,name:"process.terminated",reason:"clean"}]);assert.equal((await upload(source,first)).status,200);
 const bad=batch(run,[{...a,action_id:randomUUID()},slow,result(slow,5,10000)]);
 assert.equal((await upload(source,bad,true)).status,400);assert.equal(cli(source,["show","--run",run]).summary[0].fraction_by_20_ms,1);
 const refused=await upload(source,bad);assert.equal(refused.status,400);const message=await refused.json();assert.match(message.message,/Whole batch refused; no events were admitted/u);
 const marked=cli(source,["show","--run",run]);assert.equal(marked.run.admission.refused_batches,1);assert.equal(marked.run.admission.unadmitted_events,3);assert.equal(marked.summary[0].fraction_by_20_ms,null);assert.equal(marked.summary[0].fraction_by_300_ms,null);assert.equal(marked.summary[0].evidence,"incomplete");
 const retry=await upload(source,batch(run,[slow,result(slow,5,10000)]));assert.equal(retry.status,200);assert.equal((await retry.json()).durability,"stored");const retried=cli(source,["show","--run",run]);assert.equal(retried.summary[0].p99_ms,10000);assert.equal(retried.summary[0].fraction_by_300_ms,null);
 const other=randomUUID(),otherStart={...a,run_id:other};assert.equal((await upload(source,batch(other,[otherStart,result(otherStart,2,8)]))).status,200);
 assert.equal(cli(source,["show","--run",other]).summary[0].fraction_by_20_ms,1);
 const comparison=negative(source,["compare","--before",run,"--after",other]);assert.equal(comparison.exit,2);assert.equal(comparison.body.message,"Recording comparison refused: a run is incomplete because admission facts are missing.");
 const all=source.cli(["diagnostics","export","--run",run,"--ndjson","--server",source.url]);const file=join(source.scratch,"full.ndjson");writeFileSync(file,all,{mode:0o600});assert.equal(all.trim().split("\n").length,2);
 destination=await diagnosticFixture(true,0);assert.equal(cli(destination,["import","--file",file,"--dry-run"]).dry_run,true);assert.equal(cli(destination,["runs"]).runs.length,0);assert.equal(cli(destination,["import","--file",file]).accepted_batches,2);
 const copied=cli(destination,["show","--run",run]);assert.equal(copied.run.admission.refused_batches,1);assert.equal(copied.summary[0].p99_ms,10000);assert.equal(copied.summary[0].fraction_by_20_ms,null);
 const clearing={...first,run:{...first.run,admission:{schema_version:1,policy:"whole_batch",refused_batches:0,unadmitted_events:0,incomplete:false}}};assert.equal((await upload(destination,clearing)).status,200);assert.equal(cli(destination,["show","--run",run]).run.admission.refused_batches,1);
 for(const field of ["title","profile_id","profile_name","path","search_text","token"]){const response=await upload(source,{...first,batch_id:randomUUID(),run:{...first.run,admission:{schema_version:1,policy:"whole_batch",refused_batches:1,unadmitted_events:3,incomplete:true,[field]:"DO_NOT_STORE_REFUSAL_PRIVATE"}}});assert.equal(response.status,400);assert.ok(!(await response.text()).includes("DO_NOT_STORE_REFUSAL_PRIVATE"));}
 const pressure=randomUUID();for(let n=0;n<600;n++){const value=batch(pressure,Array.from({length:128},(_,i)=>({...event,run_id:pressure,sequence:n*128+i,name:"span.finished",stage:"ipc",duration_ms:1,outcome:"completed"})));const response=await upload(source,value);assert.equal(response.status,200);assert.equal((await response.json()).accepted,true);}
 const evicted=cli(source,["show","--run",run]);assert.deepEqual(evicted.summary,[]);assert.equal(evicted.run.admission.refused_batches,1);
 const markOnly=cli(source,["export","--run",run]);assert.deepEqual(markOnly.batches[0].events,[]);const marker=join(destination.scratch,"marker.json");writeFileSync(marker,JSON.stringify(markOnly),{mode:0o600});assert.equal(cli(destination,["import","--file",marker]).accepted_batches,1);assert.equal(cli(destination,["show","--run",run]).run.admission.refused_batches,1);
 const mixedA=randomUUID(),mixedB=randomUUID(),shared= start(mixedA),otherShared={...shared,run_id:mixedB,monotonic_ms:1};
 const mixed=join(destination.scratch,"mixed-runs.ndjson");writeFileSync(mixed,`${JSON.stringify(batch(mixedA,[shared,result(shared,2,8)]))}\n${JSON.stringify(batch(mixedB,[otherShared,result(otherShared,2,400)]))}\n`,{mode:0o600});
 assert.equal(cli(destination,["import","--file",mixed]).accepted_batches,2);assert.equal(cli(destination,["show","--run",mixedA]).summary[0].p50_ms,8);assert.equal(cli(destination,["show","--run",mixedB]).summary[0].p50_ms,400);
 assert.equal(cli(destination,["compare","--before",mixedA,"--after",mixedB]).comparable,true);
 const root=join(source.scratch,"diagnostic-recordings");const bytes=readdirSync(root).reduce((sum,name)=>{assert.equal(statSync(join(root,name)).mode&0o777,0o600);assert.ok(!readFileSync(join(root,name),"utf8").includes("DO_NOT_STORE_REFUSAL_PRIVATE"));return sum+statSync(join(root,name)).blocks*512;},0);assert.ok(bytes<=33554432+12288);
 record.push({message,marked,retried,copied,evicted,comparison,bytes});writeFileSync(join(evidence,"result.json"),JSON.stringify({result:"PASS",record},null,2));
}finally{await source.close();if(destination)await destination.close();}
