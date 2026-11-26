const fs=require("node:fs");
const path=require("node:path");
const {randomUUID}=require("node:crypto");
require("../v2-sync-core.js");

function prepare(firebase,uid){
 const config=globalThis.LynnSync.productionFirebase(firebase);
 if(typeof uid!=="string"||!/^[a-zA-Z0-9_-]{1,128}$/.test(uid))
  throw new Error("请输入 Firebase Authentication Users 表中的正式账户 UID。");
 const rules=fs.readFileSync(path.join(__dirname,"../firestore.rules"),"utf8");
 const predicate="request.auth.uid == uid";
 if(rules.split(predicate).length!==2)throw new Error("Firestore 规则中的 UID 条件已变化，请先审查。");
 return {
  "sync-config.js":"window.LynnSyncConfig = "+JSON.stringify({mode:"production",firebase:config},null,2)+";\n",
  "firestore.rules":rules.replace(predicate,predicate+" && uid == "+JSON.stringify(uid))
 };
}

async function checkCloud(firebase){
 const {projectId,apiKey,authDomain}=globalThis.LynnSync.productionFirebase(firebase);
 const auth=new URL("https://identitytoolkit.googleapis.com/v1/projects");
 auth.searchParams.set("key",apiKey);
 const guest=new URL("https://firestore.googleapis.com");
 guest.pathname=`/v1/projects/${projectId}/databases/(default)/documents/syncUsers/check-${randomUUID()}/changes`;
 const [authResponse,guestResponse]=await Promise.all([
  fetch(auth,{signal:AbortSignal.timeout(15000)}),
  fetch(guest,{signal:AbortSignal.timeout(15000)})
 ]);
 const authConfig=await authResponse.json();
 const denied=await guestResponse.json();
 if(!authResponse.ok||!authConfig.authorizedDomains?.includes(authDomain)
  ||!authConfig.authorizedDomains.includes("lynnwang77.github.io"))
  throw new Error("未能确认 Firebase Web 配置与正式站授权域名。");
 if(guestResponse.status!==403||denied.error?.status!=="PERMISSION_DENIED"
  ||!denied.error.message?.includes("Missing or insufficient permissions"))
  throw new Error("未能确认生产 Firestore 拒绝未登录读取。");
}

async function main(){
  const [configPath,uid,output,option]=process.argv.slice(2);
  if(!configPath||!uid||!output)
   throw new Error("用法：node tools/prepare-sync-production.cjs firebase-web-config.json OWNER_UID NEW_OUTPUT_DIRECTORY [--check-cloud]");
  const firebase=JSON.parse(fs.readFileSync(configPath,"utf8"));
  const artifacts=prepare(firebase,uid);
  if(option==="--check-cloud"){
   await checkCloud(firebase);
   console.log("正式站授权域名已确认；未登录访问被拒绝。账户权限仍需独立确认。");
  }else if(option)throw new Error("未知选项："+option);
  fs.mkdirSync(output,{mode:0o700});
  for(const [filename,content] of Object.entries(artifacts))
   fs.writeFileSync(path.join(output,filename),content,{flag:"wx",mode:0o600});
  console.log("生产配置与规则已生成，等待云端验证和发布批准。");
}

if(require.main===module){
 main().catch(error=>{
  console.error(error.message);
  process.exitCode=1;
 });
}

module.exports={prepare};
