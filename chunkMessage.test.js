// Feature: video-feedback-optimization
// Tests for chunkMessage and sendChunks helpers

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { chunkMessage, sendChunks } from "./helpers.js";

// ---------------------------------------------------------------------------
// Unit tests — 4.4
// ---------------------------------------------------------------------------

describe("chunkMessage — unit tests", () => {
  it('returns [""] for an empty string', () => {
    expect(chunkMessage("")).toEqual([""]);
  });

  it("returns a single-element array when text ≤ 4000 chars", () => {
    const text = "a".repeat(4000);
    const result = chunkMessage(text);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(text);
  });

  it("returns a single-element array for text shorter than the limit", () => {
    const text = "Hello world";
    expect(chunkMessage(text)).toEqual(["Hello world"]);
  });

  it("emits a single line longer than the limit as its own chunk", () => {
    const longLine = "x".repeat(5000);
    const result = chunkMessage(longLine, 4000);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(longLine);
  });

  it("splits a multi-line string that exceeds the limit", () => {
    const line = "a".repeat(2000);
    const text = [line, line, line].join("\n"); // ~6002 chars
    const result = chunkMessage(text, 4000);
    expect(result.length).toBeGreaterThan(1);
    expect(result.join("")).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// Property 8: Chunking preserves content
// Validates: Requirements 5.1, 5.3
// ---------------------------------------------------------------------------

describe("Property 8: Chunking preserves content", () => {
  it("chunks.join('') equals the original string for any input", () => {
    // Feature: video-feedback-optimization, Property 8: Chunking preserves content
    fc.assert(
      fc.property(fc.string(), (text) => {
        const chunks = chunkMessage(text);
        expect(chunks.join("")).toBe(text);
      }),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: All chunks respect the size limit
// Validates: Requirements 5.1, 5.4
// ---------------------------------------------------------------------------

describe("Property 9: All chunks respect the size limit", () => {
  it("every chunk satisfies chunk.length ≤ limit", () => {
    // Feature: video-feedback-optimization, Property 9: All chunks respect the size limit
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer({ min: 1, max: 8000 }),
        (text, limit) => {
          const chunks = chunkMessage(text, limit);
          // A single line longer than limit is allowed to exceed it (per spec)
          // but only if the text has no newlines or the line itself is oversized.
          // The spec says: "a single line longer than maxLen must be emitted as its own chunk"
          // so we verify that any chunk exceeding the limit contains no \n (it's a bare oversized line).
          for (const chunk of chunks) {
            if (chunk.length > limit) {
              // Must be an oversized single-line segment (no embedded newlines except possibly a trailing one)
              const stripped = chunk.endsWith("\n") ? chunk.slice(0, -1) : chunk;
              expect(stripped.includes("\n")).toBe(false);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10: Chunks split only at newline boundaries
// Validates: Requirements 5.2
// ---------------------------------------------------------------------------

describe("Property 10: Chunks split only at newline boundaries", () => {
  it("no chunk ends mid-line (non-last chunks end with \\n or are oversized single lines)", () => {
    // Feature: video-feedback-optimization, Property 10: Chunks split only at newline boundaries
    fc.assert(
      fc.property(
        fc.array(fc.string({ maxLength: 200 })).map((lines) => lines.join("\n")),
        fc.integer({ min: 1, max: 8000 }),
        (text, limit) => {
          const chunks = chunkMessage(text, limit);
          if (chunks.length <= 1) return; // single chunk — no split to verify

          // Every chunk except the last must end with \n
          // (unless it is an oversized single line that was forced out)
          for (let i = 0; i < chunks.length - 1; i++) {
            const chunk = chunks[i];
            const isOversizedLine = chunk.length > limit && !chunk.slice(0, -1).includes("\n");
            if (!isOversizedLine) {
              expect(chunk.endsWith("\n")).toBe(true);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// sendChunks — unit tests
// ---------------------------------------------------------------------------

describe("sendChunks", () => {
  it("calls safeSend once per chunk in order", async () => {
    const mockSafeSend = vi.fn().mockResolvedValue(true);
    const chunks = ["chunk1\n", "chunk2\n", "chunk3"];
    const sock = {};
    const jid = "test@g.us";

    await sendChunks(sock, jid, chunks, [], mockSafeSend);

    expect(mockSafeSend).toHaveBeenCalledTimes(3);
    expect(mockSafeSend).toHaveBeenNthCalledWith(1, sock, jid, { text: "chunk1\n", mentions: [] });
    expect(mockSafeSend).toHaveBeenNthCalledWith(2, sock, jid, { text: "chunk2\n", mentions: [] });
    expect(mockSafeSend).toHaveBeenNthCalledWith(3, sock, jid, { text: "chunk3", mentions: [] });
  });

  it("passes mentions to every safeSend call", async () => {
    const mockSafeSend = vi.fn().mockResolvedValue(true);
    const mentions = ["user1@s.whatsapp.net", "user2@s.whatsapp.net"];
    await sendChunks({}, "jid", ["a", "b"], mentions, mockSafeSend);

    for (const call of mockSafeSend.mock.calls) {
      expect(call[2].mentions).toEqual(mentions);
    }
  });

  it("does nothing for an empty chunks array", async () => {
    const mockSafeSend = vi.fn();
    await sendChunks({}, "jid", [], [], mockSafeSend);
    expect(mockSafeSend).not.toHaveBeenCalled();
  });
});
