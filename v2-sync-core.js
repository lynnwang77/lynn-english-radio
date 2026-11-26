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
root.LynnSync={keys,records,heads,alternatives,project,differences,equal};
})(typeof window==="undefined"?globalThis:window);
