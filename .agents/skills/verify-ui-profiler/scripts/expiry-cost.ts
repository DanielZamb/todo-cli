import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { join, resolve } from "node:path";
import { Schema } from "effect";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
const evidence=resolve(process.argv[2] ?? "docs/evidence/ui-speed/recordings-correction/expiry-cost");mkdirSync(evidence,{recursive:true});
const binary=resolve(".scratch/bin/expiry-fault-server");
const baseline=await diagnosticFixture(true,15,[binary]);let failing:Awaited<ReturnType<typeof diagnosticFixture>>|undefined;
const rows:{pair:number;failed_expiry:boolean;load_start:number;load_end:number;ms:number[];driver_cpu_ms:number;elapsed_ms:number}[]=[];
const quantile=(v:number[],q:number)=>[...v].sort((a,b)=>a-b)[Math.ceil(v.length*q)-1]??0;
const median=(v:number[])=>{const a=[...v].sort((x,y)=>x-y);return ((a[Math.floor((a.length-1)/2)]??0)+(a[Math.floor(a.length/2)]??0))/2;};
try {
 failing=await diagnosticFixture(true,15,[binary,"--expiry-fault"]);
 for(let pair=0;pair<5;pair++) for(const failed_expiry of pair%2?[true,false]:[false,true]) {
  const fixture: Awaited<ReturnType<typeof diagnosticFixture>>=failed_expiry?failing:baseline;const ms:number[]=[];const load_start=loadavg()[0]??0,cpu=process.cpuUsage(),started=performance.now();
  while(performance.now()-started<6500) {
   const start=performance.now();const response: Response=await fetch(fixture.url+"/profiles/work/tasks",{headers:{Authorization:`Bearer ${fixture.credential}`}});assert.equal(response.status,200);
   const tasks=Schema.decodeUnknownSync(Schema.Array(Schema.Struct({title:Schema.String})))(await response.json());assert.equal(tasks.length,15);assert.deepEqual(tasks.map(task=>task.title).sort(),["Benchmark Task 000","Benchmark Task 001","Benchmark Task 002","Benchmark Task 003","Benchmark Task 004","Benchmark Task 005","Benchmark Task 006","Benchmark Task 007","Benchmark Task 008","Benchmark Task 009","Benchmark Task 010","Benchmark Task 011","Benchmark Task 012","Benchmark Task 013","Benchmark Task 014"]);ms.push(performance.now()-start);await Bun.sleep(20);
  }
  const used=process.cpuUsage(cpu);rows.push({pair,failed_expiry,load_start,load_end:loadavg()[0]??0,ms,driver_cpu_ms:(used.user+used.system)/1000,elapsed_ms:performance.now()-started});writeFileSync(join(evidence,"raw.json"),JSON.stringify(rows,null,2));
 }
 await failing.close();
 const match=/expiry-final:(\{[^\n]+\})/u.exec(failing.log());assert.ok(match);const status=JSON.parse(match[1]??"");assert.equal(status.loss.storage_failures,2);assert.equal(status.segments,0);assert.equal(status.bytes,4096);
 const pairs=Array.from({length:5},(_,pair)=>{const a=rows.find(r=>r.pair===pair&&!r.failed_expiry),b=rows.find(r=>r.pair===pair&&r.failed_expiry);assert.ok(a&&b);return {pair,baseline_p50:quantile(a.ms,.5),failing_p50:quantile(b.ms,.5),baseline_p99:quantile(a.ms,.99),failing_p99:quantile(b.ms,.99),difference:quantile(b.ms,.5)-quantile(a.ms,.5)};});
 writeFileSync(join(evidence,"result.json"),JSON.stringify({result:"PASS",condition:"ambient host; permanent real unlink failure; five alternating AB/BA pairs; 6.5 seconds per cell; two actual failed timer attempts",pairs,median_difference_ms:median(pairs.map(p=>p.difference)),range_ms:[Math.min(...pairs.map(p=>p.difference)),Math.max(...pairs.map(p=>p.difference))],baseline_p50:rows.filter(r=>!r.failed_expiry).map(r=>quantile(r.ms,.5)),failing_p50:rows.filter(r=>r.failed_expiry).map(r=>quantile(r.ms,.5)),baseline_p99:rows.filter(r=>!r.failed_expiry).map(r=>quantile(r.ms,.99)),failing_p99:rows.filter(r=>r.failed_expiry).map(r=>quantile(r.ms,.99)),requests:rows.reduce((sum,r)=>sum+r.ms.length,0),status},null,2));
} finally {await baseline.close();if(failing)await failing.close();}
