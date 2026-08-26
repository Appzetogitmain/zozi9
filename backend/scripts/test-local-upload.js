import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { saveFileLocally, deleteLocalFile } from "../app/services/localStorageService.js";
import { uploadToCloudinary, storageProvider } from "../app/services/mediaService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function runTest() {
  console.log("=== Testing Local Media Storage ===");
  console.log(`Current Storage Provider: ${storageProvider()}`);
  console.log(`Media Base URL: ${process.env.MEDIA_BASE_URL}`);

  // Create a 100x100 PNG buffer
  const samplePngBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );

  // 1. Test image save and Sharp WebP conversion
  console.log("\n1. Testing Image Upload (PNG -> WebP conversion)...");
  const imgResult = await saveFileLocally(samplePngBuffer, "products", {
    originalname: "test-product.png",
    mimeType: "image/png",
  });
  console.log("Image saved successfully:", imgResult);

  if (!imgResult.url || !imgResult.filename.endsWith(".webp")) {
    throw new Error("Image upload test failed: expected .webp extension");
  }

  // 2. Test banner upload via mediaService delegation
  console.log("\n2. Testing Banner Upload via mediaService delegation...");
  const bannerUrl = await uploadToCloudinary(samplePngBuffer, "banners", {
    mimeType: "image/jpeg",
    resourceType: "image",
  });
  console.log("Banner URL generated:", bannerUrl);

  // 3. Test video / raw buffer save
  console.log("\n3. Testing Video/Raw Buffer Upload...");
  const sampleVideoBuffer = Buffer.from("SAMPLE_VIDEO_STREAM_DATA");
  const videoResult = await saveFileLocally(sampleVideoBuffer, "videos", {
    originalname: "sample-intro.mp4",
    mimeType: "video/mp4",
  });
  console.log("Video saved successfully:", videoResult);

  if (!videoResult.filename.endsWith(".mp4")) {
    throw new Error("Video upload test failed: expected .mp4 extension");
  }

  console.log("\nAll Local Storage tests passed successfully!");
}

runTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed with error:", err);
    process.exit(1);
  });
