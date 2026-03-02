// auto-fix.ts
// Auto-fix suggestions for invalid siteswaps.
//
// To add a new heuristic, add an entry to the HEURISTICS array below.
// Each heuristic has:
//   name        - unique string id
//   description - human-readable description for developers
//   applies(input) -> bool  - whether to run this heuristic for the given input
//   suggest(input, isValid) -> Fix[]  - array of { pattern, description } objects
//
// All heuristics are always run; duplicates are automatically deduplicated.

import { VanillaSiteswap } from 'universal-siteswap';
import { findAnagrams } from './generators/anagram';

// ---- Constants (easy to adjust) ----

/** Maximum period to attempt anagram search (exclusive upper bound) */
export const MAX_ANAGRAM_PERIOD = 15;

/** Absolute maximum throw height to try (overridden downward by MAX_HEIGHT_MARGIN) */
export const MAX_THROW_HEIGHT = 20;

/** Max height above the pattern's own max throw to suggest (keeps fixes realistic) */
export const MAX_HEIGHT_MARGIN = 2;

/** Maximum anagram suggestions to include */
export const MAX_ANAGRAM_RESULTS = 50;

/** Maximum number of fix suggestions to return */
export const MAX_FIXES = 10;


// ---- Types ----

export interface Fix {
    pattern: string;
    description: string;
    _dist?: number;
}

export interface Heuristic {
    name: string;
    description: string;
    applies(input: string): boolean;
    suggest(input: string, isValid: (pattern: string) => boolean): Fix[];
}

export interface PrefixInfo {
    prefix: string;
    base: string;
    type: string;
    hands: number;
}


// ---- Utilities ----

/** Convert integer throw height to siteswap character */
function intToSS(n: number): string | null {
    if (n >= 0 && n < 10) return String(n);
    if (n >= 10 && n < 36) return String.fromCharCode('a'.charCodeAt(0) + n - 10);
    return null;
}

/** Convert siteswap character to integer throw height, or null if invalid */
function ssToInt(c: string): number | null {
    if (c >= '0' && c <= '9') return parseInt(c, 10);
    const lc = c.toLowerCase();
    if (lc >= 'a' && lc <= 'z') return lc.charCodeAt(0) - 'a'.charCodeAt(0) + 10;
    return null;
}

/** Returns true if a string is a simple vanilla sequence: only base-36 chars, no prefixes/sync/multiplex */
function isSimpleVanillaInput(str: string): boolean {
    return str.length > 0 && /^[0-9a-z]+$/i.test(str);
}

/**
 * Parse an optional prefix from the input, returning the prefix and base pattern.
 * Supported prefixes: N@ (n-handed global), NL@ (n-handed local), $ (stack).
 */
export function parsePrefix(input: string): PrefixInfo {
    const localMatch = input.match(/^(\d+)L@(.+)$/i);
    if (localMatch) return { prefix: localMatch[1] + 'L@', base: localMatch[2], type: 'nhanded-local', hands: parseInt(localMatch[1]) };

    const nhandedMatch = input.match(/^(\d+)@(.+)$/i);
    if (nhandedMatch) return { prefix: nhandedMatch[1] + '@', base: nhandedMatch[2], type: 'nhanded', hands: parseInt(nhandedMatch[1]) };

    const stackMatch = input.match(/^\$(.+)$/);
    if (stackMatch) return { prefix: '$', base: stackMatch[1], type: 'stack', hands: 2 };

    return { prefix: '', base: input, type: 'vanilla', hands: 2 };
}

/** Parse a simple vanilla string to an array of integer throw heights */
function parseSimpleVanillaThrows(str: string): number[] {
    return [...str].map(ssToInt).filter((n): n is number => n !== null);
}


// ---- Heuristics ----

export const HEURISTICS: Heuristic[] = [
    // --- PRIORITY: local/global swap (first so it appears first in results) ---
    {
        name: 'local-global-swap',
        description: 'Try interpreting as local vs global N-handed (swap NL@ ↔ N@)',
        applies(input) {
            return /^\d+(L?)@/i.test(input);
        },
        suggest(input, isValid) {
            const { prefix, base, type, hands } = parsePrefix(input);
            if (type === 'nhanded') {
                const candidate = `${hands}L@${base}`;
                return isValid(candidate) ? [{ pattern: candidate, description: `Interpreted as ${hands}L@ (local/one-juggler view)` }] : [];
            } else if (type === 'nhanded-local') {
                const candidate = `${hands}@${base}`;
                return isValid(candidate) ? [{ pattern: candidate, description: `Interpreted as ${hands}@ (global view)` }] : [];
            }
            return [];
        },
    },

    // --- String-level fixes ---
    {
        name: 'add-star',
        description: 'Try appending * to alternate the pattern (common fix for sync patterns)',
        applies(input) {
            return !input.endsWith('*');
        },
        suggest(input, isValid) {
            const candidate = input + '*';
            return isValid(candidate) ? [{ pattern: candidate, description: 'Added *' }] : [];
        },
    },

    {
        name: 'space-before-x',
        description: 'Add space before x modifiers for disambiguation',
        applies(input) {
            return /x/i.test(input);
        },
        suggest(input, isValid) {
            const candidate = input.replace(/(?<=\S)(x)/gi, ' $1').trim();
            if (candidate === input) return [];
            return isValid(candidate) ? [{ pattern: candidate, description: 'Added space before x' }] : [];
        },
    },

    {
        name: 'space-before-rl',
        description: 'Add space before R/L hand indicators for disambiguation',
        applies(input) {
            return /[RL]/i.test(input);
        },
        suggest(input, isValid) {
            const candidate = input.replace(/(?<=[^\s@])([RL])/gi, ' $1').trim();
            if (candidate === input) return [];
            return isValid(candidate) ? [{ pattern: candidate, description: 'Added space before R/L' }] : [];
        },
    },

    // --- Sync-pattern fixes ---
    {
        name: 'flip-sync-pair',
        description: 'Swap left and right throws in each sync pair: (A,B) → (B,A)',
        applies(input) {
            return /\([^,()]+,[^,()]+\)/.test(input);
        },
        suggest(input, isValid) {
            const candidate = input.replace(/\(([^,()]+),([^,()]+)\)/g, '($2,$1)');
            if (candidate === input) return [];
            return isValid(candidate) ? [{ pattern: candidate, description: 'Swapped L/R in sync pair' }] : [];
        },
    },

    // --- Sync throw-level fixes ---
    {
        name: 'sync-throw-changes',
        description: 'Try changing individual throws within sync beats (height ±2, toggle x)',
        applies(input) {
            return /\([^,()]+,[^,()]+\)/.test(input) && !/^\d+(L?)@/i.test(input);
        },
        suggest(input, isValid) {
            const hasStar = input.endsWith('*');
            const core = hasStar ? input.slice(0, -1) : input;

            const beatRegex = /\(([^,()]+),([^,()]+)\)/g;
            const beats: { full: string; rh: string; lh: string }[] = [];
            let m: RegExpExecArray | null;
            while ((m = beatRegex.exec(core)) !== null) {
                beats.push({ full: m[0], rh: m[1].trim(), lh: m[2].trim() });
            }
            if (beats.length === 0) return [];

            function parseThrow(spec: string): { h: number; x: boolean } | null {
                const mt = spec.match(/^(\d+)(x?)$/i);
                return mt ? { h: parseInt(mt[1]), x: !!mt[2] } : null;
            }

            let patternMax = 0;
            for (const beat of beats) {
                const rh = parseThrow(beat.rh);
                const lh = parseThrow(beat.lh);
                if (rh) patternMax = Math.max(patternMax, rh.h);
                if (lh) patternMax = Math.max(patternMax, lh.h);
            }
            const ceiling = Math.min(MAX_THROW_HEIGHT, patternMax + MAX_HEIGHT_MARGIN * 2);

            const fixes: Fix[] = [];
            const seen = new Set<string>();

            for (let bi = 0; bi < beats.length; bi++) {
                for (const side of ['rh', 'lh'] as const) {
                    const orig = parseThrow(beats[bi][side]);
                    if (!orig) continue;

                    for (let h = 0; h <= ceiling; h += 2) {
                        for (const toggleX of [false, true]) {
                            const newX = toggleX ? !orig.x : orig.x;
                            if (h === orig.h && newX === orig.x) continue;

                            const newThrowStr = `${h}${newX ? 'x' : ''}`;
                            const newBeat = side === 'rh'
                                ? `(${newThrowStr},${beats[bi].lh})`
                                : `(${beats[bi].rh},${newThrowStr})`;
                            const newBeats = beats.map((b, i) => i === bi ? newBeat : b.full);
                            const candidate = newBeats.join('') + (hasStar ? '*' : '');

                            if (seen.has(candidate) || candidate === input) continue;
                            seen.add(candidate);

                            if (isValid(candidate)) {
                                const dist = Math.abs(h - orig.h) + (newX !== orig.x ? 0.5 : 0);
                                fixes.push({
                                    pattern: candidate,
                                    description: `Change ${side === 'rh' ? 'RH' : 'LH'} throw from ${orig.h}${orig.x ? 'x' : ''} to ${h}${newX ? 'x' : ''}`,
                                    _dist: dist,
                                });
                            }
                        }
                    }
                }
            }

            fixes.sort((a, b) => (a._dist ?? 0) - (b._dist ?? 0) || a.pattern.localeCompare(b.pattern));
            return fixes;
        },
    },

    // --- Vanilla throw-level fixes ---
    {
        name: 'swap-adjacent',
        description: 'Try swapping each pair of adjacent throws',
        applies(input) {
            const { base } = parsePrefix(input);
            return isSimpleVanillaInput(base) && base.length >= 2;
        },
        suggest(input, isValid) {
            const { prefix, base } = parsePrefix(input);
            const throws = parseSimpleVanillaThrows(base);
            if (throws.length < 2) return [];

            const fixes: Fix[] = [];
            const seen = new Set<string>();

            for (let i = 0; i < throws.length - 1; i++) {
                if (throws[i] === throws[i + 1]) continue;
                const newThrows = [...throws];
                [newThrows[i], newThrows[i + 1]] = [newThrows[i + 1], newThrows[i]];
                const chars = newThrows.map(intToSS);
                if (chars.some(c => c === null)) continue;
                const newBase = (chars as string[]).join('');
                if (seen.has(newBase)) continue;
                seen.add(newBase);
                const candidate = prefix + newBase;
                if (isValid(candidate)) {
                    fixes.push({ pattern: candidate, description: `Swap throws ${i + 1} and ${i + 2}` });
                }
            }

            return fixes;
        },
    },

    {
        name: 'single-throw-changes',
        description: 'Try changing one throw by a small amount to fix a collision or average',
        applies(input) {
            const { base } = parsePrefix(input);
            return isSimpleVanillaInput(base);
        },
        suggest(input, isValid) {
            const { prefix, base } = parsePrefix(input);
            const throws = parseSimpleVanillaThrows(base);
            if (throws.length === 0) return [];

            const patternMax = Math.max(...throws);
            const maxHeight = Math.min(MAX_THROW_HEIGHT, patternMax + MAX_HEIGHT_MARGIN);

            const fixes: Fix[] = [];
            const seen = new Set<string>();

            for (let i = 0; i < throws.length; i++) {
                for (let h = 0; h <= maxHeight; h++) {
                    if (h === throws[i]) continue;
                    const newThrows = [...throws];
                    newThrows[i] = h;
                    const chars = newThrows.map(intToSS);
                    if (chars.some(c => c === null)) continue;
                    const newBase = (chars as string[]).join('');
                    if (seen.has(newBase)) continue;
                    seen.add(newBase);
                    const candidate = prefix + newBase;

                    let valid = false;
                    if (prefix) {
                        valid = isValid(candidate);
                    } else {
                        try {
                            const vs = VanillaSiteswap.Parse(newBase);
                            valid = vs.isValid;
                        } catch { /* skip */ }
                    }

                    if (valid) {
                        const dist = Math.abs(h - throws[i]);
                        fixes.push({ pattern: candidate, description: `Change throw ${i + 1} from ${intToSS(throws[i])} to ${intToSS(h)}`, _dist: dist });
                    }
                }
            }

            fixes.sort((a, b) => (a._dist ?? 0) - (b._dist ?? 0) || a.pattern.localeCompare(b.pattern));
            return fixes;
        },
    },

    {
        name: 'anagrams',
        description: 'Find valid rearrangements of the same throws',
        applies(input) {
            const { base } = parsePrefix(input);
            if (!isSimpleVanillaInput(base)) return false;
            const throws = parseSimpleVanillaThrows(base);
            const period = throws.length;
            if (period === 0 || period >= MAX_ANAGRAM_PERIOD) return false;
            const total = throws.reduce((a, b) => a + b, 0);
            return total % period === 0;
        },
        suggest(input, isValid) {
            const { prefix, base } = parsePrefix(input);
            const result = findAnagrams(base, false);
            if (result.error || !result.anagrams) return [];

            return result.anagrams
                .filter(a => a !== base)
                .slice(0, MAX_ANAGRAM_RESULTS)
                .map(a => {
                    const candidate = prefix + a;
                    if (prefix && !isValid(candidate)) return null;
                    return { pattern: candidate, description: 'Anagram' };
                })
                .filter((x): x is Fix => x !== null);
        },
    },
];


// ---- Deduplication helpers ----

/**
 * Returns the lexicographically smallest cyclic rotation of a string.
 */
function canonicalRotation(str: string): string {
    if (str.length <= 1) return str;
    let canonical = str;
    for (let i = 1; i < str.length; i++) {
        const rot = str.slice(i) + str.slice(0, i);
        if (rot < canonical) canonical = rot;
    }
    return canonical;
}

/**
 * Returns a rotation-deduplication key for a pattern, or null if not applicable.
 */
function rotationKey(pattern: string): string | null {
    const { prefix, base } = parsePrefix(pattern);
    if (!isSimpleVanillaInput(base)) return null;
    return `${prefix}\0${canonicalRotation(base)}`;
}


// ---- Main export ----

/**
 * Run all applicable heuristics and return up to MAX_FIXES deduplicated suggestions.
 *
 * @param userInput - The siteswap string entered by the user (may be invalid)
 * @param isValid   - Function that returns true if a pattern string is a valid siteswap
 */
export async function findFixes(
    userInput: string,
    isValid: (pattern: string) => boolean,
): Promise<Fix[]> {
    const seen = new Set<string>();
    const rotSeen = new Set<string>();

    function isNew(pattern: string): boolean {
        if (seen.has(pattern)) return false;
        const rk = rotationKey(pattern);
        return rk === null || !rotSeen.has(rk);
    }

    function markSeen(pattern: string): void {
        seen.add(pattern);
        const rk = rotationKey(pattern);
        if (rk !== null) rotSeen.add(rk);
    }

    markSeen(userInput);

    const buckets: Fix[][] = [];
    for (const heuristic of HEURISTICS) {
        try {
            if (!heuristic.applies(userInput)) continue;
            const suggestions = heuristic.suggest(userInput, isValid);
            const bucket: Fix[] = [];
            for (const s of suggestions) {
                if (isNew(s.pattern)) {
                    markSeen(s.pattern);
                    bucket.push({ pattern: s.pattern, description: s.description });
                }
            }
            if (bucket.length > 0) buckets.push(bucket);
        } catch {
            // Never let a broken heuristic break the whole feature
        }
    }

    const fixes: Fix[] = [];
    for (let i = 0; fixes.length < MAX_FIXES; i++) {
        let anyLeft = false;
        for (const bucket of buckets) {
            if (fixes.length >= MAX_FIXES) break;
            if (i < bucket.length) {
                fixes.push(bucket[i]);
                anyLeft = true;
            }
        }
        if (!anyLeft) break;
    }

    return fixes;
}
