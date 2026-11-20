import { v2 as cloudinary } from "cloudinary";
import crypto from "crypto";
import { config } from "../config/env.js";
import logger from "../utils/logger.js";
import { AppError } from "../middleware/errorHandler.js";

// Configure Cloudinary only if credentials are provided
if (config.cloudinaryCloudName && config.cloudinaryApiKey && config.cloudinaryApiSecret) {
  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret,
    secure: true,
  });
  logger.info("Cloudinary service initialized successfully");
} else {
  logger.warn("Cloudinary credentials are not fully set. File uploads to Cloudinary will fail.");
}

export const cloudinaryService = {
  /**
   * Helper to write a buffer stream directly to Cloudinary
   */
  async _uploadStream(buffer, options) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error) {
          logger.error("Cloudinary stream upload error: %s", error.message);
          return reject(error);
        }
        resolve(result);
      });
      stream.end(buffer);
    });
  },

  /**
   * Upload attendance photo and compress aggressively to WebP (<100kb)
   */
  async uploadAttendancePhoto(buffer, filename) {
    const uuid = crypto.randomUUID();
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const folder = `attendance/${year}/${month}`;

    const options = {
      folder,
      public_id: uuid,
      quality: "auto:eco",
      fetch_format: "webp",
      format: "webp",
      width: 800,
      height: 800,
      crop: "limit",
    };

    logger.info("Uploading attendance photo to Cloudinary: %s/%s", folder, uuid);
    const result = await this._uploadStream(buffer, options);
    return {
      public_id: result.public_id,
      secure_url: result.secure_url,
      format: result.format,
      bytes: result.bytes,
    };
  },

  /**
   * Upload private documents
   */
  async uploadDocument(buffer, filename, userId) {
    const uuid = crypto.randomUUID();
    const folder = `employee-documents/${userId}`;

    const options = {
      folder,
      public_id: uuid,
      type: "private",
      upload_preset: config.cloudinaryDocumentsPreset,
    };

    logger.info("Uploading private document to Cloudinary: %s/%s", folder, uuid);
    const result = await this._uploadStream(buffer, options);
    return {
      public_id: result.public_id,
      secure_url: result.secure_url,
      format: result.format,
      bytes: result.bytes,
    };
  },

  /**
   * Generate temporary signed URLs for private documents
   */
  generateSignedUrl(publicId, options = {}) {
    if (!publicId) return null;
    logger.info("Generating signed URL for Cloudinary private asset: %s", publicId);
    // Use private_download_url to support private signed URLs correctly
    return cloudinary.utils.private_download_url(publicId, null, {
      resource_type: "image",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      ...options,
    });
  },

  /**
   * Generate upload signature for direct frontend uploads
   */
  generateUploadSignature(params) {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = {
      ...params,
      timestamp,
    };
    const signature = cloudinary.utils.api_sign_request(paramsToSign, config.cloudinaryApiSecret);
    return {
      signature,
      timestamp,
      apiKey: config.cloudinaryApiKey,
      cloudName: config.cloudinaryCloudName,
    };
  },

  /**
   * Verify Cloudinary asset metadata to ensure integrity
   */
  async verifyMetadata(publicId, expectedFolderPrefix, isPrivate = false) {
    try {
      logger.info("Verifying Cloudinary metadata for publicId: %s", publicId);
      const resource = await cloudinary.api.resource(publicId, {
        type: isPrivate ? "private" : "upload",
      });

      if (!resource) {
        throw new AppError("Uploaded asset not found on storage provider", 400);
      }

      // 1. Verify folder prefix
      if (expectedFolderPrefix && !resource.public_id.startsWith(expectedFolderPrefix)) {
        throw new AppError("Invalid file path / folder destination spoofed", 400);
      }

      // 2. Verify resource format
      const allowedFormats = ["pdf", "jpg", "jpeg", "webp"];
      if (!allowedFormats.includes((resource.format || "").toLowerCase())) {
        throw new AppError("File format type not allowed", 400);
      }

      // 3. Verify size is under 2MB for private documents
      if (isPrivate && resource.bytes > 2 * 1024 * 1024) {
        throw new AppError("File size exceeds the allowed limit of 2MB", 400);
      }

      return resource;
    } catch (err) {
      logger.error("Cloudinary resource metadata validation failed: %s", err.message);
      if (err instanceof AppError) throw err;
      throw new AppError(`File verification failed: ${err.message}`, 400);
    }
  },

  /**
   * Destroy an asset in Cloudinary
   */
  async destroy(publicId, isPrivate = false) {
    try {
      logger.info("Destroying Cloudinary asset: %s (private: %s)", publicId, isPrivate);
      const result = await cloudinary.uploader.destroy(publicId, {
        type: isPrivate ? "private" : "upload",
      });
      return result;
    } catch (err) {
      logger.error("Failed to destroy Cloudinary asset: %s. Error: %s", publicId, err.message);
      throw err;
    }
  }
};

export default cloudinaryService;
