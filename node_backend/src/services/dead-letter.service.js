import outboxRepository from "../repositories/outbox.repository.js";
import logger from "../utils/logger.js";

/**
 * Enterprise Dead-Letter & Failure Recovery Service
 * Provides secure operator visibility, forensic audit trails, and replay controls.
 * Guarantees zero sensitive payload exposure in operator interfaces.
 */
class DeadLetterService {
  /**
   * List dead-lettered events with safe metadata.
   * Strips out raw/encrypted payloads to prevent credential leakage.
   * 
   * @param {number} [limit=50] 
   * @param {number} [offset=0] 
   * @returns {Promise<Array<object>>} Sanitized dead-letter event summaries
   */
  async listDeadLetters(limit = 50, offset = 0) {
    const rawEvents = await outboxRepository.getDeadLetterEvents(limit, offset);
    return rawEvents.map((event) => ({
      id: event.id,
      eventType: event.event_type,
      aggregateType: event.aggregate_type,
      aggregateId: event.aggregate_id,
      retryCount: event.retry_count,
      lastError: event.last_error,
      createdAt: event.created_at,
      updatedAt: event.updated_at,
      status: "DEAD_LETTER"
    }));
  }

  /**
   * Get safe detail for a specific dead-letter event.
   * Excludes payload contents.
   * 
   * @param {number|string} id 
   * @returns {Promise<object|null>}
   */
  async getDeadLetterDetail(id) {
    const event = await outboxRepository.findById(id);
    if (!event) return null;

    return {
      id: event.id,
      eventType: event.event_type,
      aggregateType: event.aggregate_type,
      aggregateId: event.aggregate_id,
      status: event.status,
      retryCount: event.retry_count,
      lastError: event.last_error,
      claimedBy: event.claimed_by,
      claimedUntil: event.claimed_until,
      createdAt: event.created_at,
      publishedAt: event.published_at,
      updatedAt: event.updated_at,
      hasPayload: Boolean(event.payload)
    };
  }

  /**
   * Safely replay a dead-lettered event back to PENDING.
   * Generates a permanent audit log entry and prevents replaying completed events.
   * 
   * @param {number|string} id - Outbox event identifier
   * @param {string} operatorUsername - Identity of the initiating operator
   * @param {string} reason - Justification for the replay action
   * @returns {Promise<{success: boolean, reason?: string, replayedAt?: Date, eventId?: number}>}
   */
  async replayEvent(id, operatorUsername = "operator_admin", reason = "Manual operational replay") {
    if (!id) {
      throw new Error("Event ID is required for dead-letter replay.");
    }
    if (!reason || reason.trim().length < 5) {
      throw new Error("A valid operational justification (minimum 5 characters) is required to replay dead-letter events.");
    }

    return outboxRepository.retryDeadLetterEvent(id, operatorUsername, reason);
  }
}

export const deadLetterService = new DeadLetterService();
export default deadLetterService;
