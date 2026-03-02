/**
 * Internal utility functions for siteswap-algorithms.
 * intToSS/ssToInt are small converters needed by every generator;
 * keeping them local avoids adding them to universal-siteswap's public API.
 */

export function intToSS(n: number): string {
  if (0 <= n && n < 10) {
    return n.toString();
  } else if (10 <= n && n < 36) {
    return String.fromCharCode('a'.charCodeAt(0) + n - 10);
  }
  throw new Error('Only siteswaps up to height 35 are accepted');
}

export function ssToInt(ss: string): number {
  if (ss.length === 1) {
    if ('0' <= ss && ss <= '9') {
      return parseInt(ss);
    } else if ('a' <= ss && ss <= 'z') {
      return ss.charCodeAt(0) - 'a'.charCodeAt(0) + 10;
    }
  }
  throw new Error('Unknown siteswap throw "' + ss + '"');
}
