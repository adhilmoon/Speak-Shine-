import { downloadVideo } from "./downloadVideo.js";
import { extractAudio } from "./extractAudio.js";
import { transcribe } from "./transcribe.js";
import { analyzeSpeech } from "./analyzeSpeech.js";
import { analyzeVideo } from "./analyzeVideo.js";
import {
  withTimeout,
  startStage,
  TRANSCRIBE_TIMEOUT_MS,
  SPEECH_TIMEOUT_MS,
  VISUAL_TIMEOUT_MS,
} from "./pipeline.js";
import fs from "fs";

/**
 * Generates detailed AI feedback for a spoken English video submission.
 * Runs audio analysis (Groq Whisper + Llama) and visual analysis (Gemini Vision) in parallel.
 *
 * @param {object}      msg              - WhatsApp message object
 * @param {string}      user             - User JID (e.g. "919876543210@s.whatsapp.net")
 * @param {number}      durationSeconds  - Video duration in seconds
 * @param {string|null} questionTopic    - Today's speaking topic (optional, for relevance check)
 * @param {string|null} questionText     - Full question text (optional)
 * @param {object|null} sock             - Baileys socket (for media re-fetch)
 * @param {object}      [opts]
 * @param {Function}    [opts.onProgress]         - async (stage: string) => void
 * @param {number}      [opts.transcribeTimeout]  - default TRANSCRIBE_TIMEOUT_MS (60 000)
 * @param {number}      [opts.speechTimeout]      - default SPEECH_TIMEOUT_MS (45 000)
 * @param {number}      [opts.visualTimeout]      - default VISUAL_TIMEOUT_MS (45 000)
 */
export async function generateFeedback(
  msg,
  user,
  durationSeconds,
  questionTopic = null,
  questionText = null,
  sock = null,
  opts = {}
) {
  const {
    onProgress = () => {},
    transcribeTimeout = TRANSCRIBE_TIMEOUT_MS,
    speechTimeout = SPEECH_TIMEOUT_MS,
    visualTimeout = VISUAL_TIMEOUT_MS,
  } = opts;

  const pipelineStart = Date.now();
  const id = Date.now();
  let videoPath, audioPath;

  try {
    // -----------------------------------------------------------------------
    // Stage 1: Download video
    // -----------------------------------------------------------------------
    const downloadStage = startStage("download");
    try {
      videoPath = await downloadVideo(msg, id, sock);
      downloadStage.end();
    } catch (err) {
      downloadStage.end(err);
      throw err;
    }

    await onProgress("Extracting audio…");

    // -----------------------------------------------------------------------
    // Stage 2: Extract audio
    // -----------------------------------------------------------------------
    const extractStage = startStage("extractAudio");
    try {
      audioPath = await extractAudio(videoPath, id);
      extractStage.end();
    } catch (err) {
      extractStage.end(err);
      throw err;
    }

    await onProgress("Analysing your video…");

    // -----------------------------------------------------------------------
    // Stage 3: Parallel — transcription + visual analysis (with timeouts)
    // -----------------------------------------------------------------------
    const parallelStage = startStage("parallel");

    const [transcriptionResult, visualResult] = await Promise.allSettled([
      withTimeout(transcribe(audioPath), transcribeTimeout, "transcription"),
      withTimeout(analyzeVideo(videoPath), visualTimeout, "visual"),
    ]);

    parallelStage.end();

    // Visual result is optional — gracefully degrade if it failed or timed out
    let visual = null;
    if (visualResult.status === "fulfilled") {
      visual = visualResult.value;
    } else {
      const reason = visualResult.reason;
      console.log(
        "⚠️ Visual analysis error (non-fatal):",
        reason?.message ?? String(reason)
      );
    }
    console.log(
      "🎨 Visual analysis result:",
      visual ? JSON.stringify(visual).slice(0, 200) : "null/failed"
    );

    // Transcription must succeed — if it timed out or failed, abort
    if (transcriptionResult.status === "rejected") {
      const reason = transcriptionResult.reason;
      console.log(
        "[PIPELINE] transcription FAIL elapsed=" + (Date.now() - pipelineStart),
        "error=" + (reason?.message ?? String(reason))
      );
      // Both transcription AND visual failed → total failure
      if (visual === null) {
        console.log(
          "[PIPELINE] total failure elapsed=" + (Date.now() - pipelineStart)
        );
        return "⚠️ _Sorry, we could not analyse your video. Please try resubmitting — if the problem persists, the service may be temporarily unavailable._";
      }
      // Transcription failed but visual succeeded — still can't produce feedback
      return "⚠️ _The transcription service is currently unavailable. Please try resubmitting your video._";
    }

    const transcription = transcriptionResult.value;

    if (!transcription.text || transcription.text.length < 10) {
      return "⚠️ _Could not detect speech in the video._";
    }

    // Use Whisper's actual spoken duration if available, fall back to video duration
    const actualDuration =
      transcription.duration > 0 ? transcription.duration : durationSeconds;

    await onProgress("Scoring your speech…");

    // -----------------------------------------------------------------------
    // Stage 4: Speech analysis (with timeout — abort on timeout)
    // -----------------------------------------------------------------------
    const speechStage = startStage("analyzeSpeech");
    let result;
    try {
      result = await withTimeout(
        analyzeSpeech(
          transcription.text,
          actualDuration,
          transcription.words,
          questionTopic,
          questionText
        ),
        speechTimeout,
        "speech"
      );
      speechStage.end();
    } catch (err) {
      speechStage.end(err);
      console.log(
        "[PIPELINE] total failure elapsed=" + (Date.now() - pipelineStart)
      );
      return "⚠️ _The scoring service is currently unavailable. Please try resubmitting your video._";
    }

    // -----------------------------------------------------------------------
    // Stage 5: Format combined feedback
    // -----------------------------------------------------------------------
    const formatted = formatFeedback(result, visual, user);

    console.log(
      "[PIPELINE] total DONE elapsed=" + (Date.now() - pipelineStart)
    );

    return formatted;
  } finally {
    if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  }
}

/**
 * Formats the combined audio + visual analysis into a WhatsApp-friendly message.
 *
 * @param {object}      result  - analyzeSpeech result (with _stats)
 * @param {object|null} visual  - analyzeVideo result, or null if unavailable
 * @param {string}      user    - User JID
 * @returns {string}
 */
export function formatFeedback(result, visual, user) {
  const username = user.split("@")[0];
  const s = result._stats;

  // --- Header ---
  let msg = `🎤 *Video Feedback for @${username}*\n\n`;

  // --- Audio Stats ---
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `⏱️ *Duration:* ${s.duration}`;
  if (s.wpm) {
    const paceLabel =
      s.wpm < 100 ? "🐢 Slow" : s.wpm <= 150 ? "✅ Good" : "⚡ Fast";
    msg += `  |  📊 *Pace:* ${s.wpm} wpm ${paceLabel}`;
  }
  msg += `\n`;

  if (s.fillerTotal > 0) {
    const fillerList = Object.entries(s.fillerWords)
      .map(([w, c]) => `"${w}" ×${c}`)
      .join(", ");
    msg += `🗣️ *Filler words:* ${fillerList}\n`;
  }

  if (s.pauses > 0) {
    msg += `🔇 *Long pauses:* ${s.pauses} detected\n`;
  }

  // --- Speech Scores ---
  msg += `━━━━━━━━━━━━━━━\n`;
  msg += `🗣️ *Fluency:*    ${scoreBar(result.fluency)} ${result.fluency}/10\n`;
  msg += `📚 *Grammar:*    ${scoreBar(result.grammar)} ${result.grammar}/10\n`;
  msg += `🔥 *Confidence:* ${scoreBar(result.confidence)} ${result.confidence}/10\n`;
  msg += `🧠 *Vocabulary:* ${scoreBar(result.vocabulary)} ${result.vocabulary}/10\n`;

  if (result.topicRelevance != null) {
    msg += `🎯 *On-topic:*   ${scoreBar(result.topicRelevance)} ${result.topicRelevance}/10\n`;
  }

  // --- Visual Scores (only if analysis succeeded) ---
  if (visual) {
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `👁️ *Eye Contact:*  ${scoreBar(visual.eyeContact)} ${visual.eyeContact}/10\n`;
    msg += `🧍 *Body Language:* ${scoreBar(visual.bodyLanguage)} ${visual.bodyLanguage}/10\n`;
    msg += `😊 *Expression:*   ${scoreBar(visual.facialExpression)} ${visual.facialExpression}/10\n`;
    msg += `✨ *Presence:*     ${scoreBar(visual.overallPresence)} ${visual.overallPresence}/10\n`;
  }

  // --- Grammar Errors ---
  if (result.grammarErrors && result.grammarErrors.length > 0) {
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `❌ *Grammar Issues:*\n`;
    for (const e of result.grammarErrors) {
      msg += `  • _"${e.original}"_ → *"${e.correction}"*\n`;
      if (e.rule) msg += `    _(${e.rule})_\n`;
    }
  }

  // --- Strong Points ---
  if (result.strongPoints && result.strongPoints.length > 0) {
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `✅ *What you did well:*\n`;
    for (const point of result.strongPoints) {
      msg += `  • ${point}\n`;
    }
  }

  // --- Visual Observations (detailed notes from Gemini) ---
  if (visual) {
    const hasNotes =
      visual.eyeContactNote || visual.bodyLanguageNote || visual.expressionNote;
    const hasStrengths =
      visual.visualStrengths && visual.visualStrengths.length > 0;

    if (hasNotes || hasStrengths) {
      msg += `━━━━━━━━━━━━━━━\n`;
      msg += `📹 *Visual Observations:*\n`;
      if (visual.eyeContactNote) msg += `  👁️ ${visual.eyeContactNote}\n`;
      if (visual.bodyLanguageNote) msg += `  🧍 ${visual.bodyLanguageNote}\n`;
      if (visual.expressionNote) msg += `  😊 ${visual.expressionNote}\n`;
      if (hasStrengths) {
        for (const str of visual.visualStrengths) {
          msg += `  ✅ ${str}\n`;
        }
      }
    }
  }

  // --- Vocabulary Highlights ---
  const voc = result.vocabularyHighlights;
  if (voc) {
    if (voc.strong && voc.strong.length > 0) {
      msg += `━━━━━━━━━━━━━━━\n`;
      msg += `💎 *Good vocabulary used:* ${voc.strong.join(", ")}\n`;
    }
    if (voc.weak && voc.weak.length > 0) {
      msg += `📖 *Words to upgrade:* ${voc.weak.join(", ")}\n`;
    }
  }

  // --- Speech Suggestions ---
  if (result.suggestions && result.suggestions.length > 0) {
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `💡 *Speaking Tips:*\n`;
    for (const tip of result.suggestions) {
      msg += `  • ${tip}\n`;
    }
  }

  // --- Visual Suggestions ---
  if (visual && visual.visualSuggestions && visual.visualSuggestions.length > 0) {
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `🎬 *Presentation Tips:*\n`;
    for (const tip of visual.visualSuggestions) {
      msg += `  • ${tip}\n`;
    }
  }

  // --- Overall Comment ---
  if (result.overallComment) {
    msg += `━━━━━━━━━━━━━━━\n`;
    msg += `📝 ${result.overallComment}`;
  }

  // --- Visual unavailability note (appended when visual is null) ---
  if (!visual) {
    msg += `\n\n_(Visual analysis was unavailable for this submission.)_`;
  }

  return msg;
}

/**
 * Returns a simple visual score bar using emoji blocks.
 * e.g. score 7 → "🟩🟩🟩🟩🟩🟩🟩⬜⬜⬜"
 */
function scoreBar(score) {
  const filled = Math.round(score);
  const empty = 10 - filled;
  return "🟩".repeat(filled) + "⬜".repeat(empty);
}
