const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const dir=path.resolve(__dirname,"..");
const code=p=>fs.readFileSync(path.join(dir,p),"utf8");
function boot(preload={}, rejectWrite=()=>false, navigatorOverrides={}){
  const db={channel:"work",rate:"1.0",zh:"on",...preload};
  const localStorage={
    getItem(k){return Object.hasOwn(db,k)?db[k]:null},
    setItem(k,v){if(rejectWrite(k))throw new Error("Storage unavailable");db[k]=String(v)},
    removeItem(k){delete db[k]}
  };
  const els={};
  const element=id=>els[id]||(els[id]={
    id,value:id==="rate"?"1.0":"",innerHTML:"",textContent:"",dataset:{},listeners:{},
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
  const context={window,document,localStorage,navigator:{...navigatorOverrides},setTimeout(){},clearTimeout(){},
    FormData:class{constructor(form){return Object.entries(form.fields)}},
    crypto:{randomUUID:()=>"test-attempt"},
    MediaMetadata:class{},SpeechSynthesisUtterance:class{},Blob:class{},
    URL:{createObjectURL(){return "blob:backup"},revokeObjectURL(){}}
  };
  vm.createContext(context);
  for(const name of ["tracks.js","accounting.js","track-audio.js","sentence-audio.js",
    "v2-core.js","unified-content.js","v2-app.js"])vm.runInContext(code(name),context,{filename:name});
  return {
    els,db,window,element,
    nav(dataset){els.nav.listeners.click({target:{closest(){return {dataset}}}})},
    action(dataset){els.content.listeners.click({target:{closest(){return {dataset}}}})},
    async upload(id,body){const el=els[id];el.files=[{size:JSON.stringify(body).length,text:async()=>JSON.stringify(body)}];await el.onchange({target:el})}
  };
}
const oldFav="work||Bank Account Opening||I'd like to open a new business bank account.";
test("the same browser keeps v8 favorites in v2",()=>{
  const ui=boot({favorites:JSON.stringify([oldFav]),rate:".85"});
  assert.match(ui.els.content.innerHTML,/Today/);
  ui.nav({view:"favorites"});
  assert.match(ui.els.content.innerHTML,/Bank Account Opening/);
  assert.match(ui.els.content.innerHTML,/★ Saved/);
  assert.deepEqual(JSON.parse(ui.db.favorites),[oldFav]);
  assert.equal(ui.els.rate.value,"0.85");
  assert.equal(ui.els.player.playbackRate,0.85);
});

test("coach saves the first attempt, fills editable fields and preserves review opt-in",()=>{
  const ui=boot();
  ui.nav({view:"words"});
  const fields={first:"I go library yesterday.",better:"",scene:"",note:"",date:"2026-11-21"};
  const form={id:"wordForm",fields,elements:Object.fromEntries(Object.keys(fields).map(key=>[key,{
    get value(){return fields[key]},set value(value){fields[key]=value},focus(){}
  }]))};
  const click=action=>ui.els.content.listeners.click({target:{closest:()=>({dataset:{action},form})}});
  ui.els.content.listeners.input({target:{form,name:"first"}});
  assert.equal(JSON.parse(ui.db["lynn.unified.wordDraft"]).first,fields.first);
  click("coach-open");
  assert.match(ui.els.content.innerHTML,/I go library yesterday/);
  assert.match(ui.els.content.innerHTML,/name="first"[^>]*readonly/);
  const stored=()=>JSON.parse(ui.db["lynn.unified.words"])[0];
  assert.equal(stored().first,"I go library yesterday.");
  const resumed=boot(ui.db);
  assert.match(resumed.els.content.innerHTML,/<section id="coachPanel" class="reading" >/);
  const paste=value=>ui.els.content.listeners.input({target:{id:"coachReply",form,value}});
  paste('{"better":"incomplete"}');
  assert.match(ui.element("coachStatus").textContent,/完整 JSON/);
  assert.match(boot(ui.db).els.content.innerHTML,/incomplete/);
  paste('{"better":"I went to the library yesterday.","note":"用 went 表达过去。","scene":"Library · 图书馆","first":"overwrite"}');
  const edit=JSON.parse(ui.db["lynn.unified.wordEdit"]);
  assert.equal(edit.stage,"filled");
  assert.equal(edit.fields.better,"I went to the library yesterday.");
  assert.match(boot(ui.db).els.content.innerHTML,/id="wordResults" open/);
  assert.equal(stored().better,"");
  Object.assign(fields,edit.fields,{first:"overwrite"});
  ui.els.content.listeners.submit({target:form,preventDefault(){}});
  assert.equal(stored().first,"I go library yesterday.");
  assert.equal(stored().better,fields.better);
  assert.deepEqual(JSON.parse(ui.db["lynn.unified.wordEdit"]),{});
  assert.match(ui.els.status.textContent,/最终版本已保存/);
  assert.equal(stored().review,false);
});

test("coach accepts fenced JSON and rejects incomplete answers",()=>{
  const core=boot().window.LynnCore;
  assert.equal(core.coachReply('```json\n{"better":"I went.","note":"过去式","scene":"Library"}\n```').note,"过去式");
  assert.throws(()=>core.coachReply('{"better":"I went."}'));
});
test("import to Inbox, promote into Today, reveal and rate",async()=>{
  const ui=boot();
  const sample={version:1,tracks:[{id:"car-repair",channel:"life",title:"Repair Shop Questions",
    sentences:[{id:"s1",en:"Could you call the adjuster?",zh:"你能联系理赔员吗？"},
               {id:"s2",en:"When can the repairs start?",zh:"何时可以开工？"}]}]};
  await ui.upload("importFile",sample);
  assert.match(ui.els.content.innerHTML,/Repair Shop Questions/);
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

test("recorded legacy audio remains the first playback choice",()=>{
  const ui=boot({channel:"work"});
  ui.nav({view:"library"});
  ui.action({action:"play-track"});
  assert.match(ui.els.player.src,/audio\/tracks\/balance-sheet-core-terms\.mp3/);
  ui.action({action:"play-one",index:"0"});
  assert.match(ui.els.player.src,/audio\/sentences\/balance-sheet-core-terms-01\.mp3/);
});
test("new imported phrases without MP3 can fall back to browser speech",async()=>{
  const ui=boot();
  let spoken=0;
  ui.window.speechSynthesis.speak=()=>{spoken++};
  await ui.upload("importFile",{version:1,tracks:[{id:"new-no-audio",channel:"life",
    title:"New Scene",sentences:[{id:"s1",en:"Can you help me?",zh:"能帮我吗？"}]}]});
  ui.action({action:"play-one",index:"0"});
  assert.equal(spoken,1);
});

test("an imported lesson with a legacy title in the other channel uses its own audio",async()=>{
  const ui=boot();
  const lesson={id:"different-balance-sheet",channel:"life",title:"Balance Sheet · Core Terms",
    trackAudio:"audio/tracks/a-quiet-day.mp3",
    sentences:[{en:"Good morning.",zh:"早上好。",audio:"audio/sentences/a-quiet-day-01.mp3"}]};
  await ui.upload("importFile",{version:1,tracks:[lesson]});
  ui.action({action:"loop-one",index:"0"});
  assert.equal(ui.els.player.src,lesson.sentences[0].audio);
  assert.equal(ui.els.player.loop,true);
  ui.action({action:"approve",track:"import:different-balance-sheet"});
  ui.action({action:"play-track"});
  assert.equal(ui.els.player.src,lesson.trackAudio);
});

test("a failed restore rolls back saved changes and a retry recovers many lessons",async()=>{
  let full=true;
  const ui=boot({favorites:JSON.stringify([oldFav])},key=>full&&key==="lynn.v2.trackStatus");
  const lessons=Array.from({length:101},(_,i)=>({id:"life-"+i,channel:"life",title:"Lesson "+i,
    sentences:[{id:"s1",en:"Good morning.",zh:"早上好。"}]}));
  const backup={app:"lynn-english-radio",version:2,legacy:{favorites:JSON.stringify(["life||Lesson 0||Good morning."])},
    v2:{importedTracks:lessons,trackStatus:{"import:life-0":"current"},progress:{
      "import:life-0:s1":{streak:2,interval:3,due:"2026-11-25",lastReviewed:"2026-11-22",reviews:2}
    }}};
  await ui.upload("restoreFile",backup);
  assert.match(ui.els.status.textContent,/existing data was kept/);
  assert.equal(ui.db["lynn.v2.importedTracks"],undefined);
  assert.equal(ui.db["lynn.v2.progress"],undefined);
  assert.deepEqual(JSON.parse(ui.db.favorites),[oldFav]);
  full=false;
  await ui.upload("restoreFile",backup);
  assert.equal(JSON.parse(ui.db["lynn.v2.importedTracks"]).length,101);
  assert.equal(JSON.parse(ui.db["lynn.v2.progress"])["import:life-0:s1"].due,"2026-11-25");
  assert.equal(JSON.parse(ui.db["lynn.v2.trackStatus"])["import:life-0"],"current");
  assert.deepEqual(JSON.parse(ui.db.favorites),[oldFav,"life||Lesson 0||Good morning."]);
});

test("restoring an older backup preserves local progress and active lesson status",async()=>{
  const lesson={id:"local-lesson",channel:"life",title:"Local lesson",status:"inbox",
    sentences:[{id:"s1",en:"Hello.",zh:"你好。"}]};
  const key="import:local-lesson:s1";
  const recent={streak:2,interval:3,due:"2026-11-25",lastReviewed:"2026-11-22",reviews:3};
  const ui=boot({
    "lynn.v2.importedTracks":JSON.stringify([lesson]),
    "lynn.v2.trackStatus":JSON.stringify({"import:local-lesson":"current"}),
    "lynn.v2.progress":JSON.stringify({[key]:recent})
  });
  await ui.upload("restoreFile",{app:"lynn-english-radio",version:2,v2:{
    importedTracks:[lesson],trackStatus:{"import:local-lesson":"archive"},
    progress:{[key]:{...recent,reviews:2,due:"2026-11-23"}}
  }});
  assert.equal(JSON.parse(ui.db["lynn.v2.progress"])[key].due,recent.due);
  assert.equal(JSON.parse(ui.db["lynn.v2.trackStatus"])["import:local-lesson"],"current");
});

test("Bible uses the original favorite key and recorded audio", () => {
  const sample=boot();
  const t=sample.window.LYNN_TRACKS.find(t=>t.title.startsWith("Psalm 23"));
  const key=sample.window.LynnCore.legacyKey(t,t.sentences[0]);
  const ui=boot({favorites:JSON.stringify([key])});
  ui.nav({channel:"bible"});
  ui.nav({view:"favorites"});
  assert.match(ui.els.content.innerHTML,/★ Saved/);
  ui.action({action:"play-one",index:"0"});
  assert.match(ui.els.player.src,/psalm-23-by-still-waters-01\.mp3/);
  assert.equal(ui.db.channel,"work");
});

test("daily queue is shared across areas and never refills after grading",()=>{
  const ui=boot();
  const day=JSON.parse(ui.db["lynn.unified.today"]);
  assert.equal(day.fresh.length,2);
  ui.action({action:"grade",choice:"good",index:"0"});
  ui.nav({channel:"bible"});
  ui.nav({view:"today"});
  assert.equal((ui.els.content.innerHTML.match(/Show English/g)||[]).length,1);
  assert.deepEqual(JSON.parse(ui.db["lynn.unified.today"]),day);
});

test("legacy expression migration is private, idempotent, and starts opted out",async()=>{
  const ui=boot();
  const backup={app:"lynn-english-site2",version:1,words:[{id:1795248000000,phrase:"My first sentence.",note:"At the lake"}],
    days:{"2026-11-20":[0,1,1,7],"not-a-date":[0]}};
  for(let i=0;i<2;i++)await ui.upload("restoreFile",backup);
  const words=JSON.parse(ui.db["lynn.unified.words"]);
  assert.equal(words.length,1);
  assert.equal(words[0].first,"My first sentence.");
  assert.equal(words[0].review,false);
  assert.match(ui.els.content.innerHTML,/My First Try/);
  assert.deepEqual(JSON.parse(ui.db["lynn.unified.legacyDays"]),{"2026-11-20":[0,1]});
  assert.equal(ui.db.favorites,undefined);
});

test("new backups restore personal revisions and review dates",async()=>{
  const ui=boot();
  const expression={id:"word-1",first:"I go library.",better:"I went to the library.",scene:"Library",review:true};
  await ui.upload("restoreFile",{app:"lynn-english-radio",version:2,
    v2:{importedTracks:[],progress:{"word:word-1":{due:"2026-12-01",lastReviewed:"2026-11-22"}}},
    unified:{words:[expression],history:{}}});
  assert.equal(JSON.parse(ui.db["lynn.unified.words"])[0].better,expression.better);
  assert.equal(JSON.parse(ui.db["lynn.v2.progress"])["word:word-1"].due,"2026-12-01");
});

test("old-site export reads only the established words and daily step keys",()=>{
  const source={
    "lynn-english-words":JSON.stringify([{id:1,phrase:"An expression"}]),
    "lynn-english-progress-2026-11-20":"[0,2]",
    "unrelated-application":"ignored"
  };
  let backup;
  const a={click(){},remove(){}};
  vm.runInNewContext(code("tools/export-original-lynn-english.js"),{
    location:{origin:"https://lynn-english.hshsj4dzwb.chatgpt.site"},
    localStorage:{length:3,key:i=>Object.keys(source)[i],getItem:k=>source[k]},
    document:{createElement:()=>a,body:{append(){}}},
    Blob:class{constructor([value]){backup=JSON.parse(value)}},
    URL:{createObjectURL:()=>"blob:fixture",revokeObjectURL(){}},setTimeout(){}
  });
  assert.deepEqual(backup,{app:"lynn-english-site2",version:1,
    words:[{id:1,phrase:"An expression"}],days:{"2026-11-20":[0,2]}});
});

test("one review cap spans Life, Work, and Bible and cuts new work when overdue",()=>{
  const {window}=boot();
  const core=window.LynnCore;
  const items=core.entries(window.LYNN_TRACKS,{});
  const old=items.filter(it=>it.t.channel==="life").slice(0,3).concat(items.slice(0,3));
  const date="2026-11-21";
  const progress=Object.fromEntries(old.map(it=>[it.id,core.grade(null,"good","2026-11-20")]));
  const plan=core.dailyAssignment(items,progress,date,new Set());
  assert.equal(plan.due.length,5);
  assert.equal(plan.fresh.length,1);
  assert.ok(plan.due.some(id=>id.startsWith("life||")));
  assert.ok(plan.due.some(id=>id.startsWith("work||")));
});

test("Lynn's Words uses a clear speak-first button and explains microphone failures",()=>{
 const ui=boot();
 ui.nav({view:"words"});
 const html=ui.els.content.innerHTML;
 assert.match(html,/Speak My First Try/);
 assert.ok(html.indexOf("Speak My First Try")<html.indexOf("My First Try<textarea"));
 let recognizer;
 ui.window.webkitSpeechRecognition=class {
  constructor(){recognizer=this}
  start(){}
  abort(){}
 };
 const field={isConnected:true,value:"",focus(){}};
 const button={dataset:{action:"transcribe"},closest(name){
  if(name==="form")return {querySelector:()=>field};
  return null;
 }};
 ui.els.content.listeners.click({target:{closest:()=>button}});
 assert.match(ui.els.voiceStatus.textContent,/Listening/);
 recognizer.onerror({error:"network"});
 assert.match(ui.els.voiceStatus.textContent,/speech recognition service/);
 assert.match(ui.els.status.textContent,/speech recognition service/);
});

test("iPhone uses keyboard dictation instead of browser speech recognition",()=>{
 const ui=boot({},()=>false,{userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"});
 ui.nav({view:"words"});
 assert.match(ui.els.content.innerHTML,/用 iPhone 说英语/);
 assert.match(ui.els.content.innerHTML,/data-action="dictate"/);
 let speechStarted=false,focused=false;
 ui.window.webkitSpeechRecognition=class {start(){speechStarted=true}};
 const field={focus(){focused=true}};
 const button={dataset:{action:"dictate"},closest(name){
  if(name==="form")return {querySelector:()=>field};
  return null;
 }};
 ui.els.content.listeners.click({target:{closest:()=>button}});
 assert.equal(focused,true);
 assert.equal(speechStarted,false);
 assert.match(ui.els.voiceStatus.textContent,/iOS Dictation/);
 assert.match(ui.els.status.textContent,/iOS Dictation/);
});
