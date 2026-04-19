import { exec } from "child_process";
import path from "path";

export function extractAudio(videoPath, id) {
  return new Promise((resolve, reject) => {
    const audioPath = path.resolve(`./tmp/audio_${id}.mp3`);
    exec(
      `ffmpeg -i "${videoPath}" -vn -ar 16000 -ac 1 -b:a 64k "${audioPath}" -y`,
      (err) => {
        if (err) return reject(err);
        resolve(audioPath);
      }
    );
  });
}
