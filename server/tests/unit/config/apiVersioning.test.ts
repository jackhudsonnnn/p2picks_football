/**
 * Tests for API versioning — /api/v1 prefix and /api backward-compat alias.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('API versioning in index.ts', () => {
  const indexSource = readFileSync(
    resolve(__dirname, '../../../src/index.ts'),
    'utf-8',
  );

  it('mounts the API router on /api/v1', () => {
    expect(indexSource).toContain("'/api/v1'");
  });

  it('keeps /api as a backward-compatible alias', () => {
    expect(indexSource).toContain("'/api'");
    // /api must come AFTER /api/v1 so the versioned path takes precedence
    const v1Pos = indexSource.indexOf("'/api/v1'");
    const legacyPos = indexSource.indexOf("'/api'", v1Pos + 1);
    expect(legacyPos).toBeGreaterThan(v1Pos);
  });
});
