const test=require("node:test");
const assert=require("node:assert/strict");
require("../v2-sync-core.js");
const sync=globalThis.LynnSync;
const day="2026-11-26";
const word={id:"sample",first:"I go to the library.",better:"I went to the library.",note:"Past event",scene:"Library",review:true};
const key=JSON.stringify(["lynn.unified.words",word.id]);
const op=(id,key,value,parents=[])=>({id,key,value,parents});

test("joining with disjoint records preserves all supported collections",()=>{
 const a=sync.records({"lynn.unified.words":[word],"lynn.v2.progress":{"word:sample":{lastReviewed:day}},
  favorites:["library"],"lynn.unified.today":{day,due:["word:sample"],fresh:[]}});
 const b=sync.records({"lynn.v2.importedTracks":[{id:"personal-course",title:"Library"}],
  "lynn.v2.trackStatus":{"import:personal-course":"current"},"lynn.unified.legacyDays":{[day]:[1,2]}});
 const ops=[...a,...b].map(([key,value],i)=>op(String(i),key,value));
 const state=sync.records(sync.project(sync.heads(ops),day));
 assert.equal(state.size,a.size+b.size);
 for(const [key,value] of [...a,...b])assert.ok(sync.equal(state.get(key),value));
});
test("initial same-ID divergence and concurrent changes keep all versions until chosen",()=>{
 const a=op("1",key,word);
 const b=op("2",key,{...word,better:"A different correction."});
 const archived=op("3",key,{...word,archived:true,review:false},["1"]);
 const deleted=op("4",key,{...word,deleted:true,review:false},["2"]);
 let groups=sync.heads([a,b,archived,deleted]);
 assert.deepEqual(groups.get(key).map(o=>o.id),["3","4"]);
 assert.equal(sync.project(groups,day)["lynn.unified.words"][0].deleted,true);
 const resolution=op("5",key,archived.value,["3","4"]);
 groups=sync.heads([a,b,archived,deleted,resolution]);
 assert.deepEqual(sync.project(groups,day)["lynn.unified.words"],[archived.value]);
});
test("explicit unstar persists through stale edits and same value roots need no consent",()=>{
 const favorite=JSON.stringify(["favorites","library"]);
 const ops=[op("1",favorite,true),op("2",favorite,true),op("3",favorite,null,["1"])];
 const groups=sync.heads(ops);
 assert.equal(sync.alternatives(sync.heads(ops.slice(0,2)).get(favorite)).length,1);
 assert.deepEqual(sync.project(groups,day).favorites,[]);
});
test("daily rollover preserves older plans without reintroducing their entries",()=>{
 const old=sync.records({"lynn.unified.today":{day:"2026-11-25",due:[],fresh:["old"]}});
 const next=sync.records({"lynn.unified.today":{day,due:[],fresh:["new"]}});
 assert.equal(sync.differences(old,next).length,1);
 assert.equal(sync.project(sync.heads([...old].map(([key,value])=>op("1",key,value))),day)["lynn.unified.today"],null);
});

test("same legacy course ID with different content keeps each course, progress, favorite and daily reference",async()=>{
 const snapshot=en=>({
  "lynn.v2.importedTracks":[{id:"same",channel:"life",title:"Library",sentences:[{id:"a",en,zh:"句子"}]}],
  "lynn.v2.progress":{"import:same:a":{reviews:en==="One."?1:2}},
  "lynn.v2.trackStatus":{"import:same":"current"},
  favorites:["life||Library||"+en],
  "lynn.unified.today":{day,due:["import:same:a"],fresh:[]}
 });
 const left=await sync.normalizeCourses(snapshot("One."));
 const right=await sync.normalizeCourses(snapshot("Two."));
 const recordSets=[left,right].map(s=>sync.records(s));
 const ops=recordSets.flatMap((set,i)=>[...set].map(([key,value],j)=>op(i+"-"+j,key,value)));
 const merged=sync.project(sync.heads(ops),day);
 assert.equal(merged["lynn.v2.importedTracks"].length,2);
 for(const lesson of merged["lynn.v2.importedTracks"]){
  const sentence="import:"+lesson.id+":a";
  assert.equal(merged["lynn.v2.progress"][sentence].reviews,lesson.sentences[0].en==="One."?1:2);
  assert.equal(merged["lynn.v2.trackStatus"]["import:"+lesson.id],"current");
  assert.ok(merged.favorites.includes(sentence));
 }
 assert.deepEqual(await sync.normalizeCourses(left),left);
 require("../v2-core.js");
 assert.equal(globalThis.LynnCore.normalizeImport({version:1,tracks:merged["lynn.v2.importedTracks"]},[],{backup:true}).tracks.length,2);
});
