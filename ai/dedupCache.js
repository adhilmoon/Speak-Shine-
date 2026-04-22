/**
 * ai/dedupCache.js — In-memory deduplication cache for the video feedback pipeline.
 *
 * Exports:
 *   - hashBuffer(buffer)
 *   - markProcessing(hash)
 *   - storeResult(hash, result)
 *   - getCacheEntry(hash)
 *   - evict(hash)
 *   - dedupCache  (the underlying Map)
 *   - CACHE_TTL_MS
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// TTL constant (env-overridable with numeric fallback)
// ---------------------------------------------------------------------------

/** How long (ms) a completed result is retained in the cache. Default: 300 000 */
export const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 300_000;

// ---------------------------------------------------------------------------
// Module-level cache Map
// ---------------------------------------------------------------------------

/**
 * Maps a SHA-256 hex digest to either:
 *   'processing' — pipeline is currently running for this hash
 *   string       — completed feedback text (cached result)
 *
 * @type {Map<string, 'processing' | string>}
 */
export const dedupCache = new Map();

// ---------------------------------------------------------------------------
// hashBuffer
// ---------------------------------------------------------------------------

/**
 * Computes a SHA-256 hex digest of the given Buffer.
 *
 * @param {Buffer | Uint8Array} buffer
 * @returns {string}  hex digest
 */
export function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

// ---------------------------------------------------------------------------
// Cache operations
// ---------------------------------------------------------------------------

/**
 * Marks a hash as currently being processed.
 *
 * @param {string} hash
 */
export function markProcessing(hash) {
  dedupCache.set(hash, 'processing');
}

/**
 * Stores a completed feedback result for the given hash and schedules
 * automatic eviction after CACHE_TTL_MS milliseconds.
 *
 * @param {string} hash
 * @param {string} result  — formatted feedback text
 */
export function storeResult(hash, result) {
  dedupCache.set(hash, result);
  setTimeout(() => {
    evict(hash);
  }, CACHE_TTL_MS);
}

/**
 * Returns the current cache state for a hash.
 *
 * @param {string} hash
 * @returns {'processing' | string | undefined}
 */
export function getCacheEntry(hash) {
  return dedupCache.get(hash);
}

/**
 * Removes a hash from the cache.
 * Used by the TTL timer and by callers that need to clear an in-progress entry
 * (e.g. on pipeline error).
 *
 * @param {string} hash
 */
export function evict(hash) {
  dedupCache.delete(hash);
}
