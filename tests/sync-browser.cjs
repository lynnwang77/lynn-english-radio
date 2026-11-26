const assert=require("node:assert/strict");
const {chromium,devices}=require("playwright");
const {execFile}=require("node:child_process");
const {promisify}=require("node:util");
const {readFile}=require("node:fs/promises");
const run=promisify(execFile);
const base="http://127.0.0.1:8769/";
const verified="lynn-test@example.invalid";
const pass="SamplePassword123";
const localWord=(id,first)=>({id,first,better:first,note:"Practice",scene:"Library",date:"2026-11-26"});
const wordStore="lynn.unified.words";
async function chooseDialog(page,selector,accept){
 const handled=new Promise((resolve,reject)=>page.once("dialog",dialog=>
  (accept?dialog.accept():dialog.dismiss()).then(resolve,reject)));
 await page.locator(selector).click();
 await handled;
}
async function seedAuth(){
 return fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-lynn-sync/accounts",{method:"POST",
  headers:{"Content-Type":"application/json",Authorization:"Bearer owner"},
  body:JSON.stringify({email:verified,password:pass,emailVerified:true})}).then(async r=>{const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data.localId});
}
(async()=>{
 const uid=await seedAuth();
 const config=process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:["--no-sandbox"]}:{};
 const browser=await chromium.launch(config);
 try{
  const devicesToTest=[{},devices["iPhone 15"]];
  const pages=[];
  const cloudCount=async()=>fetch("http://127.0.0.1:8080/v1/projects/demo-lynn-sync/databases/(default)/documents/syncUsers/"+uid+":runQuery",{method:"POST",
   headers:{"Content-Type":"application/json",Authorization:"Bearer owner"},
   body:JSON.stringify({structuredQuery:{from:[{collectionId:"changes",allDescendants:true}]}})}).then(r=>r.json()).then(rows=>rows.filter(row=>row.document).length);
  for(const [i,options] of devicesToTest.entries()){
   const context=await browser.newContext(options);
   await context.route("https://www.gstatic.com/firebasejs/**",async route=>{
    const {stdout}=await run("curl",["-fsS",route.request().url()],{encoding:"buffer",maxBuffer:8*1024*1024});
    await route.fulfill({body:stdout,contentType:"application/javascript",headers:{"access-control-allow-origin":"*"}});
   });
   await context.route(base+"sync-config.js",route=>route.fulfill({contentType:"application/javascript",body:
    'window.LynnSyncConfig={firebase:{apiKey:"demo-key",projectId:"demo-lynn-sync"},emulator:true};'}));
   const page=await context.newPage();
   pages.push(page);
   page.on("requestfailed",req=>console.error("Request failed",new URL(req.url()).origin,req.failure()?.errorText));
   page.on("pageerror",error=>console.error(error.message));
   await page.goto(base);
   await page.evaluate(([key,words])=>localStorage.setItem(key,JSON.stringify(words)),[wordStore,
    [localWord("shared",i?"Desktop alternate.":"Phone alternate."),localWord("only-"+i,"Only device "+i)]]);
   await page.locator("#syncPanel > summary").click();
   await page.waitForFunction(()=>!document.querySelector("#syncLogin").hidden,{},{timeout:20000}).catch(async error=>{console.error(await page.locator("#syncStatus").innerText());throw error});
   await page.locator("#syncLogin input[name=email]").fill(verified);
   await page.locator("#syncLogin input[name=password]").fill(pass);
   await page.locator("#syncLogin button[type=submit],#syncLogin button:not([type])").click();
   await page.locator("#syncMigration").waitFor({timeout:20000}).catch(async error=>{console.error(await page.locator("#syncStatus").innerText());throw error});
   const before=await cloudCount();
   assert.equal(before,i?3:0);
   const backup=page.waitForEvent("download");
   await page.locator("#syncBackup").click();
   assert.equal(JSON.parse(await readFile(await (await backup).path(),"utf8")).unified.words.length,2);
   await page.locator("#syncBackupConfirmed").check();
   await page.locator("#syncConfirm").click();
   await page.locator("#syncStatus").filter({hasText:"已同步"}).waitFor({timeout:30000});
  }
  const [a,b]=pages;
  for(const p of pages){
   await p.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).length===3,wordStore);
   await p.locator("#syncConflicts summary").first().click();
   const versions=await p.locator("#syncConflicts pre").allTextContents();
   assert.ok(versions.some(v=>v.includes("Desktop alternate.")));
   assert.ok(versions.some(v=>v.includes("Phone alternate.")));
  }
  await a.locator("#syncConflicts button").first().click();
  await b.waitForFunction(()=>!document.querySelector("#syncConflicts summary"));
  await b.context().setOffline(true);
  await b.evaluate(key=>{
   const words=JSON.parse(localStorage.getItem(key));
   words.find(word=>word.id==="only-0").archived=true;
   localStorage.setItem(key,JSON.stringify(words));
  },wordStore);
  await b.locator("#syncStatus").filter({hasText:"待同步"}).waitFor();
  assert.ok(!(await a.evaluate(key=>JSON.parse(localStorage.getItem(key)).find(word=>word.id==="only-0").archived,wordStore)));
  await b.context().setOffline(false);
  await a.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).find(word=>word.id==="only-0")?.archived,wordStore);
  const tab=await a.context().newPage();
  await tab.goto(base);
  await tab.locator("#syncPanel > summary").click();
  await tab.locator("#syncStatus").filter({hasText:"服务器已确认"}).waitFor({timeout:30000});
  await tab.close();
  const exported=a.waitForEvent("download");
  await a.locator("#syncArchive").click();
  const archive=JSON.parse(await readFile(await (await exported).path(),"utf8")).syncArchive;
  assert.ok(archive.operations.some(op=>op.value?.first==="Desktop alternate."));
  assert.ok(archive.operations.some(op=>op.value?.first==="Phone alternate."));
  await b.locator("#syncSignout").click();
  await b.locator("#syncClearLocal").waitFor();
  await chooseDialog(b,"#syncClearLocal",false);
  assert.ok(await b.evaluate(key=>localStorage.getItem(key),wordStore));
  await chooseDialog(b,"#syncClearLocal",true);
  await b.waitForFunction(key=>localStorage.getItem(key)===null,wordStore);
  assert.ok(await cloudCount());
  await a.getByText("删除云端账户",{exact:true}).click();
  await a.locator("#syncDeletePassword").fill("IncorrectPassword");
  await chooseDialog(a,"#syncDeleteAccount",true);
  await a.locator("#syncStatus").filter({hasText:"同步失败"}).waitFor();
  assert.ok(await cloudCount());
  await a.locator("#syncDeletePassword").fill(pass);
  await chooseDialog(a,"#syncDeleteAccount",true);
  await a.locator("#syncStatus").filter({hasText:"云端测试账户已删除"}).waitFor({timeout:30000});
  assert.equal(await cloudCount(),0);
  assert.ok(await a.evaluate(key=>localStorage.getItem(key),wordStore));
  console.log("Firebase emulator browser test: login, pre-confirmation isolation, backup, two-device merge, conflicts, offline retry, second tab, export, local clearing and cloud account deletion passed");
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
