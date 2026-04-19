import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";

export async function transcribe(audioPath) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set in .env");
  const form = new FormData();
  form.append("file", fs.createReadStream(audioPath), {
    filename: "audio.mp3",
    contentType: "audio/mpeg",
  });
  form.append("model", "whisper-large-v3-turbo");
  form.append("response_format", "text");
  form.append("language", "en");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq transcription failed: ${err}`);
  }

  const text = await res.text();
  return text.trim();
}
