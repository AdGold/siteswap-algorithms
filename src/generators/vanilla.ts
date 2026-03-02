/**
 * Vanilla siteswap generator
 * Simple wrapper around n-handed generator with hands=2
 */

import {Filter, generateNHandedSiteswaps} from './n-handed';

export interface VanillaOptions {
  balls: number;
  period: number;
  maxThrow?: number;
  includeThrows?: number[];
  excludeThrows?: number[];
  filters?: Filter[];
}

/**
 * Generates all valid vanilla (2-handed) siteswaps for given parameters.
 *
 * @param options - Generation options
 * @returns Array of siteswap strings
 */
export function generateVanillaSiteswaps(options: VanillaOptions): string[] {
  return generateNHandedSiteswaps({...options, hands: 2});
}
