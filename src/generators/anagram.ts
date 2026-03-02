/**
 * Anagram generator
 * Finds all valid, unique anagrams of a given siteswap.
 * Uses recursive backtracking with pruning.
 */

import {intToSS, ssToInt} from '../common';

const MAX_HEIGHT = 36; // 'z' corresponds to 35

export interface AnagramResult {
  count: number;
  anagrams: string[];
  error: string | null;
}

/**
 * The main recursive function to find anagrams.
 * This is an internal helper function.
 */
function getAnagrams(
  ss: number[],
  options: number[],
  lands: boolean[],
  minRot: number,
  done: number,
  period: number,
  shouldPrint: boolean,
  results: AnagramResult
): void {
  const f = ss[0]; // The very first throw of this permutation.

  for (let i = 0; i < MAX_HEIGHT; i++) {
    // Pruning Checks
    if (
      options[i] === 0 ||
      lands[(i + done) % period] ||
      (minRot !== -1 && i > ss[minRot])
    ) {
      continue;
    }

    ss[done] = i;

    let newMinRot: number;
    if (minRot === -1) {
      newMinRot = i === f ? 1 : -1;
    } else {
      if (i < ss[minRot]) {
        newMinRot = -1;
      } else {
        newMinRot = minRot + 1;
      }
    }

    if (done + 1 === period) {
      let good = true;
      if (newMinRot !== -1) {
        for (let j = 0; j < period; j++) {
          if (ss[j] > ss[newMinRot]) {
            good = false;
            break;
          } else if (ss[j] < ss[newMinRot]) {
            break;
          }
          newMinRot = (newMinRot + 1) % period;
        }
      }
      if (good) {
        results.count++;
        if (shouldPrint) {
          results.anagrams.push(ss.map(intToSS).join(''));
        }
      }
    } else {
      options[i]--;
      lands[(i + done) % period] = true;
      getAnagrams(
        ss,
        options,
        lands,
        newMinRot,
        done + 1,
        period,
        shouldPrint,
        results
      );
      options[i]++; // Backtrack
      lands[(i + done) % period] = false;
    }
  }
}

/**
 * Finds all unique, valid anagrams for a given siteswap string.
 *
 * @param siteswapString - The input siteswap (e.g., "741").
 * @param countOnly - If true, only count anagrams without storing them
 * @returns An object with { count, anagrams, error }.
 */
export function findAnagrams(
  siteswapString: string,
  countOnly = false
): AnagramResult {
  if (!siteswapString || siteswapString.trim().length === 0) {
    return {count: 0, anagrams: [], error: 'Please enter a siteswap.'};
  }

  const ssString = siteswapString.trim().toLowerCase();
  const period = ssString.length;

  const options = new Array<number>(MAX_HEIGHT).fill(0);
  let siteswapSum = 0;

  try {
    for (let i = 0; i < period; i++) {
      const val = ssToInt(ssString[i]);
      options[val]++;
      siteswapSum += val;
    }
  } catch (e) {
    return {
      count: 0,
      anagrams: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (siteswapSum % period !== 0) {
    return {
      count: 0,
      anagrams: [],
      error: `Invalid siteswap: The sum of throws (${siteswapSum}) is not divisible by the period (${period}).`,
    };
  }

  let firstThrow = -1;
  for (let i = MAX_HEIGHT - 1; i >= 0; i--) {
    if (options[i] > 0) {
      firstThrow = i;
      break;
    }
  }

  if (firstThrow === -1) {
    return {count: 0, anagrams: [], error: 'No throws found in siteswap.'};
  }

  const results: AnagramResult = {
    count: 0,
    anagrams: [],
    error: null,
  };
  const shouldPrint = !countOnly;

  if (period === 1) {
    results.count = 1;
    if (shouldPrint) results.anagrams.push(ssString);
    return results;
  }

  options[firstThrow]--;

  const siteswap = new Array<number>(period).fill(0);
  siteswap[0] = firstThrow;

  const lands = new Array<boolean>(period).fill(false);
  lands[firstThrow % period] = true;

  getAnagrams(siteswap, options, lands, -1, 1, period, shouldPrint, results);

  return results;
}
