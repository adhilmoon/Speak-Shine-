/**
 * Tests for ai/feedback.js
 *
 * Sub-task 6.1 — Property 5: Visual timeout produces partial result with audio sections
 * Sub-task 6.2 — Property 11: Null visual feedback includes unavailability note
 * Sub-task 6.3 — Unit tests for pipeline abort paths
 */

// Feature: video-feedback-optimization

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { formatFeedback, generateFeedback } from "./feedback.js";

// ---------------------------------------------------------------------------
// Top-level module mocks (hoisted by Vitest before any imports)
// ---------------------------------------------------------------------------
vi.mock("./downloadVideo.js", () => ({
  downloadVideo: vi.fn().mockResolvedValue("/tmp/fake_video.mp4"),
}));
vi.mock("./extractAudio.js", () => ({
  extractAudio: vi.fn().mockResolvedValue("/tmp/fake_audio.mp3"),
}));
vi.mock("./transcribe.js", () => ({
  transcribe: vi.fn(),
}));
vi.mock("./analyzeSpeech.js", () => ({
  analyzeSpeech: vi.fn(),
}));
vi.mock("./analyzeVideo.js", () => ({
  analyzeVideo: vi.fn(),
}));
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: vi.fn().mockReturnValue(false),
      unlinkSync: vi.fn(),
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers — minimal valid analyzeSpeech result shape
// ---------------------------------------------------------------------------

/**
 * fast-check arbitrary that generates a valid analyzeSpeech result object.
 * All numeric scores are integers 1-10; string fields are non-empty strings.
 */
const arbSpeechResult = () =>
  fc.record({
    fluency: fc.integer({ min: 1, max: 10 }),
    grammar: fc.integer({ min: 1, max: 10 }),
    confidence: fc.integer({ min: 1, max: 10 }),
    vocabulary: fc.integer({ min: 1, max: 10 }),
    topicRelevance: fc.option(fc.integer({ min: 1, max: 10 }), {
      nil: null,
    }),
    grammarErrors: fc.array(
      fc.record({
        original: fc.string({ minLength: 1 }),
        correction: fc.string({ minLength: 1 }),
        rule: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
      }),
      { maxLength: 4 }
    ),
    strongPoints: fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
    suggestions: fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
    vocabularyHighlights: fc.record({
      strong: fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
      weak: fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
    }),
    overallComment: fc.string({ minLength: 1 }),
    _stats: fc.record({
      duration: fc.string({ minLength: 1 }),
      wpm: fc.option(fc.integer({ min: 50, max: 300 }), { nil: null }),
      fillerWords: fc.constant({}),
      fillerTotal: fc.constant(0),
      pauses: fc.constant(0),
      wordCount: fc.integer({ min: 1, max: 500 }),
    }),
  });

// ---------------------------------------------------------------------------
// Sub-task 6.1 — Property 5: Visual timeout produces partial result with audio sections
// Feature: video-feedback-optimization, Property 5: Visual timeout produces partial result with audio sections
// Validates: Requirements 3.5, 6.1
// ---------------------------------------------------------------------------

describe("formatFeedback — Property 5: visual timeout produces partial result with audio sections", () => {
  it("returns a non-empty string containing audio score section when visual is null", () => {
    fc.assert(
      fc.property(arbSpeechResult(), fc.string({ minLength: 1 }), (result, user) => {
        const output = formatFeedback(result, null, user);

        // Must be a non-empty string
        expect(typeof output).toBe("string");
        expect(output.length).toBeGreaterThan(0);

        // Must contain the audio score section (fluency score is always present)
        expect(output).toContain("Fluency");

        // Must NOT contain raw error text (no "Error:" prefix, no stack frames)
        expect(output).not.toMatch(/Error:/);
        expect(output).not.toMatch(/\s{4}at /);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Sub-task 6.2 — Property 11: Null visual feedback includes unavailability note
// Feature: video-feedback-optimization, Property 11: Null visual feedback includes unavailability note
// Validates: Requirements 6.2
// ---------------------------------------------------------------------------

describe("formatFeedback — Property 11: null visual includes unavailability note", () => {
  it("output contains 'visual analysis' (case-insensitive) when visual is null", () => {
    fc.assert(
      fc.property(arbSpeechResult(), fc.string({ minLength: 1 }), (result, user) => {
        const output = formatFeedback(result, null, user);
        expect(output.toLowerCase()).toContain("visual analysis");
      })
    );
  });

  it("unavailability note is NOT present when visual data is provided", () => {
    const visualData = {
      eyeContact: 7,
      bodyLanguage: 7,
      facialExpression: 7,
      overallPresence: 7,
      eyeContactNote: "Good eye contact",
      bodyLanguageNote: "Upright posture",
      expressionNote: "Engaged expression",
      visualSuggestions: [],
      visualStrengths: [],
    };

    fc.assert(
      fc.property(arbSpeechResult(), fc.string({ minLength: 1 }), (result, user) => {
        const output = formatFeedback(result, visualData, user);
        expect(output).not.toContain("Visual analysis was unavailable");
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Sub-task 6.3 — Unit tests for pipeline abort paths
// Validates: Requirements 3.4, 3.5, 3.6, 6.3, 6.4
// ---------------------------------------------------------------------------

describe("generateFeedback — pipeline abort paths", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper: build a minimal valid speech result for mocking analyzeSpeech.
   */
  function makeSpeechResult() {
    return {
      fluency: 7,
      grammar: 7,
      confidence: 7,
      vocabulary: 7,
      topicRelevance: null,
      grammarErrors: [],
      strongPoints: ["Good effort"],
      suggestions: ["Speak more slowly"],
      vocabularyHighlights: { strong: [], weak: [] },
      overallComment: "Keep it up!",
      _stats: {
        duration: "1m 0s",
        wpm: 120,
        fillerWords: {},
        fillerTotal: 0,
        pauses: 0,
        wordCount: 120,
      },
    };
  }

  it("aborts and returns a user-friendly string (no stack trace) when transcription times out", async () => {
    const { transcribe } = await import("./transcribe.js");
    const { analyzeVideo } = await import("./analyzeVideo.js");

    // transcribe never resolves → will time out
    transcribe.mockReturnValue(new Promise(() => {}));
    // visual succeeds
    analyzeVideo.mockResolvedValue({
      eyeContact: 8,
      bodyLanguage: 8,
      facialExpression: 8,
      overallPresence: 8,
    });

    const msg = {};
    const result = await generateFeedback(
      msg,
      "user@s.whatsapp.net",
      60,
      null,
      null,
      null,
      { transcribeTimeout: 50, speechTimeout: 45000, visualTimeout: 45000 }
    );

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // Must not expose stack traces
    expect(result).not.toMatch(/\s{4}at /);
    expect(result).not.toContain("Error.stack");
    // Should be a user-friendly error message
    expect(result.toLowerCase()).toMatch(/unavailable|could not|error|sorry/);
  });

  it("aborts and returns a user-friendly string when speech analysis times out", async () => {
    const { transcribe } = await import("./transcribe.js");
    const { analyzeVideo } = await import("./analyzeVideo.js");
    const { analyzeSpeech } = await import("./analyzeSpeech.js");

    transcribe.mockResolvedValue({
      text: "Hello this is a test of my speaking ability and I am doing well today.",
      words: [],
      segments: [],
      duration: 10,
    });
    analyzeVideo.mockResolvedValue(null);
    // analyzeSpeech never resolves → will time out
    analyzeSpeech.mockReturnValue(new Promise(() => {}));

    const result = await generateFeedback(
      {},
      "user@s.whatsapp.net",
      60,
      null,
      null,
      null,
      { transcribeTimeout: 45000, speechTimeout: 50, visualTimeout: 45000 }
    );

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // Must not expose stack traces
    expect(result).not.toMatch(/\s{4}at /);
    expect(result).not.toContain("Error.stack");
    expect(result.toLowerCase()).toMatch(/unavailable|could not|error|sorry/);
  });

  it("returns partial result with unavailability note when only visual times out", async () => {
    const { transcribe } = await import("./transcribe.js");
    const { analyzeVideo } = await import("./analyzeVideo.js");
    const { analyzeSpeech } = await import("./analyzeSpeech.js");

    transcribe.mockResolvedValue({
      text: "Hello this is a test of my speaking ability and I am doing well today.",
      words: [],
      segments: [],
      duration: 10,
    });
    // analyzeVideo never resolves → will time out
    analyzeVideo.mockReturnValue(new Promise(() => {}));
    analyzeSpeech.mockResolvedValue(makeSpeechResult());

    const result = await generateFeedback(
      {},
      "user@s.whatsapp.net",
      60,
      null,
      null,
      null,
      { transcribeTimeout: 45000, speechTimeout: 45000, visualTimeout: 50 }
    );

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // Should contain audio feedback sections
    expect(result).toContain("Fluency");
    // Should contain the unavailability note
    expect(result.toLowerCase()).toContain("visual analysis");
    expect(result).toContain("unavailable");
    // Must not expose stack traces
    expect(result).not.toMatch(/\s{4}at /);
  });

  it("returns total-failure message when both transcription and visual fail", async () => {
    const { transcribe } = await import("./transcribe.js");
    const { analyzeVideo } = await import("./analyzeVideo.js");

    // Both never resolve → both time out
    transcribe.mockReturnValue(new Promise(() => {}));
    analyzeVideo.mockReturnValue(new Promise(() => {}));

    const result = await generateFeedback(
      {},
      "user@s.whatsapp.net",
      60,
      null,
      null,
      null,
      { transcribeTimeout: 50, speechTimeout: 45000, visualTimeout: 50 }
    );

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // Should tell the user to resubmit
    expect(result.toLowerCase()).toMatch(/resubmit|try again|could not/);
    // Must not expose stack traces
    expect(result).not.toMatch(/\s{4}at /);
    expect(result).not.toContain("Error.stack");
  });
});
