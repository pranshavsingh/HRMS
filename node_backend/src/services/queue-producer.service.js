import { Queue } from "bullmq";
import { QUEUE_NAMES, createQueueConnection, defaultJobOptions, queueConfig } from "../config/queue.js";
import logger from "../utils/logger.js";

class QueueProducerService {
  constructor() {
    this.queues = new Map();
    this.connection = null;
  }

  getConnection() {
    if (!this.connection) {
      this.connection = createQueueConnection("producer");
    }
    return this.connection;
  }

  /**
   * Get or instantiate a BullMQ Queue instance by name.
   * @param {string} queueName 
   * @returns {Queue}
   */
  getQueue(queueName) {
    if (!this.queues.has(queueName)) {
      const conn = this.getConnection();
      const queue = new Queue(queueName, {
        connection: conn,
        prefix: queueConfig.prefix,
        defaultJobOptions
      });
      this.queues.set(queueName, queue);
      logger.info("[QueueProducer] Registered BullMQ queue producer: %s", queueName);
    }
    return this.queues.get(queueName);
  }

  /**
   * Enqueue a job into the specified BullMQ queue with deterministic job options.
   * 
   * @param {string} queueName - Name of target queue
   * @param {string} jobName - Name of the job action
   * @param {object} data - Serializable job payload
   * @param {object} [options={}] - Custom job options (jobId, attempts, backoff, delay)
   * @returns {Promise<Job>} Enqueued BullMQ job
   */
  async addJob(queueName, jobName, data, options = {}) {
    const queue = this.getQueue(queueName);
    const jobOpts = {
      ...defaultJobOptions,
      ...options
    };

    const job = await queue.add(jobName, data, jobOpts);
    logger.info(
      "[QueueProducer] Enqueued job: Name [%s], ID [%s], Queue [%s]",
      jobName,
      job.id,
      queueName
    );
    return job;
  }

  /**
   * Gracefully close all producer queue instances and underlying Redis connection.
   */
  async close() {
    logger.info("[QueueProducer] Closing all BullMQ queue producer instances...");
    for (const [name, queue] of this.queues.entries()) {
      try {
        await queue.close();
      } catch (err) {
        logger.warn("[QueueProducer] Error closing queue %s: %s", name, err.message);
      }
    }
    this.queues.clear();

    if (this.connection) {
      try {
        await this.connection.quit();
      } catch {
        this.connection.disconnect();
      }
      this.connection = null;
    }
  }
}

export const queueProducerService = new QueueProducerService();
export default queueProducerService;

