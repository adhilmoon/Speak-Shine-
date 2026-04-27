import dotenv from "dotenv";
import { connectDB } from "./db.js";
import VideoReport from "./models/videoReportSchema.js";

dotenv.config();

async function retryStuckVideos() {
  await connectDB();
  
  // Find videos stuck in processing for more than 10 minutes
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  
  const stuckVideos = await VideoReport.find({
    status: "processing",
    submittedAt: { $lt: tenMinutesAgo }
  });
  
  console.log(`Found ${stuckVideos.length} stuck videos`);
  
  for (const video of stuckVideos) {
    console.log(`\nVideo ID: ${video._id}`);
    console.log(`Phone: ${video.phone}`);
    console.log(`Submitted: ${video.submittedAt}`);
    console.log(`Duration: ${video.videoDuration}s`);
    console.log(`File: ${video.videoFileName}`);
    
    // Mark as failed since the video file is likely deleted
    await VideoReport.findByIdAndUpdate(video._id, {
      status: "failed",
      errorMessage: "Processing timeout - video file no longer available. Please re-upload."
    });
    
    console.log(`✅ Marked as failed`);
  }
  
  console.log(`\n✅ Done! Updated ${stuckVideos.length} stuck videos`);
  process.exit(0);
}

retryStuckVideos().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
