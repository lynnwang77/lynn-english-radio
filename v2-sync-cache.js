function openCache(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open("lynn-sync-test",1);
  request.onupgradeneeded=()=>request.result.createObjectStore("journal");
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}
export async function journal(uid,action,value){
 const db=await openCache();
 try{
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction("journal",action==="get"?"readonly":"readwrite");
   const store=tx.objectStore("journal");
   const request=action==="get"?store.get(uid):action==="put"?store.put(value,uid):store.delete(uid);
   tx.oncomplete=()=>resolve(request.result);
   tx.onabort=tx.onerror=()=>reject(tx.error||request.error);
  });
 }finally{db.close()}
}
