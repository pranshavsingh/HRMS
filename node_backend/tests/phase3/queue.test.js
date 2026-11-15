import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Worker } from "bullmq";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { QUEUE_NAMES, createQueueConnection, queueConfig, defaultJobOptions } from "../../src/config/queue.js";
import queueProducerService from "../../src/services/queue-producer.service.js";

async function isRedisLive() {
  const client = createQueueConnection("ping-test");
  try {
    const res = await Promise.race([
      client.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 800))
    ]);
    try { client.disconnect(); } catch {}
    return res === "PONG";
  } catch {
    try { client.disconnect(); } catch {}
    return false;
  }
}

describe("P3.2 — BullMQ Queue Producer & Consumer Test Suite", () => {
  let testQueueName;
  let testWorker;
  let redisOnline = false;

  before(async () => {
    testQueueName = `test-queue-${Date.now()}`;
    redisOnline = await isRedisLive();

    if (process.env.CI && !redisOnline) {
      throw new Error("Redis service is mandatory in CI environment but unreachable on configured port.");
    }
  });

  after(async () => {
    if (testWorker) {
      await testWorker.close();
    }
    await queueProducerService.close();
  });

  it("should initialize dedicated BullMQ Redis connection with maxRetriesPerRequest=null", () => {
    const client = createQueueConnection("test-check");
    assert.equal(client.options.maxRetriesPerRequest, null, "BullMQ worker connection requires maxRetriesPerRequest: null");
    assert.equal(client.options.enableOfflineQueue, true, "BullMQ requires enableOfflineQueue: true");
    client.disconnect();
  });

  it("should export standard retry and backoff defaults", () => {
    assert.equal(defaultJobOptions.attempts, 5, "Default attempts must be 5");
    assert.equal(defaultJobOptions.backoff.type, "exponential", "Default backoff must be exponential");
    assert.equal(defaultJobOptions.backoff.delay, 1000, "Default backoff delay must be 1000ms");
    assert.ok(defaultJobOptions.removeOnComplete, "Must specify removeOnComplete bounds");
    assert.ok(defaultJobOptions.removeOnFail, "Must specify removeOnFail bounds for dead-letter retention");
  });

  it("should enqueue a job and process it successfully via worker (when Redis is available)", async (t) => {
    if (!redisOnline) {
      t.skip("Local Redis server offline. Live BullMQ processing runs in containerized CI.");
      return;
    }

    const testPayload = { message: "hello-bullmq", timestamp: Date.now() };
    let processedJob = null;

    testWorker = new Worker(
      testQueueName,
      async (job) => {
        processedJob = job;
        return { success: true };
      },
      {
        connection: createQueueConnection("worker-test"),
        prefix: queueConfig.prefix,
        concurrency: 1
      }
    );

    const enqueued = await queueProducerService.addJob(
      testQueueName,
      "test-action",
      testPayload,
      { attempts: 3 }
    );

    assert.ok(enqueued.id, "Enqueued job must have an ID");

    // Wait for worker to consume
    let waitCount = 0;
    while (!processedJob && waitCount < 50) {
      await new Promise((r) => setTimeout(r, 100));
      waitCount++;
    }

    assert.ok(processedJob, "Worker must successfully process the enqueued job");
    assert.equal(processedJob.data.message, "hello-bullmq");
  });

  it("should prevent duplicate processing when the same deterministic Job ID is enqueued (when Redis is available)", async (t) => {
    if (!redisOnline) {
      t.skip("Local Redis server offline. Live BullMQ processing runs in containerized CI.");
      return;
    }

    const fixedJobId = `fixed_id_${Date.now()}`;
    const queue = queueProducerService.getQueue(testQueueName);

    const job1 = await queue.add("idempotent-task", { val: 1 }, { jobId: fixedJobId });
    assert.equal(job1.id, fixedJobId);

    // Enqueue second job with same jobId
    const job2 = await queue.add("idempotent-task", { val: 2 }, { jobId: fixedJobId });
    assert.equal(job2.id, fixedJobId);

    const count = await queue.getJobCounts("waiting", "active", "completed");
    assert.ok(count.waiting + count.completed <= 2, "Duplicate job ID must not create second job");
  });

  it("should retry failed job with exponential backoff (when Redis is available)", async (t) => {
    if (!redisOnline) {
      t.skip("Local Redis server offline. Live BullMQ processing runs in containerized CI.");
      return;
    }

    const retryQueueName = `retry-queue-${Date.now()}`;
    let attempts = 0;

    const retryWorker = new Worker(
      retryQueueName,
      async (job) => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Simulated transient failure");
        }
        return { recovered: true };
      },
      {
        connection: createQueueConnection("worker-retry-test"),
        prefix: queueConfig.prefix,
        concurrency: 1
      }
    );

    await queueProducerService.addJob(
      retryQueueName,
      "retry-task",
      { data: "retry-me" },
      {
        attempts: 4,
        backoff: { type: "exponential", delay: 100 }
      }
    );

    // Wait for retries
    let waitCount = 0;
    while (attempts < 3 && waitCount < 60) {
      await new Promise((r) => setTimeout(r, 100));
      waitCount++;
    }

    await retryWorker.close();
    assert.equal(attempts, 3, "Worker must retry until success or exhaustion");
  });
});
