(function(root){
"use strict";
const lists={"lynn.unified.words":"id","lynn.v2.importedTracks":"id"};
const maps=["lynn.v2.progress","lynn.v2.trackStatus","lynn.unified.legacyDays"];
const daily="lynn.unified.today";
const keys=[...Object.keys(lists),...maps,"favorites",daily];
const recordKey=(store,id)=>JSON.stringify([store,id]);
function records(snapshot){
 const out=new Map();
 for(const [store,field] of Object.entries(lists)){
  for(const item of snapshot[store]||[])out.set(recordKey(store,item[field]),item);
 }
 for(const store of maps){
  for(const [id,value] of Object.entries(snapshot[store]||{}))out.set(recordKey(store,id),value);
 }
 for(const id of snapshot.favorites||[])out.set(recordKey("favorites",id),true);
 const plan=snapshot[daily];
 if(plan?.day)out.set(recordKey(daily,plan.day),plan);
 return out;
}
const variantID=id=>/^sync-[a-f0-9]{64}$/.test(id);
async function normalizeCourses(snapshot){
 const lessons=snapshot["lynn.v2.importedTracks"]||[];
 const progress={...snapshot["lynn.v2.progress"]};
 const statuses={...snapshot["lynn.v2.trackStatus"]};
 const favorites=new Set(snapshot.favorites||[]);
 const ids=new Map();
 const tracks=await Promise.all(lessons.map(async lesson=>{
  if(variantID(lesson.id))return lesson;
  const bytes=new TextEncoder().encode(canonical(lesson));
  const hash=await globalThis.crypto.subtle.digest("SHA-256",bytes);
  const id="sync-"+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,"0")).join("");
  for(const sentence of lesson.sentences||[]){
   ids.set("import:"+lesson.id+":"+sentence.id,"import:"+id+":"+sentence.id);
   const oldFavorite=[lesson.channel,lesson.title,sentence.en].join("||");
   if(favorites.delete(oldFavorite))favorites.add("import:"+id+":"+sentence.id);
  }
  const oldKey="import:"+lesson.id;
  if(Object.hasOwn(statuses,oldKey)){statuses["import:"+id]=statuses[oldKey];delete statuses[oldKey]}
  return {...lesson,id};
 }));
 for(const [before,after] of ids){
  if(Object.hasOwn(progress,before)){progress[after]=progress[before];delete progress[before]}
 }
 const plan=snapshot[daily];
 return {...snapshot,"lynn.v2.importedTracks":tracks,"lynn.v2.progress":progress,"lynn.v2.trackStatus":statuses,
  favorites:[...favorites],[daily]:plan?.day?{...plan,due:plan.due.map(id=>ids.get(id)||id),fresh:plan.fresh.map(id=>ids.get(id)||id)}:null};
}
function canonical(value){
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
 return JSON.stringify(value??null);
}
function equal(a,b){return canonical(a)===canonical(b)}
function heads(ops){
 const superseded=new Set(ops.flatMap(op=>op.parents));
 const groups=new Map();
 for(const op of ops){
  if(superseded.has(op.id))continue;
  if(!groups.has(op.key))groups.set(op.key,[]);
  groups.get(op.key).push(op);
 }
 for(const versions of groups.values())versions.sort((a,b)=>a.id.localeCompare(b.id));
 return groups;
}
function alternatives(versions){
 const distinct=new Map();
 for(const v of versions)distinct.set(canonical(v.value),v.value);
 return [...distinct.values()];
}
function selected(key,versions){
 const values=alternatives(versions),[store]=JSON.parse(key);
 if(values.length===1)return values[0];
 if(store==="lynn.unified.words"){
  const word=values.find(v=>v?.deleted)||values.find(v=>v?.archived)||values.find(Boolean);
  return word?{...word,review:false}:null;
 }
 if(store==="favorites")return values.every(Boolean)?true:null;
 // A concurrent daily plan is surfaced as a conflict. Use one stable plan
 // while waiting for a choice so switching devices cannot refill the queue.
 return values[0];
}
function project(groups,today){
 const snapshot=Object.fromEntries(keys.map(key=>[key,key===daily?null:lists[key]||key==="favorites"?[]:Object.create(null)]));
 for(const [key,versions] of groups){
  const [store,id]=JSON.parse(key),value=selected(key,versions);
  if(value===null||!keys.includes(store))continue;
  if(store==="favorites")snapshot[store].push(id);
  else if(lists[store])snapshot[store].push(value);
  else if(store===daily){if(id===today)snapshot[store]=value}
  else snapshot[store][id]=value;
 }
 return snapshot;
}
function differences(before,after){
 return [...new Set([...before.keys(),...after.keys()])].flatMap(key=>{
  // Switching to a new day does not delete a previous day's plan.
  if(JSON.parse(key)[0]===daily&&!after.has(key))return [];
  return equal(before.get(key),after.get(key))?[]:[[key,after.get(key)??null]];
 });
}
root.LynnSync={keys,normalizeCourses,records,heads,alternatives,project,differences,equal};
})(typeof window==="undefined"?globalThis:window);
