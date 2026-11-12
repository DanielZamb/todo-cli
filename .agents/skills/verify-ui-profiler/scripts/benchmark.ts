import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { join, resolve } from "node:path";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";

const directory=resolve(process.argv[2] ?? "docs/evidence/ui-speed/recordings/cost");mkdirSync(directory,{recursive:true});
const eventCount=Number(process.env.TODO_PROFILER_EVENTS ?? 16);assert.ok(eventCount===16||eventCount===128);
const pairCount=Number(process.env.TODO_PROFILER_PAIRS ?? 5);assert.ok(pairCount===5||pairCount===10);
const fixture=await diagnosticFixture(true,15);
const serverCPU=()=>spawnSync("ps",["-p",String(fixture.server.pid),"-o","cputime=,rss="],{encoding:"utf8"}).stdout.trim();
const headers={Authorization:`Bearer ${fixture.credential}`,"Content-Type":"application/json"};
const results:{pair:number;enabled:boolean;load_start:number;load_end:number;task_ms:number[];task_handler_ms:number[];ingest_ms:number[];bytes:number;accepted:number;server_status:unknown;driver_cpu_ms:number;server_cpu_start:string;server_cpu_end:string}[]=[];
try {
  for(let pair=0;pair<pairCount;pair++) for(const enabled of pair%2?[true,false]:[false,true]) {
    const id=randomUUID();let bytes=0,accepted=0;const task_ms:number[]=[], task_handler_ms:number[]=[],ingest_ms:number[]=[];const load_start=loadavg()[0] ?? 0;const cpu=process.cpuUsage();const server_cpu_start=serverCPU();
    for(let index=0;index<100;index++) {
      const action_id=randomUUID();
      const event={schema_version:1,run_id:id,process_role:"macos",build_id:"a".repeat(40),contract_id:"b".repeat(64),category:{inventory_id:"I07",subtype:"task.selection.pointer"},mode:"full",input_kind:"pointer",workload:"warm",sequence:index*eventCount,monotonic_ms:index,clock_unit:"ms",trace_id:randomUUID(),span_id:randomUUID(),action_id,name:"ui.action.started"};
      const batch={schema_version:1,batch_id:randomUUID(),run:{run_id:id,app:"macos",build_id:event.build_id,contract_id:event.contract_id,comparison:{fixture_hash:"c".repeat(64),script_hash:"d".repeat(64),environment_hash:"e".repeat(64),configuration:"release",render_stage:"layout_complete",concurrency:1}},events:Array.from({length:eventCount},(_,i)=>({...event,sequence:index*16+i,action_id:randomUUID()}))};
      const text=JSON.stringify(batch);
      const started=performance.now();
      const task=fetch(fixture.url+"/profiles/work/tasks",{headers}).then(async response=>{assert.equal(response.status,200);const tasks=await response.json();task_ms.push(performance.now()-started);assert.equal(tasks.length,15);task_handler_ms.push(Number(/todo-handler;dur=([0-9.]+)/u.exec(response.headers.get("server-timing")??"")?.[1]));});
      const ingestion=enabled?fetch(fixture.url+"/diagnostics/profiler/ingest",{method:"POST",headers,body:text}).then(async response=>{assert.equal(response.status,200);const receipt=await response.json();assert.equal(receipt.accepted,true);accepted++;bytes+=Buffer.byteLength(text);ingest_ms.push(Number(/todo-handler;dur=([0-9.]+)/u.exec(response.headers.get("server-timing")??"")?.[1]));}):Promise.resolve();
      await Promise.all([task,ingestion]);
    }
    const server_status=await (await fetch(fixture.url+"/diagnostics/profiler/runs",{headers})).json();
    const used=process.cpuUsage(cpu);
    results.push({pair,enabled,load_start,load_end:loadavg()[0]??0,task_ms,task_handler_ms,ingest_ms,bytes,accepted,server_status,server_cpu_start,server_cpu_end:serverCPU(),driver_cpu_ms:(used.user+used.system)/1000});
    writeFileSync(join(directory,"raw.json"),JSON.stringify(results,null,2));
  }
  const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);const at=Math.floor(sorted.length/2);return sorted.length%2?(sorted[at]??0):((sorted[at-1]??0)+(sorted[at]??0))/2;};
  const p=(values:number[],q:number)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*q)-1]??null;
  const pairs=Array.from({length:pairCount},(_,pair)=>{const a=results.find(r=>r.pair===pair&&!r.enabled);const b=results.find(r=>r.pair===pair&&r.enabled);assert.ok(a&&b);return {pair,baseline_p50_ms:p(a.task_ms,.5),enabled_p50_ms:p(b.task_ms,.5),baseline_p99_ms:p(a.task_ms,.99),enabled_p99_ms:p(b.task_ms,.99),difference_p50_ms:(p(b.task_ms,.5)??0)-(p(a.task_ms,.5)??0),baseline_handler_p50_ms:p(a.task_handler_ms,.5),enabled_handler_p50_ms:p(b.task_handler_ms,.5),ingest_handler_p50_ms:p(b.ingest_ms,.5),ingest_handler_p99_ms:p(b.ingest_ms,.99)};});
  const diffs=pairs.map(p=>p.difference_p50_ms);const variation=Math.max(...diffs)-Math.min(...diffs);
  writeFileSync(join(directory,"result.json"),JSON.stringify({result:"PASS",conditions:"ambient busy-host; no imposed CPU pressure",pairs,paired_difference_median_ms:median(diffs),paired_difference_range_ms:[Math.min(...diffs),Math.max(...diffs)],verdict:Math.abs(median(diffs))<=variation?"inconclusive":"difference exceeds pair variation",task_requests:pairCount*200,ingestions:pairCount*100,events:pairCount*100*eventCount},null,2));
}finally{await fixture.close();}
