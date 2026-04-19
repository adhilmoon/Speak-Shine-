import { downloadVideo } from "./downloadVideo.js";
import { extractAudio } from "./extractAudio.js";
import { transcribe } from "./transcribe.js";
import { analyzeSpeech } from "./analyzeSpeech.js";
import fs from "fs";

export async function generateFeedback(msg, user, durationSeconds) {
  const id = Date.now();
  let videoPath, audioPath;

  try {
    // 1. Download video
    videoPath = await downloadVideo(msg, id);

    // 2. Extract audio
    audioPath = await extractAudio(videoPath, id);

    // 3. Transcribe
    const transcript = await transcribe(audioPath);
    if (!transcript || transcript.length < 10) {
      return "⚠️ _Could not detect speech in the video._";
    }

    // 4. Analyze
    const result = await analyzeSpeech(transcript, durationSeconds);

    // 5. Format feedback message
    const username = user.split("@")[0];
    const suggestions = result.suggestions
      .map((s) => `  • ${s}`)
      .join("\n");

    return (
      `🎤 *Video Feedback for @${username}*\n\n` +
      `━━━━━━━━━━━━━━━\n` +
      `✅ *Duration:* ${result.duration}\n` +
      `🗣️ *Fluency:* ${result.fluency}/10\n` +
      `📚 *Grammar:* ${result.grammar}/10\n` +
      `🔥 *Confidence:* ${result.confidence}/10\n` +
      `🧠 *Vocabulary:* ${result.vocabulary}/10\n` +
      `━━━━━━━━━━━━━━━\n` +
      `💡 *Suggestions:*\n${suggestions}`
    );
  } finally {
    // Cleanup temp files
    if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  }
}
