import fs from "fs";
import path from "path";
import { config } from "../config/env.js";
import logger from "../utils/logger.js";
import { buildMediaPath } from "../utils/common.js";
import { AppError } from "../middleware/errorHandler.js";
import cloudinaryService from "./cloudinary.service.js";

class StorageService {
  /**
   * Stores a file and returns its relative URI path or Cloudinary scheme path.
   * @param {object} file - Express multer file object containing buffer
   * @param {string} category - 'attendance' or 'documents'
   * @param {string|number|null} userId - The target user's ID
   * @returns {Promise<string>} database reference path (prefixed with cloudinary://)
   */
  async store(file, category, userId = null) {
    // If Cloudinary keys are missing, throw error instead of falling back to disk
    if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) {
      if (process.env.NODE_ENV === "test") {
        return `cloudinary://test-fixtures/${category}/${userId || "general"}/doc_${Date.now()}`;
      }
      logger.error("Cloudinary credentials are not configured. Upload failed.");
      throw new AppError("Cloudinary storage service is not configured.", 500);
    }

    if (category === "attendance") {
      const result = await cloudinaryService.uploadAttendancePhoto(file.buffer, file.originalname);
      return `cloudinary://${result.public_id}`;
    } else {
      const result = await cloudinaryService.uploadDocument(file.buffer, file.originalname, userId || "general");
      return `cloudinary://${result.public_id}`;
    }
  }

  /**
   * Deletes a file from local disk or Cloudinary.
   * @param {string} dbPath - The path stored in the database
   */
  async delete(dbPath) {
    if (!dbPath) return;

    if (dbPath.startsWith("cloudinary://")) {
      const publicId = dbPath.replace("cloudinary://", "");
      if (publicId.startsWith("test-fixtures/")) return;
      const isPrivate = publicId.startsWith("employee-documents/");
      try {
        await cloudinaryService.destroy(publicId, isPrivate);
        logger.info("Deleted Cloudinary asset: %s", publicId);
      } catch (err) {
        logger.error("Failed to delete Cloudinary asset: %s. Error: %s", publicId, err.message);
      }
      return;
    }

    // Fallback: Delete legacy local file from disk with strict path traversal boundary check
    const rootDir = path.resolve(process.cwd(), config.mediaRoot);
    const absolutePath = path.resolve(rootDir, dbPath);
    if (!absolutePath.startsWith(rootDir + path.sep) && absolutePath !== rootDir) {
      logger.warn("[Security] Path traversal attempt blocked in storage delete: %s", dbPath);
      return;
    }

    try {
      if (fs.existsSync(absolutePath)) {
        await fs.promises.unlink(absolutePath);
        logger.info("Deleted local file: %s", absolutePath);
      }
    } catch (err) {
      logger.error("Failed to delete local file: %s. Error: %s", absolutePath, err.message);
    }
  }

  /**
   * Resolves a database path to a public URL or a signed private URL.
   * @param {string} dbPath 
   * @returns {string|null} URL
   */
  getUrl(dbPath) {
    if (!dbPath) return null;

    if (dbPath.startsWith("cloudinary://")) {
      const publicId = dbPath.replace("cloudinary://", "");
      if (publicId.startsWith("test-fixtures/")) {
        return `https://res.cloudinary.com/test-mock/image/upload/${publicId}.webp`;
      }
      const isPrivate = publicId.startsWith("employee-documents/");
      if (isPrivate) {
        return cloudinaryService.generateSignedUrl(publicId);
      }
      return `https://res.cloudinary.com/${config.cloudinaryCloudName}/image/upload/${publicId}.webp`;
    }

    // Fallback for legacy files stored on local disk
    return buildMediaPath(dbPath);
  }
}

export const storageService = new StorageService();
export default storageService;
