const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
require("../v2-sync-core.js");
const core=globalThis.LynnSync;
const source=fs.readFileSync(require.resolve("../v2-sync.js"),"utf8")
 .replace(/^import[^\n]*\n/,"").replace(/void start\(\);\s*$/,"");
const words="lynn.unified.words";
const deviceWord={id:"local",first:"I saved this while syncing."};
const cloudWord={id:"cloud",first:"The other device saved this."};
const cloudKey=JSON.stringify([words,cloudWord.id]);

function client({snapshot={},journalState,cloud=[],normalize=core.normalizeCourses}){
 const persisted=new Map([["lynn.sync.test.v1",JSON.stringify(journalState)]]);
 const applied=[];
 const statuses={};
 const context=vm.createContext({
  window:{LynnSync:{...core,normalizeCourses:normalize},LynnSyncApp:{
   read:()=>structuredClone(snapshot),today:()=>"2026-11-26",
   apply:next=>{applied.push(next);return true}
  }},
  document:{getElementById:id=>statuses[id]??={}},
  localStorage:{getItem:key=>persisted.get(key)??null,setItem:(key,value)=>persisted.set(key,value)},
  navigator:{onLine:true},crypto:globalThis.crypto,Map,Set,Date,TextEncoder,setTimeout:()=>{},
  remoteOps:cloud
 });
 vm.runInContext(source+`
  state=load();user={uid:"owner"};enabled=true;serverConfirmed=true;lastPoll=Date.now();
  remote=new Map(remoteOps.map(op=>[op.id,op]));
  api={doc:()=>null,collection:()=>null,getDocFromServer:async()=>({data:()=>null}),
       getDocsFromServer:async()=>({docs:[]})};
 `,context);
 return {applied,statuses,run:()=>vm.runInContext("reconcile()",context)};
}

test("cloud projection cannot overwrite a word saved while local normalization awaited",async()=>{
 const snapshot={};
 let started, resume;
 const startedPromise=new Promise(resolve=>{started=resolve});
 const paused=new Promise(resolve=>{resume=resolve});
 let normalizations=0;
 const {applied,run}=client({
  snapshot,journalState:{uid:"owner",baseline:[],heads:{},pending:[]},
  cloud:[{id:"cloud-op",key:cloudKey,value:cloudWord,parents:[]}],
  normalize:async captured=>{
   if(++normalizations===2){started();await paused}
   return core.normalizeCourses(captured);
  }
 });
 const running=run();
 await startedPromise;
 snapshot[words]=[deviceWord];
 resume();
 await running;
 assert.equal(applied.length,0);
 assert.deepEqual(snapshot[words],[deviceWord]);
});

test("a stale tab cannot project a partial history over records from another tab",async()=>{
 const snapshot={[words]:[cloudWord]};
 const {applied,run,statuses}=client({
  snapshot,journalState:{uid:"owner",baseline:[...core.records(snapshot)],heads:{[cloudKey]:["other-tab-op"]},pending:[]}
 });
 await run();
 assert.equal(applied.length,0);
 assert.match(statuses.syncStatus.textContent,/已知版本尚未从云端读回/);
});

test("an oversized course stays local without adding a permanently rejected pending write",async()=>{
 const courses="lynn.v2.importedTracks";
 const lesson={id:"sync-"+"a".repeat(64),title:"Long bilingual lesson",reading:"长".repeat(90000)};
 const snapshot={[courses]:[lesson]};
 const {applied,run,statuses}=client({snapshot,journalState:{uid:"owner",baseline:[],heads:{},pending:[]}});
 await run();
 assert.equal(applied.length,0);
 assert.deepEqual(snapshot[courses],[lesson]);
 assert.match(statuses.syncStatus.textContent,/记录超过同步大小限制：Long bilingual lesson/);
});
