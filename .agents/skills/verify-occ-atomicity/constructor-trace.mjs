import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Effect } from 'effect';
const [repoInput,directoryInput,output]=process.argv.slice(2);
const repo=resolve(repoInput),directory=resolve(directoryInput);
if(!directory.includes('todo-constructor-'))throw Error('Expected owned constructor scratch');
mkdirSync(directory,{recursive:true});
const {OperationStore}=await import(pathToFileURL(join(repo,'packages/domain/src/store/store.ts')).href);
const {actor,created,profile,work}=await import(pathToFileURL(join(repo,'packages/domain/test/store-fixtures.ts')).href);
const path=join(directory,'scratch.db'),seed=join(directory,'seed.sqlite');
if(!existsSync(seed)){
 const store=new OperationStore({path,attachmentRoot:join(directory,'images')});
 await Effect.runPromise(store.putProfile(work));await Effect.runPromise(store.append({actor,profile,event:created}));await Effect.runPromise(store.close());copyFileSync(path,seed);
}
for(const suffix of ['-wal','-shm'])rmSync(path+suffix,{force:true});
copyFileSync(seed,path);
const sha=value=>createHash('sha256').update(value).digest('hex');
const seedHash=sha(readFileSync(path));
const trace=[],wrapped=new WeakSet();
const wrap=(statement,sql)=>{
 if(wrapped.has(statement))return statement;wrapped.add(statement);
 for(const method of ['get','all','run','values','iterate']){const original=statement[method];statement[method]=function(...args){trace.push({kind:'statement',method,sql,args});return original.apply(this,args);};}
 return statement;
};
for(const method of ['prepare','query']){const original=Database.prototype[method];Database.prototype[method]=function(sql,...args){return wrap(original.call(this,sql,...args),sql);};}
for(const method of ['exec','run']){const original=Database.prototype[method];Database.prototype[method]=function(sql,...args){trace.push({kind:'statement',method,sql,args});return original.call(this,sql,...args);};}
const transaction=Database.prototype.transaction;
Database.prototype.transaction=function(...args){const actual=transaction.apply(this,args);const wrapCall=(call,mode)=>function(...input){trace.push({kind:'transaction',mode,phase:'enter'});try{const result=call.apply(this,input);trace.push({kind:'transaction',mode,phase:'committed'});return result;}catch(error){trace.push({kind:'transaction',mode,phase:'rolled-back'});throw error;}};const result=wrapCall(actual,'default');for(const mode of ['default','immediate','deferred','exclusive'])result[mode]=wrapCall(actual[mode],mode);return result;};
const store=new OperationStore({path,attachmentRoot:join(directory,'images')});
await Effect.runPromise(store.close());
writeFileSync(output,JSON.stringify({source_sha256:sha(readFileSync(join(repo,'packages/domain/src/store/store.ts'))),seed_sha256:seedHash,trace},null,2));
console.log({statements:trace.filter(row=>row.kind==='statement').length,transaction_boundaries:trace.filter(row=>row.kind==='transaction').length,seed_sha256:seedHash});
