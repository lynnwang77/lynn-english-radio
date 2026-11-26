const config=window.LynnSyncConfig;
const core=window.LynnSync;
const app=window.LynnSyncApp;
const byId=id=>document.getElementById(id);
const status=(message)=>{byId("syncStatus").textContent=message};
const key="lynn.sync.test.v1";
const withLock=action=>navigator.locks?navigator.locks.request(key,action):Promise.resolve().then(action);
const readLocal=()=>core.records(app.read(core.keys));
const create=(key,value,parents=[])=>({id:crypto.randomUUID(),key,value,parents});
const login=byId("syncLogin");
const migration=byId("syncMigration");
const conflicts=byId("syncConflicts");
let state, user, remote, unsubscribe, preview, scheduled=false, busy=false, requested=false, serverConfirmed=false, enabled=false;
let auth, db, api, authApi, conflictSignature;

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
function recordLocalEdits(){
 const next=readLocal();
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
   button.onclick=()=>withLock(()=>{
    try{
     if(!enabled)return;
     state=load();
     recordLocalEdits();
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
async function reconcile(){
 if(!enabled||busy)return;
 busy=true;requested=false;
 const uid=user.uid;
 try{
  state=load();
  recordLocalEdits();
  if(!navigator.onLine){status("离线 · 本机已保存 · 待同步 "+state.pending.length+" 项");return}
  for(const op of [...state.pending]){
   if(!enabled||user?.uid!==uid)return;
   const ref=api.doc(db,"syncUsers",uid,"changes",op.id);
   await api.runTransaction(db,async transaction=>{
    const existing=await transaction.get(ref);
    if(!existing.exists())transaction.set(ref,{id:op.id,key:op.key,parents:op.parents,payload:JSON.stringify(op.value)});
   });
   if(!enabled||user?.uid!==uid)return;
   // Keep the acknowledged write visible while its listener event is in flight.
   remote.set(op.id,op);
   persist({...state,pending:state.pending.filter(item=>item.id!==op.id)});
  }
  if(!serverConfirmed)return;
  recordLocalEdits();
  if(state.pending.length){requestSync();return}
  const groups=current();
  const snapshot=core.project(groups,app.today());
  const next=core.records(snapshot);
  if(core.differences(readLocal(),next).length&&!app.apply(snapshot)){
   status("已收到其他设备的更新 · 完成当前编辑后应用");
   return;
  }
  const latest=readLocal();
  const updated={...state,baseline:[...latest],heads:Object.fromEntries([...groups].map(([key,versions])=>[key,versions.map(v=>v.id)]))};
  if(!core.equal(updated,state))persist(updated);
  conflictList(groups);
  const count=conflicts.childElementCount;
  status(count?"已同步 · "+count+" 项冲突待确认":"已同步 · 服务器已确认");
 }catch(error){showError(error)}
 finally{busy=false;if(requested)requestSync()}
}
function prepareMigration(){
 const local=readLocal();
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
function confirmMigration(){
 try{
  if(!user?.emailVerified||!preview||!serverConfirmed||!byId("syncBackupConfirmed").checked||!navigator.onLine)return;
  if(load()){status("此浏览器已在另一标签页启用同步。请刷新页面。");return}
  const local=readLocal();
  if(core.differences(preview.local,local).length||!core.equal(preview.remote,[...remote.keys()].sort())){
   byId("syncBackupConfirmed").checked=false;prepareMigration();status("记录有变化，请重新备份并核对预览。");return;
  }
  const groups=core.heads([...remote.values()]);
  const pending=[...local].flatMap(([key,value])=>
   (groups.get(key)||[]).some(op=>core.equal(value,op.value))?[]:[create(key,value)]);
  persist({uid:user.uid,baseline:[...local],heads:{},pending});
  enabled=true;migration.hidden=true;requestSync();
 }catch(error){showError(error)}
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
  authApi.onIdTokenChanged(auth,account=>{
   unsubscribe?.();unsubscribe=null;
   user=account;serverConfirmed=false;preview=null;remote=new Map();enabled=false;
   migration.hidden=true;byId("syncBackupConfirmed").checked=false;conflicts.replaceChildren();conflictSignature=null;
   login.hidden=!!account;
   byId("syncSession").hidden=!account;
   byId("syncVerify").hidden=!account||account.emailVerified;
   try{
    state=load();
    if(!account){status("仅本机保存");return}
    if(state&&state.uid!==account.uid){status("此浏览器已关联另一账户。请在独立浏览器配置文件中测试。");return}
    if(!account.emailVerified){status("请验证邮箱，再退出并重新登录。");return}
    status("读取云端记录…");
    enabled=!!state;
    // The current local snapshot is compared with the durable previous baseline
    // before applying any incoming changes, including immediately after a reload.
    if(enabled)requestSync();
    unsubscribe=api.onSnapshot(api.collection(db,"syncUsers",account.uid,"changes"),{includeMetadataChanges:true},result=>{
     try{
      if(result.metadata.fromCache)return;
      serverConfirmed=true;
      for(const doc of result.docs){
       const data=doc.data();
       remote.set(data.id,{id:data.id,key:data.key,parents:data.parents,value:JSON.parse(data.payload)});
      }
      if(!enabled){if(!preview)prepareMigration()}
      else requestSync();
     }catch(error){showError(error)}
    },error=>{serverConfirmed=false;showError(error)});
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
  byId("syncBackup").onclick=app.backup;
  setInterval(()=>{
   if(enabled&&!busy)requestSync();
  },2500);
  addEventListener("online",requestSync);
  addEventListener("offline",requestSync);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)requestSync()});
 }catch(error){showError(error)}
}
void start();
