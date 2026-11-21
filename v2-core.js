/* Lynn English Radio 2.0 — dependency-free learning logic */
(function (root) {
  "use strict";
  const LADDER = [1, 3, 7, 14, 30, 60, 120];
  const MAX_TRACKS = 100;
  const MAX_SENTENCES = 100;
  function dayStamp(date) {
    const d = date instanceof Date ? date : new Date(date || Date.now());
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  }
  function addDays(day, days) {
    const d = new Date(day + "T12:00:00");
    if (!Number.isFinite(d.getTime())) throw new Error("Invalid review date");
    d.setDate(d.getDate() + days);
    return dayStamp(d);
  }
  function trackId(t) { return t.id ? "import:" + t.id : t.channel + "||" + t.title; }
  function legacyKey(t, s) { return [t.channel, t.title, s.en].join("||"); }
  function sentenceId(t, s) { return t.id && s.id ? "import:" + t.id + ":" + s.id : legacyKey(t, s); }
  function safeAudio(s) {
    if (typeof s !== "string") return "";
    if (/^audio\/[a-z0-9/_.-]+\.mp3$/i.test(s) && !s.includes("..")) return s;
    if (/^https:\/\/[a-z0-9.-]+\/[^\s"'<>]+\.mp3(\?[^\s"'<>]*)?$/i.test(s)) return s;
    return "";
  }
  function normalizeImport(data, existing) {
    if (!data || data.version !== 1 || !Array.isArray(data.tracks) || !data.tracks.length || data.tracks.length > MAX_TRACKS)
      throw new Error("Expected {version:1, tracks:[...]} with 1–100 lessons.");
    const used = new Set((existing || []).map(t => t.channel + "||" + t.title.toLowerCase()));
    const usedIds = new Set((existing || []).filter(t => t.id).map(t => t.id));
    const tracks = [];
    let skipped = 0;
    for (const raw of data.tracks) {
      if (!raw || !["life", "work"].includes(raw.channel) || typeof raw.title !== "string" ||
          !raw.title.trim() || raw.title.length > 100 || !Array.isArray(raw.sentences) ||
          !raw.sentences.length || raw.sentences.length > MAX_SENTENCES)
        throw new Error("Invalid lesson. Each needs a Life/Work channel, title, and 1–100 sentences.");
      const title = raw.title.trim();
      const duplicate = raw.channel + "||" + title.toLowerCase();
      if (used.has(duplicate) || (raw.id && usedIds.has(raw.id))) { skipped++; continue; }
      const id = (typeof raw.id === "string" && /^[\w.:-]{1,80}$/.test(raw.id)) ?
        raw.id : "lesson-" + simpleHash(raw.channel + "|" + title);
      if (usedIds.has(id)) { skipped++; continue; }
      const sentences = raw.sentences.map((s, i) => {
        if (!s || typeof s.en !== "string" || !s.en.trim() || s.en.length > 500 ||
            typeof s.zh !== "string" || s.zh.length > 500)
          throw new Error("Each sentence needs short English (en) and Chinese (zh) text.");
        return { id: (typeof s.id === "string" && /^[\w.:-]{1,80}$/.test(s.id)) ? s.id : "s" + (i + 1),
          en: s.en.trim(), zh: s.zh.trim(), audio: safeAudio(s.audio) };
      });
      if (new Set(sentences.map(s => s.id)).size !== sentences.length) throw new Error("Duplicate sentence IDs.");
      tracks.push({ id, channel: raw.channel, title, meta: typeof raw.meta === "string" ? raw.meta.slice(0, 160) : "Real-life English · ChatGPT",
        status: "inbox", sentences, trackAudio: safeAudio(raw.trackAudio) });
      used.add(duplicate); usedIds.add(id);
    }
    return {tracks, skipped};
  }
  function simpleHash(value) {
    let h = 2166136261;
    for (const c of value) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  function grade(previous, choice, today) {
    if (!["again", "hard", "good", "easy", "mastered"].includes(choice)) throw new Error("Invalid review grade");
    const p = previous && typeof previous === "object" ? previous : {};
    const streak = Math.max(0, Number(p.streak) || 0);
    let nextStreak = streak, interval = 1, mastered = !!p.mastered;
    if (choice === "again") { nextStreak = 0; interval = 1; mastered = false; }
    if (choice === "hard") { interval = Math.max(1, Math.min(3, Math.floor((Number(p.interval) || 1) / 2))); }
    if (choice === "good") {
      nextStreak++;
      interval = LADDER[Math.min(nextStreak - 1, LADDER.length - 1)];
      if (mastered) interval = Math.max(30, interval);
    }
    if (choice === "easy") {
      nextStreak++;
      interval = Math.max(3, LADDER[Math.min(nextStreak, LADDER.length - 1)]);
      if (mastered) interval = Math.max(60, interval);
    }
    if (choice === "mastered") { nextStreak = Math.max(4, nextStreak); interval = 60; mastered = true; }
    if (nextStreak >= 4 && interval >= 14) mastered = true;
    const stamp = today || dayStamp();
    return { streak: nextStreak, interval, mastered, due: addDays(stamp, interval),
      lastReviewed: stamp, reviews: Math.max(0, Number(p.reviews) || 0) + 1 };
  }
  function entries(tracks, overrides) {
    const result = [];
    for (const t of tracks) {
      const status = (overrides || {})[trackId(t)] || t.status || "current";
      for (const s of t.sentences || []) result.push({t, s, id: sentenceId(t, s), status});
    }
    return result;
  }
  function todayPlan(items, progress, channel, today, maxDue = 8, maxNew = 3) {
    const pool = items.filter(it => it.t.channel === channel && it.status === "current");
    const due = pool.filter(it => progress[it.id] && progress[it.id].due <= today)
      .sort((a, b) => progress[a.id].due.localeCompare(progress[b.id].due)).slice(0, maxDue);
    const fresh = pool.filter(it => !progress[it.id]).slice(0, Math.min(maxNew, Math.max(0, 10 - due.length)));
    return {due, fresh, all: due.concat(fresh)};
  }
  root.LynnCore = {LADDER, dayStamp, addDays, trackId, legacyKey, sentenceId, safeAudio, normalizeImport, grade, entries, todayPlan};
})(typeof window === "undefined" ? globalThis : window);
