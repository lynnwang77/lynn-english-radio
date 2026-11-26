import {journal} from "./v2-sync-cache.js";
const config=window.LynnSyncConfig;
const core=window.LynnSync;
const app=window.LynnSyncApp;
const byId=id=>document.getElementById(id);
const status=message=>{
 byId("syncStatus").textContent=message;
 byId("syncFooter").textContent=enabled?"私人同步已启用 · "+message:"未启用私人同步 · 学习记录保存在此浏览器。";
};
const key="lynn.sync.test.v1";
const withLock=action=>navigator.locks?navigator.locks.request(key,action):Promise.resolve().then(action);
const readRaw=()=>core.records(app.read(core.keys));
const readLocal=async()=>core.records(await core.normalizeCourses(app.read(core.keys)));
const create=(key,value,parents=[])=>({id:crypto.randomUUID(),key,value,parents});
const login=byId("syncLogin");
const migration=byId("syncMigration");
const conflicts=byId("syncConflicts");
let state, user, remote, preview, scheduled=false, busy=false, requested=false, serverConfirmed=false, enabled=false;
let auth, db, api, authApi, conflictSignature, cursor, lastPoll=0, accountGeneration=0, deleting=false;
const pollInterval=12000;

function load(){
 return JSON.parse(localStorage.getItem(key)||"null");
}
function persist(next){
 localStorage.setItem(key,JSON.stringify(next));
 state=next;
}
function current(){
 return core.heads([...new Map([...remote.values(),...state.pending].map(op=>[op.id,op])).values()]);
}
async function recordLocalEdits(){
 const next=await readLocal();
 const changes=core.differences(new Map(state.baseline),next);
 if(!changes.length)return;
 const pending=changes.map(([key,value])=>create(key,value,state.heads[key]||[]));
 const heads={...state.heads};
 for(const op of pending)heads[op.key]=[op.id];
 persist({...state,baseline:[...next],heads,pending:state.pending.concat(pending)});
}
function conflictList(groups){
 const unresolved=[...groups].filter(([,versions])=>core.alternatives(versions).length>1);
 const signature=JSON.stringify(unresolved.map(([key,versions])=>[key,versions.map(v=>v.id)]));
 if(signature===conflictSignature)return;
 conflictSignature=signature;
 conflicts.replaceChildren();
 for(const [key,versions] of unresolved){
  const box=document.createElement("details");
  const summary=document.createElement("summary");
  summary.textContent="待确认 · "+JSON.parse(key)[1];
  box.append(summary);
  for(const option of versions){
   const value=document.createElement("pre");
   value.textContent=option.value===null?"已移除":JSON.stringify(option.value,null,2);
   const button=document.createElement("button");
   button.textContent="保留此版本";
   button.disabled=!enabled;
   button.onclick=()=>withLock(async()=>{
    try{
     if(!enabled)return;
     state=load();
     await recordLocalEdits();
     const now=current().get(key);
     if(!now||!core.equal(now.map(v=>v.id),versions.map(v=>v.id))){requestSync();return}
     persist({...state,pending:state.pending.concat(create(key,option.value,versions.map(v=>v.id)))});
     requestSync();
    }catch(error){showError(error)}
   }).catch(showError);
   box.append(value,button);
  }
  conflicts.append(box);
 }
}
function showError(error){
 status("同步失败 · 本机数据保留 · "+(error.code||error.message));
}
function requestSync(){
 requested=true;
 if(busy||scheduled)return;
 scheduled=true;
 setTimeout(()=>{scheduled=false;void runSync()},150);
}
async function runSync(){
 try{
  await withLock(reconcile);
 }catch(error){showError(error)}
}
async function pull(uid,generation){
 const guard=await api.getDocFromServer(api.doc(db,"syncUsers",uid));
 if(generation!==accountGeneration)return false;
 if(guard.data()?.purging){
  enabled=false;serverConfirmed=false;
  status("云端账户正在删除或已停用 · 本机记录保留");
  return false;
 }
 const collection=api.collection(db,"syncUsers",uid,"changes");
 const query=cursor?api.query(collection,api.where("committedAt",">=",new api.Timestamp(...cursor))):collection;
 const results=await api.getDocsFromServer(query);
 if(generation!==accountGeneration)return false;
 const before=cursor;
 let received=false;
 for(const doc of results.docs){
  const data=doc.data();
  received ||= !remote.has(data.id);
  remote.set(data.id,{id:data.id,key:data.key,parents:data.parents,value:JSON.parse(data.payload)});
  const stamp=data.committedAt;
  if(stamp&&(!cursor||stamp.seconds>cursor[0]||(stamp.seconds===cursor[0]&&stamp.nanoseconds>cursor[1])))
   cursor=[stamp.seconds,stamp.nanoseconds];
 }
 // Save the cursor and its corresponding record set in one transaction.
 if(received||before!==cursor)await journal(uid,"put",{cursor,ops:[...remote.values()]});
 if(generation!==accountGeneration)return false;
 serverConfirmed=true;lastPoll=Date.now();
 return true;
}
async function reconcile(){
 if(!enabled||busy)return;
 busy=true;requested=false;
 const uid=user.uid,generation=accountGeneration;
 try{
  state=load();
  if(!state||state.uid!==uid){enabled=false;status("这台设备的同步已停用。");return}
  await recordLocalEdits();
  if(!navigator.onLine){status("离线 · 本机已保存 · 待同步 "+state.pending.length+" 项");return}
  if(!serverConfirmed||Date.now()-lastPoll>=pollInterval)
   if(!await pull(uid,generation))return;
  for(const op of [...state.pending]){
   if(!enabled||generation!==accountGeneration)return;
   const ref=api.doc(db,"syncUsers",uid,"changes",op.id);
   await api.runTransaction(db,async transaction=>{
    const existing=await transaction.get(ref);
    if(!existing.exists())transaction.set(ref,{id:op.id,key:op.key,parents:op.parents,payload:JSON.stringify(op.value),committedAt:api.serverTimestamp()});
   });
   if(!enabled||generation!==accountGeneration)return;
   // Keep the acknowledged write visible while its listener event is in flight.
   remote.set(op.id,op);
   persist({...state,pending:state.pending.filter(item=>item.id!==op.id)});
  }
  if(!serverConfirmed)return;
  await recordLocalEdits();
  if(state.pending.length){requestSync();return}
  const groups=current();
  const snapshot=core.project(groups,app.today());
  const next=core.records(snapshot);
  if(core.differences(readRaw(),next).length&&!app.apply(snapshot)){
   status("已收到其他设备的更新 · 完成当前编辑后应用");
   return;
  }
  const latest=await readLocal();
  const updated={...state,baseline:[...latest],heads:Object.fromEntries([...groups].map(([key,versions])=>[key,versions.map(v=>v.id)]))};
  if(!core.equal(updated,state))persist(updated);
  conflictList(groups);
  const count=conflicts.childElementCount;
  status(count?"已同步 · "+count+" 项冲突待确认":"已同步 · 服务器已确认");
 }catch(error){showError(error)}
 finally{busy=false;if(requested)requestSync()}
}
async function prepareMigration(){
 const local=await readLocal();
 const groups=core.heads([...remote.values()]);
 const localOnly=[...local.keys()].filter(key=>!groups.has(key)).length;
 const conflict=[...local].filter(([key,value])=>groups.has(key)&&!core.alternatives(groups.get(key)).some(v=>core.equal(v,value)));
 const cloudOnly=[...groups.keys()].filter(key=>!local.has(key)).length;
 const differences=byId("syncDifferences");
 differences.replaceChildren();
 for(const [key,value] of conflict){
  const detail=document.createElement("details");
  const title=document.createElement("summary");
  const contents=document.createElement("pre");
  title.textContent=JSON.parse(key)[1];
  contents.textContent=JSON.stringify({本机:value,云端:core.alternatives(groups.get(key))},null,2);
  detail.append(title,contents);
  differences.append(detail);
 }
 preview={local,remote:[...remote.keys()].sort()};
 byId("syncPreview").textContent=`仅本机 ${localOnly} 项 · 仅云端 ${cloudOnly} 项 · 同 ID 差异 ${conflict.length} 项。差异将保留两版，等待你选择。`;
 migration.hidden=false;
}
async function confirmMigration(){
 try{
  if(!user?.emailVerified||!preview||!serverConfirmed||!byId("syncBackupConfirmed").checked||!navigator.onLine)return;
  if(load()){status("此浏览器已在另一标签页启用同步。请刷新页面。");return}
  const generation=accountGeneration;
  if(!await pull(user.uid,generation))return;
  const local=await readLocal();
  if(core.differences(preview.local,local).length||!core.equal(preview.remote,[...remote.keys()].sort())){
   byId("syncBackupConfirmed").checked=false;await prepareMigration();status("记录有变化，请重新备份并核对预览。");return;
  }
  const groups=core.heads([...remote.values()]);
  const pending=[...local].flatMap(([key,value])=>
   (groups.get(key)||[]).some(op=>core.equal(value,op.value))?[]:[create(key,value)]);
  persist({uid:user.uid,baseline:[...local],heads:{},pending});
  enabled=true;migration.hidden=true;requestSync();
 }catch(error){showError(error)}
}
async function deleteCloudAccount(){
 const account=auth.currentUser;
 if(!account?.emailVerified||!confirm("永久删除此测试账户及其全部云端学习记录？此设备的本地副本会保留。请先导出备份。"))return;
 const credentialForm=byId("syncDeletePassword");
 const password=credentialForm.value;
 if(!password){credentialForm.reportValidity();return}
 credentialForm.value="";
 deleting=true;
 try{
  await authApi.reauthenticateWithCredential(account,authApi.EmailAuthProvider.credential(account.email,password));
  enabled=false;serverConfirmed=false;accountGeneration++;
  const guard=api.doc(db,"syncUsers",account.uid);
  await api.setDoc(guard,{purging:true});
  const changes=api.collection(guard,"changes");
  while(true){
   const page=await api.getDocsFromServer(api.query(changes,api.limit(10)));
   if(page.empty)break;
   const batch=api.writeBatch(db);
   page.docs.forEach(doc=>batch.delete(doc.ref));
   await batch.commit();
  }
  await journal(account.uid,"delete");
  await authApi.deleteUser(account);
  localStorage.removeItem(key);
  status("云端测试账户已删除 · 本机记录保留");
 }finally{deleting=false}
}
async function start(){
 if(!config){
  login.hidden=true;
  status("尚未连接 Firebase 测试项目 · 仍可在此浏览器试用学习功能");
  return;
 }
 try{
  const sdk="https://www.gstatic.com/firebasejs/12.10.0/";
  const [firebase,authModule,firestore]=await Promise.all([
   import(sdk+"firebase-app.js"),import(sdk+"firebase-auth.js"),import(sdk+"firebase-firestore.js")
  ]);
  authApi=authModule;api=firestore;
  const instance=firebase.initializeApp(config.firebase);
  auth=authApi.getAuth(instance);
  db=api.getFirestore(instance);
  if(config.emulator&&["localhost","127.0.0.1"].includes(location.hostname)){
   authApi.connectAuthEmulator(auth,"http://127.0.0.1:9099");
   api.connectFirestoreEmulator(db,"127.0.0.1",8080);
  }
  await authApi.setPersistence(auth,authApi.browserLocalPersistence);
  authApi.onIdTokenChanged(auth,async account=>{
   if(deleting&&account)return;
   const generation=++accountGeneration;
   user=account;serverConfirmed=false;preview=null;remote=new Map();enabled=false;cursor=null;lastPoll=0;
   migration.hidden=true;byId("syncBackupConfirmed").checked=false;conflicts.replaceChildren();conflictSignature=null;
   login.hidden=!!account;
   byId("syncSession").hidden=!account;
   byId("syncClearLocal").hidden=!!account;
   byId("syncVerify").hidden=!account||account.emailVerified;
   byId("syncDeleteAccount").hidden=!account?.emailVerified;
   try{
    state=load();
    if(!account){status("仅本机保存");return}
    if(state&&state.uid!==account.uid){status("此浏览器已关联另一账户。请先退出并清除这台设备的个人记录。");return}
    if(!account.emailVerified){status("请验证邮箱，再退出并重新登录。");return}
    status("读取云端记录…");
    const cache=await journal(account.uid,"get");
    if(generation!==accountGeneration)return;
    cursor=cache?.cursor||null;
    remote=new Map((cache?.ops||[]).map(op=>[op.id,op]));
    enabled=!!state;
    if(enabled)requestSync();
    else if(await pull(account.uid,generation))await prepareMigration();
   }catch(error){showError(error)}
  });
  login.onsubmit=async event=>{
   event.preventDefault();
   try{
    const form=new FormData(login);
    await authApi.signInWithEmailAndPassword(auth,form.get("email"),form.get("password"));
    login.reset();
   }catch(error){showError(error)}
  };
  byId("syncReset").onclick=async()=>{
   try{
    const email=login.elements.email;
    if(!email.reportValidity())return;
    await authApi.sendPasswordResetEmail(auth,email.value);
    status("如邮箱已注册，请查看密码重置邮件。");
   }catch(error){showError(error)}
  };
  byId("syncVerify").onclick=async()=>{
   try{await authApi.sendEmailVerification(user);status("验证邮件已发送。验证后请重新登录。")}catch(error){showError(error)}
  };
  byId("syncSignout").onclick=async()=>{
   try{await authApi.signOut(auth)}catch(error){showError(error)}
  };
  byId("syncConfirm").onclick=()=>withLock(confirmMigration).catch(showError);
  byId("syncBackup").onclick=()=>app.backup();
  byId("syncArchive").onclick=()=>withLock(async()=>{
   const local=load();
   if(enabled){state=local;await recordLocalEdits();}
   const backupState=enabled?state:local;
   app.backup({version:1,operations:[...remote.values()],pending:backupState?.uid===user?.uid?backupState.pending:[]});
  }).catch(showError);
  byId("syncClearLocal").onclick=()=>withLock(async()=>{
   if(auth.currentUser||!confirm("清除这台设备保存的私人学习记录及草稿？请先下载备份。云端记录会保留。"))return;
   const local=load();
   if(local?.uid)await journal(local.uid,"delete");
   for(const name of [...app.localKeys,key])localStorage.removeItem(name);
   location.reload();
  }).catch(showError);
  byId("syncDeleteAccount").onclick=()=>withLock(deleteCloudAccount).catch(showError);
  setInterval(()=>{
   if(enabled&&!busy&&!document.hidden)requestSync();
  },2500);
  addEventListener("online",()=>{lastPoll=0;requestSync()});
  addEventListener("offline",requestSync);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)requestSync()});
 }catch(error){showError(error)}
}
void start();
