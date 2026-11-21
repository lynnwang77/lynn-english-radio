const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const dir=path.resolve(__dirname,"..");
const code=p=>fs.readFileSync(path.join(dir,p),"utf8");
function boot(preload={}){
  const db={channel:"work",rate:"1.0",zh:"on",...preload};
  const localStorage={
    getItem(k){return Object.hasOwn(db,k)?db[k]:null},
    setItem(k,v){db[k]=String(v)}
  };
  const els={};
  const element=id=>els[id]||(els[id]={
    id,value:id==="rate"?"1.0":"",innerHTML:"",textContent:"",listeners:{},
    addEventListener(type,handler){this.listeners[type]=handler},
    setAttribute(){},click(){},remove(){},appendChild(){},setSelectionRange(){},
    classList:{toggle(){}},pause(){},play(){return Promise.resolve()}
  });
  for(const id of ["player","nav","content","status","rate","importBtn","exportBtn",
    "restoreBtn","importFile","restoreFile","zhbtn","stopBtn"])element(id);
  const document={
    getElementById:element,querySelectorAll(){return []},
    createElement(){return {click(){},remove(){}}},
    body:{appendChild(){}}
  };
  const window={speechSynthesis:{cancel(){},speak(){}},confirm(){return true}};
  const context={window,document,localStorage,navigator:{},setTimeout(){},
    MediaMetadata:class{},SpeechSynthesisUtterance:class{},Blob:class{},
    URL:{createObjectURL(){return "blob:backup"},revokeObjectURL(){}}
  };
  vm.createContext(context);
  for(const name of ["tracks.js","accounting.js","track-audio.js","sentence-audio.js",
    "v2-core.js","v2-app.js"])vm.runInContext(code(name),context,{filename:name});
  return {
    els,db,window,
    nav(dataset){els.nav.listeners.click({target:{closest(){return {dataset}}}})},
    action(dataset){els.content.listeners.click({target:{closest(){return {dataset}}}})},
    async upload(id,body){const el=els[id];el.files=[{size:JSON.stringify(body).length,text:async()=>JSON.stringify(body)}];await el.onchange({target:el})}
  };
}
const oldFav="work||Bank Account Opening||I'd like to open a new business bank account.";
test("the same browser keeps v8 favorites in v2",()=>{
  const ui=boot({favorites:JSON.stringify([oldFav])});
  assert.match(ui.els.content.innerHTML,/Today/);
  ui.nav({view:"favorites"});
  assert.match(ui.els.content.innerHTML,/Bank Account Opening/);
  assert.match(ui.els.content.innerHTML,/★ Saved/);
  assert.deepEqual(JSON.parse(ui.db.favorites),[oldFav]);
});
test("import to Inbox, promote into Today, reveal and rate",async()=>{
  const ui=boot();
  const sample={version:1,tracks:[{id:"car-repair",channel:"life",title:"Auto Repair",
    sentences:[{id:"s1",en:"Could you call the adjuster?",zh:"你能联系理赔员吗？"},
               {id:"s2",en:"When can the repairs start?",zh:"何时可以开工？"}]}]};
  await ui.upload("importFile",sample);
  assert.match(ui.els.content.innerHTML,/Auto Repair/);
  assert.match(ui.els.content.innerHTML,/Add to Library/);
  ui.action({action:"approve",track:"import:car-repair"});
  assert.match(ui.els.content.innerHTML,/Move to Archive/);
  ui.nav({view:"today"});
  assert.match(ui.els.content.innerHTML,/你能联系理赔员吗？/);
  ui.action({action:"reveal",index:"0"});
  assert.match(ui.els.content.innerHTML,/Could you call the adjuster/);
  ui.action({action:"grade",choice:"good",index:"0"});
  assert.ok(JSON.parse(ui.db["lynn.v2.progress"])["import:car-repair:s1"].due);
  ui.nav({view:"library"});
  ui.action({action:"toggle-archive",track:"import:car-repair"});
  assert.equal(JSON.parse(ui.db["lynn.v2.trackStatus"])["import:car-repair"],"archive");
  assert.ok(JSON.parse(ui.db["lynn.v2.importedTracks"]).length===1);
});
test("empty-import backup safely restores review progress and merges favorites",async()=>{
  const ui=boot({favorites:JSON.stringify([oldFav])});
  const key="work||Bank Account Opening||I'd like to open a new business bank account.";
  const backup={app:"lynn-english-radio",version:2,
    legacy:{favorites:JSON.stringify([oldFav])},
    v2:{importedTracks:[],trackStatus:{},progress:{
      [key]:{streak:2,interval:3,due:"2026-11-25",lastReviewed:"2026-11-22",reviews:2}
    }}
  };
  await ui.upload("restoreFile",backup);
  assert.match(ui.els.status.textContent,/Backup merged/);
  assert.equal(JSON.parse(ui.db["lynn.v2.progress"])[key].due,"2026-11-25");
  assert.deepEqual(JSON.parse(ui.db.favorites),[oldFav]);
});
test("imported text is HTML escaped and cannot replace legacy lessons",async()=>{
  const ui=boot();
  await ui.upload("importFile",{version:1,tracks:[{id:"safe",channel:"life",
    title:"Shop <img src=x>",sentences:[{en:"<script>alert(1)</script>",zh:"中文 <b>"}]}]});
  assert.match(ui.els.content.innerHTML,/&lt;script&gt;/);
  assert.doesNotMatch(ui.els.content.innerHTML,/<script>alert/);
  assert.equal(ui.window.LYNN_TRACKS.length,12);
});
