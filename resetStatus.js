import dotenv from "dotenv";
import { connectDB } from "./db.js";
import Status from "./models/statusSchema.js";

dotenv.config();
await connectDB();

await Status.updateOne({}, {
  questionSentToday: false,
  notifiedEmpty: false,
  notifiedLast: false,
  fineAppliedToday: false,
});

console.log("✅ Status reset done");
process.exit(0);
