import logger from "../utils/logger.js";

/**
 * @deprecated
 * LEGACY IN-MEMORY QUEUE SERVICE (REPLACED IN PHASE 3 M3.2)
 * 
 * All background jobs must now be processed via BullMQ and the Transactional Outbox pattern.
 * This class is preserved solely for backward compatibility with external test mocks.
 * It does NOT execute production work in memory.
 */
class DeprecatedQueueService {
  constructor() {
    this.jobs = [];
    this.isProcessing = false;
  }

  /**
   * @deprecated
   */
  async add(name) {
    logger.warn(
      "[DEPRECATION WARNING] Legacy queueService.add() called for '%s'. Background jobs must use BullMQ and Outbox.",
      name
    );
    throw new Error(
      `DeprecatedQueueService: In-memory queueing is disabled in Phase 3. Use outboxRepository or queueProducerService instead.`
    );
  }

  /**
   * @deprecated
   */
  async processQueue() {
    logger.warn("[DEPRECATION WARNING] Legacy queueService.processQueue() called. Ignored.");
  }
}

export const queueService = new DeprecatedQueueService();
export default queueService;
