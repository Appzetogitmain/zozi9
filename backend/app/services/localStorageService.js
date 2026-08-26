import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import logger from "./logger.js";

const DEFAULT_UPLOADS_ROOT = path.resolve("./uploads");

function getUploadsRoot() {
  const configured = process.env.LOCAL_MEDIA_PATH;
  return configured ? path.resolve(configured) : DEFAULT_UPLOADS_ROOT;
}

function ensureDirectory(dirPath) {
  if (!fsSync.existsSync(dirPath)) {
    fsSync.mkdirSync(dirPath, { recursive: true });
  }
}

const ALLOWED_MIME_TYPES = (
  process.env.MEDIA_ALLOWED_MIME_TYPES ||
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf"
)
  .split(",")
  .map((m) => m.trim().toLowerCase());

/**
 * Sanitize folder to prevent directory traversal
 */
function sanitizeFolder(rawFolder = "misc") {
  return String(rawFolder || "misc")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\.\./g, "")
    .replace(/^\/+|\/+$/g, "") || "misc";
}

/**
 * Check if the mime type indicates an image that can be optimized
 */
function isOptimizableImage(mimeType = "") {
  const mime = String(mimeType || "").trim().toLowerCase();
  return (
    mime === "image/jpeg" ||
    mime === "image/jpg" ||
    mime === "image/png" ||
    mime === "image/webp" ||
    mime === "image/avif"
  );
}

/**
 * Save file locally on the server
 * @param {Buffer} fileBuffer - The binary buffer of the uploaded file
 * @param {string} folder - Target subfolder (e.g. 'products', 'banners', 'categories', 'videos')
 * @param {object} options - Options including originalname, mimeType, optimize
 * @returns {Promise<{url: string, relativeUrl: string, filename: string, bytes: number, mimeType: string}>}
 */
export async function saveFileLocally(fileBuffer, folder = "misc", options = {}) {
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    const err = new Error("Valid file buffer is required for local storage");
    err.statusCode = 400;
    throw err;
  }

  const uploadsRoot = getUploadsRoot();
  const safeFolder = sanitizeFolder(folder);
  const targetDir = path.join(uploadsRoot, safeFolder);
  ensureDirectory(targetDir);

  const mimeType = String(options.mimeType || options.mimetype || "").trim().toLowerCase();
  const originalname = String(options.originalname || "upload.bin").trim();
  const shouldOptimize = options.optimize !== false && isOptimizableImage(mimeType);

  const randomSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const timestamp = Date.now();

  let finalBuffer = fileBuffer;
  let finalFileName = "";
  let finalMimeType = mimeType || "application/octet-stream";

  if (shouldOptimize) {
    // Convert to webp and optimize image
    finalFileName = `${timestamp}-${randomSuffix}.webp`;
    finalMimeType = "image/webp";
    try {
      finalBuffer = await sharp(fileBuffer)
        .rotate() // auto-orient based on EXIF
        .webp({ quality: 82, effort: 4 })
        .toBuffer();
    } catch (sharpError) {
      logger.warn("Sharp optimization failed, saving original buffer", {
        error: sharpError.message,
      });
      // Fallback to saving original buffer
      const ext = path.extname(originalname) || ".jpg";
      finalFileName = `${timestamp}-${randomSuffix}${ext}`;
      finalBuffer = fileBuffer;
      finalMimeType = mimeType || "image/jpeg";
    }
  } else {
    // Keep original extension for videos, GIFs, and PDFs
    let ext = path.extname(originalname);
    if (!ext) {
      if (mimeType.includes("mp4")) ext = ".mp4";
      else if (mimeType.includes("webm")) ext = ".webm";
      else if (mimeType.includes("gif")) ext = ".gif";
      else if (mimeType.includes("pdf")) ext = ".pdf";
      else ext = ".bin";
    }
    finalFileName = `${timestamp}-${randomSuffix}${ext}`;
  }

  const destinationPath = path.join(targetDir, finalFileName);
  await fs.writeFile(destinationPath, finalBuffer);

  // Build URLs
  const relativeUrl = `/uploads/${safeFolder}/${finalFileName}`.replace(/\/+/g, "/");
  const configuredBase = process.env.MEDIA_BASE_URL;
  let absoluteUrl = "";

  if (configuredBase) {
    const cleanBase = configuredBase.replace(/\/+$/, "");
    if (cleanBase.endsWith("/uploads")) {
      absoluteUrl = `${cleanBase}/${safeFolder}/${finalFileName}`;
    } else {
      absoluteUrl = `${cleanBase}/uploads/${safeFolder}/${finalFileName}`;
    }
  } else {
    absoluteUrl = relativeUrl;
  }

  logger.info("Saved local media file", {
    destinationPath,
    bytes: finalBuffer.length,
    mimeType: finalMimeType,
  });

  return {
    url: absoluteUrl,
    secureUrl: absoluteUrl,
    relativeUrl,
    filename: finalFileName,
    bytes: finalBuffer.length,
    mimeType: finalMimeType,
  };
}

/**
 * Delete a locally stored file
 * @param {string} fileUrlOrPath - Full URL or relative path
 */
export async function deleteLocalFile(fileUrlOrPath) {
  try {
    if (!fileUrlOrPath) return;
    const uploadsRoot = getUploadsRoot();

    let relativePath = fileUrlOrPath;
    if (relativePath.includes("/uploads/")) {
      relativePath = relativePath.split("/uploads/")[1];
    } else if (relativePath.startsWith("/")) {
      relativePath = relativePath.slice(1);
    }

    const safeRelativePath = sanitizeFolder(path.dirname(relativePath)) + "/" + path.basename(relativePath);
    const fullPath = path.join(uploadsRoot, safeRelativePath);

    if (fsSync.existsSync(fullPath)) {
      await fs.unlink(fullPath);
      logger.info("Deleted local media file", { fullPath });
    }
  } catch (error) {
    logger.warn("Failed to delete local media file", {
      file: fileUrlOrPath,
      error: error.message,
    });
  }
}

export default {
  saveFileLocally,
  deleteLocalFile,
};
