/**
 * Tests for ai/pipeline.js
 *
 * Sub-task 1.1 — Property test for stage logger format (Property 12)
 * Sub-task 1.2 — Unit tests for withTimeout
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { withTimeout, startStage } from './pipeline.js';

// ---------------------------------------------------------------------------
// Sub-task 1.1 — Property 12: Stage logger emits stage name and non-negative elapsed time
// Feature: video-feedback-optimization, Property 12: Stage logger emits stage name and non-negative elapsed time
// Validates: Requirements 7.1, 7.2, 7.3, 7.4
// ---------------------------------------------------------------------------

describe('startStage — Property 12: stage logger format', () => {
  let logs;

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('START log contains stage name and epoch timestamp', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (stageName) => {
        logs = [];
        startStage(stageName);

        const startLog = logs.find((l) => l.includes('START'));
        expect(startLog).toBeDefined();
        expect(startLog).toContain(stageName);
        // ts= followed by digits
        expect(startLog).toMatch(/ts=\d+/);
      })
    );
  });

  it('DONE log contains stage name and non-negative elapsed time', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.nat(), (stageName) => {
        logs = [];
        const stage = startStage(stageName);
        stage.end();

        const doneLog = logs.find((l) => l.includes('DONE'));
        expect(doneLog).toBeDefined();
        expect(doneLog).toContain(stageName);

        const match = doneLog.match(/elapsed=(\d+)/);
        expect(match).not.toBeNull();
        const elapsed = Number(match[1]);
        expect(elapsed).toBeGreaterThanOrEqual(0);
      })
    );
  });

  it('FAIL log contains stage name, non-negative elapsed time, and error message', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (stageName, errorMsg) => {
          logs = [];
          const stage = startStage(stageName);
          stage.end(new Error(errorMsg));

          const failLog = logs.find((l) => l.includes('FAIL'));
          expect(failLog).toBeDefined();
          expect(failLog).toContain(stageName);
          expect(failLog).toContain(errorMsg);

          const match = failLog.match(/elapsed=(\d+)/);
          expect(match).not.toBeNull();
          const elapsed = Number(match[1]);
          expect(elapsed).toBeGreaterThanOrEqual(0);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Sub-task 1.2 — Unit tests for withTimeout
// Validates: Requirements 3.1, 3.2, 3.3
// ---------------------------------------------------------------------------

describe('withTimeout', () => {
  it('resolves with the promise value when the promise settles before the timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000, 'test-stage');
    expect(result).toBe('ok');
  });

  it('resolves with a non-string value (object) when settled before timeout', async () => {
    const obj = { score: 42 };
    const result = await withTimeout(Promise.resolve(obj), 1000, 'test-stage');
    expect(result).toBe(obj);
  });

  it('rejects with a timeout error when the promise takes longer than ms', async () => {
    const neverResolves = new Promise(() => {});
    await expect(
      withTimeout(neverResolves, 50, 'slow-stage')
    ).rejects.toThrow(/slow-stage/);
  });

  it('rejection message includes the label', async () => {
    const neverResolves = new Promise(() => {});
    await expect(
      withTimeout(neverResolves, 50, 'my-label')
    ).rejects.toThrow(/my-label/);
  });

  it('rejection message includes the timeout value', async () => {
    const neverResolves = new Promise(() => {});
    await expect(
      withTimeout(neverResolves, 50, 'stage')
    ).rejects.toThrow(/50/);
  });

  it('propagates rejection from the original promise before timeout', async () => {
    const failing = Promise.reject(new Error('original error'));
    await expect(
      withTimeout(failing, 1000, 'stage')
    ).rejects.toThrow('original error');
  });
});
