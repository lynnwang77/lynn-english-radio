const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
function read(name) { return fs.readFileSync(path.join(root, name), "utf8"); }
function setup() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  for (const name of ["tracks.js", "accounting.js", "track-audio.js", "sentence-audio.js", "v2-core.js"])
    vm.runInContext(read(name), ctx, { filename: name });
  return { data: ctx.window.LYNN_TRACKS, trackAudio: ctx.window.LYNN_TRACK_AUDIO,
    sentenceAudio: ctx.window.LYNN_SENTENCE_AUDIO, core: ctx.window.LynnCore };
}
test("all legacy lessons and 91 MP3s remain addressable", () => {
  const {data, trackAudio, sentenceAudio}=setup();
  assert.equal(data.length,12);
  assert.equal(data.reduce((n,t)=>n+t.sentences.length,0),79);
  let tracks=0,sentences=0;
  for(const t of data){
    assert.ok(["life","work"].includes(t.channel));
    assert.ok(trackAudio[t.title],t.title+" has track MP3");
    assert.ok(fs.existsSync(path.join(root,trackAudio[t.title])));
    tracks++;
    for(let i=0;i<t.sentences.length;i++){
      const name=sentenceAudio[t.title]?.[String(i+1)];
      assert.ok(name,t.title+" sentence "+(i+1)+" has MP3");
      assert.ok(fs.existsSync(path.join(root,name)),name);
      sentences++;
    }
  }
  assert.equal(tracks,12);assert.equal(sentences,79);
  const all=[];
  for(const dir of ["audio/tracks","audio/sentences"]){
    for(const entry of fs.readdirSync(path.join(root,dir)))if(entry.endsWith(".mp3"))all.push(entry);
  }
  assert.equal(all.length,91);
});
test("legacy favorite key does not change",()=>{
  const {data,core}=setup();
  const t=data.find(x=>x.title==="Bank Account Opening");
  assert.equal(core.legacyKey(t,t.sentences[0]),
    "work||Bank Account Opening||I'd like to open a new business bank account.");
});
test("reviews return over increasing intervals and maintain mastered cards",()=>{
  const {core}=setup();
  let p;
  const today="2026-11-21";
  const due=["2026-11-22","2026-11-24","2026-11-28","2026-12-05"];
  for(let i=0;i<4;i++){
    p=core.grade(p,"good",today);
    assert.equal(p.due,due[i]);
  }
  assert.equal(p.mastered,true);
  p=core.grade(p,"easy",today);
  assert.ok(p.interval>=30);
  p=core.grade(p,"again",today);
  assert.equal(p.mastered,false);
  assert.equal(p.due,"2026-11-22");
  assert.equal(p.streak,0);
});
test("today plan includes due and a few new phrases, skips archived and inbox",()=>{
  const {data,core}=setup();
  const items=core.entries(data,{});
  const id=items[0].id;
  let progress={};progress[id]=core.grade(null,"again","2026-11-20");
  const today=core.todayPlan(items,progress,"work","2026-11-21");
  assert.equal(today.due[0].id,id);
  assert.equal(today.fresh.length,3);
  assert.ok(today.all.every(x=>x.t.channel==="work"));
  const archived=core.entries(data,{[core.trackId(items[0].t)]:"archive"});
  assert.ok(!core.todayPlan(archived,progress,"work","2026-11-21").all.some(x=>x.id===id));
  const inbox=core.entries(data,{[core.trackId(items[0].t)]:"inbox"});
  assert.ok(!core.todayPlan(inbox,progress,"work","2026-11-21").all.some(x=>x.id===id));
});
test("JSON import preserves stable IDs, queues in Inbox and deduplicates",()=>{
  const {data,core}=setup();
  const template=JSON.parse(read("examples/car-title-mailing.json"));
  const first=core.normalizeImport(template,data);
  assert.equal(first.tracks.length,1);
  assert.equal(first.tracks[0].status,"inbox");
  assert.equal(first.tracks[0].sentences.length,5);
  assert.equal(core.sentenceId(first.tracks[0],first.tracks[0].sentences[0]),
    "import:life-post-office-car-title:s1");
  const second=core.normalizeImport(template,data.concat(first.tracks));
  assert.equal(second.tracks.length,0);
  assert.equal(second.skipped,1);
  assert.throws(()=>core.normalizeImport({version:1,tracks:[{title:"X",channel:"other",sentences:[{en:"Hi",zh:"你好"}]}]},data));
});
test("unsafe audio URLs are not accepted from imported lessons",()=>{
  const {core}=setup();
  assert.equal(core.safeAudio("javascript:alert(1)"),"");
  assert.equal(core.safeAudio("audio/../../evil.mp3"),"");
  assert.equal(core.safeAudio("audio/sentences/bank-transfer-01.mp3"),"audio/sentences/bank-transfer-01.mp3");
});
test("2.0 scripts parse, load in order and original player is saved",()=>{
  assert.doesNotThrow(()=>new vm.Script(read("v2-app.js"),{filename:"v2-app.js"}));
  const html=read("index.html");
  assert.ok(html.indexOf('src="tracks.js"')<html.indexOf('src="accounting.js"'));
  assert.ok(html.indexOf('src="accounting.js"')<html.indexOf('src="v2-app.js"'));
  assert.ok(html.includes('src="v2-core.js"'));
  assert.ok(read("index-v8.1.html").includes("Current"));
  assert.ok(fs.existsSync(path.join(root,"v8.html")));
});

test("today keeps a real daily limit instead of infinitely refilling",()=>{
  const {data,core}=setup();
  const pool=core.entries(data,{}).filter(it=>it.t.channel==="life");
  const p={};
  const date="2026-11-21";
  const first=core.todayPlan(pool,p,"life",date);
  assert.equal(first.fresh.length,3);
  first.fresh.forEach(it=>p[it.id]=core.grade(null,"good",date));
  const second=core.todayPlan(pool,p,"life",date);
  assert.equal(second.fresh.length,0);
  const next=core.todayPlan(pool,p,"life","2026-11-22");
  assert.ok(next.due.length>=3);
  assert.ok(next.fresh.length>=1);
});

test("finishing due cards does not add an eleventh sentence to Today",()=>{
  const {data,core}=setup();
  const items=core.entries(data,{}).filter(it=>it.t.channel==="work");
  const progress={};
  for(const {id} of items.slice(0,8))progress[id]=core.grade(null,"good","2026-11-20");
  const today="2026-11-21";
  const plan=()=>core.todayPlan(items,progress,"work",today);
  assert.equal(plan().all.length,10);
  while(plan().due.length){
    const {id}=plan().due[0];
    progress[id]=core.grade(progress[id],"good",today);
  }
  assert.equal(plan().fresh.length,2);
});
test("existing favorite cards are prioritized among old unstarted lessons",()=>{
  const {data,core}=setup();
  const items=core.entries(data,{});
  const fav=items.find(it=>it.t.title==="Bank Account Opening"&&it.s.en.startsWith("He said"));
  const result=core.todayPlan(items,{},"work","2026-11-21",8,3,new Set([core.legacyKey(fav.t,fav.s)]));
  assert.equal(result.fresh[0].id,fav.id);
});

test("a Hard review removes premature Mastered status",()=>{
  const {core}=setup();
  let p=core.grade(null,"mastered","2026-11-21");
  assert.equal(p.mastered,true);
  p=core.grade(p,"hard","2026-11-22");
  assert.equal(p.mastered,false);
  assert.ok(p.interval<=3);
});
