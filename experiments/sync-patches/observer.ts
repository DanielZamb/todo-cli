import {Database} from 'bun:sqlite';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {existsSync,readdirSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {Schema} from 'effect';
import type {OperationStore} from '../../packages/domain/src/store/store.ts';
import {baseline,database,sequence} from './baseline.ts';
import {Patch, type Replica} from './model.ts';
import {difference,applyPatch,bytes} from './patch.ts';
const observers=new WeakMap<object,Observer>();
export type Arm='stored'|'memory'|'off';
export type Frame={seq:number; before:Replica; cpu:ReturnType<typeof process.cpuUsage>};
export class Observer{
 readonly db:Database; writer:Replica; replica:Replica; ring:Array<{patch:Patch;encoded:Buffer;at:number}>=[]; patches:Patch[]=[]; resets:string[]=[]; metrics:Array<Record<string,number|string>>=[]; busy=false; expectedChecks=0; lastOutbox=0;
 constructor(readonly store:OperationStore,readonly arm:Arm,readonly profile:string,public at:string,readonly path:string){this.db=database(store);this.db.exec('PRAGMA wal_autocheckpoint=0');if(arm==='stored')this.db.exec('CREATE TABLE IF NOT EXISTS sync_patch_outbox (id INTEGER PRIMARY KEY, from_cursor TEXT NOT NULL,to_cursor TEXT NOT NULL,payload TEXT NOT NULL)');this.replica=baseline(store,profile,at);this.writer=this.replica;if(arm==='stored')this.lastOutbox=this.db.query<{id:number},[]>('SELECT coalesce(max(id),0) id FROM sync_patch_outbox').get()?.id??0;observers.set(store,this);}
 sample(stage:'projection'|'encoding'|'decode',operation:()=>Replica):Replica {const recorder=this.store.diagnostics.profiler,root=recorder.root({}),span=recorder.start(root,stage);try{return operation();}finally{recorder.end(span,'completed');}}
 fresh(){return this.sample('projection',()=>baseline(this.store,this.profile,this.at));}
 push(patch:Patch){const start=performance.now(),encoded=Buffer.from(JSON.stringify(patch));this.ring.push({patch,encoded,at:Date.now()});if(this.ring.length>256)this.ring.shift();this.patches.push(patch);if(this.patches.length>256)this.patches.shift();this.metrics.push({stage:'patch',compute_ms:0,encode_ms:performance.now()-start,bytes:encoded.byteLength,rows:Object.keys(patch.rows).length,derived:Object.keys(patch.computed).length});}
 reset(next:Replica,reason:string){this.ring=[];this.patches=[];this.lastOutbox=this.arm==='stored'?(this.db.query<{id:number},[]>('SELECT coalesce(max(id),0) id FROM sync_patch_outbox').get()?.id??0):0;this.replica=next;this.writer=next;this.resets.push(reason);this.metrics.push({stage:'baseline',reason,bytes:bytes(next)});}
 poll(){if(this.arm==='off')return;this.busy=true;try{if(this.arm==='memory'){const next=this.fresh();if(next.generation!==this.replica.generation){this.reset(next,'generation');return;}if(next.cursor!==this.replica.cursor){const start=performance.now(),patch=difference(this.replica,next,'whole');this.metrics.push({stage:'diff',compute_ms:performance.now()-start});assert.deepEqual(applyPatch(this.replica,patch),next);this.expectedChecks++;this.replica=next;this.push(patch);}return;}
 const epoch=sequence(this.db);
 const rows=this.db.query<{id:number;payload:string},[number]>('SELECT id,payload FROM sync_patch_outbox WHERE id>? ORDER BY id').all(this.lastOutbox);for(const row of rows){this.lastOutbox=row.id;const patch=Schema.decodeUnknownSync(Patch)(JSON.parse(row.payload));if(patch.to===this.replica.cursor)continue;if(patch.from!==this.replica.cursor)continue;this.replica=applyPatch(this.replica,patch);this.push(patch);}
 if(!this.replica.cursor.includes(':'+epoch+':'))this.reset(this.fresh(),'gap-or-old-cli');
 }finally{this.busy=false;}}
 memory(){return {replica_json_bytes:bytes(this.replica),ring_bytes:this.ring.reduce((n,r)=>n+r.encoded.byteLength,0),ring_count:this.ring.length,heap_used:process.memoryUsage().heapUsed,rss:process.memoryUsage().rss};}
}
export function attach(store:OperationStore,arm:Arm,profile:string,at:string,path:string){return new Observer(store,arm,profile,at,path);}
export function maybeAttach(store:OperationStore){const config=process.env.SYNC_EXPERIMENT_CONFIG;if(config){const c=JSON.parse(readFileSync(config,'utf8'));attach(store,c.arm,c.profile,c.at,c.path);}}
export function beginTransaction(store:OperationStore):Frame|undefined {const o=observers.get(store);if(!o||o.busy||o.db.inTransaction||o.arm==='off')return;const seq=sequence(o.db);o.busy=true;try{if(o.arm==='stored'&&!o.writer.cursor.includes(':'+seq+':'))o.writer=o.fresh();return {seq,before:o.writer,cpu:process.cpuUsage()};}finally{o.busy=false;}}
function eraseOutboxSnapshots(o:Observer){const directory=join(dirname(o.path),'snapshots');if(!existsSync(directory))return;for(const name of readdirSync(directory).filter(n=>n.endsWith('.sqlite'))){const file=join(directory,name),db=new Database(file);try{if(db.query("SELECT 1 FROM sqlite_master WHERE name='sync_patch_outbox'").get()){db.exec('DELETE FROM sync_patch_outbox; VACUUM');}}finally{db.close();}const manifest=file.replace(/\.sqlite$/u,'.json');if(existsSync(manifest)){const m=JSON.parse(readFileSync(manifest,'utf8'));m.sha256=createHash('sha256').update(readFileSync(file)).digest('hex');m.size=statSync(file).size;writeFileSync(manifest,JSON.stringify(m));}}}
export function insideCommit(store:OperationStore,frame:Frame|undefined){const o=observers.get(store);if(!o||!frame||o.busy||o.arm!=='stored')return;const seq=sequence(o.db);if(seq===frame.seq)return;o.busy=true;try{assert.equal(o.db.inTransaction,true);const start=performance.now(),next=o.fresh();if(next.generation!==frame.before.generation){o.db.exec('DELETE FROM sync_patch_outbox');eraseOutboxSnapshots(o);o.writer=next;return;}const patch=difference(frame.before,next,'whole'),encoded=JSON.stringify(patch);o.db.query('INSERT INTO sync_patch_outbox(from_cursor,to_cursor,payload) VALUES (?,?,?)').run(patch.from,patch.to,encoded);o.db.exec('DELETE FROM sync_patch_outbox WHERE id NOT IN (SELECT id FROM sync_patch_outbox ORDER BY id DESC LIMIT 256)');o.metrics.push({stage:'stored',compute_ms:performance.now()-start,bytes:Buffer.byteLength(encoded),inside_transaction:1});o.writer=next;}finally{o.busy=false;}}
export function afterCommit(store:OperationStore,frame:Frame|undefined){const o=observers.get(store);if(o&&frame&&!o.busy&&!database(store).inTransaction&&sequence(o.db)!==frame.seq)o.poll();}
