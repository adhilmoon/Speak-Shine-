/**
 * One-time script to mark all stuck "processing" jobs as failed.
 * Run: node clearStuckJob.js
 */
import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "./db.js";
import VideoReport from "./models/videoReportSchema.js";

await connectDB();

const result = await VideoReport.updateMany(
  { status: "processing" },
  {
    $set: {
      status: "failed",
      errorMessage: "Manually cleared — video was too large and caused server OOM. Please re-upload a smaller file.",
      retryCount: 99,
    },
  }
);

console.log(`✅ Cleared ${result.modifiedCount} stuck job(s)`);
process.exit(0);
