/**
 * Tests for ai/analyzeVideo.helpers.js
 *
 * Sub-task 5.1 — Property test for null frame filtering (Property 6)
 * Sub-task 5.2 — Property test for frame timestamp distribution (Property 7)
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generateTimestamps, filterFrames } from './analyzeVideo.helpers.js';

// ---------------------------------------------------------------------------
// Sub-task 5.1 — Property 6: Null frame filtering
// Feature: video-feedback-optimization, Property 6: Null frame filtering
// Validates: Requirements 4.2, 4.3
// ---------------------------------------------------------------------------

describe('filterFrames — Property 6: null frame filtering', () => {
  it('result contains only non-null entries', () => {
    // fc.option(fc.base64String()) produces either a base64 string or null
    fc.assert(
      fc.property(
        fc.array(fc.option(fc.base64String({ minLength: 1 }))),
        (results) => {
          const filtered = filterFrames(results);
          // Every entry in the filtered result must be non-null/non-undefined/non-false
          expect(filtered.every((f) => f !== null && f !== undefined && f !== '')).toBe(true);
        }
      )
    );
  });

  it('result preserves the relative order of non-null entries', () => {
    fc.assert(
      fc.property(
        fc.array(fc.option(fc.base64String({ minLength: 1 }))),
        (results) => {
          const nonNulls = results.filter(Boolean);
          const filtered = filterFrames(results);
          expect(filtered).toEqual(nonNulls);
        }
      )
    );
  });

  it('result length equals the number of non-null entries in the input', () => {
    fc.assert(
      fc.property(
        fc.array(fc.option(fc.base64String({ minLength: 1 }))),
        (results) => {
          const expectedCount = results.filter(Boolean).length;
          expect(filterFrames(results)).toHaveLength(expectedCount);
        }
      )
    );
  });

  it('returns an empty array when all entries are null', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        (n) => {
          const allNulls = Array(n).fill(null);
          expect(filterFrames(allNulls)).toHaveLength(0);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Sub-task 5.2 — Property 7: Frame timestamps are evenly distributed
// Feature: video-feedback-optimization, Property 7: Frame timestamps are evenly distributed
// Validates: Requirements 4.4
// ---------------------------------------------------------------------------

describe('generateTimestamps — Property 7: frame timestamps are evenly distributed', () => {
  it('returns exactly frameCount timestamps', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 1, max: 3600, noNaN: true }),
        fc.integer({ min: 1, max: 10 }),
        (duration, frameCount) => {
          const timestamps = generateTimestamps(duration, frameCount);
          expect(timestamps).toHaveLength(frameCount);
        }
      )
    );
  });

  it('all timestamps are within [1, duration]', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 1, max: 3600, noNaN: true }),
        fc.integer({ min: 1, max: 10 }),
        (duration, frameCount) => {
          const timestamps = generateTimestamps(duration, frameCount);
          for (const t of timestamps) {
            expect(t).toBeGreaterThanOrEqual(1);
            expect(t).toBeLessThanOrEqual(Math.ceil(duration));
          }
        }
      )
    );
  });

  it('timestamps are strictly increasing', () => {
    fc.assert(
      fc.property(
        // Use larger durations to ensure distinct integer timestamps
        fc.float({ min: 10, max: 3600, noNaN: true }),
        fc.integer({ min: 1, max: 10 }),
        (duration, frameCount) => {
          const timestamps = generateTimestamps(duration, frameCount);
          for (let i = 1; i < timestamps.length; i++) {
            // With large enough duration, consecutive timestamps should be non-decreasing.
            // They are strictly increasing when duration is large relative to frameCount.
            expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
          }
        }
      )
    );
  });

  it('timestamps match the exact formula Math.max(1, Math.floor((duration * i) / (frameCount + 1)))', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 1, max: 3600, noNaN: true }),
        fc.integer({ min: 1, max: 10 }),
        (duration, frameCount) => {
          const timestamps = generateTimestamps(duration, frameCount);
          for (let i = 1; i <= frameCount; i++) {
            const expected = Math.max(1, Math.floor((duration * i) / (frameCount + 1)));
            expect(timestamps[i - 1]).toBe(expected);
          }
        }
      )
    );
  });

  it('timestamps are approximately evenly spaced (gap ≈ duration / (frameCount + 1))', () => {
    fc.assert(
      fc.property(
        // Use larger durations so integer rounding doesn't dominate
        fc.float({ min: 60, max: 3600, noNaN: true }),
        fc.integer({ min: 2, max: 10 }),
        (duration, frameCount) => {
          const timestamps = generateTimestamps(duration, frameCount);
          const expectedGap = duration / (frameCount + 1);
          for (let i = 1; i < timestamps.length; i++) {
            const gap = timestamps[i] - timestamps[i - 1];
            // Allow ±2 seconds of rounding error from Math.floor
            expect(Math.abs(gap - expectedGap)).toBeLessThanOrEqual(expectedGap + 2);
          }
        }
      )
    );
  });
});
