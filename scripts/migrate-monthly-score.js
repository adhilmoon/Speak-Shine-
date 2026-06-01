/**
 * Migration: seed monthlyScore from todayScore for existing users
 *
 * Production DB has todayScore (old field, 0–100 daily composite).
 * New schema uses monthlyScore (cumulative, resets on 1st of month).
 *
 * This script copies todayScore → monthlyScore for every user that:
 *   - has todayScore > 0
 *   - AND monthlyScore is 0 or missing (not yet migrated)
 *
 * Safe to run multiple times — the $ne guard prevents overwriting real data.
 *
 * Usage:
 *   node scripts/migrate-monthly-score.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌  MONGODB_URI not set in .env");
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
console.log("✅  Connected to MongoDB");

const User = mongoose.model(
  "User",
  new mongoose.Schema({}, { strict: false, collection: "users" })
);

// 1. Find users that have todayScore but monthlyScore is 0 / missing
const candidates = await User.find({
  todayScore: { $gt: 0 },
  $or: [
    { monthlyScore: { $exists: false } },
    { monthlyScore: 0 },
  ],
}).lean();

console.log(`Found ${candidates.length} user(s) to migrate`);

let migrated = 0;
for (const u of candidates) {
  const score = u.todayScore;
  await User.updateOne(
    { _id: u._id },
    { $set: { monthlyScore: score } }
  );
  console.log(`  ✓ ${u.name || u.userId} — todayScore ${score.toFixed(2)} → monthlyScore ${score.toFixed(2)}`);
  migrated++;
}

console.log(`\n✅  Migration complete — ${migrated} user(s) updated`);
await mongoose.disconnect();
