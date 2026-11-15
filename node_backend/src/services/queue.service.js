import logger from "../utils/logger.js";

class QueueService {
  constructor() {
    this.jobs = [];
    this.isProcessing = false;
  }

  /**
   * Add a job to the queue.
   * @param {string} name - Name of the job / action
   * @param {function} handler - The async work function
   */
  async add(name, handler) {
    logger.info("Adding job to queue: %s", name);
    this.jobs.push({ name, handler });
    
    // Execute asynchronously to avoid blocking the current thread
    setImmediate(() => this.processQueue());
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.jobs.length > 0) {
      const job = this.jobs.shift();
      try {
        logger.info("Processing background job: %s", job.name);
        await job.handler();
        logger.info("Job completed successfully: %s", job.name);
      } catch (err) {
        logger.error("Job failed: %s. Error: %s", job.name, err.message);
      }
    }

    this.isProcessing = false;
  }
}

export const queueService = new QueueService();
export default queueService;
