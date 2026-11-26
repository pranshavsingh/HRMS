# NOTIFICATION_DATABASE_SCHEMA.md

Migration: `node_backend/scripts/migrations/026_notifications_and_push_tokens.sql`

## Tables
1. **`notifications`**
   - `id` (`BIGINT AUTO_INCREMENT PK`), `tenant_id` (`BIGINT`), `recipient_id` (`BIGINT FK -> accounts_user.id`), `actor_id` (`BIGINT NULL FK -> accounts_user.id`)
   - `type` (`VARCHAR(100)`), `category` (`VARCHAR(32)`), `title` (`VARCHAR(255)`), `message` (`TEXT`), `data` (`JSON`), `action_url` (`VARCHAR(500)`), `priority` (`VARCHAR(16)`), `dedupe_key` (`VARCHAR(191)`), `read_at` (`DATETIME`), `expires_at` (`DATETIME`), `created_at`, `updated_at`
   - Indexes: `(recipient_id, created_at)`, `(recipient_id, read_at)`, `(recipient_id, category, created_at)`, `(tenant_id, recipient_id, created_at)`, `UNIQUE (tenant_id, recipient_id, dedupe_key)`
2. **`notification_push_tokens`**
   - `id`, `tenant_id`, `user_id` (`FK -> accounts_user.id`), `token` (`VARCHAR(512)`), `platform`, `provider`, `device_id`, `is_active`, `last_used_at`, timestamps
   - Unique key on `token(255)`, index on `(tenant_id, user_id, is_active)`
3. **`notification_deliveries`**
   - `id`, `notification_id` (`FK -> notifications.id`), `channel` (`socket` | `push`), `status` (`PENDING` | `SENT` | `FAILED` | `SKIPPED`), `provider_message_id`, `attempts`, `error_message`, timestamps
