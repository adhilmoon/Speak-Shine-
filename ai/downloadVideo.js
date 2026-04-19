import { downloadMediaMessage } from "@whiskeysockets/baileys";
import fs from "fs";
import path from "path";

export async function downloadVideo(msg, id) {
  const buffer = await downloadMediaMessage(msg, "buffer", {});
  const filePath = path.resolve(`./tmp/video_${id}.mp4`);
  fs.mkdirSync("./tmp", { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return filePath;
}
