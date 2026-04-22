/**
 * Tests for ai/dedupCache.js
 *
 * Sub-task 2.1 — Property test for hash consistency (Property 3)
 * Sub-task 2.2 — Property test for dedup cache round-trip (Property 4)
 * Sub-task 2.3 — Unit tests for dedup cache lifecycle
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  hashBuffer,
  markProcessing,
  storeResult,
  getCacheEntry,
  evict,
  dedupCache,
  CACHE_TTL_MS,
} from './dedupCache.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clear the shared cache before each test to avoid cross-test pollution. */
beforeEach(() => {
  dedupCache.clear();
});

// ---------------------------------------------------------------------------
// Sub-task 2.1 — Property 3: Hash consistency
// Feature: video-feedback-optimization, Property 3: Hash consistency
// Validates: Requirements 2.1
// ---------------------------------------------------------------------------

describe('hashBuffer — Property 3: hash consistency', () => {
  it('same buffer hashes identically twice', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 1024 }), (bytes) => {
        const buf = Buffer.from(bytes);
        expect(hashBuffer(buf)).toBe(hashBuffer(buf));
      })
    );
  });

  it('two buffers with different content produce different hashes', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 1, maxLength: 512 }),
        fc.uint8Array({ minLength: 1, maxLength: 512 }),
        (a, b) => {
          // Only assert when the byte arrays are actually different
          fc.pre(!a.every((v, i) => v === b[i] && a.length === b.length));
          const bufA = Buffer.from(a);
          const bufB = Buffer.from(b);
          if (!bufA.equals(bufB)) {
            expect(hashBuffer(bufA)).not.toBe(hashBuffer(bufB));
          }
        }
      )
    );
  });

  it('returns a 64-character hex string', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 256 }), (bytes) => {
        const digest = hashBuffer(Buffer.from(bytes));
        expect(digest).toMatch(/^[0-9a-f]{64}$/);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Sub-task 2.2 — Property 4: Dedup cache round-trip
// Feature: video-feedback-optimization, Property 4: Dedup cache round-trip
// Validates: Requirements 2.4
// ---------------------------------------------------------------------------

describe('dedupCache — Property 4: cache round-trip', () => {
  it('stored result is retrieved exactly', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[0-9a-f]{64}$/),
        fc.string(),
        (hash, feedbackText) => {
          dedupCache.clear();
          storeResult(hash, feedbackText);
          expect(getCacheEntry(hash)).toBe(feedbackText);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Sub-task 2.3 — Unit tests for dedup cache lifecycle
// Validates: Requirements 2.2, 2.3, 2.5
// ---------------------------------------------------------------------------

describe('dedupCache lifecycle', () => {
  const HASH = 'a'.repeat(64);

  it('markProcessing sets state to "processing"', () => {
    markProcessing(HASH);
    expect(getCacheEntry(HASH)).toBe('processing');
  });

  it('storeResult stores the result string', () => {
    storeResult(HASH, 'Great job!');
    expect(getCacheEntry(HASH)).toBe('Great job!');
  });

  it('getCacheEntry returns undefined for an unknown hash', () => {
    expect(getCacheEntry('unknown-hash')).toBeUndefined();
  });

  it('evict removes the entry', () => {
    markProcessing(HASH);
    evict(HASH);
    expect(getCacheEntry(HASH)).toBeUndefined();
  });

  it('evict is a no-op for a hash that is not in the cache', () => {
    expect(() => evict('nonexistent')).not.toThrow();
    expect(getCacheEntry('nonexistent')).toBeUndefined();
  });

  describe('TTL eviction via fake timers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('entry is still present before TTL expires', () => {
      storeResult(HASH, 'cached feedback');
      vi.advanceTimersByTime(CACHE_TTL_MS - 1);
      expect(getCacheEntry(HASH)).toBe('cached feedback');
    });

    it('entry is removed after TTL expires', () => {
      storeResult(HASH, 'cached feedback');
      vi.advanceTimersByTime(CACHE_TTL_MS);
      expect(getCacheEntry(HASH)).toBeUndefined();
    });

    it('TTL eviction fires exactly at CACHE_TTL_MS', () => {
      storeResult(HASH, 'result');
      expect(getCacheEntry(HASH)).toBe('result');
      vi.advanceTimersByTime(CACHE_TTL_MS);
      expect(getCacheEntry(HASH)).toBeUndefined();
    });
  });
});
