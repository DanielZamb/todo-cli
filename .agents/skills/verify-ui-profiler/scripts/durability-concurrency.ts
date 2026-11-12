import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Schema } from "effect";
import { diagnosticFixture } from "../../../../apps/server/scripts/diagnostic-fixture.ts";
import { RecordingReceipt, RecordingShow } from "../../../../packages/domain/src/diagnostic-recordings.ts";
import { event } from "../../../../packages/domain/test/fixtures/diagnostic-recording.ts";
const evidence=resolve(process.argv[2]??"docs/evidence/ui-speed/recordings-durability/concurrency");mkdirSync(evidence,{recursive:true});
const rows:object[]=[];
for(const mode of ["producer","import"] as const) for(const point of ["later_refusal","pending_duplicate"] as const){
  const id=randomUUID(),a={...event,run_id:id},batch={schema_version:1,batch_id:randomUUID(),run:{run_id:id,app:"macos",build_id:event.build_id,contract_id:event.contract_id,admission:{schema_version:1,policy:"whole_batch",refused_batches:1,unadmitted_events:3,incomplete:true}},events:[a,{...a,name:"ui.result.committed",sequence:2,monotonic_ms:18,duration_ms:8,outcome:"completed",correct:true,render_stage:"layout_complete"},{...a,name:"process.terminated",sequence:3,monotonic_ms:30,reason:"clean"}]};
  const f=await diagnosticFixture(true,1,[resolve(".scratch/bin/durability-server"),"--durability-point",point,"--durability-run",id]),headers={Authorization:`Bearer ${f.credential}`,"Content-Type":"application/json"};
  let number=0;
  const upload=()=>{
    if(mode==="producer")return fetch(f.url+"/diagnostics/profiler/ingest",{method:"POST",headers,body:JSON.stringify(batch)}).then(async response=>{if(point==="pending_duplicate"&&response.status===500){const body:unknown=await response.json();return{exit:1,body};}assert.equal(response.status,200);return{exit:0,body:Schema.decodeUnknownSync(RecordingReceipt)(await response.json())};});
    const file=join(f.scratch,`batch-${number++}.json`);writeFileSync(file,JSON.stringify(batch));
    return new Promise<{exit:number;body:unknown}>((done,reject)=>{const child=spawn(resolve(".scratch/bin/todo"),["--profile","work","diagnostics","import","--file",file,"--server",f.url,"--format","json"],{env:f.env,stdio:["ignore","pipe","pipe"]});let out="",err="";child.stdout.on("data",x=>out+=x);child.stderr.on("data",x=>err+=x);child.once("error",reject);child.once("exit",exit=>{try{assert.equal(err,"");done({exit:exit??-1,body:JSON.parse(out)});}catch(error){reject(error);}});});
  };
  const wait=async(name:string)=>{const deadline=performance.now()+60000;while(!existsSync(join(f.scratch,name))&&performance.now()<deadline){assert.equal(f.server.exitCode,null,f.log());await Bun.sleep(10);}assert.ok(existsSync(join(f.scratch,name)),f.log());};
  const blocker=join(f.scratch,"diagnostic-recordings",`${id}.admission.json.tmp`);
  try{
    const first=upload();await wait("durability-barrier.json");
    let second:Promise<{status:number;body:unknown}|Awaited<ReturnType<typeof upload>>>;
    if(point==="later_refusal"){
      mkdirSync(blocker);
      second=fetch(f.url+"/diagnostics/profiler/ingest",{method:"POST",headers,body:JSON.stringify({...batch,batch_id:randomUUID(),events:[{...a,action_id:randomUUID()}]})}).then(async response=>{const body:unknown=await response.json();return{status:response.status,body};});
    }else second=upload();
    await wait("durability-second-observed");writeFileSync(join(f.scratch,"durability-release"),"release");
    const one=await first,two=await second;
    if(point==="later_refusal"){
      assert.equal(one.exit,0);if(mode==="producer"){const receipt=Schema.decodeUnknownSync(RecordingReceipt)(one.body);assert.equal(receipt.accepted,true);assert.equal(receipt.admission.refused_batches,1);}
      assert.ok("status"in two);assert.equal(two.status,500);rmSync(blocker,{recursive:true});
    }else{
      assert.equal(one.exit,1);assert.ok("exit"in two);assert.equal(two.exit,1);
      if(mode==="producer"){for(const body of [one.body,two.body])assert.equal(Schema.decodeUnknownSync(Schema.Struct({message:Schema.String}))(body).message,"Whole batch was not admitted and its uncertainty could not be persisted. Keep the entire batch and retry when storage is available.");}
    }
    const beforeResponse=await fetch(f.url+`/diagnostics/profiler/runs/${id}`,{headers});if(point==="later_refusal"){assert.equal(beforeResponse.status,400);assert.equal(Schema.decodeUnknownSync(Schema.Struct({message:Schema.String}))(await beforeResponse.json()).message,"Recording admission metadata is unavailable; no complete summary can be shown.");}else{assert.equal(beforeResponse.status,400);assert.equal(Schema.decodeUnknownSync(Schema.Struct({message:Schema.String}))(await beforeResponse.json()).message,"Recording unavailable: the run is missing or expired.");}
    const retry=await upload();assert.equal(retry.exit,0);const final=Schema.decodeUnknownSync(RecordingShow)(await(await fetch(f.url+`/diagnostics/profiler/runs/${id}`,{headers})).json());assert.equal(final.summary[0]?.starts,1);assert.equal(final.summary[0]?.fraction_by_20_ms,null);
    assert.equal(readdirSync(join(f.scratch,"diagnostic-recordings")).filter(name=>/^\d{13}-.*\.json$/u.test(name)).length,1);
    rows.push({mode,point,first:one,second:two,final:final.run.admission});writeFileSync(join(evidence,"result.json"),JSON.stringify({result:rows.length===4?"PASS":"RUNNING",cases:rows.length,rows},null,2));
  }finally{
    writeFileSync(join(f.scratch,"durability-release"),"release");if(existsSync(blocker))rmSync(blocker,{recursive:true});await f.close();
  }
}
