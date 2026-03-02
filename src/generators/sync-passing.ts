/**
 * Synchronous symmetric passing pattern generator
 * Generates synchronous symmetric 2-juggler passing patterns.
 * Two-stage algorithm (J1 candidates, then find J2 partners).
 */

import {intToSS, ssToInt} from '../common';

export interface SyncPassingOptions {
  balls: number;
  period: number; // Must be even
  maxThrow: number;
  filterZeros?: boolean;
  filterTwos?: boolean;
  filter1p?: boolean;
  filter2p?: boolean;
  filterFakeSync?: boolean;
  filterWimpy?: boolean;
  filterCollisiony?: boolean;
  syncMode?: 'full-sync' | 'sync-async' | 'both';
  passModification?: 'none' | 'consistent' | 'any';
  selfModification?: 'none' | 'consistent' | 'any';
}

// Internal SyncThrow class for this generator.
// This is a lightweight alternative to the main Throw class, optimized for pattern generation.
// It stores original_str for string comparison in isWimpy/isCollisiony.
// The getLandingHand function is mathematically equivalent to Throw.landHand.
class SyncThrow {
  height: number;
  is_pass: boolean;
  is_crossing: boolean;
  original_str: string;

  constructor(
    height: number,
    is_pass: boolean,
    is_crossing: boolean,
    original_str: string
  ) {
    this.height = height;
    this.is_pass = is_pass;
    this.is_crossing = is_crossing;
    this.original_str = original_str;
  }
}

type Beat = [string, string]; // [left_throw, right_throw]
type Pattern = Beat[];

function parseThrow(s: string): SyncThrow | null {
  if (!s) return null;
  const height = ssToInt(s[0]);
  const is_pass = s.includes('p');
  const is_crossing = s.includes('x');
  return new SyncThrow(height, is_pass, is_crossing, s);
}

function getLandingHand(origin_hand: number, throwObj: SyncThrow): number {
  if (throwObj.is_pass) {
    return (origin_hand + 1 + (throwObj.is_crossing ? 1 : 0)) % 2;
  } else {
    return (origin_hand + throwObj.height + (throwObj.is_crossing ? 1 : 0)) % 2;
  }
}

function isValid(
  p1: Pattern,
  p2: Pattern,
  period: number,
  juggler_delay: number
): boolean {
  // landings[juggler*2 + hand][beat] = list of throws landing there
  const landings: SyncThrow[][][] = Array.from({length: 4}, () =>
    Array.from({length: period}, () => [])
  );

  const patterns: [number, Pattern][] = [
    [0, p1],
    [1, p2],
  ];

  for (const [juggler_idx, p] of patterns) {
    for (let beat = 0; beat < p.length; beat++) {
      const [l_str, r_str] = p[beat];
      const throws: [number, string][] = [
        [0, l_str],
        [1, r_str],
      ];

      for (const [hand_idx, throw_str] of throws) {
        const throwObj = parseThrow(throw_str);
        if (!throwObj) continue;

        let height = throwObj.height;
        if (throwObj.is_pass && juggler_delay === 1) {
          height =
            juggler_idx === 0 ? throwObj.height - 1 : throwObj.height + 1;
        }

        if (height < 0 || height % 2 !== 0) {
          return false;
        }
        const height_in_array = height / 2;

        const land_beat = (beat + height_in_array) % period;
        const dest_juggler = throwObj.is_pass ? 1 - juggler_idx : juggler_idx;
        const land_hand = getLandingHand(hand_idx, throwObj);
        landings[dest_juggler * 2 + land_hand][land_beat].push(throwObj);
      }
    }
  }
  return landings.every(hand => hand.every(beat => beat.length <= 1));
}

function isFakeSync(p1: Pattern, p2: Pattern): boolean {
  const isFakeSyncLocal = (pattern: Pattern, hold: number): boolean => {
    const case1 = pattern.every(([l, r], i) =>
      i % 2 === 0
        ? ssToInt(l[0]) === hold && ssToInt(r[0]) !== hold
        : ssToInt(r[0]) === hold && ssToInt(l[0]) !== hold
    );
    const case2 = pattern.every(([l, r], i) =>
      i % 2 === 0
        ? ssToInt(r[0]) === hold && ssToInt(l[0]) !== hold
        : ssToInt(l[0]) === hold && ssToInt(r[0]) !== hold
    );
    return case1 || case2;
  };

  const isFakeSyncGlobal = (
    p1: Pattern,
    p2: Pattern,
    hold: number
  ): boolean => {
    const isHoldBeat = ([l, r]: Beat): boolean =>
      ssToInt(l[0]) === hold && ssToInt(r[0]) === hold;
    const case1 =
      p1.every((beat, i) =>
        i % 2 === 0 ? isHoldBeat(beat) : !isHoldBeat(beat)
      ) &&
      p2.every((beat, i) =>
        i % 2 === 0 ? !isHoldBeat(beat) : isHoldBeat(beat)
      );
    const case2 =
      p1.every((beat, i) =>
        i % 2 === 0 ? !isHoldBeat(beat) : isHoldBeat(beat)
      ) &&
      p2.every((beat, i) =>
        i % 2 === 0 ? isHoldBeat(beat) : !isHoldBeat(beat)
      );
    return case1 || case2;
  };

  return [0, 2].some(
    hold =>
      isFakeSyncGlobal(p1, p2, hold) ||
      isFakeSyncLocal(p1, hold) ||
      isFakeSyncLocal(p2, hold)
  );
}

function isWimpy(pattern: Pattern): boolean {
  for (const [l_str, r_str] of pattern) {
    const l_throw = parseThrow(l_str);
    const r_throw = parseThrow(r_str);
    if (l_throw && r_throw && l_throw.is_crossing && l_str === r_str) {
      return true;
    }
  }
  return false;
}

function isCollisiony(p1: Pattern, p2: Pattern, period: number): boolean {
  for (let i = 0; i < period; i++) {
    const j1l = parseThrow(p1[i][0]);
    const j2r = parseThrow(p2[i][1]);
    if (j1l && j2r && j1l.original_str === j2r.original_str && j1l.is_pass) {
      return true;
    }
    const j1r = parseThrow(p1[i][1]);
    const j2l = parseThrow(p2[i][0]);
    if (j1r && j2l && j1r.original_str === j2l.original_str && j1r.is_pass) {
      return true;
    }
  }
  return false;
}

function flipThrow(throw_str: string): string {
  if (!throw_str) return throw_str;
  const throwObj = parseThrow(throw_str);
  if (!throwObj) return throw_str;
  const new_crossing = !throwObj.is_crossing;
  return `${intToSS(throwObj.height)}${throwObj.is_pass ? 'p' : ''}${
    new_crossing ? 'x' : ''
  }`;
}

function cartesianProduct<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) {
    return [[]];
  }
  const [head, ...tail] = arrays;
  const tailProduct = cartesianProduct(tail);
  const result: T[][] = [];
  for (const item of head) {
    for (const rest of tailProduct) {
      result.push([item, ...rest]);
    }
  }
  return result;
}

interface InternalOptions {
  balls: number;
  period: number;
  max_throw: number;
  filter_zeros: boolean;
  filter_twos: boolean;
  filter_1p: boolean;
  filter_2p: boolean;
  filter_fake_sync: boolean;
  filter_wimpy: boolean;
  filter_collisiony: boolean;
  delays_to_check: number[];
  self_modification: 'none' | 'consistent' | 'any';
  pass_modification: 'none' | 'consistent' | 'any';
}

function generateJ1Candidates(
  balls: number,
  period: number,
  max_throw: number,
  options: InternalOptions
): Pattern[] {
  const candidates: Pattern[] = [];
  const k = period / 2;

  let self_throws: string[] = ['0'];
  for (let h = 2; h <= max_throw; h += 2) {
    self_throws.push(`${intToSS(h)}`);
    self_throws.push(`${intToSS(h)}x`);
  }

  let pass_throws: string[] = [];
  for (let h = 1; h <= max_throw; h++) {
    pass_throws.push(`${intToSS(h)}p`);
    pass_throws.push(`${intToSS(h)}px`);
  }

  if (options.filter_zeros) self_throws = self_throws.filter(t => t !== '0');
  if (options.filter_twos)
    self_throws = self_throws.filter(t => !t.startsWith('2'));
  if (options.filter_1p)
    pass_throws = pass_throws.filter(t => !t.startsWith('1p'));
  if (options.filter_2p)
    pass_throws = pass_throws.filter(t => !t.startsWith('2p'));

  const all_throws = self_throws.concat(pass_throws);
  const required_height_sum = balls * period;

  function findHalfPatterns(t: number, half_pattern: Beat[]): void {
    const throws = half_pattern
      .flat()
      .map(parseThrow)
      .filter((th): th is SyncThrow => th !== null);
    const total_height = throws.reduce((sum, th) => sum + th.height, 0);

    if (total_height * 2 > required_height_sum) {
      return;
    }

    const has_even_pass = throws.some(t => t.is_pass && t.height % 2 === 0);
    const has_odd_pass = throws.some(t => t.is_pass && t.height % 2 !== 0);
    if (has_even_pass && has_odd_pass) {
      return;
    }

    if (t === k) {
      if (throws.every(throwObj => !throwObj.is_pass)) {
        return;
      }
      if (total_height * 2 !== required_height_sum) {
        return;
      }

      const p1: Pattern = [...half_pattern];
      p1.push(...half_pattern.map(([l, r]) => [r, l] as Beat));

      for (const delay of options.delays_to_check) {
        if (
          isValid(p1, Array(period).fill(['', '']) as Pattern, period, delay)
        ) {
          candidates.push(p1);
          return;
        }
      }
      return;
    }

    for (const l_throw of all_throws) {
      for (const r_throw of all_throws) {
        if (options.filter_wimpy && isWimpy([[l_throw, r_throw]])) continue;
        findHalfPatterns(t + 1, half_pattern.concat([[l_throw, r_throw]]));
      }
    }
  }

  findHalfPatterns(0, []);
  return candidates;
}

interface Solution {
  p1: Pattern;
  p2: Pattern;
  juggler_delay: number;
}

function findSolutionsForCandidate(
  p1: Pattern,
  period: number,
  options: InternalOptions
): Solution[] {
  const solutions: Solution[] = [];
  const k = period / 2;

  for (let delta = 0; delta < period; delta++) {
    const p2_base: Pattern = Array.from(
      {length: period},
      (_, t) => p1[(t - delta + period) % period]
    );
    if (options.filter_wimpy && isWimpy(p2_base)) continue;

    const self_indices: [number, number][] = [];
    const pass_indices: [number, number][] = [];
    for (let t = 0; t < k; t++) {
      for (let h = 0; h < 2; h++) {
        const throwObj = parseThrow(p2_base[t][h]);
        if (throwObj) {
          if (throwObj.is_pass) pass_indices.push([t, h]);
          else self_indices.push([t, h]);
        }
      }
    }

    let self_choices: [number, number][][] =
      options.self_modification === 'none'
        ? []
        : options.self_modification === 'consistent'
        ? [self_indices]
        : self_indices.map(idx => [idx]);
    let pass_choices: [number, number][][] =
      options.pass_modification === 'none'
        ? []
        : options.pass_modification === 'consistent'
        ? [pass_indices]
        : pass_indices.map(idx => [idx]);

    self_choices = self_choices.filter(arr => arr.length > 0);
    pass_choices = pass_choices.filter(arr => arr.length > 0);

    const choice_indices = self_choices.concat(pass_choices);
    const flip_combinations = cartesianProduct(
      Array(choice_indices.length).fill([false, true]) as boolean[][]
    );

    for (const choices of flip_combinations) {
      const p2_candidate: Pattern = p2_base.map(beat => [...beat] as Beat);

      for (let i = 0; i < choices.length; i++) {
        if (choices[i]) {
          // if we should flip this group
          for (const [t, h] of choice_indices[i]) {
            // Flip the throw and its symmetric counterpart
            p2_candidate[t][h] = flipThrow(p2_candidate[t][h]);
            const sym_t = t + k;
            const sym_h = 1 - h;
            p2_candidate[sym_t][sym_h] = flipThrow(p2_candidate[sym_t][sym_h]);
          }
        }
      }
      for (const juggler_delay of options.delays_to_check) {
        if (isValid(p1, p2_candidate, period, juggler_delay)) {
          solutions.push({p1, p2: p2_candidate, juggler_delay});
        }
      }
    }
  }
  return solutions;
}

function asString(p1: Pattern, p2: Pattern): string {
  const mid = p1.length / 2;
  const p1_str = p1
    .slice(0, mid)
    .map(([l, r]) => `(${l || '()'},${r || '()'})`)
    .join(' ');
  const p2_str = p2
    .slice(0, mid)
    .map(([l, r]) => `(${l || '()'},${r || '()'})`)
    .join(' ');
  return `<${p1_str}*| ${p2_str}*>`;
}

function equivalentRotations(
  p1: Pattern,
  p2: Pattern,
  juggler_delay: number
): string[] {
  const period = p1.length;
  const rotations = new Set<string>();
  for (let rot = 0; rot < period; rot++) {
    const p1_rot = p1.slice(rot).concat(p1.slice(0, rot));
    const p2_rot = p2.slice(rot).concat(p2.slice(0, rot));
    rotations.add(asString(p1_rot, p2_rot));
    if (juggler_delay === 0) {
      rotations.add(asString(p2_rot, p1_rot));
    } else {
      const p1_new_rot = p1_rot.slice(1).concat(p1_rot.slice(0, 1));
      rotations.add(asString(p2_rot, p1_new_rot));
    }
  }
  return Array.from(rotations);
}

/**
 * Generates synchronous symmetric passing patterns based on given options.
 *
 * @param options - The complete set of parameters for the generator.
 * @returns Array of pattern strings.
 */
export function generateSyncPassing(options: SyncPassingOptions): string[] {
  if (options.period % 2 !== 0) {
    throw new Error('Period must be an even number.');
  }

  const internalOptions: InternalOptions = {
    balls: options.balls,
    period: options.period,
    max_throw: options.maxThrow,
    filter_zeros: options.filterZeros ?? false,
    filter_twos: options.filterTwos ?? false,
    filter_1p: options.filter1p ?? false,
    filter_2p: options.filter2p ?? false,
    filter_fake_sync: options.filterFakeSync ?? false,
    filter_wimpy: options.filterWimpy ?? false,
    filter_collisiony: options.filterCollisiony ?? false,
    self_modification: options.selfModification ?? 'none',
    pass_modification: options.passModification ?? 'none',
    delays_to_check: [0, 1],
  };

  if (options.syncMode === 'full-sync') {
    internalOptions.delays_to_check = [0];
  } else if (options.syncMode === 'sync-async') {
    internalOptions.delays_to_check = [1];
  } else {
    internalOptions.delays_to_check = [0, 1];
  }

  const j1_candidates = generateJ1Candidates(
    internalOptions.balls,
    internalOptions.period,
    internalOptions.max_throw,
    internalOptions
  );

  const all_solutions: Solution[] = [];
  for (const p1 of j1_candidates) {
    all_solutions.push(
      ...findSolutionsForCandidate(p1, internalOptions.period, internalOptions)
    );
  }

  const seen = new Set<string>();
  const finalResults: string[] = [];
  for (const {p1, p2, juggler_delay} of all_solutions) {
    if (internalOptions.filter_fake_sync && isFakeSync(p1, p2)) continue;
    if (internalOptions.filter_wimpy && (isWimpy(p1) || isWimpy(p2))) continue;
    if (
      internalOptions.filter_collisiony &&
      juggler_delay === 0 &&
      isCollisiony(p1, p2, internalOptions.period)
    )
      continue;

    const ss_str = asString(p1, p2);
    if (!seen.has(ss_str)) {
      const equiv = equivalentRotations(p1, p2, juggler_delay);
      const best = equiv.sort()[equiv.length - 1]; // Choose a canonical representation

      const outputStr = juggler_delay === 1 ? `{0,1}${best}` : best;
      finalResults.push(outputStr);
      equiv.forEach(e => seen.add(e));
    }
  }

  return finalResults.sort();
}
