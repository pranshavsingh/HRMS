import { decryptPayload } from "../../utils/crypto.js";
import { sendOtpEmail } from "../../utils/mailer.js";
import accountsRepository from "../../repositories/accounts.repository.js";
import logger from "../../utils/logger.js";

/**
 * BullMQ Job Handler for Password Reset OTP Email dispatch.
 * Decrypts the AES-256-GCM outbox payload, verifies that the OTP has not
 * expired or been superseded, and sends the email via SMTP.
 * 
 * @param {import("bullmq").Job} job - BullMQ job instance
 */
export async function sendOtpEmailHandler(job) {
  const { outboxEventId, eventType, payload } = job.data;

  logger.info(
    "[JobHandler:sendOtpEmail] Processing OTP dispatch: JobID [%s], OutboxID [%s], Attempt [%d/%d]",
    job.id,
    outboxEventId,
    job.attemptsMade + 1,
    job.opts.attempts || 5
  );

  let decrypted;
  try {
    // 1. Decrypt authenticated AES-256-GCM payload
    decrypted = decryptPayload(payload);
  } catch (err) {
    logger.error("[JobHandler:sendOtpEmail] Decryption error for JobID [%s]: %s", job.id, err.message);
    // Malformed or corrupted encryption is a non-retryable error
    throw new Error(`Non-retryable poison payload: ${err.message}`);
  }

  const { email, otp, otpHash } = decrypted;

  if (!email || !otp) {
    throw new Error("Non-retryable poison payload: missing required email or OTP field.");
  }

  // 2. Fresh Database State Check (Prevent sending stale, superseded, or consumed OTPs)
  const currentOtpRecord = await accountsRepository.findOtpByEmail(email);

  if (!currentOtpRecord) {
    logger.info(
      "[JobHandler:sendOtpEmail] OTP record no longer exists in database for recipient. Skipping stale email dispatch."
    );
    return { skipped: true, reason: "RECORD_NOT_FOUND" };
  }

  if (currentOtpRecord.consumed_at) {
    logger.info(
      "[JobHandler:sendOtpEmail] OTP record was already consumed. Skipping stale email dispatch."
    );
    return { skipped: true, reason: "ALREADY_CONSUMED" };
  }

  if (new Date(currentOtpRecord.expires_at) < new Date()) {
    logger.info(
      "[JobHandler:sendOtpEmail] OTP record has already expired. Skipping stale email dispatch."
    );
    return { skipped: true, reason: "EXPIRED" };
  }

  if (otpHash && currentOtpRecord.otp_hash !== otpHash) {
    logger.info(
      "[JobHandler:sendOtpEmail] A newer OTP was requested for this recipient. Skipping superseded email dispatch."
    );
    return { skipped: true, reason: "SUPERSEDED" };
  }

  // 3. Dispatch Email via SMTP
  try {
    await sendOtpEmail(email, otp);
    logger.info(
      "[JobHandler:sendOtpEmail] Successfully dispatched OTP email to recipient for JobID [%s].",
      job.id
    );
    return { success: true, recipient: email };
  } catch (smtpErr) {
    logger.error(
      "[JobHandler:sendOtpEmail] SMTP transmission failure for JobID [%s]: %s (Triggering BullMQ backoff retry)",
      job.id,
      smtpErr.message
    );
    // Throw error so BullMQ handles exponential backoff and retry
    throw smtpErr;
  }
}

export default sendOtpEmailHandler;
