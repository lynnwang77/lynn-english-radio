/* Lynn English Radio 2.0 — browser-only UI; legacy courses and MP3 maps remain untouched. */
(function () {
"use strict";
const Core=window.LynnCore;
const BASE=Array.isArray(window.LYNN_TRACKS)?window.LYNN_TRACKS:[];
const A=window.LYNN_TRACK_AUDIO||{}, SA=window.LYNN_SENTENCE_AUDIO||{};
const $=id=>document.getElementById(id);
const STORAGE={imported:"lynn.v2.importedTracks",progress:"lynn.v2.progress",overrides:"lynn.v2.trackStatus"};
function get(key,fallback){try{let x=localStorage.getItem(key);return x===null?fallback:JSON.parse(x)}catch(e){return fallback}}
function raw(key,fallback){try{return localStorage.getItem(key)||fallback}catch(e){return fallback}}
function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch(e){notice("Browser storage is full/unavailable. Export a backup and check your browser settings.");return false}}
function savePreference(key,value){try{localStorage.setItem(key,value)}catch(e){}}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function validMap(x){return x&&typeof x==="object"&&!Array.isArray(x)?x:{}}
const favRaw=get("favorites",[]);
let favorites=new Set(Array.isArray(favRaw)?favRaw.filter(x=>typeof x==="string"):[]);
const storedTracks=get(STORAGE.imported,[]);
let imported=Array.isArray(storedTracks)?storedTracks:[];
let progress=cleanProgress(get(STORAGE.progress,{}));
let overrides=validMap(get(STORAGE.overrides,{}));
let channel=["work","life"].includes(raw("channel","work"))?raw("channel","work"):"work";
let view="today",selectedTrack="",libraryFilter="current",query="",showZh=raw("zh","on")!=="off";
let revealed=new Set(), currentItems=[], queue=[],queuePos=0,loopQueue=false,playToken=0,playingId="";
const media=$("player");media.preload="metadata";media.setAttribute("playsinline","");
const rate=$("rate");
const savedRate=Number(raw("rate","1.0"));
rate.value=({0.85:"0.85",0.95:"0.95",1:"1.0",1.1:"1.1"})[savedRate]||"1.0";
media.playbackRate=Number(rate.value);
let audioActive=false;
const allTracks=()=>BASE.concat(imported);
function allEntries(){return Core.entries(allTracks(),overrides)}
function notice(msg){$("status").textContent=msg}
function trackStatus(t){return overrides[Core.trackId(t)]||t.status||"current"}
function changeStatus(t,status){
 const next={...overrides,[Core.trackId(t)]:status};
 if(!save(STORAGE.overrides,next))return false;
 overrides=next;return true;
}
function isFav(it){return favorites.has(Core.legacyKey(it.t,it.s))}
function markPlaying(){document.querySelectorAll(".sentence").forEach(x=>x.classList.toggle("playing",x.dataset.id===playingId))}
function navi(){
 document.querySelectorAll("[data-channel]").forEach(b=>{b.classList.toggle("active",b.dataset.channel===channel);b.setAttribute("aria-pressed",String(b.dataset.channel===channel))});
 document.querySelectorAll("[data-view]").forEach(b=>{b.classList.toggle("active",b.dataset.view===view);b.setAttribute("aria-current",b.dataset.view===view?"page":"false")});
}
function itemHtml(it,i,practice){
 const id=it.id,r=progress[id],fav=isFav(it),open=revealed.has(id);
 const origin=esc(it.t.title);
 const head='<div class="meta">'+(practice?(r?"Review due · ":"New · "):"")+origin+(r?" · Next "+esc(r.due):"")+'</div>';
 const body=practice?
  '<div class="prompt"><div class="zh">'+esc(it.s.zh||"Think of the English sentence before revealing it.")+'</div>'+
  (open?'<div class="en">'+esc(it.s.en)+'</div>':'<div class="hidden-answer">Try saying it aloud, then reveal the English.</div>')+'</div>':
  '<div class="en">'+esc(it.s.en)+'</div>'+(showZh?'<div class="zh">'+esc(it.s.zh)+'</div>':"");
 const review=practice&&open?'<div class="row"><button data-action="grade" data-choice="again" data-index="'+i+'" class="again">Again · 重来</button><button data-action="grade" data-choice="hard" data-index="'+i+'">Hard · 还不熟</button><button data-action="grade" data-choice="good" data-index="'+i+'" class="good">Good · 会了</button><button data-action="grade" data-choice="easy" data-index="'+i+'" class="good">Easy · 很熟</button><button data-action="grade" data-choice="mastered" data-index="'+i+'">Mastered ✓</button></div>':"";
 return '<article class="sentence" data-id="'+esc(id)+'">'+head+body+
  '<div class="row">'+(practice&&!open?'<button class="primary" data-action="reveal" data-index="'+i+'">Show English · 查看答案</button>':"")+
  '<button data-action="play-one" data-index="'+i+'">▶ Listen</button>'+
  '<button data-action="loop-one" data-index="'+i+'">↻ Loop</button>'+
  '<button class="'+(fav?"starred":"")+'" data-action="favorite" data-index="'+i+'">'+(fav?"★ Saved":"☆ Favorite")+'</button>'+
  (!practice&&!r&&trackStatus(it.t)==="current"?'<button data-action="grade" data-choice="again" data-index="'+i+'">Start reviewing</button>':"")+
  '</div>'+review+'</article>';
}
function listItems(items,practice){currentItems=items;return items.map((it,i)=>itemHtml(it,i,practice)).join("")}
function statsHtml(){
 const ents=allEntries().filter(e=>e.t.channel===channel&&e.status==="current");
 const p=Core.todayPlan(ents,progress,channel,Core.dayStamp(),8,3,favorites);
 const done=ents.filter(e=>progress[e.id]&&progress[e.id].lastReviewed===Core.dayStamp()).length;
 return '<div class="stats"><div class="stat"><strong>'+p.due.length+'</strong>Due today</div>'+
   '<div class="stat"><strong>'+p.fresh.length+'</strong>New picks</div>'+
   '<div class="stat"><strong>'+done+'</strong>Reviewed today</div></div>';
}
function todayHtml(){
 const plan=Core.todayPlan(allEntries(),progress,channel,Core.dayStamp(),8,3,favorites);
 let html=statsHtml()+'<section class="card"><h2>Today · 10–15 minutes</h2><p class="muted">Say it in English → check the answer and listen → rate your recall to schedule the next review.</p>';
 if(!plan.all.length)return html+'<div class="empty">You are caught up for today. Explore the Library, or come back tomorrow.</div></section>';
 return html+listItems(plan.all,true)+'</section>';
}
function libraryHtml(){
 const tracks=allTracks().filter(t=>t.channel===channel&&trackStatus(t)!=="inbox"&&
  (libraryFilter==="all"||trackStatus(t)===libraryFilter)&&
  (t.title+" "+(t.meta||"")).toLowerCase().includes(query.toLowerCase()));
 if(!tracks.some(t=>Core.trackId(t)===selectedTrack))selectedTrack=tracks.length?Core.trackId(tracks[0]):"";
 let html='<section class="card"><div class="cardhead"><h2>Library</h2><div class="tools"><input class="search" id="search" placeholder="Search lessons" aria-label="Search lessons" value="'+esc(query)+'">'+
  '<select id="libraryFilter" aria-label="Library status"><option value="current" '+(libraryFilter==="current"?"selected":"")+'>Current</option><option value="archive" '+(libraryFilter==="archive"?"selected":"")+'>Archive</option><option value="all" '+(libraryFilter==="all"?"selected":"")+'>All lessons</option></select></div></div>';
 html+='<div class="tracklist">'+tracks.map(t=>'<button class="trackbtn '+(Core.trackId(t)===selectedTrack?"active":"")+'" data-action="track" data-track="'+esc(Core.trackId(t))+'">'+esc(t.title)+'</button>').join("")+'</div>';
 const t=tracks.find(x=>Core.trackId(x)===selectedTrack);
 if(!t){currentItems=[];return html+'<div class="empty">No lessons in this category.</div></section>'}
 const st=trackStatus(t);
 html+='<div class="cardhead"><div><h3>'+esc(t.title)+'</h3><div class="meta">'+esc(t.meta||"")+' · '+t.sentences.length+' sentences · '+st+'</div></div>'+
  '<div class="row"><button class="primary" data-action="play-track">▶ Play All</button><button data-action="loop-track">↻ Loop All</button>'+
  '<button data-action="toggle-archive" data-track="'+esc(Core.trackId(t))+'">'+(st==="archive"?"Restore to Current":"Move to Archive")+'</button></div></div>';
 const es=Core.entries([t],overrides);
 html+=listItems(es,false)+'</section>';return html;
}
function favoritesHtml(){
 const es=allEntries().filter(it=>it.t.channel===channel&&isFav(it));
 return '<section class="card"><div class="cardhead"><h2>★ Favorites</h2><div class="row"><button data-action="play-list">▶ Play All</button><button data-action="loop-list">↻ Loop All</button></div></div>'+
 (es.length?listItems(es,false):'<div class="empty">Star a sentence in Library or Today to save it here.</div>')+'</section>';
}
function masteredHtml(){
 const es=allEntries().filter(it=>it.t.channel===channel&&progress[it.id]?.mastered);
 return '<section class="card"><h2>Mastered ✓</h2><p class="muted">These are strong sentences, not forgotten sentences. They return periodically for maintenance.</p>'+
 (es.length?listItems(es,false):'<div class="empty">Practice sentences several times or mark one Mastered after you can say it independently.</div>')+'</section>';
}
function inboxHtml(){
 const tracks=imported.filter(t=>t.channel===channel&&trackStatus(t)==="inbox");
 let html='<section class="card"><h2>Inbox · New real-life English</h2><p class="muted">Import a JSON file prepared in ChatGPT. New lessons wait here until you add them to the Library. Imported lessons stay on this browser until backed up.</p>';
 if(!tracks.length){currentItems=[];return html+'<div class="empty">Your Inbox is empty. Use Import JSON above to add a real-life scenario.</div></section>'}
 currentItems=[];
 for(const t of tracks){
  const id=Core.trackId(t),es=Core.entries([t],overrides);
  html+='<div class="sentence"><div class="cardhead"><div><h3>'+esc(t.title)+'</h3><div class="meta">'+esc(t.meta)+' · '+es.length+' sentences</div></div><button class="pill" data-action="approve" data-track="'+esc(id)+'">Add to Library</button></div>';
  for(const e of es){let i=currentItems.push(e)-1;html+=itemHtml(e,i,false)}
  html+='</div>';
 }
 return html+'</section>';
}
function render(){
 navi();
 $("zhbtn").textContent="中文 "+(showZh?"On":"Off");
 currentItems=[];
 $("content").innerHTML=view==="today"?todayHtml():view==="library"?libraryHtml():view==="favorites"?favoritesHtml():view==="inbox"?inboxHtml():masteredHtml();
 markPlaying();
}
function setView(v){stop();view=v;revealed.clear();render()}
function setChannel(c){stop();channel=c;savePreference("channel",channel);selectedTrack="";query="";revealed.clear();render()}
function audioSrc(it){
 if(it.t.id)return Core.safeAudio(it.s.audio);
 const n=it.t.sentences.indexOf(it.s)+1;
 return Core.safeAudio((SA[it.t.title]||{})[String(n)]);
}
function session(title,context){
 if(!("mediaSession" in navigator))return;
 try{navigator.mediaSession.metadata=new MediaMetadata({title,artist:"Lynn English Radio",album:context||"English practice"});
 navigator.mediaSession.setActionHandler("play",()=>{if(audioActive)media.play().catch(()=>notice("Tap Play to restart audio."))});
 navigator.mediaSession.setActionHandler("pause",()=>media.pause());
 navigator.mediaSession.setActionHandler("stop",stop);}catch(e){}
}
function stop(){
 playToken++;queue=[];queuePos=0;playingId="";audioActive=false;media.onended=null;media.pause();media.loop=false;
 try{media.currentTime=0}catch(e){}
 if("speechSynthesis" in window)window.speechSynthesis.cancel();
 markPlaying();
}
function finishPlayback(msg){
 audioActive=false;playingId="";markPlaying();notice(msg);
}
function playSource(src,title,context,onEnd,loop){
 if(!src)return false;
 media.pause();media.onended=null;media.loop=!!loop;media.src=src;media.playbackRate=Number(rate.value)||1;
 const token=playToken;
 audioActive=true;session(title,context);media.onended=onEnd;
 media.play().catch(()=>{
  if(token===playToken)finishPlayback("Audio could not start. Tap Play again or check your connection.");
 });
 return true;
}
function speak(en,next){
 if(!("speechSynthesis" in window)){finishPlayback("No recorded audio or browser speech is available.");return}
 const token=playToken;
 const utter=new SpeechSynthesisUtterance(en);utter.lang="en-US";utter.rate=Number(rate.value)||1;
 utter.onend=next;
 utter.onerror=()=>{if(token===playToken)finishPlayback("Browser speech is unavailable or was interrupted.")};
 window.speechSynthesis.speak(utter);
}
function playQueue(items,loop){
 stop();queue=items.slice();loopQueue=loop;queuePos=0;let token=playToken;
 function next(){
  if(token!==playToken||!queue.length)return;
  if(queuePos>=queue.length){if(!loopQueue){finishPlayback("Finished.");return}queuePos=0}
  let it=queue[queuePos++];playingId=it.id;markPlaying();
  notice("Playing · "+it.t.title+" · "+queuePos+"/"+queue.length);
  const src=audioSrc(it);
  if(!playSource(src,it.s.en,it.t.title,next,loopQueue&&queue.length===1))speak(it.s.en,next);
 }
 next();
}
function playTrack(loop){
 const t=allTracks().find(t=>Core.trackId(t)===selectedTrack);if(!t)return;
 const source=Core.safeAudio(t.id?t.trackAudio:A[t.title]);
 if(source){stop();notice((loop?"Looping · ":"Playing · ")+t.title);playSource(source,t.title,t.meta,()=>finishPlayback("Finished."),loop)}
 else playQueue(Core.entries([t],overrides),loop);
}
function exportBackup(){
 const keys=["favorites","channel","view","zh","rate","v8channel","v8zh","v8rate"];
 const legacy={};keys.forEach(k=>{try{legacy[k]=localStorage.getItem(k)}catch(e){legacy[k]=null}});
 legacy.favorites=JSON.stringify([...favorites]);
 const backup={app:"lynn-english-radio",version:2,exportedAt:new Date().toISOString(),legacy,
  v2:{importedTracks:imported,progress,trackStatus:overrides}};
 const blob=new Blob([JSON.stringify(backup)],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="lynn-english-radio-backup-"+Core.dayStamp()+".json";
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 notice("Backup downloaded. Keep the file somewhere safe.");
}
async function importLessons(file){
 if(!file)return;if(file.size>2*1024*1024){notice("File too large (2 MB limit).");return}
 try{const data=JSON.parse(await file.text()),parsed=Core.normalizeImport(data,allTracks());
 if(!parsed.tracks.length){notice("No new lessons: "+parsed.skipped+" already exist.");return}
 if(!save(STORAGE.imported,imported.concat(parsed.tracks)))return;
 imported=imported.concat(parsed.tracks);stop();channel=parsed.tracks[0].channel;savePreference("channel",channel);
 view="inbox";selectedTrack="";query="";revealed.clear();render();
 notice("Imported "+parsed.tracks.length+" lesson(s) into Inbox. Skipped duplicates: "+parsed.skipped+".");
 }catch(e){notice("Import failed: "+e.message)}
}
function cleanProgress(data){
 const result={};
 const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
 if(!data||typeof data!=="object"||Array.isArray(data))return result;
 for(const [k,p] of Object.entries(data)){
  if(["__proto__","constructor","prototype"].includes(k)||!p||typeof p!=="object"||typeof p.due!=="string")continue;
  if(!isReviewDate(p.due))continue;
  const lastReviewed=isReviewDate(p.lastReviewed)?p.lastReviewed:"";
  result[k]={streak:Math.min(count(p.streak),Core.LADDER.length),interval:Math.max(1,count(p.interval)),
   mastered:p.mastered===true,due:p.due,firstReviewed:isReviewDate(p.firstReviewed)?p.firstReviewed:lastReviewed,lastReviewed,reviews:count(p.reviews)};
 }
 return result;
}
function isReviewDate(day){
 return typeof day==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Core.dayStamp(day+"T12:00:00")===day;
}
function saveRestore(values){
 const written=[];
 try{
  for(const [key,value] of Object.entries(values)){
   const previous=localStorage.getItem(key),next=JSON.stringify(value);
   if(previous===next)continue;
   localStorage.setItem(key,next);
   written.push([key,previous]);
  }
  return true;
 }catch(e){
  try{
   for(const [key,previous] of written.reverse()){
    if(previous===null)localStorage.removeItem(key);
    else localStorage.setItem(key,previous);
   }
   notice("Restore could not be saved. Your existing data was kept.");
  }catch(e){notice("Restore and rollback failed. Keep your backup before retrying.")}
  return false;
 }
}
async function restoreBackup(file){
 if(!file)return;if(file.size>32*1024*1024){notice("Backup too large.");return}
 try{
  const data=JSON.parse(await file.text());
  if(!data||data.app!=="lynn-english-radio"||data.version!==2||!data.v2||!Array.isArray(data.v2.importedTracks))
    throw new Error("Not a Lynn English Radio 2.0 backup.");
  const snapshot=Core.normalizeImport({version:1,tracks:data.v2.importedTracks},[],{backup:true}).tracks;
  const parsed=Core.normalizeImport({version:1,tracks:snapshot},allTracks(),{backup:true});
  const incoming=cleanProgress(data.v2.progress),status=validMap(data.v2.trackStatus);
  const mergedTracks=imported.concat(parsed.tracks);
  const sourceTracks=new Map(BASE.concat(snapshot).map(t=>[Core.trackId(t),t]));
  const matchingTracks=BASE.concat(mergedTracks).filter(t=>{
   const source=sourceTracks.get(Core.trackId(t));
   return source?.channel===t.channel&&source.title===t.title;
  });
  const matchingEntries=Core.entries(matchingTracks,{});
  const sourceEntries=new Map(Core.entries(BASE.concat(snapshot),{}).map(it=>[it.id,it.s.en]));
  const mergedProgress={...progress};
  for(const {id,s} of matchingEntries){
   const p=incoming[id],local=mergedProgress[id];
   if(p&&sourceEntries.get(id)===s.en&&(!local||p.lastReviewed>local.lastReviewed||
      (p.lastReviewed===local.lastReviewed&&p.reviews>local.reviews)))mergedProgress[id]=p;
  }
  const mergedStatus={...overrides};
  for(const t of matchingTracks){
   const key=Core.trackId(t),value=status[key];
   if(!Object.hasOwn(overrides,key)&&["current","archive","inbox"].includes(value))mergedStatus[key]=value;
  }
  let storedFav=[];try{storedFav=JSON.parse(data.legacy?.favorites||"[]")}catch(e){}
  const mergedFavorites=new Set(favorites);
  if(Array.isArray(storedFav))for(const f of storedFav)if(typeof f==="string")mergedFavorites.add(f);
  if(!window.confirm("Merge this backup into this browser? Existing lessons and favorites will be kept."))return;
  if(!saveRestore({[STORAGE.imported]:mergedTracks,[STORAGE.progress]:mergedProgress,
    [STORAGE.overrides]:mergedStatus,favorites:[...mergedFavorites]}))return;
  imported=mergedTracks;progress=mergedProgress;overrides=mergedStatus;favorites=mergedFavorites;render();
  notice("Backup merged: "+parsed.tracks.length+" new lessons and compatible review progress restored.");
 }catch(e){notice("Restore failed: "+e.message)}
}
$("nav").addEventListener("click",e=>{
 const b=e.target.closest("button");if(!b)return;
 if(b.dataset.channel)setChannel(b.dataset.channel);
 if(b.dataset.view)setView(b.dataset.view);
});
$("content").addEventListener("click",e=>{
 const b=e.target.closest("button[data-action]");if(!b)return;
 const action=b.dataset.action,i=Number(b.dataset.index),it=currentItems[i];
 if(action==="track"){stop();selectedTrack=b.dataset.track;render();return}
 if(action==="approve"){const t=imported.find(t=>Core.trackId(t)===b.dataset.track);if(t&&changeStatus(t,"current")){stop();view="library";query="";libraryFilter="current";selectedTrack=Core.trackId(t);render();notice("Lesson added to Library and today's review pool.")}return}
 if(action==="toggle-archive"){const t=allTracks().find(t=>Core.trackId(t)===b.dataset.track);if(t&&changeStatus(t,trackStatus(t)==="archive"?"current":"archive")){stop();selectedTrack="";render()}return}
 if(action==="play-track"){playTrack(false);return}
 if(action==="loop-track"){playTrack(true);return}
 if(action==="play-list"){playQueue(currentItems,false);return}
 if(action==="loop-list"){playQueue(currentItems,true);return}
 if(!it)return;
 if(action==="reveal"){revealed.add(it.id);render();return}
 if(action==="favorite"){
  const k=Core.legacyKey(it.t,it.s),stored=get("favorites",[]);
  const next=new Set(Array.isArray(stored)?stored.filter(x=>typeof x==="string"):[]);
  if(next.has(k))next.delete(k);else next.add(k);
  if(save("favorites",[...next])){favorites=next;render()}
  return;
 }
 if(action==="play-one"){playQueue([it],false);return}
 if(action==="loop-one"){playQueue([it],true);return}
 if(action==="grade"){
  const scheduled=Core.grade(progress[it.id],b.dataset.choice,Core.dayStamp());
  const next={...progress,[it.id]:scheduled};
  if(!save(STORAGE.progress,next))return;
  stop();progress=next;revealed.delete(it.id);render();notice("Scheduled next review: "+scheduled.due);
  if(view==="today"){
   const target=$("content").querySelector?.('[data-action="reveal"][data-index="'+Math.min(i,currentItems.length-1)+'"]')||$("content").querySelector?.(".empty");
   if(target){if(!currentItems.length)target.tabIndex=-1;target.focus()}
  }
 }
});
$("importBtn").onclick=()=>$("importFile").click();
$("restoreBtn").onclick=()=>$("restoreFile").click();
$("exportBtn").onclick=exportBackup;
$("importFile").onchange=async e=>{await importLessons(e.target.files[0]);e.target.value=""};
$("restoreFile").onchange=async e=>{await restoreBackup(e.target.files[0]);e.target.value=""};
$("zhbtn").onclick=()=>{showZh=!showZh;savePreference("zh",showZh?"on":"off");render()};
$("stopBtn").onclick=()=>{stop();notice("Stopped.")};
rate.onchange=()=>{savePreference("rate",rate.value);media.playbackRate=Number(rate.value)||1};
$("content").addEventListener("change",e=>{if(e.target.id==="libraryFilter"){libraryFilter=e.target.value;selectedTrack="";render()}});
$("content").addEventListener("input",e=>{if(e.target.id==="search"){let pos=e.target.selectionStart;query=e.target.value;render();let input=$("search");if(input){input.focus();input.setSelectionRange(pos,pos)}}});
window.addEventListener?.("storage",event=>{
 if(event.key===null||event.key==="favorites"){
  const stored=get("favorites",[]);
  favorites=new Set(Array.isArray(stored)?stored.filter(x=>typeof x==="string"):[]);
 }else if(!Object.values(STORAGE).includes(event.key))return;
 const stored=get(STORAGE.imported,[]);
 imported=Array.isArray(stored)?stored:[];
 progress=cleanProgress(get(STORAGE.progress,{}));
 overrides=validMap(get(STORAGE.overrides,{}));
 render();
});
render();notice("Ready.");
})();
