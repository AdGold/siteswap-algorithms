import {
  generateVanillaSiteswaps,
  generateNHandedSiteswaps,
  findAnagrams,
  generateSyncPassing,
  generateSyncSiteswaps,
} from '../src/generators';

import * as chai from 'chai';

const expect = chai.expect;

describe('Generators', () => {
  describe('Vanilla siteswap generator', () => {
    it('generates correct 3-ball period-1 patterns', () => {
      const results = generateVanillaSiteswaps({balls: 3, period: 1});
      expect(results).to.deep.equal(['3']);
    });

    it('generates correct 3-ball period-3 patterns', () => {
      const results = generateVanillaSiteswaps({balls: 3, period: 3});
      expect(results).to.include.members(['423', '441', '531', '612', '333']);
    });

    it('generates 5-ball period-1 patterns', () => {
      const results = generateVanillaSiteswaps({balls: 5, period: 1});
      expect(results).to.deep.equal(['5']);
    });

    it('respects maxThrow option', () => {
      const results = generateVanillaSiteswaps({
        balls: 3,
        period: 3,
        maxThrow: 5,
      });
      expect(results).to.include('531');
      expect(results).to.not.include('612');
      expect(results).to.not.include('720');
    });

    it('respects excludeThrows option', () => {
      const results = generateVanillaSiteswaps({
        balls: 3,
        period: 3,
        excludeThrows: [1, 2],
      });
      // 531, 612 have 1 or 2
      expect(results).to.not.include('531');
      expect(results).to.not.include('612');
      expect(results).to.include('333');
    });

    it('respects includeThrows option', () => {
      const results = generateVanillaSiteswaps({
        balls: 3,
        period: 3,
        includeThrows: [3, 4, 5],
      });
      // Only patterns using throws 3, 4, 5 are included
      // 333 is the only 3-ball period-3 pattern with only 3, 4, 5
      expect(results).to.deep.equal(['333']);
      // 441, 531, 612 all contain throws outside {3, 4, 5}
    });

    it('generates empty array for impossible parameters', () => {
      // 10 balls period 1 with max throw 5 is impossible
      const results = generateVanillaSiteswaps({
        balls: 10,
        period: 1,
        maxThrow: 5,
      });
      expect(results).to.deep.equal([]);
    });
  });

  describe('N-handed siteswap generator', () => {
    it('generates 2-handed patterns same as vanilla', () => {
      const vanilla = generateVanillaSiteswaps({balls: 3, period: 3});
      const nhanded = generateNHandedSiteswaps({balls: 3, period: 3, hands: 2});
      expect(nhanded).to.deep.equal(vanilla);
    });

    it('generates 4-handed patterns without prefix', () => {
      const results = generateNHandedSiteswaps({
        balls: 6,
        period: 2,
        hands: 4,
      });
      // Should not have any prefix
      expect(results.every(r => !r.includes('@'))).to.be.true;
      expect(results.length).to.be.greaterThan(0);
    });

    it('filters fake n-handed patterns by default for hands > 2', () => {
      // A fake 4-handed pattern would have all throws divisible by 2
      const results = generateNHandedSiteswaps({
        balls: 6,
        period: 2,
        hands: 4,
      });
      // Should not contain patterns where all throws are even
      for (const result of results) {
        const allEven = result.split('').every(c => parseInt(c, 36) % 2 === 0);
        expect(allEven).to.be.false;
      }
    });

    it('can include fake n-handed patterns when filterFakeNHanded is false', () => {
      const results = generateNHandedSiteswaps({
        balls: 6,
        period: 2,
        hands: 4,
        filterFakeNHanded: false,
      });
      // Now should have at least one pattern where all throws are even
      const hasFake = results.some(result => {
        return result.split('').every(c => parseInt(c, 36) % 2 === 0);
      });
      expect(hasFake).to.be.true;
    });

    it('supports advanced throw-count filter', () => {
      const results = generateNHandedSiteswaps({
        balls: 3,
        period: 3,
        hands: 2,
        filters: [
          {
            type: 'throw-count',
            throw: '3',
            comparison: 'exactly',
            count: 3,
          },
        ],
      });
      expect(results).to.deep.equal(['333']);
    });

    it('supports simplified filter syntax (defaults to pattern-global)', () => {
      // Simple syntax without type - defaults to pattern-global
      const results = generateNHandedSiteswaps({
        balls: 3,
        period: 3,
        hands: 2,
        filters: [{pattern: '53', mode: 'include'}],
      });
      expect(results).to.include('531');
      expect(results).to.not.include('333');
    });

    describe('pattern-global filter', () => {
      it('include mode filters to patterns containing the sequence', () => {
        const results = generateNHandedSiteswaps({
          balls: 5,
          period: 5,
          hands: 2,
          filters: [
            {type: 'pattern-global', pattern: '97', mode: 'include'},
          ],
        });
        expect(results).to.include('97531');
        // 91357 does not contain "97" consecutively
        expect(results).to.not.include('91357');
      });

      it('exclude mode filters out patterns containing the sequence', () => {
        const results = generateNHandedSiteswaps({
          balls: 5,
          period: 5,
          hands: 2,
          filters: [
            {type: 'pattern-global', pattern: '53', mode: 'exclude'},
          ],
        });
        // 97531 contains "53" so should be excluded
        expect(results).to.not.include('97531');
        // 91357 doesn't contain "53" consecutively
        expect(results).to.include('91357');
      });

      it('matches patterns that wrap around the end (e.g., "19" in 97531)', () => {
        // 97531: positions are 9,7,5,3,1 - "19" wraps from position 4 to position 0
        const results = generateNHandedSiteswaps({
          balls: 5,
          period: 5,
          hands: 2,
          filters: [
            {type: 'pattern-global', pattern: '19', mode: 'include'},
          ],
        });
        expect(results).to.include('97531');
      });

      it('exclude mode works with wrap-around patterns', () => {
        const results = generateNHandedSiteswaps({
          balls: 5,
          period: 5,
          hands: 2,
          filters: [
            {type: 'pattern-global', pattern: '19', mode: 'exclude'},
          ],
        });
        // 97531 has "19" wrapping, so should be excluded
        expect(results).to.not.include('97531');
      });

      it('handles longer wrap-around patterns', () => {
        // Test "319" which wraps in 97531 (3,1,9)
        const results = generateNHandedSiteswaps({
          balls: 5,
          period: 5,
          hands: 2,
          filters: [
            {type: 'pattern-global', pattern: '319', mode: 'include'},
          ],
        });
        expect(results).to.include('97531');
      });

      it('4-handed patterns with wrap-around', () => {
        // Generate 4-handed patterns and test wrap-around
        // 88577 has global sequence "88577" - "78" wraps from position 4 to 0
        const results = generateNHandedSiteswaps({
          balls: 7,
          period: 5,
          hands: 4,
          filters: [
            {type: 'pattern-global', pattern: '78', mode: 'include'},
          ],
        });
        expect(results).to.include('88577');
      });
    });

    describe('pattern-local filter', () => {
      it('include mode filters based on local (per-juggler) patterns', () => {
        // For 4-handed (2 jugglers), local patterns extract every 2nd throw
        // 95678: juggler 0 gets positions 0,2,4 = "968", juggler 1 gets positions 1,3 = "57"
        const results = generateNHandedSiteswaps({
          balls: 7,
          period: 5,
          hands: 4,
          filters: [
            {type: 'pattern-local', pattern: '57', mode: 'include'},
          ],
        });
        expect(results).to.include('95678');
      });

      it('exclude mode filters out patterns with matching local sequence', () => {
        const results = generateNHandedSiteswaps({
          balls: 7,
          period: 5,
          hands: 4,
          filters: [
            {type: 'pattern-local', pattern: '57', mode: 'exclude'},
          ],
        });
        // 95678 has local "57" for juggler 1, so should be excluded
        expect(results).to.not.include('95678');
      });

      it('matches local patterns that wrap around - rotations find same patterns', () => {
        // For 4-handed period 6, each juggler has a local of period 3
        // Test that filtering for "abc" and its rotation "cab" find the same patterns
        // because wrap-around matching should find "abc" in any rotation like "bca" or "cab"
        const withAbc = generateNHandedSiteswaps({
          balls: 6,
          period: 6,
          hands: 4,
          filters: [
            {type: 'pattern-local', pattern: '579', mode: 'include'},
          ],
        });
        const withRotation = generateNHandedSiteswaps({
          balls: 6,
          period: 6,
          hands: 4,
          filters: [
            {type: 'pattern-local', pattern: '795', mode: 'include'},
          ],
        });
        // Both rotations should find the same patterns due to wrap-around matching
        expect(withAbc).to.deep.equal(withRotation);
        expect(withAbc.length).to.be.greaterThan(0);
      });

      it('exclude mode works with local wrap-around', () => {
        // 95678 has local 0 = "968" - "89" wraps from position 2 to position 0
        const results = generateNHandedSiteswaps({
          balls: 7,
          period: 5,
          hands: 4,
          filters: [
            {type: 'pattern-local', pattern: '89', mode: 'exclude'},
          ],
        });
        expect(results).to.not.include('95678');
      });

      it('matches if any juggler has the local pattern', () => {
        // 95678 has local 0 = "968", local 1 = "57"
        // Filtering for "68" should match via juggler 0's local
        const results = generateNHandedSiteswaps({
          balls: 7,
          period: 5,
          hands: 4,
          filters: [
            {type: 'pattern-local', pattern: '68', mode: 'include'},
          ],
        });
        expect(results).to.include('95678');
      });

      it('2-handed local is same as global', () => {
        // For 2-handed (1 juggler), local = global
        const globalResults = generateNHandedSiteswaps({
          balls: 5,
          period: 5,
          hands: 2,
          filters: [
            {type: 'pattern-global', pattern: '97', mode: 'include'},
          ],
        });
        const localResults = generateNHandedSiteswaps({
          balls: 5,
          period: 5,
          hands: 2,
          filters: [
            {type: 'pattern-local', pattern: '97', mode: 'include'},
          ],
        });
        expect(localResults).to.deep.equal(globalResults);
      });
    });

    describe('throws filter', () => {
      it('exclude-throws filters out patterns with specified throws', () => {
        const results = generateNHandedSiteswaps({
          balls: 3,
          period: 3,
          hands: 2,
          filters: [{type: 'exclude-throws', throws: '1,2'}],
        });
        expect(results).to.not.include('531');
        expect(results).to.not.include('612');
        expect(results).to.include('333');
      });

      it('include-throws filters to only patterns with specified throws', () => {
        const results = generateNHandedSiteswaps({
          balls: 3,
          period: 3,
          hands: 2,
          filters: [{type: 'include-throws', throws: '3,4,5'}],
        });
        expect(results).to.deep.equal(['333']);
      });
    });

    describe('generated patterns verification', () => {
      // These tests verify specific generated patterns for manual checking
      it('vanilla 3 balls period 3', () => {
        const results = generateVanillaSiteswaps({balls: 3, period: 3});
        expect(results).to.deep.equal([
          '333', '423', '441', '504', '522', '531', '603', '612', '630',
        ]);
      });

      it('vanilla 4 balls period 2', () => {
        const results = generateVanillaSiteswaps({balls: 4, period: 2});
        expect(results).to.deep.equal(['44', '53', '62']);
      });

      it('vanilla 5 balls period 3', () => {
        const results = generateVanillaSiteswaps({balls: 5, period: 3});
        expect(results).to.deep.equal([
          '555', '645', '663', '726', '744', '753',
          '771', '807', '825', '834', '852', '861',
        ]);
      });

      it('4-handed 6 balls period 2', () => {
        const results = generateNHandedSiteswaps({balls: 6, period: 2, hands: 4});
        expect(results).to.deep.equal(['75', '93', 'b1']);
      });

      it('4-handed 7 balls period 3', () => {
        const results = generateNHandedSiteswaps({balls: 7, period: 3, hands: 4});
        expect(results).to.deep.equal([
          '777', '867', '885', '948', '966', '975', '993',
          'a29', 'a47', 'a56', 'a74', 'a83', 'aa1',
          'b0a', 'b28', 'b37', 'b55', 'b64', 'b82', 'b91',
          'c09', 'c18', 'c36', 'c45', 'c63', 'c72', 'c90',
          'd17', 'd26', 'd44', 'd53', 'd71', 'd80',
          'e07', 'e25', 'e34', 'e52', 'e61',
        ]);
      });

      it('6-handed 9 balls period 2', () => {
        const results = generateNHandedSiteswaps({balls: 9, period: 2, hands: 6});
        expect(results).to.deep.equal(['a8', 'b7', 'd5', 'e4', 'g2', 'h1']);
      });

      it('filter include pattern 53', () => {
        const results = generateVanillaSiteswaps({
          balls: 3,
          period: 3,
          filters: [{pattern: '53', mode: 'include'}],
        });
        expect(results).to.deep.equal(['531']);
      });

      it('filter exclude throw 7', () => {
        const results = generateVanillaSiteswaps({
          balls: 5,
          period: 3,
          filters: [{type: 'exclude-throws', throws: '7'}],
        });
        expect(results).to.deep.equal([
          '555', '645', '663', '825', '834', '852', '861',
        ]);
      });

      it('4-handed 6 balls period 5 with local 95 include', () => {
        // Local patterns: e.g. 92577 has local0=957, local1=27 - contains 95
        const results = generateNHandedSiteswaps({
          balls: 6,
          period: 5,
          hands: 4,
          filters: [{type: 'pattern-local', pattern: '95', mode: 'include'}],
        });
        expect(results).to.deep.equal([
          '92577', '92586', '94557', '94584',
          '95394', '95556', '95574', '95691',
          '97527', '97536', '97572', '97581',
          '99057', '99453', '99507', '99534',
          '99552', 'a1955', 'a2945', 'a5195',
          'a5294', 'a5690', 'a6905', 'b9055',
          'b9253', 'b9550', 'c2925', 'c4905',
          'c9252', 'c9450', 'd1925', 'd5291',
          'd5390', 'e5191', 'e9052', 'f1905',
          'f5190',
        ]);
      });

      it('4-handed 6 balls period 5 with local 95 exclude', () => {
        const withInclude = generateNHandedSiteswaps({
          balls: 6,
          period: 5,
          hands: 4,
          filters: [{type: 'pattern-local', pattern: '95', mode: 'include'}],
        });
        const withExclude = generateNHandedSiteswaps({
          balls: 6,
          period: 5,
          hands: 4,
          filters: [{type: 'pattern-local', pattern: '95', mode: 'exclude'}],
        });
        const all = generateNHandedSiteswaps({balls: 6, period: 5, hands: 4});
        // Include + exclude should equal all patterns
        expect(withInclude.length + withExclude.length).to.equal(all.length);
        // No overlap
        for (const p of withInclude) {
          expect(withExclude).to.not.include(p);
        }
      });

      it('4-handed 7 balls period 5 with local 95 include', () => {
        // e.g. 95894 has local0=984, local1=59 - contains 95 (via wrap: 59->95)
        // e.g. 99458 has local0=948, local1=95 - contains 95 directly
        const results = generateNHandedSiteswaps({
          balls: 7,
          period: 5,
          hands: 4,
          filters: [{type: 'pattern-local', pattern: '95', mode: 'include'}],
        });
        expect(results).to.deep.equal([
          '95894', '97577', '97586', '99458',
          '99557', '99584', '99953', 'a2995',
          'a5299', 'a5695', 'a5794', 'a6955',
          'a7945', 'b905a', 'b9258', 'b9555',
          'b9753', 'b9a50', 'c2975', 'c4955',
          'c7925', 'c9257', 'c9455', 'c9752',
          'c9905', 'c9950', 'd1975', 'd4945',
          'd5296', 'd5395', 'd5791', 'd5890',
          'd6925', 'e5196', 'e5394', 'e5691',
          'e9057', 'e9453', 'e9552', 'f1955',
          'f2945', 'f5195', 'f5294', 'f5690',
          'f6905', 'g9055', 'g9253', 'g9550',
        ]);
      });

      it('4-handed 7 balls period 5 with local 95 exclude', () => {
        const withInclude = generateNHandedSiteswaps({
          balls: 7,
          period: 5,
          hands: 4,
          filters: [{type: 'pattern-local', pattern: '95', mode: 'include'}],
        });
        const withExclude = generateNHandedSiteswaps({
          balls: 7,
          period: 5,
          hands: 4,
          filters: [{type: 'pattern-local', pattern: '95', mode: 'exclude'}],
        });
        const all = generateNHandedSiteswaps({balls: 7, period: 5, hands: 4});
        // Include + exclude should equal all patterns
        expect(withInclude.length + withExclude.length).to.equal(all.length);
        expect(all.length).to.equal(1771);
        expect(withInclude.length).to.equal(48);
        expect(withExclude.length).to.equal(1723);
      });
    });
  });

  describe('Anagram finder', () => {
    it('finds all anagrams of 741 (without rotational duplicates)', () => {
      const result = findAnagrams('741');
      expect(result.error).to.be.null;
      // 741, 714 are the 2 unique patterns (417, 174 are rotations of 741; 147, 471 are rotations of 714)
      expect(result.count).to.equal(2);
      expect(result.anagrams).to.include.members(['741', '714']);
    });

    it('finds anagrams of 531 (without rotational duplicates)', () => {
      const result = findAnagrams('531');
      expect(result.error).to.be.null;
      // 531 is the only unique pattern (315 is a rotation)
      expect(result.count).to.equal(1);
      expect(result.anagrams).to.include.members(['531']);
    });

    it('returns single anagram for 333', () => {
      const result = findAnagrams('333');
      expect(result.error).to.be.null;
      expect(result.count).to.equal(1);
      expect(result.anagrams).to.deep.equal(['333']);
    });

    it('Test with rotations: 424233', () => {
      const result = findAnagrams('424233');
      expect(result.error).to.be.null;
      expect(result.count).to.equal(2);
      expect(result.anagrams).to.have.members(['424233', '423423']);
    });

    it('handles period 1 siteswap', () => {
      const result = findAnagrams('5');
      expect(result.error).to.be.null;
      expect(result.count).to.equal(1);
      expect(result.anagrams).to.deep.equal(['5']);
    });

    it('returns error for invalid siteswap', () => {
      const result = findAnagrams('421');
      expect(result.error).to.not.be.null;
      expect(result.count).to.equal(0);
    });

    it('returns error for empty input', () => {
      const result = findAnagrams('');
      expect(result.error).to.not.be.null;
      expect(result.count).to.equal(0);
    });

    it('countOnly mode returns count without anagrams', () => {
      const result = findAnagrams('741', true);
      expect(result.error).to.be.null;
      expect(result.count).to.equal(2);
      expect(result.anagrams).to.deep.equal([]);
    });

    it('handles larger siteswaps', () => {
      const result = findAnagrams('97531');
      expect(result.error).to.be.null;
      expect(result.count).to.equal(3);
      expect(result.anagrams).to.have.members(['97531', '91357', '95173']);
    });
  });

  describe('Sync siteswap generator', () => {
    describe('known patterns', () => {
      it('generates correct 3-ball period-1 patterns', () => {
        // vanilla 33→(4x,2x), vanilla 42→(4,2); vanilla 51→(6x,0x) filtered
        const results = generateSyncSiteswaps({balls: 3, period: 1});
        expect(results).to.include('(4,2)');
        expect(results).to.include('(4x,2x)');
        // (6x,0x) would be generated from vanilla 51 but 0x is invalid
        expect(results.some(r => r.includes('0x'))).to.be.false;
      });

      it('generates correct 4-ball period-1 patterns', () => {
        // vanilla 44→(4,4), vanilla 53→(6x,2x), vanilla 62→(6,2)
        const results = generateSyncSiteswaps({balls: 4, period: 1});
        expect(results).to.include('(4,4)');
        expect(results).to.include('(6,2)');
        expect(results).to.include('(6x,2x)');
      });

      it('generates correct 5-ball period-1 patterns', () => {
        // vanilla 55→(6x,4x), vanilla 64→(6,4)
        const results = generateSyncSiteswaps({balls: 5, period: 1});
        expect(results).to.include('(6,4)');
        expect(results).to.include('(6x,4x)');
      });
    });

    describe('validity: filters out collision patterns', () => {
      it('does not generate collision patterns for 3-ball period-2', () => {
        const results = generateSyncSiteswaps({balls: 3, period: 2});
        // These all have landing collisions and must be filtered out
        expect(results).to.not.include('(4,2)(4x,2x)');   // RH@2 and LH@2 both double-booked
        expect(results).to.not.include('(4,4)(2x,2x)');   // RH@0 and LH@0 both double-booked
        expect(results).to.not.include('(6,0)(2x,4x)');   // RH@2 double-booked
        expect(results).to.not.include('(6x,2x)(0,4)');   // LH@2 double-booked
        expect(results).to.not.include('(6,2x)(2x,2)');   // RH@2 double-booked
        expect(results).to.not.include('(6x,2)(2,2x)');   // LH@2 double-booked
      });

      it('does generate valid 3-ball period-2 patterns', () => {
        const results = generateSyncSiteswaps({balls: 3, period: 2});
        expect(results).to.include('(4,2)(4,2)');
        expect(results).to.include('(4,4)(4,0)');
        expect(results).to.include('(4x,2x)(4x,2x)');
        expect(results).to.include('(6,0)(2,4)');
        expect(results).to.include('(6,0)(6,0)');
        expect(results).to.include('(6,2)(2,2)');
        expect(results).to.include('(6,4)(2,0)');
        expect(results).to.include('(6x,2x)(2x,2x)');
      });

      it('produces exact 3-ball period-1 patterns (maxThrow=7)', () => {
        const results = generateSyncSiteswaps({balls: 3, period: 1, maxThrow: 7});
        expect(results).to.deep.equal([
          '(4,2)',
          '(4x,2x)',
          '(6,0)',
        ]);
      });

      it('produces exact 3-ball period-2 patterns (maxThrow=7)', () => {
        const results = generateSyncSiteswaps({balls: 3, period: 2, maxThrow: 7});
        expect(results).to.deep.equal([
          '(4,2)(4,2)',
          '(4,2x)(2x,4)',
          '(4,4)(4,0)',
          '(4x,2)(2,4x)',
          '(4x,2)(4,2x)',
          '(4x,2x)(2,4)',
          '(4x,2x)(4x,2x)',
          '(4x,4x)(4,0)',
          '(6,0)(2,4)',
          '(6,0)(4x,2x)',
          '(6,0)(6,0)',
          '(6,2)(2,2)',
          '(6,2)(2x,2x)',
          '(6,4)(2,0)',
          '(6,4x)(2x,0)',
          '(6x,0)(0,6x)',
          '(6x,0)(2,4x)',
          '(6x,0)(4,2x)',
          '(6x,2x)(2,2)',
          '(6x,2x)(2x,2x)',
          '(6x,4)(0,2x)',
          '(6x,4x)(0,2)',
        ]);
      });
    });

    describe('maxThrow option', () => {
      it('respects maxThrow applied to sync throws', () => {
        // (8x,2x) has a sync throw of 8, so maxThrow=7 should exclude it
        const withLimit = generateSyncSiteswaps({balls: 5, period: 1, maxThrow: 7});
        const withoutLimit = generateSyncSiteswaps({balls: 5, period: 1});
        expect(withoutLimit.length).to.be.greaterThanOrEqual(withLimit.length);
        // All sync throws in results should be <= maxThrow
        for (const pattern of withLimit) {
          const heights = Array.from(pattern.matchAll(/\d+/g)).map(m => parseInt(m[0]));
          expect(heights.every(h => h <= 7)).to.be.true;
        }
      });

      it('maxThrow=6 produces fewer 5-ball period-1 patterns than maxThrow=9', () => {
        const r6 = generateSyncSiteswaps({balls: 5, period: 1, maxThrow: 6});
        const r9 = generateSyncSiteswaps({balls: 5, period: 1, maxThrow: 9});
        expect(r9.length).to.be.greaterThan(r6.length);
        // (6,4) has max throw 6, should be in both
        expect(r6).to.include('(6,4)');
        expect(r9).to.include('(6,4)');
        // (8x,2x) has throw 8, should only be in r9
        expect(r6).to.not.include('(8x,2x)');
        expect(r9).to.include('(8x,2x)');
      });
    });

    describe('filterZeros option', () => {
      it('filterZeros excludes patterns with 0 throws', () => {
        const withZeros = generateSyncSiteswaps({balls: 3, period: 2, filterZeros: false});
        const withoutZeros = generateSyncSiteswaps({balls: 3, period: 2, filterZeros: true});
        expect(withZeros.length).to.be.greaterThan(withoutZeros.length);
        // Patterns with 0 should be gone
        expect(withoutZeros.some(r => r.includes(',0)') || r.includes('(0,'))).to.be.false;
        // Patterns without 0 should still be there
        expect(withoutZeros).to.include('(4,2)(4,2)');
        expect(withoutZeros).to.include('(4x,2x)(4x,2x)');
      });
    });

    describe('no 0x throws', () => {
      it('never generates 0x in any pattern', () => {
        const results = generateSyncSiteswaps({balls: 3, period: 2});
        expect(results.some(r => r.includes('0x'))).to.be.false;
      });

      it('never generates 0x for multiple ball counts', () => {
        for (const balls of [2, 3, 4, 5]) {
          const results = generateSyncSiteswaps({balls, period: 1});
          expect(results.some(r => r.includes('0x'))).to.be.false;
        }
      });
    });
  });

  describe('Sync passing generator', () => {
    it('throws error for odd period', () => {
      expect(() =>
        generateSyncPassing({balls: 6, period: 3, maxThrow: 6})
      ).to.throw('Period must be an even number');
    });

    it('generates patterns for 6 balls period 2', () => {
      const results = generateSyncPassing({
        balls: 6,
        period: 2,
        maxThrow: 6,
      });
      expect(results.length).to.be.greaterThan(0);
    });

    it('full-sync mode only generates non-delayed patterns', () => {
      const results = generateSyncPassing({
        balls: 6,
        period: 2,
        maxThrow: 6,
        syncMode: 'full-sync',
      });
      // Full-sync patterns should not have {0,1} prefix
      for (const result of results) {
        expect(result.startsWith('{0,1}')).to.be.false;
      }
    });

    it('sync-async mode only generates delayed patterns', () => {
      const results = generateSyncPassing({
        balls: 6,
        period: 2,
        maxThrow: 6,
        syncMode: 'sync-async',
      });
      // sync-async patterns should have {0,1} prefix
      for (const result of results) {
        expect(result.startsWith('{0,1}')).to.be.true;
      }
    });

    it('respects filterWimpy option', () => {
      const withWimpy = generateSyncPassing({
        balls: 6,
        period: 2,
        maxThrow: 6,
        filterWimpy: false,
      });
      const withoutWimpy = generateSyncPassing({
        balls: 6,
        period: 2,
        maxThrow: 6,
        filterWimpy: true,
      });
      // Filtering wimpy should result in fewer or equal patterns
      expect(withoutWimpy.length).to.be.at.most(withWimpy.length);
    });

    it('respects filterZeros option', () => {
      const withZeros = generateSyncPassing({
        balls: 6,
        period: 2,
        maxThrow: 6,
        filterZeros: false,
      });
      const withoutZeros = generateSyncPassing({
        balls: 6,
        period: 2,
        maxThrow: 6,
        filterZeros: true,
      });
      expect(withoutZeros.length).to.be.at.most(withZeros.length);
    });
  });
});
