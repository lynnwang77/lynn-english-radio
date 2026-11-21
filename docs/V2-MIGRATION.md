# Lynn English Radio 2.0 — Phase 1

**Production:** https://lynnwang77.github.io/lynn-english-radio/ (existing GitHub Pages URL)
**Repository:** lynnwang77/lynn-english-radio

## Inventory and compatibility

The original repository contains 12 lessons (9 in tracks.js plus 3 prepended by accounting.js),
79 sentences, 12 complete-track MP3 files and 79 sentence MP3 files (91 MP3 files total).
Unchanged track-audio.js and sentence-audio.js map to the recordings.
The original v8.html experiment is retained; the old v8.1 homepage is preserved
at index-v8.1.html on the development branch.

### Browser state migration

- Legacy favorites stay under the **original localStorage key: favorites** and use
  the **unchanged legacy phrase key: channel||title||English sentence**.
- Legacy channel, zh and rate preferences are reused.
- Legacy view=current|favorites|archive is **not overwritten**. Version 2 starts
  in Today; Current and Archive are inside Library.
- New separate keys are lynn.v2.progress, lynn.v2.importedTracks and
  lynn.v2.trackStatus.
- No migration deletes, replaces or rewrites legacy favorites or legacy lesson files.
- Browser-only keys exist on a particular browser and site origin. A GitHub branch
  backup CANNOT capture existing favorites in the user's browser. Export a backup
  from that browser before switching devices, clearing browser data or using private mode.

## Minimal architecture

- index.html: lightweight new UI.
- v2-core.js: review dates, lesson IDs and JSON import validation.
- v2-app.js: views, in-browser storage, import/export/restore and playback.
- v2.css: mobile daily-study layout.
- All original tracks.js, accounting.js, MP3 files, manifests, audio maps and
  build workflows remain untouched.

No database, subscription, paid API or new hosting fees.

## Learning flow

1. ChatGPT prepares a small JSON lesson in v1 format (example below).
2. Download the file, then choose Import JSON.
3. New lesson goes into Inbox under its Life or Work channel.
4. Select Add to Library to enable it for Today.
5. Today assigns up to 8 due phrases and 3 new phrases, capped at 10 per day in each channel.
6. Say English aloud from the Chinese prompt, reveal English, listen, then
   grade Again / Hard / Good / Easy / Mastered.
7. Grading schedules calendar-day reviews along 1/3/7/14/30/60/120-day steps.
   Mastered sentences also return for occasional maintenance.
8. Backup downloads a JSON of imported lessons, progress, statuses and legacy
   favorites. Restore merges favorites and keeps the most recent matching review
   record. Existing explicit lesson statuses take precedence over backup statuses.

Ratings are **self-assessed**, not automated pronunciation grading.
Imported lessons remain ONLY in that browser. To make them permanent across devices,
curated imported lessons need a later commit through Work/GitHub.

## ChatGPT import format

Use a UTF-8 JSON file in this format:

    {
      "version": 1,
      "tracks": [{
        "id": "life-post-office-car-title",
        "channel": "life",
        "title": "Mailing a Car Title",
        "meta": "Life · Post Office",
        "sentences": [
          {"id":"s1", "en":"Hi, I need to mail this car title.", "zh":"你好，我需要邮寄这份汽车产权证。"}
        ]
      }]
    }

- Channel is life or work; all everyday life scenes belong to life.
- Keep lesson and sentence IDs stable across imports.
- Up to 100 sentences per lesson and 100 lessons per file (2 MB file limit).
- Optional audio path may point to repository audio/*.mp3 or an HTTPS MP3.
- Original lessons use their original MP3 maps. Imports use their own audio
  fields when present. Other sentences use the browser's built-in
  English voice, whose quality and screen-off behavior vary by device.

Sample import: examples/car-title-mailing.json

## Safety and release checklist

1. Backup branch backup/2026-11-21-before-v2 points at the original main
   commit 5c49e2a5700efeb1a4676a3dac0bdbb67fea7c87.
2. Work only on feature/lynn-english-radio-2 before review, never main.
3. Run node --test tests/*.test.cjs (also executed on the PR).
4. Confirm PR changes no legacy course/audio/map files.
5. Browser test Work/Life, legacy playlist MP3 and single MP3, favorites,
   review due dates, file import and Inbox promotion, Archive/Restore,
   backup/restore and mobile layout.
6. On the same browser that has old favorites, verify favorite preservation
   after release, and immediately export a backup.
7. Only merge the PR to main after tests, manual browser checks and approval.
8. Roll back from original commit/backup branch if needed.

Opening a draft PR does not authorize changing the production website.
