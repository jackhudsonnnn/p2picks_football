#!/usr/bin/env node
/**
 * liveDataFetcher.ts
 * TypeScript/Node adaptation of nfl_data.py to continuously fetch NFL scoreboard and per-game summary
 * JSON files for use by the betPrototype. Designed to write into json-data/ (raw) so that refinement + prototype
 * can consume in near real-time without Python dependency.
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

interface EventStatusType { name?: string; state?: string; completed?: boolean; }
interface EventStatus { type?: EventStatusType; }
interface Event { id: string; date?: string; status?: EventStatus; shortName?: string; competitions?: any[]; }

const BASE_SCOREBOARD_URL = 'http://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const BASE_SUMMARY_URL = 'http://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';
const OUTPUT_DIR = 'json-data';
const UPDATE_INTERVAL_SECONDS = parseInt(process.env.UPDATE_INTERVAL_SECONDS || '90', 10); // a bit faster than python script
const HOURS_BEFORE_GAME_TO_FETCH = parseInt(process.env.HOURS_BEFORE_GAME_TO_FETCH || '4', 10);

function delay(ms:number){ return new Promise(r=>setTimeout(r,ms)); }

function fetchJson(url: string): Promise<any | null> {
  return new Promise(resolve => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, res => {
      if (res.statusCode && res.statusCode >= 400) {
        console.error('HTTP error', res.statusCode, url);
        res.resume();
        return resolve(null);
      }
      let data='';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { console.error('JSON parse error', url, (e as Error).message); resolve(null); }
      });
    });
    req.on('error', err => { console.error('Request error', url, err.message); resolve(null); });
    req.setTimeout(15_000, () => { console.error('Timeout', url); req.destroy(); resolve(null); });
  });
}

function writeJson(name: string, obj: any) {
  const outDir = path.resolve(OUTPUT_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, name);
  try { fs.writeFileSync(outPath, JSON.stringify(obj, null, 2)); } catch(e:any) { console.error('Write error', outPath, e.message); }
}

function gameShouldFetch(event: Event, now: Date): boolean {
  const statusName = event.status?.type?.name;
  if (statusName === 'STATUS_IN_PROGRESS') return true;
  if (statusName === 'STATUS_FINAL') return false;
  if (statusName === 'STATUS_SCHEDULED' && event.date) {
    try {
      const gameTime = new Date(event.date);
      const diffHours = (gameTime.getTime() - now.getTime()) / 3_600_000;
      return diffHours >= 0 && diffHours < HOURS_BEFORE_GAME_TO_FETCH;
    } catch { return false; }
  }
  return false;
}

async function loop() {
  console.log('Live data fetcher starting. Writing to', OUTPUT_DIR);
  while(true) {
    const started = new Date();
    console.log(`\n--- Fetch cycle @ ${started.toISOString()} ---`);
    const scoreboard = await fetchJson(BASE_SCOREBOARD_URL);
    if (scoreboard) {
      writeJson('nfl_data.json', scoreboard);
      const events: Event[] = (scoreboard.events || []).filter((e:any)=>e && e.id);
      const now = new Date();
      const targets = events.filter(e=>gameShouldFetch(e, now));
      if (targets.length === 0) {
        console.log('No target games (live or starting soon).');
      } else {
        for (const e of targets) {
          const url = `${BASE_SUMMARY_URL}?event=${e.id}`;
            const summary = await fetchJson(url);
            if (summary) {
              writeJson(`${e.id}_stats.json`, summary);
              console.log('Saved summary', e.id, e.shortName||'');
            }
            // small stagger to avoid hammering
            await delay(400);
        }
      }
    } else {
      console.log('Scoreboard fetch failed.');
    }
    const elapsed = (Date.now() - started.getTime())/1000;
    const sleepFor = Math.max(5, UPDATE_INTERVAL_SECONDS - elapsed);
    console.log(`Cycle complete in ${elapsed.toFixed(1)}s. Sleeping ${sleepFor.toFixed(1)}s.`);
    await delay(sleepFor*1000);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loop().catch(e=>{ console.error('Fatal loop error', e); process.exit(1); });
}
