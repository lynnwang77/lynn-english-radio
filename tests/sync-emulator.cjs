const assert=require("node:assert/strict");
const {initializeTestEnvironment}=require("@firebase/rules-unit-testing");
const {collection,doc,getDocs,runTransaction}=require("firebase/firestore");
require("../v2-sync-core.js");
const core=globalThis.LynnSync;
const key=(store,id)=>JSON.stringify([store,id]);
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
(async()=>{
 const env=await initializeTestEnvironment({projectId:"demo-lynn-sync"});
 try{
  const a=env.authenticatedContext("sync-demo",{email_verified:true}).firestore();
  const b=env.authenticatedContext("sync-demo",{email_verified:true}).firestore();
  const date="2026-11-26";
  const word=key("lynn.unified.words","same");
  const star=key("favorites","Library");
  const tags=key("lynn.v2.trackStatus","import:sample");
  const progress=key("lynn.v2.progress","word:same");
  const write=(db,n,key,value,parents=[])=>runTransaction(db,async tx=>{
   const ref=doc(db,"syncUsers","sync-demo","changes",id(n));
   if(!(await tx.get(ref)).exists())tx.set(ref,{id:id(n),key,payload:JSON.stringify(value),parents:parents.map(id)});
  });
  const read=async db=>{
   const snapshot=await getDocs(collection(db,"syncUsers","sync-demo","changes"));
   const groups=core.heads(snapshot.docs.map(doc=>{const {payload,...op}=doc.data();return {...op,value:JSON.parse(payload)}}));
   return {groups,view:core.project(groups,date),count:snapshot.size};
  };
  const first={id:"same",first:"One sentence.",better:"From iPhone.",review:true};
  await write(a,1,word,first);
  await write(b,2,word,{...first,better:"From Chrome."});
  await write(b,3,key("lynn.v2.importedTracks","sample"),{id:"sample",title:"At the Library"});
  await write(a,4,star,true);
  await write(b,5,tags,"current");
  await write(a,6,key("lynn.unified.today",date),{day:date,due:["word:same"],fresh:[]});
  await write(b,7,progress,{lastReviewed:date,reviews:1});
  const firstMerge=await read(b);
  assert.equal(core.alternatives(firstMerge.groups.get(word)).length,2);
  assert.equal(firstMerge.view["lynn.v2.importedTracks"][0].title,"At the Library");
  await write(b,8,word,{...first,archived:true,review:false},[1,2]);
  await write(a,9,star,null,[4]);
  await write(a,9,star,null,[4]); // same operation replay
  const changed=await read(a);
  assert.equal(changed.count,9);
  assert.deepEqual(changed.view.favorites,[]);
  assert.equal(changed.view["lynn.unified.words"][0].archived,true);
  assert.equal(changed.view["lynn.v2.trackStatus"]["import:sample"],"current");
  assert.equal(changed.view["lynn.v2.progress"]["word:same"].reviews,1);
  assert.deepEqual(changed.view["lynn.unified.today"].due,["word:same"]);
  assert.deepEqual((await read(b)).view,changed.view);
  console.log("Firestore emulator: two clients, first-merge conflict, course, rating, Today, favorite removal and idempotent retry passed");
 }finally{await env.cleanup()}
})().catch(e=>{console.error(e);process.exitCode=1});
