import {Database} from 'bun:sqlite';
import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,cpSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
const out=resolve(process.argv[4]);mkdirSync(out,{recursive:true});
const work=mkdtempSync(join(tmpdir(),'todo-denial-process-'));
mkdirSync(work,{recursive:true});
const cli=resolve(process.argv[2]);
const serverBin=resolve(process.argv[3]);
const seed=join(work,'seed');mkdirSync(seed,{recursive:true});
const envFor=home=>({...process.env,HOME:home,TODO_DB:join(home,'scratch.db'),TODO_PORT:'0'});
const invoke=(home,args,input='')=>spawnSync(cli,args,{env:envFor(home),input,encoding:'utf8',timeout:60000});
assert.equal(invoke(seed,['init','--password-stdin'],'scratch-passphrase\n').status,0);
assert.equal(invoke(seed,['login','--password-stdin'],'scratch-passphrase\n').status,0);
const added=invoke(seed,['add','Durable denial target','--format','json']);assert.equal(added.status,0,added.stderr);
const id=JSON.parse(added.stdout).task.id;
const credential=JSON.parse(readFileSync(join(seed,'.todo-cli/session_default.json'),'utf8')).token;
const db=new Database(join(seed,'scratch.db'));db.exec("UPDATE credentials SET revoked_at='2000-01-01T00:00:00Z'");db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();
async function start(home){
 const child=spawn(serverBin,[],{env:envFor(home),stdio:['ignore','pipe','pipe']});
 let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
 const base=await new Promise((done,reject)=>{const timer=setTimeout(()=>reject(new Error(log)),60000);const check=()=>{const match=/Listening on (http:\/\/127\.0\.0\.1:(\d+))/.exec(log);if(match){clearTimeout(timer);assert.notEqual(Number(match[2]),4310);done(match[1]);}};child.stdout.on('data',check);child.stderr.on('data',check);child.once('exit',code=>reject(new Error(`server exit ${code}: ${log}`)));});
 return {child,base,log:()=>log};
}
async function stop(s){const ended=new Promise(r=>s.child.once('exit',(code,signal)=>r({code,signal})));s.child.kill('SIGTERM');return await ended;}
const actions=[];const cases=[];
// Each case must stay inside one wall-clock minute; start late cases in the next one.
const freshMinute=async()=>{const left=60000-Date.now()%60000;if(left<15000)await new Promise(r=>setTimeout(r,left+250));};
for(const name of ['cli-cli','server-server','cli-server','server-cli','server-restart','barrier-cli-cli-server']){
 await freshMinute();
 const home=join(work,name);mkdirSync(home,{recursive:true});cpSync(seed,home,{recursive:true});
 let servers=[];let live;
 const startOne=async()=>{live=await start(home);servers.push(live);return live;};
 const cliArgs=['show',id,'--format','json'];
 const callCli=()=>{const r=invoke(home,cliArgs);assert.equal(r.status,3,r.stderr);assert.equal(JSON.parse(r.stdout).code,'auth_required');actions.push({case:name,surface:'cli',exit:r.status});};
 const callHttp=async()=>{const r=await fetch(`${live.base}/profiles/default/tasks/${id}`,{headers:{Authorization:`Bearer ${credential}`}});const b=await r.json();assert.equal(r.status,401);assert.equal(b._tag,'Unauthorized');actions.push({case:name,surface:'http',status:r.status});};
 try {
  if(name==='cli-cli'){callCli();callCli();}
  if(name==='server-server'){await startOne();await callHttp();await callHttp();}
  if(name==='cli-server'){callCli();await startOne();await callHttp();}
  if(name==='server-cli'){await startOne();await callHttp();callCli();}
  if(name==='server-restart'){await startOne();await callHttp();await stop(live);servers=[];await startOne();await callHttp();}
  if(name==='barrier-cli-cli-server'){
   await startOne();
   const helper=`const {spawn}=require('node:child_process');process.send('ready');process.once('message',()=>{const c=spawn(process.argv[1],JSON.parse(process.argv[2]),{env:process.env,stdio:['ignore','pipe','pipe']});let out='';c.stdout.on('data',d=>out+=d);c.on('exit',code=>{process.send({code,out});process.disconnect();});});`;
   const children=[0,1].map(()=>spawn('node',['-e',helper,cli,JSON.stringify(cliArgs)],{env:envFor(home),stdio:['ignore','ignore','inherit','ipc']}));
   await Promise.all(children.map(c=>new Promise(r=>c.once('message',m=>{assert.equal(m,'ready');r();}))));
   const results=children.map(c=>new Promise(r=>c.once('message',m=>{assert.equal(m.code,3);assert.equal(JSON.parse(m.out).code,'auth_required');r(m.code);})));
   children.forEach(c=>c.send('release'));await Promise.all([...results,callHttp()]);
   actions.push({case:name,surface:'cli-barrier',exits:await Promise.all(results),ready:2});
  }
 } finally {for(const s of servers){const exit=await stop(s);actions.push({case:name,serverExit:exit,log:s.log()});}}
 const check=new Database(join(home,'scratch.db'),{readonly:true});
 const rows=check.query("SELECT seq,actor,profile,json_extract(event,'$.action') action,json_extract(event,'$.detail') detail,json_extract(event,'$.occurred_at') occurred_at FROM op_log WHERE json_extract(event,'$.kind')='AuthAttemptRejected'").all();check.close();
 assert.equal(new Set(rows.map(r=>Math.floor(Date.parse(r.occurred_at)/60000))).size,1,'fixture crossed a minute');
 assert.equal(new Set(rows.map(({seq,occurred_at,...rest})=>JSON.stringify(rest))).size,1);
 cases.push({name,expected:1,actual:rows.length,pass:rows.length===1,rows});
}
writeFileSync(join(out,'parity.json'),JSON.stringify({cases,actions},null,2));
console.log(JSON.stringify(cases.map(({rows,...r})=>r),null,2));
rmSync(work,{recursive:true,force:true});
assert.deepEqual(cases.map(c=>c.actual),[1,1,1,1,1,1]);
