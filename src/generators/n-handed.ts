/**
 * N-handed siteswap generator
 * Generates all valid N-handed (KHSS) siteswaps for a given number of balls and period.
 * Based on stack notation enumeration algorithm.
 *
 * This is the unified generator - vanilla siteswaps are just 2-handed KHSS.
 * Supports advanced filtering by pattern matching, throw counts, etc.
 */

import {intToSS, ssToInt} from '../common';
import {stackToSiteswap} from 'universal-siteswap';

// Filter types
export interface PatternFilter {
  type?: 'pattern-global' | 'pattern-local'; // Defaults to 'pattern-global'
  pattern: string;
  mode: 'include' | 'exclude';
}

export interface ThrowCountFilter {
  type: 'throw-count';
  throw: string;
  comparison: 'exactly' | 'at-least' | 'at-most';
  count: number;
}

export interface ThrowsFilter {
  type: 'exclude-throws' | 'include-throws';
  throws: string;
}

export type Filter = PatternFilter | ThrowCountFilter | ThrowsFilter;

export interface NHandedOptions {
  balls: number;
  period: number;
  hands?: number;
  maxThrow?: number;
  includeThrows?: number[];
  excludeThrows?: number[];
  filterFakeNHanded?: boolean;
  filters?: Filter[];
}

interface PatternMatcher {
  type: 'exact' | 'pass' | 'self' | 'any';
  value?: number;
}

/**
 * Check if siteswap is in its maximum cyclic rotation (to prevent duplicates)
 */
function isMaxRotation(ss: number[]): boolean {
  const period = ss.length;
  for (let i = 0; i < period; i++) {
    for (let j = 0; j < period; j++) {
      const a = ss[(j + i) % period];
      if (ss[j] > a) break;
      else if (a > ss[j]) return false;
    }
  }
  return true;
}

/**
 * Check if all throws are divisible by a given number (making it a "fake" n-handed pattern)
 */
function allDivisibleBy(ss: number[], divisor: number): boolean {
  return ss.every(t => t % divisor === 0);
}

/**
 * Parse a throw character to a number (0-9, a-z = 10-35)
 * Uses ssToInt from common.ts but returns null instead of throwing.
 */
function parseThrowChar(char: string): number | null {
  try {
    return ssToInt(char.toLowerCase());
  } catch {
    return null;
  }
}

/**
 * Parse a filter pattern string into an array of matchers
 * Each matcher is either: a number (exact throw), 'p' (pass), 's' (self), '?' (any)
 */
function parseFilterPattern(pattern: string, _hands: number): PatternMatcher[] {
  const matchers: PatternMatcher[] = [];
  for (const char of pattern.toLowerCase()) {
    if (char === 'p') {
      matchers.push({type: 'pass'});
    } else if (char === 's') {
      matchers.push({type: 'self'});
    } else if (char === '?') {
      matchers.push({type: 'any'});
    } else {
      const val = parseThrowChar(char);
      if (val !== null) {
        matchers.push({type: 'exact', value: val});
      }
    }
  }
  return matchers;
}

/**
 * Check if a throw matches a matcher
 */
function throwMatches(
  throwVal: number,
  matcher: PatternMatcher,
  hands: number
): boolean {
  const divisor = hands / 2;
  const isPass = throwVal % divisor !== 0;

  switch (matcher.type) {
    case 'exact':
      return throwVal === matcher.value;
    case 'pass':
      return isPass;
    case 'self':
      return !isPass;
    case 'any':
      return true;
    default:
      return false;
  }
}

/**
 * Check if pattern appears in siteswap (with wrap-around)
 */
function patternAppearsIn(
  ss: number[],
  matchers: PatternMatcher[],
  hands: number
): boolean {
  if (matchers.length === 0) return true;
  if (matchers.length > ss.length) return false;

  const period = ss.length;
  // Check each starting position (with wrap-around)
  for (let start = 0; start < period; start++) {
    let matches = true;
    for (let i = 0; i < matchers.length; i++) {
      const throwVal = ss[(start + i) % period];
      if (!throwMatches(throwVal, matchers[i], hands)) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

/**
 * Get local siteswap for a specific juggler (every Nth throw starting from juggler index)
 */
function getLocalPattern(
  ss: number[],
  hands: number,
  jugglerIndex = 0
): number[] {
  const numJugglers = hands / 2;
  const local: number[] = [];
  for (let i = jugglerIndex; i < ss.length; i += numJugglers) {
    local.push(ss[i]);
  }
  return local;
}

/**
 * Count occurrences of throws matching a condition
 */
function countThrows(ss: number[], throwSpec: string, hands: number): number {
  const spec = throwSpec.toLowerCase();
  const divisor = hands / 2;

  if (spec === 'p') {
    return ss.filter(t => t % divisor !== 0).length;
  } else if (spec === 's') {
    return ss.filter(t => t % divisor === 0).length;
  } else {
    const val = parseThrowChar(spec);
    if (val !== null) {
      return ss.filter(t => t === val).length;
    }
  }
  return 0;
}

/**
 * Parse comma-separated throw list to Set of numbers
 */
function parseThrowList(str: string): Set<number> {
  const set = new Set<number>();
  for (const part of str.split(',')) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed) {
      const val = parseThrowChar(trimmed);
      if (val !== null) set.add(val);
    }
  }
  return set;
}

/**
 * Apply filters to a siteswap
 */
function passesFilters(
  ss: number[],
  filters: Filter[],
  hands: number
): boolean {
  if (!filters || filters.length === 0) return true;

  for (const filter of filters) {
    // Default type is 'pattern-global' for PatternFilter
    const filterType = filter.type ?? 'pattern-global';
    switch (filterType) {
      case 'pattern-global': {
        const pf = filter as PatternFilter;
        const matchers = parseFilterPattern(pf.pattern, hands);
        const found = patternAppearsIn(ss, matchers, hands);
        if (pf.mode === 'include' && !found) return false;
        if (pf.mode === 'exclude' && found) return false;
        break;
      }
      case 'pattern-local': {
        const pf = filter as PatternFilter;
        const matchers = parseFilterPattern(pf.pattern, hands);
        const numJugglers = hands / 2;
        let foundInAny = false;
        for (let j = 0; j < numJugglers; j++) {
          const local = getLocalPattern(ss, hands, j);
          if (patternAppearsIn(local, matchers, hands)) {
            foundInAny = true;
            break;
          }
        }
        if (pf.mode === 'include' && !foundInAny) return false;
        if (pf.mode === 'exclude' && foundInAny) return false;
        break;
      }
      case 'throw-count': {
        const tcf = filter as ThrowCountFilter;
        const count = countThrows(ss, tcf.throw, hands);
        switch (tcf.comparison) {
          case 'exactly':
            if (count !== tcf.count) return false;
            break;
          case 'at-least':
            if (count < tcf.count) return false;
            break;
          case 'at-most':
            if (count > tcf.count) return false;
            break;
        }
        break;
      }
      case 'exclude-throws': {
        const tf = filter as ThrowsFilter;
        const excluded = parseThrowList(tf.throws);
        if (ss.some(t => excluded.has(t))) return false;
        break;
      }
      case 'include-throws': {
        const tf = filter as ThrowsFilter;
        const included = parseThrowList(tf.throws);
        if (included.size > 0 && ss.some(t => !included.has(t))) return false;
        break;
      }
    }
  }
  return true;
}

/**
 * Generates all valid N-handed (KHSS) siteswaps for given parameters.
 * When hands=2, generates vanilla siteswaps without prefix.
 *
 * @param options - Generation options
 * @returns Array of siteswap strings (with n@ prefix if hands > 2)
 */
export function generateNHandedSiteswaps(options: NHandedOptions): string[] {
  const {balls, period} = options;
  const hands = options.hands ?? 2;
  const isVanilla = hands === 2;
  const maxThrow = options.maxThrow ?? balls + period + (isVanilla ? 0 : hands);
  // Only filter fake n-handed for hands > 2 by default
  const filterFakeNHanded = options.filterFakeNHanded ?? hands > 2;
  const divisor = hands / 2;
  const filters = options.filters || [];

  // Legacy include/exclude support
  const includeThrows = options.includeThrows?.length
    ? new Set(options.includeThrows)
    : null;
  const excludeThrows = options.excludeThrows?.length
    ? new Set(options.excludeThrows)
    : null;

  const results: string[] = [];
  const stack = new Array<number>(period);
  stack[0] = balls;

  function generate(pos: number): void {
    if (pos === period) {
      const ss = stackToSiteswap(stack);

      // Check max throw constraint
      if (ss.some(t => t > maxThrow)) return;

      // Check rotation (avoid duplicates)
      if (!isMaxRotation(ss)) return;

      // Legacy include/exclude filters
      if (includeThrows && ss.some(t => !includeThrows.has(t))) return;
      if (excludeThrows && ss.some(t => excludeThrows.has(t))) return;

      // Filter out "fake" n-handed patterns (all throws divisible by hands/2)
      if (filterFakeNHanded && allDivisibleBy(ss, divisor)) return;

      // Apply filters
      if (!passesFilters(ss, filters, hands)) return;

      // Convert to string (no prefix)
      const ssStr = ss.map(t => intToSS(t)).join('');
      results.push(ssStr);
      return;
    }

    for (let i = 0; i <= balls; i++) {
      stack[pos] = i;
      generate(pos + 1);
    }
  }

  generate(1);

  return results.sort((a, b) => a.localeCompare(b));
}
