#!/usr/bin/env node
/**
 * Simple CLI to validate one or more ESPN boxscore JSON files.
 * Usage examples:
 *   npm run validate -- json-data/401772974_stats.json
 *   node dist/validatorCli.js json-data/*.json
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validateGameData } from './boxscoreValidator.js';

function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Provide at least one path to a JSON file.');
    process.exit(1);
  }
  let overallFailures = 0;
  args.forEach(p => {
    const full = resolve(p);
    try {
      const raw = readFileSync(full, 'utf-8');
      const json = JSON.parse(raw);
      const result = validateGameData(json);
      if (result.isValid) {
        console.log(`✅ ${p}: valid (${result.players?.length || 0} players extracted)`);
      } else {
        overallFailures++;
        console.error(`❌ ${p}: invalid`);
  result.errors.forEach((e: string) => console.error('   -', e));
      }
    } catch (e: any) {
      overallFailures++;
      console.error(`💥 ${p}: error reading/parsing - ${e.message}`);
    }
  });
  if (overallFailures > 0) process.exit(1);
}

run();
