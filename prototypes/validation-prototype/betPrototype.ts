#!/usr/bin/env node
/**
 * Enhanced Bet Validation Prototype CLI
 * Adds implementations for future modes (developer simulation only).
 */
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import readline from 'readline';
import { validateGameData, extractPlayerStats } from './boxscoreValidator.js';
import http from 'http';
import https from 'https';
import { refineFromPath } from './refineData.js';

/* ------------------ Live Fetch Config ------------------ */
const BASE_SCOREBOARD_URL = 'http://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const BASE_SUMMARY_URL = 'http://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';
const RAW_DIR = 'json-data';
const REFINED_DIR = 'refined-json-data';
const UPDATE_INTERVAL_SECONDS = 90; // scoreboard + summaries
const CLEAN_INTERVAL_SECONDS = 60 * 15; // run cleanup every 15 min
const DATA_TTL_MS = 60 * 60 * 1000; // 1 hour retention
const HOURS_BEFORE_GAME_TO_FETCH = 4;

function ensureDirs(){ [RAW_DIR, REFINED_DIR].forEach(d=>{ try { mkdirSync(d,{recursive:true}); } catch{} }); }
ensureDirs();

function fetchJson(url: string): Promise<any|null>{ return new Promise(res=>{ const lib = url.startsWith('https')? https: http; const req = lib.get(url,r=>{ if(r.statusCode && r.statusCode>=400){ r.resume(); return res(null);} let data=''; r.on('data',c=>data+=c); r.on('end',()=>{ try{ res(JSON.parse(data)); }catch{ res(null);} }); }); req.on('error',()=>res(null)); req.setTimeout(15000,()=>{ req.destroy(); res(null); }); }); }
function writeRaw(name: string, obj:any){ const full=resolve(RAW_DIR,name); try { writeFileSync(full, JSON.stringify(obj,null,2)); } catch{} }
function writeRefinedFromRaw(rawPath: string){ try { const refined = refineFromPath(rawPath); const base = rawPath.split('/').pop()!; const outName = base.replace(/\.json$/, '.refined.json'); writeFileSync(resolve(REFINED_DIR,outName), JSON.stringify(refined,null,2)); } catch(e) { /* swallow for prototype */ } }
function shouldFetch(event:any, now:Date){ const status = event.status?.type?.name; if(status==='STATUS_IN_PROGRESS') return true; if(status==='STATUS_FINAL') return false; if(status==='STATUS_SCHEDULED' && event.date){ try { const gt=new Date(event.date); const diffH=(gt.getTime()-now.getTime())/3600000; return diffH>=0 && diffH < HOURS_BEFORE_GAME_TO_FETCH; } catch { return false; } } return false; }
async function liveCycle(){ const scoreboard = await fetchJson(BASE_SCOREBOARD_URL); const now=new Date(); if(scoreboard){ writeRaw('nfl_data.json',scoreboard); const events = (scoreboard.events||[]).filter((e:any)=>e?.id); for(const ev of events.filter((e:any)=>shouldFetch(e, now))){ const summary= await fetchJson(`${BASE_SUMMARY_URL}?event=${ev.id}`); if(summary){ const fname = `${ev.id}_stats.json`; writeRaw(fname, summary); writeRefinedFromRaw(resolve(RAW_DIR,fname)); } } }
  cleanupOld(); }
function cleanupOld(){ const now=Date.now(); [RAW_DIR, REFINED_DIR].forEach(dir=>{ if(!existsSync(dir)) return; readdirSync(dir).forEach(f=>{ const full=resolve(dir,f); try { const age = now - statSync(full).mtimeMs; if(age>DATA_TTL_MS) unlinkSync(full); } catch{} }); }); }
setInterval(liveCycle, UPDATE_INTERVAL_SECONDS*1000).unref();
setInterval(cleanupOld, CLEAN_INTERVAL_SECONDS*1000).unref();
// kick off immediately
liveCycle();

/* ------------------ Modes & Core Bet Structures ------------------ */
type Mode = 'BEST_OF_THE_BEST' | 'ONE_LEG_SPREAD' | 'SCORCERER' | 'HORSE_RACE' | 'CHOOSE_THEIR_FATE' | 'SACK_STACK' | 'TWO_MINUTE_DRILL';

interface BaseBet { id: string; mode: Mode; createdAt: Date; status: 'PENDING' | 'RESOLVED' | 'WASHED'; notes?: string; }

// Existing modes
interface BestOfBestBet extends BaseBet { mode: 'BEST_OF_THE_BEST'; playerAId: string; playerBId: string; stat: StatKey; settleQuarter: 1|2|3|4; baseline: Record<string, number>; winner?: string; }
interface OneLegSpreadBet extends BaseBet { mode: 'ONE_LEG_SPREAD'; baselineScore: { home: number; away: number }; winnerBucket?: string; }

// New modes
type ScorcererPick = 'TD' | 'FG' | 'SAFETY' | 'NO_MORE_SCORES';
interface ScorcererBet extends BaseBet { mode: 'SCORCERER'; pick: ScorcererPick; baselineTotal: number; lastObservedTotal: number; resolvedType?: ScorcererPick; }

interface HorseRaceBet extends BaseBet { mode: 'HORSE_RACE'; resolveQuarter: 1|2|3|4; leaderAtResolve?: string; }

type FateOutcome = 'TD' | 'FG' | 'TURNOVER';
interface ChooseFateBet extends BaseBet { mode: 'CHOOSE_THEIR_FATE'; predicted: FateOutcome; actual?: FateOutcome; awaitingManual: boolean; }

interface SackStackBet extends BaseBet { mode: 'SACK_STACK'; baselineSacks: number; predictedBucket: '0-1' | '2-4' | '5+'; finalBucket?: string; }

interface TwoMinuteDrillBet extends BaseBet { mode: 'TWO_MINUTE_DRILL'; scope: 'FIRST_HALF' | 'GAME'; prediction: 'SCORE' | 'NO_SCORE'; thresholdStarted: boolean; thresholdStartScore?: number; result?: 'SCORE' | 'NO_SCORE'; }

type AnyBet = BestOfBestBet | OneLegSpreadBet | ScorcererBet | HorseRaceBet | ChooseFateBet | SackStackBet | TwoMinuteDrillBet;

/* ------------------ Stat + Snapshot Models ------------------ */
type StatKey = 'receptions' | 'receivingYards' | 'receivingTouchdowns' | 'rushingYards' | 'rushingTouchdowns';

interface DataSources { boxscoreFile: string; scoreboardFile?: string; }
interface GameSnapshot {
  quarter?: number; clock?: string; isFinal: boolean;
  homeAbbr?: string; awayAbbr?: string; homeScore?: number; awayScore?: number;
  playerStats: ReturnType<typeof extractPlayerStats>;
  combinedSacks?: number; totalScore?: number;
}

function parseNumberSafe(v: any): number | undefined { if (v == null) return undefined; const n = parseInt(String(v), 10); return Number.isNaN(n) ? undefined : n; }

function loadBoxscore(boxscorePath: string): Partial<GameSnapshot> {
  // If a refined file version exists, use that
  const refinedPath = boxscorePath.includes(REFINED_DIR)
    ? boxscorePath
    : boxscorePath.replace(/json-data/, REFINED_DIR).replace(/\.json$/, '.refined.json');
  if (existsSync(refinedPath)) {
    try {
      const refined = JSON.parse(readFileSync(refinedPath, 'utf-8'));
      const playerStats = (refined.players || []).map((p: any) => ({
        playerId: p.id,
        name: p.name,
        team: p.team,
        receptions: p.receptions,
        receivingYards: p.receivingYards,
        receivingTouchdowns: p.receivingTouchdowns,
        rushingYards: p.rushingYards,
        rushingTouchdowns: p.rushingTouchdowns
      }));
      return { playerStats, isFinal: !!refined.game?.isFinal, combinedSacks: refined.aggregates?.combinedSacks };
    } catch {}
  }
  const raw = JSON.parse(readFileSync(boxscorePath, 'utf-8'));
  const validation = validateGameData(raw);
  if (!validation.isValid || !validation.data) {
    console.warn('Warning: boxscore validation failed for', boxscorePath, 'errors=', validation.errors);
    return { playerStats: [], isFinal: false };
  }
  const playerStats = validation.players ?? [];
  let combinedSacks = 0;
  try {
    const playerTeams = validation.data.boxscore.players;
    playerTeams.forEach(team => {
      team.statistics.forEach((cat: any) => {
        if (cat.name === 'defensive') {
          const sackIndex = cat.labels.findIndex((l: string) => l.toUpperCase() === 'SACKS');
          if (sackIndex >= 0) {
            cat.athletes.forEach((ath: any) => {
              const rawS = ath.stats[sackIndex];
              const val = parseFloat(rawS);
              if (!Number.isNaN(val)) combinedSacks += val;
            });
          }
        }
      });
    });
  } catch {}
  return { playerStats, isFinal: false, combinedSacks };
}

function loadScoreboard(scoreboardPath: string | undefined, eventId?: string): Partial<GameSnapshot> {
  if (!scoreboardPath) return {}; try {
    const raw = JSON.parse(readFileSync(scoreboardPath, 'utf-8'));
    const event = eventId ? raw.events?.find((e: any) => e.id === eventId) : raw.events?.[0]; if (!event) return {};
    const comp = event.competitions?.[0]; const status = comp?.status || event.status; const period = status?.period; const clock = status?.displayClock; const type = status?.type?.state || status?.type?.name; const competitors = comp?.competitors || [];
    const home = competitors.find((c: any) => c.homeAway === 'home'); const away = competitors.find((c: any) => c.homeAway === 'away');
    const ps: Partial<GameSnapshot> = { quarter: period, clock, isFinal: ['post','final','complete'].includes((type||'').toLowerCase()) };
    if (home) { ps.homeAbbr = home.team?.abbreviation; ps.homeScore = parseNumberSafe(home.score) ?? 0; }
    if (away) { ps.awayAbbr = away.team?.abbreviation; ps.awayScore = parseNumberSafe(away.score) ?? 0; }
    if (ps.homeScore != null && ps.awayScore != null) ps.totalScore = ps.homeScore + ps.awayScore;
    return ps;
  } catch { return {}; }
}

function currentSnapshot(src: DataSources, eventId?: string): GameSnapshot { const box = loadBoxscore(src.boxscoreFile); const score = loadScoreboard(src.scoreboardFile, eventId); return { ...box, ...score } as GameSnapshot; }

/* ------------------ Evaluation Helpers ------------------ */
function evalBestOfBest(bet: BestOfBestBet, snap: GameSnapshot): BestOfBestBet {
  if (bet.status !== 'PENDING') return bet; if (!snap.quarter) return bet; if (snap.quarter < bet.settleQuarter) return bet; // wait
  const get = (pid: string) => snap.playerStats.find(p => p.playerId === pid)?.[bet.stat] ?? 0;
  const dA = get(bet.playerAId) - (bet.baseline[bet.playerAId] ?? 0); const dB = get(bet.playerBId) - (bet.baseline[bet.playerBId] ?? 0);
  if (dA === dB) return { ...bet, status: 'WASHED', notes: `Tie Δ=${dA}` }; return { ...bet, status: 'RESOLVED', winner: dA > dB ? bet.playerAId : bet.playerBId, notes: `ΔA=${dA} ΔB=${dB}` };
}
function evalOneLegSpread(bet: OneLegSpreadBet, snap: GameSnapshot): OneLegSpreadBet { if (bet.status !== 'PENDING') return bet; if (!snap.isFinal || snap.homeScore==null || snap.awayScore==null) return bet; const spread = Math.abs(snap.homeScore - snap.awayScore); const bucket = spread<=3?'0-3':spread<=10?'4-10':spread<=25?'11-25':'26+'; return { ...bet, status: 'RESOLVED', winnerBucket: bucket, notes: `Spread=${spread}` }; }
function classifyScoreDelta(delta: number): ScorcererPick | undefined { if (delta===3) return 'FG'; if (delta===2) return 'SAFETY'; if (delta===7||delta===6||delta===8) return 'TD'; return undefined; }
function evalScorcerer(bet: ScorcererBet, snap: GameSnapshot): ScorcererBet {
  if (bet.status !== 'PENDING') return bet; if (snap.totalScore == null) return bet; if (snap.totalScore !== bet.lastObservedTotal) { const delta = snap.totalScore - bet.lastObservedTotal; const typ = classifyScoreDelta(delta); const resolvedType = typ ?? 'TD'; return { ...bet, status: 'RESOLVED', resolvedType, notes: `ΔScore=${delta}` }; } if (snap.isFinal) { return { ...bet, status: 'RESOLVED', resolvedType: 'NO_MORE_SCORES', notes: 'Game Final' }; } return bet; }
function evalHorseRace(bet: HorseRaceBet, snap: GameSnapshot): HorseRaceBet { if (bet.status!=='PENDING') return bet; if (!snap.quarter) return bet; if (snap.quarter < bet.resolveQuarter) return bet; if (snap.homeScore==null||snap.awayScore==null) return bet; if (snap.homeScore===snap.awayScore) { return { ...bet, status: snap.isFinal? 'WASHED':'PENDING', notes: 'Tied' }; } const leader = snap.homeScore>snap.awayScore? snap.homeAbbr : snap.awayAbbr; const resolved: HorseRaceBet = { ...bet, status: 'RESOLVED', notes: `Score ${snap.awayScore}-${snap.homeScore}` }; if (leader) (resolved as any).leaderAtResolve = leader; return resolved; }
function evalSackStack(bet: SackStackBet, snap: GameSnapshot): SackStackBet { if (bet.status!=='PENDING') return bet; if (!snap.isFinal) return bet; const net = (snap.combinedSacks ?? 0) - bet.baselineSacks; const bucket = net<=1?'0-1': net<=4?'2-4':'5+'; return { ...bet, status: 'RESOLVED', finalBucket: bucket, notes: `NetSacks=${net}` }; }
function evalTwoMinute(bet: TwoMinuteDrillBet, snap: GameSnapshot, prevSnap?: GameSnapshot): TwoMinuteDrillBet { if (bet.status!=='PENDING') return bet; const targetQuarter = bet.scope==='FIRST_HALF'?2:4; if (snap.quarter == null) return bet; const clockStr = snap.clock || '15:00'; const parseClock = (c: string) => { const [m,s]=c.split(':'); return (parseInt(m||'0')*60)+(parseInt(s||'0')); }; const secs = parseClock(clockStr); if (!bet.thresholdStarted && snap.quarter===targetQuarter && secs<=120) { return { ...bet, thresholdStarted:true, thresholdStartScore: snap.totalScore ?? 0 }; } if (bet.thresholdStarted) { if (snap.quarter>targetQuarter || (snap.isFinal && snap.quarter===targetQuarter)) { const diff = (snap.totalScore??0) - (bet.thresholdStartScore??0); const result = diff>0? 'SCORE':'NO_SCORE'; return { ...bet, status:'RESOLVED', result, notes:`ΔScoreLate=${diff}` }; } } return bet; }
function evalChooseFate(bet: ChooseFateBet): ChooseFateBet { if (bet.status!=='PENDING') return bet; if (bet.actual) { return { ...bet, status:'RESOLVED', notes:`Outcome=${bet.actual}` }; } return bet; }

function evaluateBet(b: AnyBet, snap: GameSnapshot, prev?: GameSnapshot): AnyBet { switch (b.mode){ case 'BEST_OF_THE_BEST': return evalBestOfBest(b as BestOfBestBet,snap); case 'ONE_LEG_SPREAD': return evalOneLegSpread(b as OneLegSpreadBet,snap); case 'SCORCERER': return evalScorcerer(b as ScorcererBet,snap); case 'HORSE_RACE': return evalHorseRace(b as HorseRaceBet,snap); case 'SACK_STACK': return evalSackStack(b as SackStackBet,snap); case 'TWO_MINUTE_DRILL': return evalTwoMinute(b as TwoMinuteDrillBet,snap,prev); case 'CHOOSE_THEIR_FATE': return evalChooseFate(b as ChooseFateBet); default: return b; } }

/* ------------------ CLI Helper Core ------------------ */
const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); const question = (q:string)=>new Promise<string>(r=>rl.question(q,r));
async function chooseMode(): Promise<Mode>{ const modes:Mode[]=['BEST_OF_THE_BEST','ONE_LEG_SPREAD','SCORCERER','HORSE_RACE','CHOOSE_THEIR_FATE','SACK_STACK','TWO_MINUTE_DRILL']; console.log('\nSelect Mode:'); modes.forEach((m,i)=>console.log(`${i+1}. ${m}`)); while(true){ const a=await question('Mode #> '); const idx=parseInt(a,10)-1; if(modes[idx]) return modes[idx]; console.log('Invalid'); } }
const statOptions: StatKey[]=['receptions','receivingYards','receivingTouchdowns','rushingYards','rushingTouchdowns'];

/* ------------------ Bet Creation ------------------ */
async function createBestOfBest(s: GameSnapshot): Promise<BestOfBestBet>{ const players=s.playerStats; console.log(`\nPlayers (${players.length}) showing first 50:`); players.slice(0,50).forEach(p=>console.log(`${p.playerId} | ${p.name} (${p.team}) rec:${p.receptions??0} rYds:${p.rushingYards??0}`)); const a=await question('Player A ID> '); const b=await question('Player B ID> '); if(a===b) throw new Error('Distinct players required'); statOptions.forEach((st,i)=>console.log(`${i+1}. ${st}`)); let stat:StatKey = 'receptions'; while(true){ const ans=await question('Stat #> '); const idx=parseInt(ans,10)-1; if(statOptions[idx]) { stat=statOptions[idx]; break; } console.log('Invalid'); } let settle:1|2|3|4=4; const qAns=await question('Settle after quarter (1-4 default 4)> '); if(['1','2','3','4'].includes(qAns)) settle=parseInt(qAns,10) as any; const get=(pid:string)=>{ const p=players.find(pp=>pp.playerId===pid); return (p as any)?.[stat] ?? 0; }; return { id:`bet_${Date.now()}`, mode:'BEST_OF_THE_BEST', createdAt:new Date(), status:'PENDING', playerAId:a, playerBId:b, stat, settleQuarter:settle, baseline:{ [a]:get(a), [b]:get(b) } }; }
async function createOneLegSpread(s: GameSnapshot): Promise<OneLegSpreadBet>{ return { id:`bet_${Date.now()}`, mode:'ONE_LEG_SPREAD', createdAt:new Date(), status:'PENDING', baselineScore:{ home:s.homeScore??0, away:s.awayScore??0 } }; }
async function createScorcerer(s: GameSnapshot): Promise<ScorcererBet>{ const picks:ScorcererPick[]=['TD','FG','SAFETY','NO_MORE_SCORES']; picks.forEach((p,i)=>console.log(`${i+1}. ${p}`)); let pick:ScorcererPick='TD'; while(true){ const a=await question('Pick #> '); const idx=parseInt(a,10)-1; if(picks[idx]) { pick=picks[idx]; break;} console.log('Invalid'); } const total = s.totalScore ?? 0; return { id:`bet_${Date.now()}`, mode:'SCORCERER', createdAt:new Date(), status:'PENDING', pick, baselineTotal: total, lastObservedTotal: total }; }
async function createHorseRace(): Promise<HorseRaceBet>{ let rq:1|2|3|4=4; const qAns=await question('Resolve at quarter (1-4 default 4)> '); if(['1','2','3','4'].includes(qAns)) rq=parseInt(qAns,10) as any; return { id:`bet_${Date.now()}`, mode:'HORSE_RACE', createdAt:new Date(), status:'PENDING', resolveQuarter:rq }; }
async function createChooseFate(): Promise<ChooseFateBet>{ const opts:FateOutcome[]=['TD','FG','TURNOVER']; opts.forEach((o,i)=>console.log(`${i+1}. ${o}`)); let pred:FateOutcome='TD'; while(true){ const a=await question('Outcome pick #> '); const idx=parseInt(a,10)-1; if(opts[idx]) { pred=opts[idx]; break;} console.log('Invalid'); } return { id:`bet_${Date.now()}`, mode:'CHOOSE_THEIR_FATE', createdAt:new Date(), status:'PENDING', predicted:pred, awaitingManual:true }; }
async function createSackStack(s: GameSnapshot): Promise<SackStackBet>{ const predBuckets:['0-1','2-4','5+']=['0-1','2-4','5+']; predBuckets.forEach((b,i)=>console.log(`${i+1}. ${b}`)); let pb:'0-1'|'2-4'|'5+'='0-1'; while(true){ const a=await question('Predicted bucket #> '); const idx=parseInt(a,10)-1; if(predBuckets[idx]) { pb=predBuckets[idx]; break;} console.log('Invalid'); } return { id:`bet_${Date.now()}`, mode:'SACK_STACK', createdAt:new Date(), status:'PENDING', baselineSacks:s.combinedSacks??0, predictedBucket:pb }; }
async function createTwoMinute(): Promise<TwoMinuteDrillBet>{ const scopeChoices:['FIRST_HALF','GAME']=['FIRST_HALF','GAME']; scopeChoices.forEach((s,i)=>console.log(`${i+1}. ${s}`)); let sc:'FIRST_HALF'|'GAME'='GAME'; while(true){ const a=await question('Scope #> '); const idx=parseInt(a,10)-1; if(scopeChoices[idx]) { sc=scopeChoices[idx]; break;} console.log('Invalid'); } const predChoices:['SCORE','NO_SCORE']=['SCORE','NO_SCORE']; predChoices.forEach((p,i)=>console.log(`${i+1}. ${p}`)); let pr:'SCORE'|'NO_SCORE'='SCORE'; while(true){ const a=await question('Prediction #> '); const idx=parseInt(a,10)-1; if(predChoices[idx]) { pr=predChoices[idx]; break;} console.log('Invalid'); } return { id:`bet_${Date.now()}`, mode:'TWO_MINUTE_DRILL', createdAt:new Date(), status:'PENDING', scope:sc, prediction:pr, thresholdStarted:false }; }
async function createBet(mode: Mode, snap: GameSnapshot): Promise<AnyBet>{ switch(mode){ case 'BEST_OF_THE_BEST': return createBestOfBest(snap); case 'ONE_LEG_SPREAD': return createOneLegSpread(snap); case 'SCORCERER': return createScorcerer(snap); case 'HORSE_RACE': return createHorseRace(); case 'CHOOSE_THEIR_FATE': return createChooseFate(); case 'SACK_STACK': return createSackStack(snap); case 'TWO_MINUTE_DRILL': return createTwoMinute(); } }

/* ------------------ Reporting ------------------ */
function describe(b: AnyBet): string { switch(b.mode){ case 'BEST_OF_THE_BEST': { const bb=b as BestOfBestBet; return `[${bb.status}] BOTB ${bb.playerAId} vs ${bb.playerBId} stat=${bb.stat} settleQ=${bb.settleQuarter} winner=${bb.winner??''} ${bb.notes??''}`; } case 'ONE_LEG_SPREAD': { const s=b as OneLegSpreadBet; return `[${s.status}] SPREAD bucket=${s.winnerBucket??''} ${s.notes??''}`; } case 'SCORCERER': { const sc=b as ScorcererBet; return `[${sc.status}] SCORCERER pick=${sc.pick} resolved=${sc.resolvedType??''} ${sc.notes??''}`; } case 'HORSE_RACE': { const hr=b as HorseRaceBet; return `[${hr.status}] HORSE_RACE resolveQ=${hr.resolveQuarter} leader=${hr.leaderAtResolve??''} ${hr.notes??''}`; } case 'CHOOSE_THEIR_FATE': { const cf=b as ChooseFateBet; return `[${cf.status}] CHOOSE_FATE predicted=${cf.predicted} actual=${cf.actual??''} ${cf.notes??''}`; } case 'SACK_STACK': { const ss=b as SackStackBet; return `[${ss.status}] SACK_STACK pred=${ss.predictedBucket} final=${ss.finalBucket??''} ${ss.notes??''}`; } case 'TWO_MINUTE_DRILL': { const tm=b as TwoMinuteDrillBet; return `[${tm.status}] TWO_MINUTE scope=${tm.scope} pred=${tm.prediction} started=${tm.thresholdStarted} result=${tm.result??''} ${tm.notes??''}`; } } }

/* ------------------ Main Loop ------------------ */
async function chooseGameFile(): Promise<string> {
  // Collect refined files first
  const refinedDir = resolve(REFINED_DIR);
  const rawDir = resolve(RAW_DIR);
  const files: { path: string; label: string; refined: boolean }[] = [];
  if (existsSync(refinedDir)) {
    readdirSync(refinedDir).filter(f=>f.endsWith('.refined.json')).forEach(f=>{
      const full = resolve(refinedDir, f);
      try { const sz = statSync(full).size; files.push({ path: full, label: `${f} (${(sz/1024).toFixed(1)} KB)`, refined: true }); } catch {}
    });
  }
  if (existsSync(rawDir)) {
    readdirSync(rawDir).filter(f=>f.endsWith('_stats.json')).forEach(f=>{
      const full = resolve(rawDir, f);
      if (!files.find(ff=>ff.path.includes(f))) { // avoid duplicate if refined already exists
        try { const sz = statSync(full).size; files.push({ path: full, label: `${f} (raw ${(sz/1024).toFixed(1)} KB)`, refined: false }); } catch {}
      }
    });
  }
  if (files.length === 0) {
    console.log('No game files found. Defaulting to json-data/401773019_stats.json');
    return resolve('json-data/401773019_stats.json');
  }
  console.log('\nSelect Game File:');
  files.forEach((f,i)=>console.log(`${i+1}. ${f.refined? 'R':'R*'} ${f.label}`));
  while (true) {
    const ans = await question('Game #> ');
    const idx = parseInt(ans,10)-1;
    if (files[idx]) return files[idx].path;
    console.log('Invalid selection');
  }
}

async function main(){ let boxscoreFileArg = process.argv[2]; let boxscoreFile: string = '';
  if (boxscoreFileArg === 'live' || !boxscoreFileArg) { // choose most recent refined or raw
    const dir = resolve(REFINED_DIR);
    const fallbackDir = resolve(RAW_DIR);
    if (existsSync(dir)) {
      const candidates = readdirSync(dir).filter(f=>/\.refined\.json$/.test(f)).map(f=>{ const full=resolve(dir,f); return { f: full, m: statSync(full).mtimeMs }; });
      if (candidates.length) { candidates.sort((a,b)=>b.m-a.m); boxscoreFile = candidates[0]!.f; console.log('Live mode: selected latest refined file', boxscoreFile); }
    }
    if (!boxscoreFile && existsSync(fallbackDir)) {
      const c2 = readdirSync(fallbackDir).filter(f=>/_stats\.json$/.test(f)).map(f=>{ const full=resolve(fallbackDir,f); return { f: full, m: statSync(full).mtimeMs }; });
      if (c2.length) { c2.sort((a,b)=>b.m-a.m); boxscoreFile = c2[0]!.f; console.log('Live mode: selected latest raw file', boxscoreFile); }
    }
  if (!boxscoreFile) { console.log('No live files yet, waiting for first fetch...'); while(!boxscoreFile){ await new Promise(r=>setTimeout(r,3000)); if (existsSync(resolve(REFINED_DIR))) { const cs = readdirSync(resolve(REFINED_DIR)).filter(f=>/\.refined\.json$/.test(f)); if (cs.length){ boxscoreFile = resolve(REFINED_DIR, cs[0]!); } } } }
  } else { boxscoreFile = resolve(boxscoreFileArg); }
  const scoreboardFile=resolve('json-data/nfl_data.json'); console.log('Using boxscore:', boxscoreFile); console.log('Using scoreboard:', scoreboardFile); let snap=currentSnapshot({boxscoreFile,scoreboardFile}); console.log(`Initial snapshot Q${snap.quarter??'?'} ${snap.clock??'?'} Score ${snap.awayAbbr??'AWY'} ${snap.awayScore??'?'} - ${snap.homeAbbr??'HOME'} ${snap.homeScore??'?'}`); const bets: AnyBet[]=[]; let prevSnap: GameSnapshot | undefined = undefined;
  async function newBet(){ snap=currentSnapshot({boxscoreFile,scoreboardFile}); const mode=await chooseMode(); const bet=await createBet(mode,snap); bets.push(bet); console.log('Created bet', bet.id); }
  // Attempt initial bet creation; if user interrupts with Ctrl+C exit gracefully
  try { await newBet(); } catch(e:any) { console.warn('Initial bet creation aborted:', e.message); }
  let auto=false; const pollMs=60_000;
  async function poll(){ prevSnap=snap; snap=currentSnapshot({boxscoreFile,scoreboardFile}); bets.forEach((b,i)=>{ // update dynamic fields for Scorcerer baseline last observed
    if (b.mode==='SCORCERER' && b.status==='PENDING'){ const sc=b as ScorcererBet; if (snap.totalScore!=null) { (b as ScorcererBet).lastObservedTotal = snap.totalScore; } }
    const evaluated=evaluateBet(b,snap,prevSnap); bets[i]=evaluated; }); report(); }
  function report(){ console.log('\n--- STATUS ---'); console.log(`Game Q${snap.quarter??'?'} ${snap.clock??''} Score ${snap.awayAbbr??'AWY'} ${snap.awayScore??'?'} - ${snap.homeAbbr??'HOME'} ${snap.homeScore??'?'} Total=${snap.totalScore??'?'} Sacks=${snap.combinedSacks??'?'} Final=${snap.isFinal}`); bets.forEach(b=>console.log(describe(b))); }
  report();
  if (process.stdin.isTTY){ const loop=async()=>{ while(true){ const cmd=await question('> '); const [base,...rest]=cmd.trim().split(/\s+/); if (!base){ await poll(); continue;} if(['q','quit'].includes(base)) break; if(base==='auto'){ if(!auto){ auto=true; console.log('Auto polling 60s.'); setInterval(()=>{ if(auto) poll().catch(e=>console.error('Poll error',e)); },pollMs);} continue; } if(base==='manual'){ auto=false; console.log('Auto disabled'); continue; } if(base==='new'){ await newBet(); continue; } if(base==='outcome'){ const [betId,out]=rest; const bet=bets.find(b=>b.id===betId && b.mode==='CHOOSE_THEIR_FATE') as ChooseFateBet|undefined; if(!bet){ console.log('No matching CHOOSE_THEIR_FATE bet'); continue; } if(!['TD','FG','TURNOVER'].includes(out||'')){ console.log('Need outcome TD|FG|TURNOVER'); continue; } bet.actual = out as FateOutcome; bet.awaitingManual=false; console.log('Outcome recorded'); continue; } if(base==='list'){ bets.forEach(b=>console.log(describe(b))); continue; } await poll(); } rl.close(); console.log('Exiting'); }; await loop(); }
}

main().catch(e=>{ console.error('Fatal',e); process.exit(1); });
