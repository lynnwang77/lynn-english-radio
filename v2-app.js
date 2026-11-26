/* Lynn English Radio 2.0 — browser-only UI; legacy courses and MP3 maps remain untouched. */
(function () {
"use strict";
const Core=window.LynnCore;
const BASE=Array.isArray(window.LYNN_TRACKS)?window.LYNN_TRACKS:[];
const CATALOG=Core.normalizeImport({version:1,tracks:window.LYNN_UNIFIED_LESSONS||[]},BASE,{backup:true}).tracks
 .map(t=>({...t,status:"current"}));
const A=window.LYNN_TRACK_AUDIO||{}, SA=window.LYNN_SENTENCE_AUDIO||{};
const $=id=>document.getElementById(id);
const STORAGE={imported:"lynn.v2.importedTracks",progress:"lynn.v2.progress",overrides:"lynn.v2.trackStatus",
 words:"lynn.unified.words",history:"lynn.unified.legacyDays"};
const DAY_KEY="lynn.unified.today";
const WORD_EDIT_KEY="lynn.unified.wordEdit";
const WORD_DRAFT_KEY="lynn.unified.wordDraft";
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
function loadWords(){try{return Core.normalizeWords(get(STORAGE.words,[]))}catch(e){return []}}
let words=loadWords(),history=validMap(get(STORAGE.history,{})),editingWord="";
let wordEdit=validMap(get(WORD_EDIT_KEY,{}));
if(words.some(w=>w.id===wordEdit.id&&!w.deleted))editingWord=wordEdit.id;
let channel=["work","life","bible"].includes(raw("lynn.area",raw("channel","life")))?raw("lynn.area",raw("channel","life")):"life";
let mode="study",view=editingWord?"words":"today",selectedTrack="",libraryFilter="current",query="",topic="",showZh=raw("zh","on")!=="off";
let assignment=get(DAY_KEY,null);
let wordFilter="active";
let revealed=new Set(), currentItems=[], queue=[],queuePos=0,loopQueue=false,playToken=0,playingId="";
const media=$("player");media.preload="metadata";media.setAttribute("playsinline","");
const rate=$("rate");
const savedRate=Number(raw("rate","1.0"));
rate.value=({0.85:"0.85",0.95:"0.95",1:"1.0",1.1:"1.1"})[savedRate]||"1.0";
media.playbackRate=Number(rate.value);
let audioActive=false;
let recognition=null;
function catalogWith(lessons){return CATALOG.filter(t=>!lessons.some(item=>item.id===t.id))}
const allTracks=()=>BASE.concat(catalogWith(imported),imported);
function wordEntry(w){
 const t={id:"personal-"+w.id,channel:"personal",title:"Lynn’s Words"};
 const s={id:"answer",en:w.better||w.first,zh:w.scene||w.note||"Say your own expression from memory."};
 return {t,s,id:"word:"+w.id,status:w.review&&!w.archived&&!w.deleted?"current":"archive",personal:true};
}
function allEntries(){return Core.entries(allTracks(),overrides).concat(words.filter(w=>!w.deleted).map(wordEntry))}
function notice(msg){$("status").textContent=msg}
function trackStatus(t){return overrides[Core.trackId(t)]||t.status||"current"}
function changeStatus(t,status){
 const next={...overrides,[Core.trackId(t)]:status};
 if(!save(STORAGE.overrides,next))return false;
 overrides=next;return true;
}
function isFav(it){return !it.personal&&favorites.has(Core.legacyKey(it.t,it.s))}
function markPlaying(){document.querySelectorAll(".sentence").forEach(x=>x.classList.toggle("playing",x.dataset.id===playingId))}
function navi(){
 document.querySelectorAll("[data-mode]").forEach(b=>{b.classList.toggle("active",b.dataset.mode===mode);b.setAttribute("aria-pressed",String(b.dataset.mode===mode))});
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
 const repeat=practice&&open?'<details class="reading"><summary>Repeat · 跟读</summary><label class="transcript-label">What you said<textarea maxlength="2000" placeholder="Type what you said"></textarea></label><div class="row"><button data-action="transcribe">🎙 Transcribe</button></div></details>':"";
 return '<article class="sentence" data-id="'+esc(id)+'">'+head+body+
  '<div class="row">'+(practice&&!open?'<button class="primary" data-action="reveal" data-index="'+i+'">Show English · 查看答案</button>':"")+
  '<button data-action="play-one" data-index="'+i+'">▶ Listen</button>'+
  '<button data-action="loop-one" data-index="'+i+'">↻ Loop</button>'+
  (!it.personal?'<button class="'+(fav?"starred":"")+'" data-action="favorite" data-index="'+i+'">'+(fav?"★ Saved":"☆ Favorite")+'</button>':"")+
  (!practice&&!r&&trackStatus(it.t)==="current"&&mode==="study"?'<button data-action="grade" data-choice="again" data-index="'+i+'">Start reviewing</button>':"")+
  '</div>'+repeat+review+'</article>';
}
function listItems(items,practice){currentItems=items;return items.map((it,i)=>itemHtml(it,i,practice)).join("")}
function todayHtml(){
 const day=Core.dayStamp(),items=allEntries();
 if(assignment?.day!==day||!Array.isArray(assignment.due)||!Array.isArray(assignment.fresh)){
  assignment=Core.dailyAssignment(items,progress,day,favorites);
  save(DAY_KEY,assignment);
 }
 const active=new Map(items.filter(it=>it.status==="current").map(it=>[it.id,it]));
 const pending=ids=>ids.map(id=>active.get(id)).filter(it=>it&&progress[it.id]?.lastReviewed!==day);
 const due=pending(assignment.due),fresh=pending(assignment.fresh);
 const done=items.filter(it=>progress[it.id]?.lastReviewed===day).length;
 const stats='<div class="stats"><div class="stat"><strong>'+due.length+'</strong>Due today</div><div class="stat"><strong>'+fresh.length+'</strong>New picks</div><div class="stat"><strong>'+done+'</strong>Reviewed today</div></div>';
 let html=stats+'<section class="card"><h2>Today · 15 minutes</h2><p class="muted">Recall the English aloud, check the answer, listen or repeat, then rate your recall.</p>';
 const talk='<section class="card"><h2>Talk · Say it your way</h2><p>Say or write one sentence about something that happened today.</p><div class="row"><button data-action="open-words">Open Lynn’s Words</button></div></section>';
 if(!due.length&&!fresh.length)return html+'<div class="empty">You are caught up for today.</div></section>'+talk;
 return html+listItems(due.concat(fresh),true)+'</section>'+talk;
}
function libraryHtml(){
 const available=allTracks().filter(t=>Core.area(t)===channel&&trackStatus(t)!=="inbox");
 const topics=[...new Set(available.flatMap(t=>t.tags||[]))].sort();
 const tracks=available.filter(t=>
  (libraryFilter==="all"||trackStatus(t)===libraryFilter)&&
  (!topic||(topic==="@scene"?t.type==="scene":t.tags?.includes(topic)))&&
  [t.title,t.meta,...(t.tags||[])].join(" ").toLowerCase().includes(query.toLowerCase()));
 if(!tracks.some(t=>Core.trackId(t)===selectedTrack))selectedTrack=tracks.length?Core.trackId(tracks[0]):"";
 let html='<section class="card"><div class="cardhead"><h2>Library</h2><div class="tools"><input class="search" id="search" placeholder="Search lessons" aria-label="Search lessons" value="'+esc(query)+'">'+
  '<select id="libraryFilter" aria-label="Library status"><option value="current" '+(libraryFilter==="current"?"selected":"")+'>Current</option><option value="archive" '+(libraryFilter==="archive"?"selected":"")+'>Archive</option><option value="all" '+(libraryFilter==="all"?"selected":"")+'>All lessons</option></select></div></div>';
 if(topics.length||channel==="life"){
  const choices=[...(channel==="life"?[["@scene","Real-life scenes"]]:[]),...topics.map(t=>[t,t])];
  html+='<div class="row"><label>Topic <select id="topic"><option value="">All topics</option>'+choices.map(([key,label])=>'<option value="'+esc(key)+'" '+(topic===key?"selected":"")+'>'+esc(label)+'</option>').join("")+'</select></label></div>';
 }
 html+='<div class="tracklist">'+tracks.map(t=>'<button class="trackbtn '+(Core.trackId(t)===selectedTrack?"active":"")+'" data-action="track" data-track="'+esc(Core.trackId(t))+'">'+esc(t.title)+'</button>').join("")+'</div>';
 const t=tracks.find(x=>Core.trackId(x)===selectedTrack);
 if(!t){currentItems=[];return html+'<div class="empty">No lessons in this category.</div></section>'}
 const st=trackStatus(t);
 html+='<div class="cardhead"><div><h3>'+esc(t.title)+'</h3><div class="meta">'+esc(t.meta||"")+' · '+t.sentences.length+' sentences · '+st+'</div></div>'+
  '<div class="row"><button class="primary" data-action="play-track">▶ Play All</button><button data-action="loop-track">↻ Loop All</button>'+
  '<button data-action="toggle-archive" data-track="'+esc(Core.trackId(t))+'">'+(st==="archive"?"Restore to Current":"Move to Archive")+'</button></div></div>';
 const es=Core.entries([t],overrides);
 if(t.context)html+='<p class="muted">'+esc(t.context)+'</p>';
 for(const [label,body] of [["Read",t.reading],["Dialogue",t.dialogue]]){
  if(body)html+='<details class="reading"><summary>'+label+'</summary><p>'+esc(body)+'</p><div class="row"><button data-action="read" data-field="'+(label==="Read"?"reading":"dialogue")+'">▶ Listen</button></div></details>';
 }
 html+=listItems(es,false)+'</section>';return html;
}
function favoritesHtml(){
 const es=allEntries().filter(it=>Core.area(it.t)===channel&&isFav(it));
 return '<section class="card"><div class="cardhead"><h2>★ Favorites</h2><div class="row"><button data-action="play-list">▶ Play All</button><button data-action="loop-list">↻ Loop All</button></div></div>'+
 (es.length?listItems(es,false):'<div class="empty">Star a sentence in Library or Today to save it here.</div>')+'</section>';
}
function masteredHtml(){
 const es=allEntries().filter(it=>(it.personal||Core.area(it.t)===channel)&&progress[it.id]?.mastered&&(!it.personal||it.status==="current"));
 return '<section class="card"><h2>Mastered ✓</h2><p class="muted">These are strong sentences, not forgotten sentences. They return periodically for maintenance.</p>'+
 (es.length?listItems(es,false):'<div class="empty">Practice sentences several times or mark one Mastered after you can say it independently.</div>')+'</section>';
}
function isIOSBrowser(){
 const ua=navigator.userAgent||"";
 return /iPhone|iPad|iPod/i.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);
}
function wordsHtml(){
 const saved=words.find(w=>w.id===editingWord);
 const edit=saved&&wordEdit.id===saved.id?wordEdit:{};
 const word=saved?{...saved,...edit.fields,first:saved.first}:validMap(get(WORD_DRAFT_KEY,{}));
 const waiting=edit.stage==="waiting",filled=edit.stage==="filled";
 const input=(key,label,max=2000)=>'<label>'+label+'<input name="'+key+'" maxlength="'+max+'" value="'+esc(word[key]||"")+'"></label>';
 return '<section class="card" id="wordEditor"><h2>Lynn’s Words</h2><div class="row">'+
  '<button data-action="new-word">＋ New sentence · 练习新句</button><a href="#wordHistory">查看练习历史</a></div>'+
  '<p id="wordSaved" role="status"></p><form id="wordForm" class="word-form">'+
  (saved?'<p class="muted">Your saved first try is kept as originally entered.</p>':isIOSBrowser()?
   '<div class="voice-entry"><button type="button" class="voice-button" data-action="dictate">🎙 用 iPhone 说英语 · 打开键盘</button>'+
   '<div class="voice-status" id="voiceStatus" role="status" aria-live="polite">先点上面按钮，再点 iPhone 键盘上的麦克风 🎙 说英语。文字会进入 My First Try，不必等待网页聆听。</div></div>':
   '<div class="voice-entry"><button type="button" class="voice-button" data-action="transcribe" aria-pressed="false">🎙 Speak My First Try · 点击说英语</button>'+
   '<div class="voice-status" id="voiceStatus" role="status" aria-live="polite">Speaking may use your browser’s speech service. You can also type or use keyboard dictation (Windows: Win + H).</div></div>')+
  '<label>My First Try<textarea name="first" required maxlength="2000" '+(saved?'readonly':'')+' placeholder="Say or type your first English attempt…">'+esc(word.first||"")+'</textarea></label>'+
  '<p id="wordStatus" class="muted" role="status">'+(saved?"原句已保存":word.first?"草稿已保存到本机":"开口说一句，文字会自动保存为草稿。")+'</p>'+
  (!waiting?'<div class="row"><button type="button" class="primary" data-action="coach-open">'+(filled?"再向 ChatGPT 请教":"Improve My English")+'</button></div>':"")+
  '<section id="coachPanel" class="reading" '+(waiting?"":"hidden")+'><h3>从 ChatGPT 带回修改</h3>'+
  '<p>复制请求，在 ChatGPT 粘贴并发送。然后复制完整回复，回到本页粘贴。</p>'+
  '<div class="row"><button type="button" data-action="coach-copy-open">复制请求并打开 ChatGPT ↗</button> <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">打开 ChatGPT</a></div>'+
  '<details id="coachRequest"><summary>查看或删去请求中的私人细节</summary>'+
  '<label>发给 ChatGPT 的请求<textarea id="coachPrompt" rows="5">'+esc(saved?Core.coachPrompt(saved.first,word.scene):"")+'</textarea></label>'+
  '<div class="row"><button type="button" data-action="coach-copy">只复制请求</button></div></details>'+
  '<label id="coachReplyLabel">在这里粘贴 ChatGPT 的完整回复<textarea id="coachReply" rows="3" maxlength="12000" placeholder="粘贴后自动填入三个字段">'+esc(edit.reply||"")+'</textarea></label>'+
  '<p id="coachStatus" role="status" aria-live="polite">'+(waiting?(edit.reply?"已暂存回复。请粘贴 ChatGPT 的完整 JSON 回复。":"原句已保存，可以随时回来。"):"")+'</p></section>'+
  (filled?'<p role="status">三个字段已填入。检查后点「保存修改」。</p>':"")+
  '<details class="reading" id="wordResults" '+(filled||edit.stage==="manual"?"open":"")+'><summary>查看或手动填写修改</summary>'+
  '<label>Better English · 修改后的英文句子<textarea name="better" maxlength="2000">'+esc(word.better||"")+'</textarea></label>'+
  '<label>What changed? · 修改原因<textarea name="note" maxlength="2000" placeholder="例如：用 went 表达过去。">'+esc(word.note||"")+'</textarea></label>'+
  input("scene","Scene · 使用场景")+
  '<label>Date<input type="date" name="date" value="'+esc(word.date||Core.dayStamp())+'"></label></details>'+
  '<div class="row"><button class="primary" type="submit">'+(editingWord?"保存修改 · Save changes":"保存新句 · Save sentence")+'</button>'+
  (editingWord?'<button type="button" data-action="cancel-word">退出编辑</button>':"")+'</div></form></section>'+
  wordHistoryHtml();
}
function wordHistoryHtml(){
 const groups={active:[],archived:[],trash:[]};
 for(const word of words)groups[word.deleted?"trash":word.archived?"archived":"active"].push(word);
 const entries=groups[wordFilter].slice().reverse().sort((a,b)=>b.date.localeCompare(a.date));
 const labels={active:"Active · 练习中",archived:"Archived · 已归档",trash:"Trash · 回收站"};
 return '<section class="card word-history" id="wordHistory"><h2>Saved expressions · 练习历史</h2>'+
  '<p class="muted">按日期从新到旧。同一浏览器可直接回看，换设备请用 Backup / Restore。</p>'+
  '<div class="row" aria-label="练习历史筛选">'+Object.keys(groups).map(key=>
   '<button data-action="filter-words" data-filter="'+key+'" aria-pressed="'+(wordFilter===key)+'">'+labels[key]+' ('+groups[key].length+')</button>').join("")+'</div>'+
  (wordFilter==="archived"?'<p class="muted">归档会暂停 Today 复习。恢复后保留原复习进度，可手动重新加入。Mastered 仍是复习评级。</p>':"")+
  (wordFilter==="trash"?'<p class="muted">删除的句子可从此处恢复到原列表。备份也保留回收站状态。</p>':"")+
  (Object.keys(history).length?'<p class="muted">'+Object.keys(history).length+' days of practice imported from the original Lynn English.</p>':"")+
  (entries.length?entries.map(wordCard).join(""):'<div class="empty">此列表暂时没有练习。</div>')+'</section>';
}
function wordCard(w){
 const button=(action,label)=>'<button data-action="'+action+'" data-word="'+esc(w.id)+'">'+label+'</button>';
 return '<article class="sentence" data-id="word:'+esc(w.id)+'"><div class="meta">'+esc(w.date)+'</div>'+
  '<p><strong>My First Try</strong><br>'+esc(w.first)+'</p>'+
  (w.better?'<p><strong>Better English</strong><br>'+esc(w.better)+'</p>':"")+
  (w.note?'<p><strong>What changed?</strong><br>'+esc(w.note)+'</p>':"")+
  (w.scene?'<p><strong>Scene</strong><br>'+esc(w.scene)+'</p>':"")+
  '<div class="row">'+(w.deleted?button("restore-word","恢复删除的句子"):
   button("listen-word","▶ Listen")+button("edit-word","Edit")+
   (w.archived?button("archive-word","Restore to Active · 恢复练习"):
    button("review-word",w.review?"Remove from review":"Add to review")+button("archive-word","Archive · 归档"))+
   button("delete-word","Delete · 删除"))+'</div></article>';
}
function inboxHtml(){
 const tracks=imported.filter(t=>Core.area(t)===channel&&trackStatus(t)==="inbox");
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
 $("content").innerHTML=view==="today"?todayHtml():view==="library"?libraryHtml():view==="favorites"?favoritesHtml():view==="inbox"?inboxHtml():view==="words"?wordsHtml():masteredHtml();
 markPlaying();
}
function setView(v){stop();view=v;if(v==="today")mode="study";revealed.clear();render()}
function setChannel(c){
 stop();channel=c;savePreference("lynn.area",c);if(c!=="bible")savePreference("channel",c);
 selectedTrack="";query="";topic="";revealed.clear();
 if(view==="today")view="library";
 render();
}
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
 cancelRecognition();
 playToken++;queue=[];queuePos=0;playingId="";audioActive=false;media.onended=null;media.pause();media.loop=false;
 try{media.currentTime=0}catch(e){}
 if("speechSynthesis" in window)window.speechSynthesis.cancel();
 markPlaying();
}
function cancelRecognition(){
 clearSpeechWatchdog();
 if(!recognition)return;
 const active=recognition;
 recognition=null;
 try{active.abort()}catch(e){}
}
let recognitionWatchdog=null;
function clearSpeechWatchdog(){
 if(recognitionWatchdog!==null){clearTimeout(recognitionWatchdog);recognitionWatchdog=null}
}
function voiceFeedback(state,message){
 const status=$("voiceStatus"),button=document.querySelector?.(".voice-button");
 if(status){status.textContent=message;status.dataset.state=state}
 if(button && button.dataset.action==="transcribe"){
  button.textContent=state==="listening"?"■ Stop listening · 结束说话":"🎙 Speak My First Try · 点击说英语";
  button.setAttribute("aria-pressed",String(state==="listening"));
 }
}
function dictateWithKeyboard(field){
 if(!field||field.readOnly)return;
 cancelRecognition();
 field.focus();
 const msg=isIOSBrowser()?
  "iPhone: Tap 🎙 on your keyboard and speak English. Tap Done when finished. This uses iOS Dictation rather than website speech recognition.":
  "Tap your keyboard microphone to speak, or type (Windows: Win + H).";
 voiceFeedback("idle",msg);notice(msg);
}
function speechError(code){
 if(code==="not-allowed")return "Microphone access was blocked. Allow microphone permission in your browser, or use keyboard dictation / typing.";
 if(code==="service-not-allowed")return "This browser's speech service is unavailable. Use your keyboard microphone (Windows: Win + H) or type.";
 if(code==="network")return "The browser could not reach its speech recognition service. Try another browser or use keyboard dictation.";
 if(code==="audio-capture")return "No microphone could be accessed. Check your microphone settings or use keyboard dictation.";
 if(code==="no-speech")return "I did not hear speech. Tap the microphone to try again, or type.";
 if(code==="language-not-supported")return "English recognition is not supported by this browser. Please type your first try.";
 return "Speech recognition could not start or finish. Use your keyboard microphone (Windows: Win + H) or type.";
}
function transcribe(field){
 if(!field||field.readOnly)return;
 if(isIOSBrowser()){dictateWithKeyboard(field);return}
 if(recognition){
  cancelRecognition();
  voiceFeedback("idle","Stopped listening. You can edit the text below or try again.");
  return;
 }
 const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SpeechRecognition){
  const msg="Speech recognition is unavailable in this browser. Try your keyboard's microphone (Windows: Win + H) or type below.";
  voiceFeedback("error",msg);notice(msg);field.focus();return;
 }
 stop();
 let attempt,gotResult=false;
 try{
  attempt=new SpeechRecognition();
  recognition=attempt;
  attempt.lang="en-US";
  attempt.interimResults=false;
  attempt.continuous=false;
  attempt.onstart=()=>{
   if(recognition===attempt)voiceFeedback("listening","🎙 Listening now... Say one English sentence. Tap the button again to stop.");
  };
  attempt.onresult=event=>{
   if(recognition!==attempt||!field.isConnected)return;
   gotResult=true;
   clearSpeechWatchdog();
   field.value=event.results[0][0].transcript.slice(0,2000);
   if(field.name==="first")rememberWordDraft(field.form);
   voiceFeedback("done","Your spoken English is written below. Check it, then save. No audio recording is stored.");
   notice("Transcript ready. Check or edit what the browser heard.");
  };
  attempt.onerror=event=>{
   if(recognition!==attempt)return;
   clearSpeechWatchdog();
   recognition=null;
   const msg=speechError(event?.error);
   voiceFeedback("error",msg);notice(msg);
  };
  attempt.onend=()=>{
   if(recognition!==attempt)return;
   recognition=null;
   clearSpeechWatchdog();
   if($("voiceStatus")?.dataset.state==="listening"){
    voiceFeedback("idle",gotResult?"Transcript captured.":"Listening ended without a transcript. You can try again or type.");
   }
  };
  attempt.start();
  voiceFeedback("listening","🎙 Listening for English... Speak now. If prompted, allow microphone access.");
  notice("Listening for English. Your browser may use its speech service.");
  recognitionWatchdog=setTimeout(()=>{
   if(recognition!==attempt||gotResult)return;
   cancelRecognition();
   const msg="No transcript after 12 seconds. This browser may not support speech recognition. Tap My First Try and use the keyboard microphone or type.";
   voiceFeedback("error",msg);notice(msg);
  },12000);
 }catch(e){
  recognition=null;
  const msg=speechError("start");
  voiceFeedback("error",msg);notice(msg);
 }
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
function exportBackup(_event, syncArchive){
 const keys=["favorites","channel","view","zh","rate","v8channel","v8zh","v8rate"];
 const legacy={};keys.forEach(k=>{try{legacy[k]=localStorage.getItem(k)}catch(e){legacy[k]=null}});
 legacy.favorites=JSON.stringify([...favorites]);
 const backup={app:"lynn-english-radio",version:2,exportedAt:new Date().toISOString(),legacy,
  v2:{importedTracks:imported,progress,trackStatus:overrides},
  unified:{words:loadWords(),history,today:get(DAY_KEY,null)},...(syncArchive?{syncArchive}:{})};
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
 imported=imported.concat(parsed.tracks);stop();channel=Core.area(parsed.tracks[0]);savePreference("lynn.area",channel);
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
function cleanHistory(value){
 return Object.fromEntries(Object.entries(validMap(value)).filter(([key,steps])=>
  isReviewDate(key)&&Array.isArray(steps)).map(([key,steps])=>
  [key,[...new Set(steps.filter(step=>Number.isInteger(step)&&step>=0&&step<5))]]));
}
function restoreOldSite(data){
 if(data.version!==1||!Array.isArray(data.words)||data.words.length>10000)throw new Error("Invalid original Lynn English backup.");
 const incoming=Core.normalizeWords(data.words.map(w=>({
  id:Number.isSafeInteger(w?.id)&&w.id>=0?"site2-"+w.id:"",
  first:w?.phrase,note:w?.note,
  date:Number.isFinite(new Date(w?.id).getTime())?Core.dayStamp(new Date(w.id)):""
 })));
 const mergedWords=Core.mergeWords(loadWords(),incoming);
 const mergedHistory={...history};
 for(const [day,steps] of Object.entries(cleanHistory(data.days)))
  mergedHistory[day]=[...new Set([...(mergedHistory[day]||[]),...steps])];
 if(!window.confirm("Import personal expressions and practice history from the original Lynn English?"))return;
 if(!saveRestore({[STORAGE.words]:mergedWords,[STORAGE.history]:mergedHistory}))return;
 words=mergedWords;history=mergedHistory;setView("words");notice("Original Lynn English data imported. Personal expressions stay on this browser.");
}
async function restoreBackup(file){
 if(!file)return;if(file.size>32*1024*1024){notice("Backup too large.");return}
 try{
  const data=JSON.parse(await file.text());
  if(data?.app==="lynn-english-site2"){restoreOldSite(data);return}
  if(!data||data.app!=="lynn-english-radio"||data.version!==2||!data.v2||!Array.isArray(data.v2.importedTracks))
    throw new Error("Not a Lynn English Radio 2.0 backup.");
  const snapshot=Core.normalizeImport({version:1,tracks:data.v2.importedTracks},[],{backup:true}).tracks;
  const parsed=Core.normalizeImport({version:1,tracks:snapshot},BASE.concat(imported),{backup:true});
  const incoming=cleanProgress(data.v2.progress),status=validMap(data.v2.trackStatus);
  const mergedTracks=imported.concat(parsed.tracks);
  const sourceCatalog=BASE.concat(catalogWith(snapshot),snapshot);
  const sourceTracks=new Map(sourceCatalog.map(t=>[Core.trackId(t),t]));
  const matchingTracks=BASE.concat(catalogWith(mergedTracks),mergedTracks).filter(t=>{
   const source=sourceTracks.get(Core.trackId(t));
   return source?.channel===t.channel&&source.title===t.title;
  });
  const matchingEntries=Core.entries(matchingTracks,{});
  const sourceWords=Core.normalizeWords(data.unified?.words??[]);
  const mergedWords=Core.mergeWords(loadWords(),sourceWords);
  const mergedHistory={...cleanHistory(data.unified?.history),...history};
  const sourceEntries=new Map(Core.entries(sourceCatalog,{}).concat(sourceWords.map(wordEntry)).map(it=>[it.id,it.s.en]));
  matchingEntries.push(...mergedWords.map(wordEntry));
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
  const incomingDay=data.unified?.today;
  const day=Core.dayStamp();
  const validIds=new Set(matchingEntries.map(it=>it.id));
  const dailyFields=["due","fresh"];
  const restoreToday=incomingDay?.day===day&&dailyFields.every(field=>
   Array.isArray(incomingDay[field])&&incomingDay[field].length<=20&&incomingDay[field].every(id=>validIds.has(id)))&&
   !Object.values(progress).some(item=>item.lastReviewed===day);
  if(!window.confirm("Merge this backup into this browser? Existing lessons and favorites will be kept."))return;
  if(!saveRestore({[STORAGE.imported]:mergedTracks,[STORAGE.progress]:mergedProgress,
    [STORAGE.overrides]:mergedStatus,favorites:[...mergedFavorites],[STORAGE.words]:mergedWords,[STORAGE.history]:mergedHistory,
    ...(restoreToday?{[DAY_KEY]:incomingDay}:{})}))return;
  imported=mergedTracks;progress=mergedProgress;overrides=mergedStatus;favorites=mergedFavorites;
  words=mergedWords;history=mergedHistory;if(restoreToday)assignment=incomingDay;render();
  notice("Backup merged: "+parsed.tracks.length+" new lessons and compatible review progress restored.");
 }catch(e){notice("Restore failed: "+e.message)}
}
function wordFields(form){
 return Object.fromEntries(new FormData(form));
}
function persistWordEdit(next){
 wordEdit=next;
 return save(WORD_EDIT_KEY,next);
}
function closeWordEditor(){
 editingWord="";
 persistWordEdit({});
}
function rememberWordDraft(form){
 if(form?.id!=="wordForm")return;
 const fields=wordFields(form);
 if(editingWord){persistWordEdit({...wordEdit,id:editingWord,fields});return}
 if(save(WORD_DRAFT_KEY,fields)){
  const status=$("wordStatus");
  if(status)status.textContent=fields.first.trim()?"草稿已保存到本机":"开口说一句，文字会自动保存为草稿。";
 }
}
function saveWord(form){
 const fields=wordFields(form);
 const latest=loadWords();
 const previous=latest.find(w=>w.id===editingWord);
 if(editingWord&&(!previous||previous.deleted))throw new Error("This expression is no longer available. Reopen Lynn’s Words.");
 const [word]=Core.normalizeWords([{...fields,first:previous?.first??fields.first,
  id:previous?.id||globalThis.crypto.randomUUID(),review:previous?.review,archived:previous?.archived,deleted:previous?.deleted,date:fields.date||Core.dayStamp()}]);
 const next=previous?latest.map(w=>w.id===word.id?word:w):latest.concat(word);
 if(!save(STORAGE.words,next))return null;
 words=next;
 if(!previous){
  try{localStorage.removeItem(WORD_DRAFT_KEY)}catch(e){}
 }
 return word;
}
function changeWordState(word,action){
 const updated={...word};
 if(action==="restore-word"){
  if(!word.deleted)return;
  delete updated.deleted;
 }else{
  if(word.deleted)return;
  if(action==="delete-word"){
   if(!window.confirm("把这条句子移入回收站？它将暂停复习，你仍可从回收站恢复。"))return;
   updated.deleted=true;
   updated.review=false;
  }else if(action==="archive-word"){
   if(word.archived)delete updated.archived;
   else updated.archived=true;
   updated.review=false;
  }else{
   if(word.archived)return;
   updated.review=!word.review;
  }
 }
 const next=loadWords().map(w=>w.id===word.id?updated:w);
 if(!save(STORAGE.words,next))return;
 if(updated.deleted&&editingWord===word.id)closeWordEditor();
 stop();words=next;render();
 notice(action==="review-word"?(updated.review?"Added to the review pool for your next daily plan.":"Removed from review."):
  updated.deleted?"已移入回收站，可随时恢复。":updated.archived?"已保存在归档。":"已恢复到练习中。");
}
function openCoach(form){
 if(!form.elements.first.value.trim()){form.elements.first.focus();notice("Say or type your first try first.");return}
 cancelRecognition();
 const fields=wordFields(form);
 const word=words.find(w=>w.id===editingWord)||saveWord(form);
 if(!word)return;
 editingWord=word.id;
 persistWordEdit({id:word.id,stage:"waiting",fields});
 render();
}
async function copyCoachRequest(openChat=false){
 const field=$("coachPrompt"),status=$("coachStatus");
 try{
  await navigator.clipboard.writeText(field.value);
  status.textContent="请求已复制。到 ChatGPT 粘贴并发送，再回来粘贴完整回复。";
  if(openChat)window.open("https://chatgpt.com/","_blank","noopener,noreferrer");
 }catch(e){
  $("coachRequest").open=true;
  field.focus();field.select();
  status.textContent="请手动复制选中的请求，再点「打开 ChatGPT」。";
 }
}
function applyCoachReply(field){
 const form=field.form;
 const reply=field.value.slice(0,12000);
 let result;
 try{result=Core.coachReply(reply)}catch(e){
  persistWordEdit({...wordEdit,reply});
  $("coachStatus").textContent=reply.trim()?"请粘贴 ChatGPT 的完整 JSON 回复。原句和已有修改已保留。":"在这里粘贴完整回复。";
  return;
 }
 persistWordEdit({id:editingWord,stage:"filled",fields:{...wordFields(form),...result}});
 render();
 $("wordResults").scrollIntoView?.({block:"nearest"});
}
$("nav").addEventListener("click",e=>{
 const b=e.target.closest("button");if(!b)return;
 if(b.dataset.mode){mode=b.dataset.mode;setView(mode==="radio"?"library":"today");return}
 if(b.dataset.channel)setChannel(b.dataset.channel);
 if(b.dataset.view)setView(b.dataset.view);
});
$("content").addEventListener("click",e=>{
 const b=e.target.closest("button[data-action]");if(!b)return;
 const action=b.dataset.action,i=Number(b.dataset.index),it=currentItems[i];
 if(action==="coach-open"){try{openCoach(b.form)}catch(error){notice(error.message)}return}
 if(action==="coach-copy"){void copyCoachRequest();return}
 if(action==="coach-copy-open"){void copyCoachRequest(true);return}
 if(action==="dictate"){dictateWithKeyboard(b.closest("form")?.querySelector('[name="first"]'));return}
 if(action==="transcribe"){transcribe(b.closest("form")?.querySelector('[name="first"]')||b.closest("details")?.querySelector("textarea"));return}
 if(action==="open-words"){setView("words");return}
 if(action==="cancel-word"){if(window.confirm("退出编辑并丢弃尚未保存的修改？原句和已保存版本会保留。")){closeWordEditor();render()}return}
 if(action==="read"){
  const track=allTracks().find(t=>Core.trackId(t)===selectedTrack);
  const field=b.dataset.field;
  if(track&&["reading","dialogue"].includes(field)&&track[field]){stop();speak(track[field],()=>finishPlayback("Finished."))}
  return;
 }
 if(action==="new-word"){
  if(editingWord&&!window.confirm("开始新句？当前未保存的修改将丢弃，已保存的记录会保留。"))return;
  stop();
  if(editingWord){closeWordEditor();render()}
  $("wordForm").querySelector?.('[name="first"]')?.focus();
  return;
 }
 if(action==="filter-words"&&["active","archived","trash"].includes(b.dataset.filter)){
  stop();wordFilter=b.dataset.filter;render();
  $("wordHistory").querySelector?.('[aria-pressed="true"]')?.focus({preventScroll:true});
  return;
 }
 const word=loadWords().find(w=>w.id===b.dataset.word);
 if(word&&["archive-word","delete-word","restore-word","review-word"].includes(action)){
  changeWordState(word,action);
  return;
 }
 if(action==="edit-word"&&word&&!word.deleted){
  if(editingWord&&editingWord!==word.id&&!window.confirm("切换表达并丢弃尚未保存的修改？"))return;
  editingWord=word.id;
  if(wordEdit.id!==word.id)persistWordEdit({id:word.id,stage:"manual"});
  render();$("wordEditor").scrollIntoView?.({block:"start"});return;
 }
 if(action==="listen-word"&&word&&!word.deleted){playQueue([wordEntry(word)],false);return}
 if(action==="track"){stop();selectedTrack=b.dataset.track;render();return}
 if(action==="approve"){const t=imported.find(t=>Core.trackId(t)===b.dataset.track);if(t&&changeStatus(t,"current")){
  stop();view="library";query="";topic="";libraryFilter="current";selectedTrack=Core.trackId(t);
  if(!Object.values(progress).some(p=>p.lastReviewed===Core.dayStamp()))assignment=null;
  render();notice("Lesson added to Library and the review pool.");
 }return}
 if(action==="toggle-archive"){const t=allTracks().find(t=>Core.trackId(t)===b.dataset.track);if(t&&changeStatus(t,trackStatus(t)==="archive"?"current":"archive")){stop();selectedTrack="";render()}return}
 if(action==="play-track"){playTrack(false);return}
 if(action==="loop-track"){playTrack(true);return}
 if(action==="play-list"){playQueue(currentItems,false);return}
 if(action==="loop-list"){playQueue(currentItems,true);return}
 if(!it)return;
 if(action==="reveal"){revealed.add(it.id);render();return}
 if(action==="favorite"&&!it.personal){
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
$("content").addEventListener("submit",event=>{
 if(event.target.id!=="wordForm")return;
 event.preventDefault();
 try{
  if(saveWord(event.target)){
   if(!editingWord)wordFilter="active";
   closeWordEditor();render();
   const message="最终版本已保存 · 共 "+words.filter(w=>!w.deleted).length+" 句";
   $("wordSaved").textContent=message;
   notice(message);
  }
 }catch(e){notice(e.message)}
});
$("importBtn").onclick=()=>$("importFile").click();
$("restoreBtn").onclick=()=>$("restoreFile").click();
$("exportBtn").onclick=exportBackup;
$("importFile").onchange=async e=>{await importLessons(e.target.files[0]);e.target.value=""};
$("restoreFile").onchange=async e=>{await restoreBackup(e.target.files[0]);e.target.value=""};
$("zhbtn").onclick=()=>{showZh=!showZh;savePreference("zh",showZh?"on":"off");render()};
$("stopBtn").onclick=()=>{stop();notice("Stopped.")};
rate.onchange=()=>{savePreference("rate",rate.value);media.playbackRate=Number(rate.value)||1};
$("content").addEventListener("change",e=>{
 if(e.target.id==="libraryFilter"){libraryFilter=e.target.value;selectedTrack="";render()}
 if(e.target.id==="topic"){topic=e.target.value;selectedTrack="";render()}
});
$("content").addEventListener("input",e=>{
 if(e.target.id==="coachReply"&&editingWord){applyCoachReply(e.target);return}
 if(e.target.form?.id==="wordForm"&&e.target.name)rememberWordDraft(e.target.form);
 if(e.target.id==="search"){let pos=e.target.selectionStart;query=e.target.value;render();let input=$("search");if(input){input.focus();input.setSelectionRange(pos,pos)}}
});
window.addEventListener?.("storage",event=>{
 if(event.key===null||event.key==="favorites"){
  const stored=get("favorites",[]);
  favorites=new Set(Array.isArray(stored)?stored.filter(x=>typeof x==="string"):[]);
 }else if(event.key===DAY_KEY){assignment=get(DAY_KEY,null)}
 else if(!Object.values(STORAGE).includes(event.key))return;
 const stored=get(STORAGE.imported,[]);
 imported=Array.isArray(stored)?stored:[];
 progress=cleanProgress(get(STORAGE.progress,{}));
 overrides=validMap(get(STORAGE.overrides,{}));
 words=loadWords();history=cleanHistory(get(STORAGE.history,{}));
 if(editingWord&&!words.some(w=>w.id===editingWord&&!w.deleted))editingWord="";
 render();
});
window.LynnSyncApp={
 read(keys){
  return Object.fromEntries(keys.map(key=>[key,JSON.parse(localStorage.getItem(key))]));
 },
 apply(snapshot){
  // Let an active form finish before rerendering the live content.
  if(document.activeElement?.matches("#content textarea, #content input, #content select"))return false;
  if(!saveRestore(snapshot))throw new Error("Local storage could not be updated.");
  assignment=get(DAY_KEY,null);
  window.dispatchEvent(new StorageEvent("storage",{key:null}));
  return true;
 },
 backup:archive=>exportBackup(null,archive),
 localKeys:[...Object.values(STORAGE),DAY_KEY,WORD_EDIT_KEY,WORD_DRAFT_KEY,"favorites"],
 today:Core.dayStamp
};
render();notice("Ready.");
})();
