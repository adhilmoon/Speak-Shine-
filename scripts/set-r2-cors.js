/**
 * set-r2-cors.js
 * Applies CORS rules to the R2 bucket so browsers can PUT directly via presigned URLs.
 * Run once: node scripts/set-r2-cors.js
 */

import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const {
  R2_ENDPOINT,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  ALLOWED_ORIGINS,
  FRONTEND_URL,
} = process.env;

if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error("❌ Missing R2 environment variables. Check your .env file.");
  process.exit(1);
}

// Build the list of allowed origins from env
const origins = [
  ...(ALLOWED_ORIGINS ? ALLOWED_ORIGINS.split(",").map(o => o.trim()) : []),
  ...(FRONTEND_URL ? [FRONTEND_URL.trim()] : []),
  "http://localhost:5173",
  "http://localhost:3000",
].filter(Boolean);

// Deduplicate
const uniqueOrigins = [...new Set(origins)];

console.log("🌐 Allowed origins:", uniqueOrigins);

const r2 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const corsConfig = {
  CORSRules: [
    {
      // Allow browsers to PUT directly via presigned URLs
      AllowedOrigins: uniqueOrigins,
      AllowedMethods: ["PUT", "GET", "HEAD"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag", "Content-Length"],
      MaxAgeSeconds: 3600,
    },
  ],
};

async function applyCors() {
  try {
    console.log(`\n📦 Applying CORS rules to bucket: ${R2_BUCKET_NAME}`);
    console.log("📋 CORS config:", JSON.stringify(corsConfig, null, 2));

    await r2.send(
      new PutBucketCorsCommand({
        Bucket: R2_BUCKET_NAME,
        CORSConfiguration: corsConfig,
      })
    );

    console.log("\n✅ CORS rules applied successfully!");

    // Verify by reading back
    const result = await r2.send(
      new GetBucketCorsCommand({ Bucket: R2_BUCKET_NAME })
    );
    console.log("\n🔍 Verified CORS rules on bucket:");
    console.log(JSON.stringify(result.CORSRules, null, 2));
  } catch (err) {
    console.error("\n❌ Failed to apply CORS rules:", err.message);
    if (err.Code) console.error("   Error code:", err.Code);
    process.exit(1);
  }
}

applyCors();
