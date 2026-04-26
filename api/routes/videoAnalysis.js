import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { authMiddleware } from "../middleware/auth.js";
import VideoReport from "../../models/videoReportSchema.js";
import User from "../../models/userSchema.js";
import { processWebVideo } from "../../ai/webVideoProcessor.js";
import { exec } from "child_process";

const router = express.Router();

// Configure multer for video uploads (max 350MB)
const upload = multer({
  dest: "tmp/uploads/",
  limits: { fileSize: 350 * 1024 * 1024 }, // 350MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "video/mp4", 
      "video/quicktime", 
      "video/x-msvideo", 
      "video/webm",
      "video/mpeg",
      "video/3gpp",
      "video/x-flv",
      "video/x-ms-wmv"
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed (MP4, MOV, AVI, WEBM, MPEG, 3GP, FLV, WMV). Max size: 350MB"));
    }
  },
});

/**
 * POST /api/video/upload
 * Upload a video for analysis (web-based submission)
 * Returns a report ID that can be used to check status
 */
router.post("/upload", authMiddleware, (req, res, next) => {
  // Handle multer errors explicitly (file too large, wrong type, etc.)
  upload.single("video")(req, res, (err) => {
    if (err) {
      console.error("[VideoUpload] Multer error:", err.message);
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large. Maximum size is 350MB." });
      }
      return res.status(400).json({ error: err.message || "File upload failed" });
    }
    next();
  });
}, async (req, res) => {
  let videoPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No video file uploaded" });
    }

    videoPath = req.file.path;
    const userId = req.user.id;
    const phone = req.user.phone;

    console.log(`[VideoUpload] File received: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)}MB) user=${phone}`);

    // Ensure tmp/uploads directory exists
    const uploadDir = path.dirname(videoPath);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Get video duration
    let duration;
    try {
      duration = await getVideoDuration(videoPath);
      console.log(`[VideoUpload] Duration: ${duration}s`);
    } catch (durationErr) {
      console.error("[VideoUpload] Duration check failed:", durationErr.message);
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      return res.status(400).json({ error: durationErr.message });
    }

    if (duration < 60) {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      return res.status(400).json({ error: `Video is too short (${duration}s). Minimum is 1 minute.` });
    }

    if (duration > 300) {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      return res.status(400).json({ error: `Video is too long (${Math.round(duration/60)}min). Maximum is 5 minutes.` });
    }

    // Create a pending report entry
    const report = await VideoReport.create({
      userId,
      phone,
      videoFileName: req.file.originalname,
      videoDuration: duration,
      status: "processing",
    });

    console.log(`[VideoUpload] Report created: ${report._id}`);

    // Start processing in background (don't await)
    processVideoInBackground(report._id, videoPath, duration, userId, phone);

    res.json({
      success: true,
      reportId: report._id,
      message: "Video uploaded successfully. Analysis in progress...",
      estimatedTime: "2-3 minutes",
    });

  } catch (err) {
    console.error("[VideoUpload] Unexpected error:", err);
    if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    res.status(500).json({ error: err.message || "Failed to upload video" });
  }
});

/**
 * GET /api/video/report/:reportId
 * Get the analysis report for a specific video submission
 */
router.get("/report/:reportId", authMiddleware, async (req, res) => {
  try {
    const report = await VideoReport.findById(req.params.reportId);
    
    if (!report) {
      return res.status(404).json({ error: "Report not found or expired" });
    }

    // Verify ownership
    if (report.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({
      reportId: report._id,
      status: report.status,
      submittedAt: report.submittedAt,
      expiresAt: report.expiresAt,
      videoFileName: report.videoFileName,
      videoDuration: report.videoDuration,
      analysis: report.status === "completed" ? report.analysis : null,
      errorMessage: report.errorMessage,
    });

  } catch (err) {
    console.error("Get report error:", err);
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

/**
 * GET /api/video/my-reports
 * Get all active reports for the current user (not expired)
 */
router.get("/my-reports", authMiddleware, async (req, res) => {
  try {
    const reports = await VideoReport.find({
      userId: req.user.id,
      expiresAt: { $gt: new Date() }, // Only non-expired reports
    })
      .sort({ submittedAt: -1 })
      .limit(10)
      .select("-analysis.transcription"); // Exclude full transcription for list view

    res.json({ reports });

  } catch (err) {
    console.error("Get reports error:", err);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

/**
 * DELETE /api/video/report/:reportId
 * Delete a report before it expires (optional — reports auto-delete after 12h)
 */
router.delete("/report/:reportId", authMiddleware, async (req, res) => {
  try {
    const report = await VideoReport.findById(req.params.reportId);
    
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    // Verify ownership
    if (report.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    await VideoReport.deleteOne({ _id: req.params.reportId });
    res.json({ success: true, message: "Report deleted" });

  } catch (err) {
    console.error("Delete report error:", err);
    res.status(500).json({ error: "Failed to delete report" });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get video duration using ffprobe
 * Uses JSON output — works without file extension
 */
function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;

    exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err || !stdout?.trim()) {
        // Fallback: try ffmpeg -i to read duration from stderr
        const fallback = `ffmpeg -i "${videoPath}" 2>&1 | grep Duration`;
        exec(fallback, { timeout: 15000 }, (err2, out2) => {
          const match = (out2 || "").match(/Duration:\s*(\d+):(\d+):(\d+)/);
          if (match) {
            const secs = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
            if (secs > 0) return resolve(secs);
          }
          console.error("[ffprobe] failed:", stderr || err?.message);
          return reject(new Error("Could not read video duration. Please ensure the file is a valid video."));
        });
        return;
      }

      try {
        const info = JSON.parse(stdout);
        const dur =
          parseFloat(info?.format?.duration) ||
          parseFloat(info?.streams?.find(s => s.codec_type === "video")?.duration) ||
          0;

        if (!dur || dur <= 0) {
          return reject(new Error("Could not determine video duration. Please try a different file."));
        }
        resolve(Math.round(dur));
      } catch (parseErr) {
        return reject(new Error("Could not read video metadata. Please try a different file."));
      }
    });
  });
}

/**
 * Process video in background using the web video processor
 */
async function processVideoInBackground(reportId, videoPath, duration, userId, phone) {
  try {
    console.log(`[VideoAnalysis] Processing report ${reportId} for user ${phone}`);

    // Get user's display name
    const user = await User.findOne({ phone });
    const displayName = user?.name || phone;

    // Process the video using the web processor
    const result = await processWebVideo(
      videoPath,
      userId,
      phone,
      displayName,
      async (stage) => {
        console.log(`[VideoAnalysis] ${reportId}: ${stage}`);
      }
    );

    // Update the report with results
    await VideoReport.findByIdAndUpdate(reportId, {
      status: "completed",
      analysis: result.analysis,
    });

    console.log(`[VideoAnalysis] Report ${reportId} completed successfully`);

  } catch (err) {
    console.error(`[VideoAnalysis] Report ${reportId} failed:`, err);
    
    await VideoReport.findByIdAndUpdate(reportId, {
      status: "failed",
      errorMessage: err.message || "Analysis failed",
    });

  } finally {
    // Clean up video file
    if (videoPath && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }
  }
}

export default router;
