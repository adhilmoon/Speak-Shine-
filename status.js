import dotenv from "dotenv";
import { connectDB } from "./db.js";
import Status from "./models/statusSchema.js";

dotenv.config();
await connectDB();

const status = await Status.findOne();

if (!status) {
  console.log("⚠️ No status document found in DB.");
} else {
  console.log("\n📋 Current Status:\n");
  console.log(`  questionSentToday : ${status.questionSentToday}`);
  console.log(`  notifiedEmpty     : ${status.notifiedEmpty}`);
  console.log(`  notifiedLast      : ${status.notifiedLast}`);
  console.log(`  fineAppliedToday  : ${status.fineAppliedToday}`);
  console.log(`  _id               : ${status._id}`);
  console.log(`  updatedAt         : ${status.updatedAt ? new Date(status.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "N/A (timestamps not enabled yet)"}`)
  console.log();
}

process.exit(0);
