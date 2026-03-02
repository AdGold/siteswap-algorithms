/**
 * Sync siteswap generator
 * Generates sync siteswaps by converting vanilla siteswaps of even period.
 *
 * The conversion works by:
 * - Pairing throws: even-indexed = RH throw, odd-indexed = LH throw
 * - For crossing RH throws (odd height h): subtract 1 → h-1, mark as x
 * - For crossing LH throws (odd height h): add 1 → h+1, mark as x
 * - Even throws are unchanged (no x)
 * - Filtering out 0x throws (invalid) and validating no two throws collide
 *
 * For each canonical vanilla siteswap, two shifts are tried:
 * - shift=0: pair (v[0],v[1]), (v[2],v[3]), ...
 * - shift=1: pair (v[1],v[2]), (v[3],v[4]), ..., (v[2k-1],v[0])
 * Even shifts beyond 0 produce sync rotations already covered by shift=0,
 * and odd shifts beyond 1 produce sync rotations covered by shift=1.
 *
 * Resulting sync patterns are deduplicated by their maximum (lexicographically
 * largest) rotation, which is used as the canonical form.
 *
 * Example: vanilla 5340 (canonical: 0534)
 *   shift=0 on 0534 → (0,6x)(2x,4), canonical: (2x,4)(0,6x)
 *   shift=1 on 0534 → (4x,4x)(4,0), canonical: (4x,4x)(4,0)
 *
 * IMPORTANT: Do NOT rewrite this as a direct sync generator without explicit
 * confirmation. The vanilla-conversion approach is intentional. The formula
 * is: RH odd h → h-1 with x; LH odd h → h+1 with x.
 */

import {intToSS, ssToInt} from '../common';
import {generateVanillaSiteswaps} from './vanilla';

export interface SyncVanillaOptions {
  balls: number;
  period: number; // sync period; vanilla period used internally = 2 * period
  maxThrow?: number; // max sync throw height (applied to converted throws)
  filterZeros?: boolean; // exclude patterns with any 0 throw (default: false)
}

type SyncBeat = [rh: number, rhX: boolean, lh: number, lhX: boolean];

function beatToString([rh, rhX, lh, lhX]: SyncBeat): string {
  return `(${intToSS(rh)}${rhX ? 'x' : ''},${intToSS(lh)}${lhX ? 'x' : ''})`;
}

function beatsToString(beats: SyncBeat[]): string {
  return beats.map(beatToString).join('');
}

/**
 * Check that no two non-zero throws land at the same (tick, hand) position.
 * Not every valid vanilla siteswap converts to a valid sync siteswap —
 * the hand-shift can cause landing collisions which this detects.
 */
function isSyncPatternValid(beats: SyncBeat[]): boolean {
  const k = beats.length;
  const period = 2 * k;
  const landings = new Set<string>();
  for (let i = 0; i < k; i++) {
    const [rh, rhX, lh, lhX] = beats[i];
    const t = 2 * i;
    if (rh !== 0) {
      const key = `${(t + rh) % period}${rhX ? 'L' : 'R'}`;
      if (landings.has(key)) return false;
      landings.add(key);
    }
    if (lh !== 0) {
      const key = `${(t + lh) % period}${lhX ? 'R' : 'L'}`;
      if (landings.has(key)) return false;
      landings.add(key);
    }
  }
  return true;
}

/**
 * Convert an array of vanilla throw heights (even length) to sync beats.
 * Returns null if invalid (0x throw, sync throw > maxThrow, filterZeros
 * triggered, or landing collision).
 */
function vanillaToSyncBeats(
  throws: number[],
  maxThrow: number | undefined,
  filterZeros: boolean
): SyncBeat[] | null {
  const beats: SyncBeat[] = [];

  for (let i = 0; i < throws.length; i += 2) {
    const rh = throws[i];
    const lh = throws[i + 1];

    // RH odd h: subtract 1 to get even sync height, mark as crossing
    // LH odd h: add 1 to get even sync height, mark as crossing
    const rhX = rh % 2 === 1;
    const rhResult = rhX ? rh - 1 : rh;
    const lhX = lh % 2 === 1;
    const lhResult = lhX ? lh + 1 : lh;

    // 0x is an invalid throw (crossing zero)
    if (rhResult === 0 && rhX) return null;
    if (lhResult === 0 && lhX) return null;

    // Apply maxThrow to resulting sync throws
    if (maxThrow !== undefined && (rhResult > maxThrow || lhResult > maxThrow))
      return null;

    // Filter patterns with any 0 throw
    if (filterZeros && (rhResult === 0 || lhResult === 0)) return null;

    beats.push([rhResult, rhX, lhResult, lhX]);
  }

  if (!isSyncPatternValid(beats)) return null;

  return beats;
}

/**
 * Returns the flip of a pattern (swap RH and LH in every beat).
 */
function flipBeats(beats: SyncBeat[]): SyncBeat[] {
  return beats.map(([rh, rhX, lh, lhX]) => [lh, lhX, rh, rhX] as SyncBeat);
}

/**
 * Returns the canonical form of a sync pattern: the lexicographically maximum
 * string across all rotations of both the pattern and its flip (hand-swap).
 * This deduplicates patterns that differ only by swapping which hand is "right".
 */
function canonicalSyncPattern(beats: SyncBeat[]): string {
  const k = beats.length;
  let best = '';
  for (const base of [beats, flipBeats(beats)]) {
    for (let r = 0; r < k; r++) {
      const s = beatsToString([...base.slice(r), ...base.slice(0, r)]);
      if (s > best) best = s;
    }
  }
  return best;
}

/**
 * Generates sync siteswaps by converting vanilla siteswaps of even period.
 * For each vanilla siteswap, both shifts (0 and 1) are tried to cover all
 * distinct sync interpretations. Results are deduplicated by maximum rotation.
 *
 * @param options - Generation options
 * @returns Array of sync siteswap strings in the form "(a,b)(c,d)..."
 */
export function generateSyncSiteswaps(options: SyncVanillaOptions): string[] {
  // Generate vanilla with maxThrow+1 so LH odd throws (e.g. 9→sync 8x) aren't missed.
  // The post-filter in vanillaToSync handles anything that converts above maxThrow.
  const vanillaSiteswaps = generateVanillaSiteswaps({
    balls: options.balls,
    period: options.period * 2,
    maxThrow: options.maxThrow !== undefined ? options.maxThrow + 1 : undefined,
  });

  const seen = new Set<string>();
  const results: string[] = [];

  for (const vs of vanillaSiteswaps) {
    const throws = vs.split('').map(c => ssToInt(c));

    for (const shift of [0, 1]) {
      const shifted = [...throws.slice(shift), ...throws.slice(0, shift)];
      const beats = vanillaToSyncBeats(
        shifted,
        options.maxThrow,
        options.filterZeros ?? false
      );
      if (beats === null) continue;

      const canonical = canonicalSyncPattern(beats);
      if (!seen.has(canonical)) {
        seen.add(canonical);
        results.push(canonical);
      }
    }
  }

  return results.sort();
}
