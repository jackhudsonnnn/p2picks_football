#!/usr/bin/env node
/**
 * refineData.ts
 * Reads raw ESPN-style boxscore/scoreboard JSON and outputs a minimal refined snapshot
 * containing only data needed for all implemented modes.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, basename } from 'path';
import { validateGameData, extractPlayerStats } from './boxscoreValidator.js';

interface RefinedPlayer {
  id: string; name: string; team: string;
  receptions?: number; receivingYards?: number; receivingTouchdowns?: number;
  rushingYards?: number; rushingTouchdowns?: number;
}
interface RefinedDrive { id?: string; result?: string; isScore?: boolean; description?: string; period?: number; clock?: string; }
interface RefinedScoringPlay { id: string; type: string; awayScore: number; homeScore: number; period: number; clock: string; }
interface RefinedData {
  meta: { lastUpdatedAt?: string; gameState?: string };
  game: { id?: string; quarter?: number; clock?: string; isFinal: boolean; homeAbbr?: string; awayAbbr?: string; homeScore?: number; awayScore?: number; };
  players: RefinedPlayer[];
  scoringPlays: RefinedScoringPlay[];
  drives: { current?: RefinedDrive; previous: RefinedDrive[] };
  aggregates: { totalScore: number; combinedSacks?: number };
}

function optional<T>(v: any, path: string[]): T|undefined { try { return path.reduce((a,k)=>a?.[k], v); } catch { return undefined; } }

function refine(rawPath: string): RefinedData {
  const raw = JSON.parse(readFileSync(rawPath,'utf-8'));
  // Player stats via validator (may throw)
  let players: RefinedPlayer[] = [];
  try {
    const v = validateGameData(raw);
    if (v.isValid && v.data) {
      const extracted = extractPlayerStats(v.data);
      players = extracted.map(p => {
        const rp: RefinedPlayer = { id: p.playerId, name: p.name, team: p.team };
        if (p.receptions != null) rp.receptions = p.receptions;
        if (p.receivingYards != null) rp.receivingYards = p.receivingYards;
        if (p.receivingTouchdowns != null) rp.receivingTouchdowns = p.receivingTouchdowns;
        if (p.rushingYards != null) rp.rushingYards = p.rushingYards;
        if (p.rushingTouchdowns != null) rp.rushingTouchdowns = p.rushingTouchdowns;
        return rp;
      });
    }
  } catch {}

  // Scoreboard style fields
  const header = raw.header || {};
  const comp = header.competitions?.[0] || raw.competitions?.[0];
  const status = comp?.status || raw.status;
  const competitors = comp?.competitors || [];
  const home = competitors.find((c:any)=>c.homeAway==='home');
  const away = competitors.find((c:any)=>c.homeAway==='away');
  const period = status?.period ?? optional<number>(raw,['drives','current','start','period','number']);
  const clock = status?.displayClock || optional<string>(raw,['drives','current','start','clock','displayValue']);
  const typeState = (status?.type?.state || status?.type?.name || '').toLowerCase();
  const isFinal = ['post','final','complete','final overtime'].includes(typeState);
  const homeScore = parseInt(home?.score ?? home?.linescores?.reduce((s:any,l:any)=>s+(parseInt(l.value||'0',10)||0),0) ?? '0',10) || undefined;
  const awayScore = parseInt(away?.score ?? away?.linescores?.reduce((s:any,l:any)=>s+(parseInt(l.value||'0',10)||0),0) ?? '0',10) || undefined;

  // Drives minimal
  const dr = raw.drives || {};
  function mapDrive(d:any): RefinedDrive { return { id:d?.id, result:d?.result || d?.shortDisplayResult, isScore:d?.isScore, description:d?.description, period: d?.start?.period?.number, clock: d?.start?.clock?.displayValue }; }
  const current = dr.current ? mapDrive(dr.current) : undefined;
  const previous = Array.isArray(dr.previous)? dr.previous.slice(-10).map(mapDrive):[];

  // Scoring plays
  const scoringPlays = Array.isArray(raw.scoringPlays)? raw.scoringPlays.map((p:any)=>({ id:p.id, type:p.type?.abbreviation, awayScore:p.awayScore, homeScore:p.homeScore, period:p.period?.number, clock:p.clock?.displayValue })) : [];

  // Combined sacks (placeholder:  not available directly in refined structure unless source had defensive stats processed earlier)
  let combinedSacks: number | undefined;
  // Attempt to derive from existing refined players? Skip for now; placeholder.

  const totalScore = (homeScore ?? 0) + (awayScore ?? 0);

  const game: RefinedData['game'] = { id: header.id, isFinal };
  if (period != null) game.quarter = period;
  if (clock != null) game.clock = clock;
  const homeAbbr = home?.team?.abbreviation || home?.abbreviation; if (homeAbbr) game.homeAbbr = homeAbbr;
  const awayAbbr = away?.team?.abbreviation || away?.abbreviation; if (awayAbbr) game.awayAbbr = awayAbbr;
  if (homeScore != null) game.homeScore = homeScore;
  if (awayScore != null) game.awayScore = awayScore;
  const drivesObj: RefinedData['drives'] = { previous };
  if (current) drivesObj.current = current;
  const aggregates: RefinedData['aggregates'] = { totalScore };
  if (combinedSacks != null) aggregates.combinedSacks = combinedSacks;
  return {
    meta: { lastUpdatedAt: raw.meta?.lastUpdatedAt, gameState: raw.meta?.gameState },
    game,
    players,
    scoringPlays,
    drives: drivesObj,
    aggregates
  };
}

function main(){
  const inFiles = process.argv.slice(2);
  if (inFiles.length===0){ console.error('Usage: refineData <rawJson...>'); process.exit(1);} 
  inFiles.forEach(f=>{
    const path = resolve(f);
    try {
      const refined = refine(path);
      const outName = basename(path).replace(/\.json$/, '.refined.json');
      const outPath = resolve('refined-json-data', outName);
      writeFileSync(outPath, JSON.stringify(refined, null, 2));
      console.log('Refined ->', outPath);
    } catch (e:any){
      console.error('Failed refining', f, e.message);
    }
  });
}

main();
