import fetch from "node-fetch";

export async function analyzeSpeech(transcript, durationSeconds) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const mins = Math.floor(durationSeconds / 60);
  const secs = durationSeconds % 60;
  const durationStr = `${mins}m ${secs}s`;

  const prompt = `You are an English speaking coach. Analyze this spoken English transcript and return ONLY a JSON object with this exact structure, no extra text:
{
  "fluency": <1-10>,
  "grammar": <1-10>,
  "confidence": <1-10>,
  "vocabulary": <1-10>,
  "suggestions": ["suggestion1", "suggestion2", "suggestion3", "suggestion4"]
}

Transcript:
"${transcript}"`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq analysis failed: ${err}`);
  }

  const data = await res.json();
  const raw = data.choices[0].message.content.trim();

  // Extract JSON safely
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in response");

  const scores = JSON.parse(jsonMatch[0]);

  return { ...scores, duration: durationStr };
}
