import { createCanvas, loadImage } from "canvas";
import fs from "fs";

export default async function generatePoster(question) {
  const canvas = createCanvas(1080, 1080);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, 1080, 1080);

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 60px Arial";
  ctx.fillText("🧠 DAILY CHALLENGE", 180, 100);

  // Quote
  ctx.font = "36px Arial";
  wrapText(ctx, `"${question.quote}"`, 100, 220, 880, 50);

  // Question
  ctx.fillStyle = "#22c55e";
  ctx.font = "bold 42px Arial";
  wrapText(ctx, `Q: ${question.question}`, 100, 500, 880, 55);

  // Footer
  ctx.fillStyle = "#ffffff";
  ctx.font = "32px Arial";
  ctx.fillText("📹 Send your 1-min speaking video", 220, 950);

  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync("./daily.png", buffer);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";

  for (let n = 0; n < words.length; n++) {
    let testLine = line + words[n] + " ";
    let metrics = ctx.measureText(testLine);
    let testWidth = metrics.width;

    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}
