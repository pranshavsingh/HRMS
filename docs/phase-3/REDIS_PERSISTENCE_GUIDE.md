# Redis Production Persistence & Recovery Guide
## VPS Deployment, AOF Verification & Failover Recovery Runbook

- **Scope**: Redis 7.x installation on Ubuntu / Debian VPS hosting HRMS SaaS
- **Target File**: `deploy/redis/redis-production.conf`
- **Application Roles**: BullMQ Queues, Socket.IO Realtime Adapter, Fast App Cache

---

## 1. Production Persistence Strategy

BullMQ requires Redis persistence to ensure that background jobs, delayed tasks, and retry counters survive process restarts and power cycles.

HRMS SaaS employs a **Hybrid Persistence Model**:
1. **AOF (`appendonly yes`, `appendfsync everysec`)**: Every write is appended to the write-ahead log. Flushed to disk every second. Under catastrophic power cut or abrupt kernel panic, a bounded window of at most 1 second of queue buffer writes may be lost before filesystem sync.
2. **Transactional Outbox Pre-Persistence**: Regardless of Redis state, all critical business events (OTP requests, attendance triggers, leave approvals) are committed to **MySQL first** inside the ACID database transaction. True Zero Business Data Loss is guaranteed by the MySQL Transactional Outbox: even if Redis suffered total data loss or was rebuilt from scratch, the MySQL Outbox Dispatcher and Reconciliation Engine automatically re-dispatch all pending or unacknowledged jobs upon reconnection.
3. **`maxmemory-policy noeviction`**: **Mandatory for BullMQ**. Redis must never evict queue keys (`bull:email-notifications:*`) to free memory. If memory fills, Redis fails new writes with an OOM error, triggering the API and Outbox Dispatcher to back off, preserving queue integrity.

---

## 2. VPS Installation & Configuration Steps

### Step 2.1: Deploy Configuration
```bash
sudo cp deploy/redis/redis-production.conf /etc/redis/redis.conf
sudo chown redis:redis /etc/redis/redis.conf
sudo chmod 640 /etc/redis/redis.conf
```

### Step 2.2: Apply Memory Overcommit & Transparent Huge Pages (OS Level)
```bash
# Enable memory overcommit so Redis background saves (BGSAVE) never fail under memory pressure
sudo sysctl vm.overcommit_memory=1
echo "vm.overcommit_memory = 1" | sudo tee -a /etc/sysctl.conf

# Disable Transparent Huge Pages (reduces latency spikes and memory fragmentation)
sudo echo never | sudo tee /sys/kernel/mm/transparent_hugepage/enabled
```

### Step 2.3: Restart and Enable Redis Service
```bash
sudo systemctl restart redis-server
sudo systemctl enable redis-server
sudo systemctl status redis-server
```

---

## 3. VPS Verification & Recovery Test Procedure

### Test 1: Verify AOF Persistence is Live
```bash
redis-cli ping
# Output: PONG

# Check persistence stats
redis-cli info persistence | grep -E "aof_enabled|aof_last_write_status|rdb_last_bgsave_status"
```
**Expected Output**:
```
aof_enabled:1
aof_last_write_status:ok
rdb_last_bgsave_status:ok
```

### Test 2: Simulated Hard Service Restart with In-Flight Queue Data
1. Write test data to Redis:
   ```bash
   redis-cli set "test:persistence:canary" "durable_12345"
   redis-cli bgsave
   ```
2. Hard restart Redis service:
   ```bash
   sudo systemctl restart redis-server
   ```
3. Verify test data survived:
   ```bash
   redis-cli get "test:persistence:canary"
   ```
   **Expected Output**: `"durable_12345"`
4. Clean up test key:
   ```bash
   redis-cli del "test:persistence:canary"
   ```

### Test 3: Simulated Redis Outage & Outbox Recovery
1. Stop Redis:
   ```bash
   sudo systemctl stop redis-server
   ```
2. Trigger an API action (e.g. request password reset OTP via API or curl).
3. Verify that the API call succeeds: the OTP is generated in `password_reset_otp`, and an event is inserted into MySQL `outbox_events` with `status = 'PENDING'`.
4. Restart Redis:
   ```bash
   sudo systemctl start redis-server
   ```
5. Inspect worker logs (`pm2 logs hrms-worker`):
   Verify that the Outbox Dispatcher detects Redis online, claims the pending event, publishes it to BullMQ, and the worker sends the email.
6. Verify MySQL status:
   `SELECT status, published_at FROM outbox_events WHERE id = ...;` -> Transitions to `PUBLISHED`.
   `SELECT status FROM consumer_processed_jobs WHERE job_id = ...;` -> Transitions to `COMPLETED`.
