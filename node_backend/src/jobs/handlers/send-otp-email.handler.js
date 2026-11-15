import { decryptPayload } from "../../utils/crypto.js";
import { sendOtpEmail } from "../../utils/mailer.js";
import accountsRepository from "../../repositories/accounts.repository.js";
import outboxRepository from "../../repositories/outbox.repository.js";
import consumerIdempotencyRepository from "../../repositories/consumer-idempotency.repository.js";
import logger from "../../utils/logger.js";

const HANDLER_NAME = "Send Password Reset OTP Email";

/**
 * BullMQ Job Handler for Password Reset OTP Email dispatch.
 * Decrypts the AES-256-GCM outbox payload, verifies that the OTP has not
 * expired or been superseded, and sends the email via SMTP.
 * Enforces durable consumer idempotency to prevent duplicate deliveries.
 * 
 * @param {import("bullmq").Job} job - BullMQ job instance
 */
export async function sendOtpEmailHandler(job) {
  const { outboxEventId, eventType, payload } = job.data || {};
  const jobId = job.id || `adhoc_${Date.now()}`;
  const workerId = job.processedBy || process.env.WORKER_ID || `worker_${process.pid}`;

  logger.info(
    "[JobHandler:sendOtpEmail] Processing OTP dispatch: JobID [%s], OutboxID [%s], Worker [%s], Attempt [%d/%d]",
    jobId,
    outboxEventId,
    workerId,
    (job.attemptsMade || 0) + 1,
    (job.opts && job.opts.attempts) || 5
  );

  // 1. Durable Consumer Idempotency Check with Lease and Fencing Token
  const claim = await consumerIdempotencyRepository.claimExecution(jobId, HANDLER_NAME, workerId, 60);
  if (!claim.acquired) {
    logger.info(
      "[JobHandler:sendOtpEmail] Job [%s] claim not acquired (%s). Skipping duplicate execution (Durable Idempotency).",
      jobId,
      claim.reason
    );
    const reason = claim.reason === "ALREADY_COMPLETED" ? "ALREADY_PROCESSED" : (claim.reason || "ALREADY_PROCESSED");
    return { duplicate: true, skipped: true, reason };
  }
  const fencingToken = claim.fencingToken;

  let decrypted;
  try {
    // 2. Decrypt authenticated AES-256-GCM payload
    decrypted = decryptPayload(payload);
  } catch (err) {
    logger.error("[JobHandler:sendOtpEmail] Poison payload decryption error for JobID [%s]: %s", jobId, err.message);
    if (outboxEventId) {
      await outboxRepository.markDeadLetter(outboxEventId, `Poison payload: ${err.message}`).catch(() => {});
    }
    await consumerIdempotencyRepository.markDeadLetter(jobId, HANDLER_NAME, workerId, fencingToken, err.message).catch(() => {});
    return { status: "DEAD_LETTER", reason: "PAYLOAD_DECRYPTION_FAILED", error: err.message };
  }

  const { email, otp, otpHash } = decrypted || {};

  if (!email || !otp) {
    const errorMsg = "Poison payload: missing required email or OTP field.";
    if (outboxEventId) {
      await outboxRepository.markDeadLetter(outboxEventId, errorMsg).catch(() => {});
    }
    await consumerIdempotencyRepository.markDeadLetter(jobId, HANDLER_NAME, workerId, fencingToken, errorMsg).catch(() => {});
    return { status: "DEAD_LETTER", reason: "MISSING_REQUIRED_FIELDS", error: errorMsg };
  }

  // 3. Fresh Database State Check (Prevent sending stale, superseded, or consumed OTPs)
  const currentOtpRecord = await accountsRepository.findOtpByEmail(email);

  if (!currentOtpRecord) {
    logger.info(
      "[JobHandler:sendOtpEmail] OTP record no longer exists in database for recipient. Skipping stale email dispatch."
    );
    await consumerIdempotencyRepository.completeExecution(jobId, HANDLER_NAME, workerId, fencingToken, { skipped: true, reason: "RECORD_NOT_FOUND" });
    return { skipped: true, reason: "RECORD_NOT_FOUND" };
  }

  if (currentOtpRecord.consumed_at) {
    logger.info(
      "[JobHandler:sendOtpEmail] OTP record was already consumed. Skipping stale email dispatch."
    );
    await consumerIdempotencyRepository.completeExecution(jobId, HANDLER_NAME, workerId, fencingToken, { skipped: true, reason: "ALREADY_CONSUMED" });
    return { skipped: true, reason: "ALREADY_CONSUMED" };
  }

  if (new Date(currentOtpRecord.expires_at) < new Date()) {
    logger.info(
      "[JobHandler:sendOtpEmail] OTP record has already expired. Skipping stale email dispatch."
    );
    await consumerIdempotencyRepository.completeExecution(jobId, HANDLER_NAME, workerId, fencingToken, { skipped: true, reason: "EXPIRED" });
    return { skipped: true, reason: "EXPIRED" };
  }

  if (otpHash && currentOtpRecord.otp_hash !== otpHash) {
    logger.info(
      "[JobHandler:sendOtpEmail] A newer OTP was requested for this recipient. Skipping superseded email dispatch."
    );
    await consumerIdempotencyRepository.completeExecution(jobId, HANDLER_NAME, workerId, fencingToken, { skipped: true, reason: "SUPERSEDED" });
    return { skipped: true, reason: "SUPERSEDED" };
  }

  // 4. Dispatch Email via SMTP
  try {
    await sendOtpEmail(email, otp);
    logger.info(
      "[JobHandler:sendOtpEmail] Successfully dispatched OTP email to recipient for JobID [%s].",
      jobId
    );
    const completed = await consumerIdempotencyRepository.completeExecution(jobId, HANDLER_NAME, workerId, fencingToken, { success: true, recipient: email });
    if (!completed) {
      logger.warn(
        "[JobHandler:sendOtpEmail] Completion update affected 0 rows for JobID [%s] (fenced out or lease expired).",
        jobId
      );
    }
    return { success: true, recipient: email };
  } catch (smtpErr) {
    logger.error(
      "[JobHandler:sendOtpEmail] SMTP transmission failure for JobID [%s]: %s (Releasing claim for BullMQ backoff retry)",
      jobId,
      smtpErr.message
    );
    await consumerIdempotencyRepository.releaseFailedClaim(jobId, HANDLER_NAME, workerId, fencingToken, smtpErr.message).catch(() => {});
    throw smtpErr;
  }
}

export default sendOtpEmailHandler;
