-- Financial-year entitlements, immutable leave transactions, versioned policies,
-- eligibility overrides, and reset execution history.
CREATE TABLE IF NOT EXISTS workforce_leave_policy_version (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  version_number INT NOT NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  effective_from_fy_start DATE NOT NULL,
  financial_year_start_month TINYINT NOT NULL DEFAULT 4,
  financial_year_start_day TINYINT NOT NULL DEFAULT 1,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  automatic_reset BOOLEAN NOT NULL DEFAULT 1,
  legacy_shared_pool_enabled BOOLEAN NOT NULL DEFAULT 1,
  proration_method ENUM('none','monthly') NOT NULL DEFAULT 'none',
  reason TEXT NULL,
  changed_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at DATETIME NULL,
  UNIQUE KEY uq_leave_policy_version (tenant_id, version_number),
  UNIQUE KEY uq_leave_policy_tenant_id (tenant_id, id),
  INDEX idx_leave_policy_effective (tenant_id, status, effective_from_fy_start),
  CONSTRAINT fk_leave_policy_tenant FOREIGN KEY (tenant_id) REFERENCES workforce_tenant(id) ON DELETE RESTRICT,
  CONSTRAINT fk_leave_policy_actor FOREIGN KEY (changed_by) REFERENCES accounts_user(id) ON DELETE SET NULL,
  CONSTRAINT chk_leave_policy_fy_month CHECK (financial_year_start_month BETWEEN 1 AND 12),
  CONSTRAINT chk_leave_policy_fy_day CHECK (financial_year_start_day BETWEEN 1 AND 28)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_leave_type_policy (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  policy_version_id BIGINT NOT NULL,
  leave_code VARCHAR(32) NOT NULL,
  leave_name VARCHAR(100) NOT NULL,
  annual_entitlement DECIMAL(8,2) NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT 1,
  carry_forward_enabled BOOLEAN NOT NULL DEFAULT 0,
  max_carry_forward_days DECIMAL(8,2) NOT NULL DEFAULT 0,
  carry_forward_expiry_days INT NULL,
  expired_balance_forfeited BOOLEAN NOT NULL DEFAULT 1,
  carry_forward_requires_approval BOOLEAN NOT NULL DEFAULT 0,
  minimum_application_days DECIMAL(6,2) NOT NULL DEFAULT 1,
  maximum_consecutive_days DECIMAL(6,2) NULL,
  half_day_allowed BOOLEAN NOT NULL DEFAULT 0,
  requires_approval BOOLEAN NOT NULL DEFAULT 1,
  requires_document BOOLEAN NOT NULL DEFAULT 0,
  accrual_frequency ENUM('none','monthly','quarterly','yearly') NOT NULL DEFAULT 'none',
  probation_restriction_months INT NOT NULL DEFAULT 0,
  active_status BOOLEAN NOT NULL DEFAULT 1,
  eligibility_rules JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_leave_type_code_version (tenant_id, policy_version_id, leave_code),
  INDEX idx_leave_type_policy_active (tenant_id, policy_version_id, active_status),
  CONSTRAINT fk_leave_type_policy_version FOREIGN KEY (tenant_id, policy_version_id) REFERENCES workforce_leave_policy_version(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_leave_type_entitlement CHECK (annual_entitlement >= 0),
  CONSTRAINT chk_leave_type_carry CHECK (max_carry_forward_days >= 0),
  CONSTRAINT chk_leave_type_application CHECK (minimum_application_days > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_employee_leave_eligibility (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  leave_code VARCHAR(32) NOT NULL,
  eligible BOOLEAN NOT NULL DEFAULT 1,
  entitlement_override DECIMAL(8,2) NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  reason TEXT NOT NULL,
  changed_by BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_employee_leave_eligibility (tenant_id, user_id, leave_code, effective_from, effective_to),
  CONSTRAINT fk_employee_leave_eligibility_user FOREIGN KEY (tenant_id, user_id) REFERENCES workforce_user_tenant(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_employee_leave_eligibility_actor FOREIGN KEY (changed_by) REFERENCES accounts_user(id) ON DELETE RESTRICT,
  CONSTRAINT chk_employee_leave_override CHECK (entitlement_override IS NULL OR entitlement_override >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_employee_leave_entitlement (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  leave_code VARCHAR(32) NOT NULL,
  financial_year_start DATE NOT NULL,
  financial_year_end DATE NOT NULL,
  policy_version_id BIGINT NOT NULL,
  annual_entitlement DECIMAL(8,2) NOT NULL,
  proration_amount DECIMAL(8,2) NOT NULL DEFAULT 0,
  carry_forward_days DECIMAL(8,2) NOT NULL DEFAULT 0,
  opening_balance DECIMAL(10,2) NOT NULL,
  initialized_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_leave_entitlement_employee_year (tenant_id, user_id, financial_year_start, leave_code),
  UNIQUE KEY uq_leave_entitlement_employee_year (tenant_id, user_id, leave_code, financial_year_start),
  CONSTRAINT fk_leave_entitlement_user FOREIGN KEY (tenant_id, user_id) REFERENCES workforce_user_tenant(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_leave_entitlement_policy FOREIGN KEY (tenant_id, policy_version_id) REFERENCES workforce_leave_policy_version(tenant_id, id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_leave_ledger_transaction (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  leave_code VARCHAR(32) NOT NULL,
  financial_year_start DATE NOT NULL,
  transaction_type ENUM('consumption','accrual','carry_forward','forfeiture','adjustment','reversal') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  effective_date DATE NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_id BIGINT NULL,
  idempotency_key VARCHAR(150) NOT NULL,
  reason TEXT NULL,
  balance_before DECIMAL(10,2) NULL,
  balance_after DECIMAL(10,2) NULL,
  action_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_leave_ledger_idempotency (tenant_id, user_id, idempotency_key),
  INDEX idx_leave_ledger_balance (tenant_id, user_id, leave_code, financial_year_start, created_at),
  INDEX idx_leave_ledger_source (tenant_id, source_type, source_id),
  CONSTRAINT fk_leave_ledger_user FOREIGN KEY (tenant_id, user_id) REFERENCES workforce_user_tenant(tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT fk_leave_ledger_actor FOREIGN KEY (action_by) REFERENCES accounts_user(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_leave_reset_run (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  financial_year_start DATE NOT NULL,
  financial_year_end DATE NOT NULL,
  policy_version_id BIGINT NOT NULL,
  status ENUM('running','completed','completed_with_errors','failed') NOT NULL,
  attempt_count INT NOT NULL DEFAULT 1,
  employee_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  failure_count INT NOT NULL DEFAULT 0,
  error_summary TEXT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  triggered_by BIGINT NULL,
  UNIQUE KEY uq_leave_reset_tenant_year (tenant_id, financial_year_start),
  INDEX idx_leave_reset_status (status, started_at),
  CONSTRAINT fk_leave_reset_tenant FOREIGN KEY (tenant_id) REFERENCES workforce_tenant(id) ON DELETE RESTRICT,
  CONSTRAINT fk_leave_reset_policy FOREIGN KEY (tenant_id, policy_version_id) REFERENCES workforce_leave_policy_version(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_leave_reset_actor FOREIGN KEY (triggered_by) REFERENCES accounts_user(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workforce_leave_reset_employee_result (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  run_id BIGINT NOT NULL,
  tenant_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  status ENUM('completed','failed','skipped') NOT NULL,
  error_message TEXT NULL,
  processed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_leave_reset_employee (run_id, user_id),
  CONSTRAINT fk_leave_reset_result_run FOREIGN KEY (run_id) REFERENCES workforce_leave_reset_run(id) ON DELETE RESTRICT,
  CONSTRAINT fk_leave_reset_result_user FOREIGN KEY (tenant_id, user_id) REFERENCES workforce_user_tenant(tenant_id, user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @leave_fy_start = STR_TO_DATE(CONCAT(YEAR(CURDATE()) - (MONTH(CURDATE()) < 4), '-04-01'), '%Y-%m-%d');
SET @leave_fy_end = DATE_SUB(DATE_ADD(@leave_fy_start, INTERVAL 1 YEAR), INTERVAL 1 DAY);

INSERT INTO workforce_leave_policy_version
  (tenant_id, version_number, status, effective_from_fy_start, financial_year_start_month, financial_year_start_day, timezone, automatic_reset, legacy_shared_pool_enabled, proration_method, reason)
SELECT t.id, 1, 'published', @leave_fy_start, 4, 1, 'Asia/Kolkata', 1, 1, 'none', 'Initial shared legacy leave balance - no historical type remapping.'
FROM workforce_tenant t
WHERE NOT EXISTS (SELECT 1 FROM workforce_leave_policy_version p WHERE p.tenant_id=t.id);

INSERT INTO workforce_leave_type_policy
  (tenant_id,policy_version_id,leave_code,leave_name,annual_entitlement,is_paid,carry_forward_enabled,max_carry_forward_days,minimum_application_days,requires_approval,active_status)
SELECT p.tenant_id,p.id,t.leave_code,t.leave_name,0,1,0,0,1,1,1
FROM workforce_leave_policy_version p
CROSS JOIN (
  SELECT 'casual' AS leave_code,'Casual Leave' AS leave_name
  UNION ALL SELECT 'sick','Sick Leave'
  UNION ALL SELECT 'paid','Paid Leave'
) t
WHERE p.version_number=1 AND NOT EXISTS (
  SELECT 1 FROM workforce_leave_type_policy x WHERE x.tenant_id=p.tenant_id AND x.policy_version_id=p.id AND x.leave_code=t.leave_code
);

INSERT INTO workforce_employee_leave_entitlement
  (tenant_id, user_id, leave_code, financial_year_start, financial_year_end, policy_version_id, annual_entitlement, proration_amount, carry_forward_days, opening_balance)
SELECT wut.tenant_id, ep.user_id, '__legacy_shared__', @leave_fy_start, @leave_fy_end, p.id,
       ep.leave_allotted, 0, 0, ep.leave_allotted
FROM workforce_user_tenant wut
JOIN accounts_employeeprofile ep ON ep.user_id=wut.user_id
JOIN workforce_leave_policy_version p ON p.tenant_id=wut.tenant_id AND p.version_number=1
WHERE wut.is_active=1 AND ep.is_active_employee=1
  AND NOT EXISTS (SELECT 1 FROM workforce_employee_leave_entitlement e WHERE e.tenant_id=wut.tenant_id AND e.user_id=ep.user_id AND e.leave_code='__legacy_shared__' AND e.financial_year_start=@leave_fy_start);

INSERT INTO workforce_leave_ledger_transaction
  (tenant_id,user_id,leave_code,financial_year_start,transaction_type,amount,effective_date,source_type,source_id,idempotency_key,reason)
SELECT l.tenant_id,l.user_id,'__legacy_shared__',@leave_fy_start,'consumption',
       -GREATEST(0,DATEDIFF(LEAST(l.to_date,@leave_fy_end),GREATEST(l.from_date,@leave_fy_start))+1),
       GREATEST(l.from_date,@leave_fy_start),'leave_application',l.id,CONCAT('legacy-leave-',l.id,'-',DATE_FORMAT(@leave_fy_start,'%Y%m%d')),
       'Backfilled approved leave for the current financial year'
FROM leave_leave l
WHERE l.status='approved' AND l.from_date<=@leave_fy_end AND l.to_date>=@leave_fy_start
  AND NOT EXISTS (SELECT 1 FROM workforce_leave_ledger_transaction x WHERE x.tenant_id=l.tenant_id AND x.user_id=l.user_id AND x.idempotency_key=CONCAT('legacy-leave-',l.id,'-',DATE_FORMAT(@leave_fy_start,'%Y%m%d')));

-- Preserve the pre-migration available balance for the transition financial year.
-- Historical approved usage is represented as one opening adjustment and the source
-- leave rows remain unchanged; later financial years start under their new policy.
INSERT INTO workforce_leave_ledger_transaction
  (tenant_id,user_id,leave_code,financial_year_start,transaction_type,amount,effective_date,source_type,idempotency_key,reason)
SELECT wut.tenant_id,ep.user_id,'__legacy_shared__',@leave_fy_start,'adjustment',-SUM(
         GREATEST(0,DATEDIFF(LEAST(l.to_date,DATE_SUB(@leave_fy_start,INTERVAL 1 DAY)),l.from_date)+1)),
       @leave_fy_start,'legacy_balance_transition',
       CONCAT('legacy-balance-transition-',wut.tenant_id,'-',ep.user_id,'-',DATE_FORMAT(@leave_fy_start,'%Y%m%d')),
       'Historical approved leave before migration retained as a transition balance adjustment'
FROM workforce_user_tenant wut
JOIN accounts_employeeprofile ep ON ep.user_id=wut.user_id
JOIN leave_leave l ON l.tenant_id=wut.tenant_id AND l.user_id=wut.user_id
WHERE wut.is_active=1 AND ep.is_active_employee=1 AND l.status='approved' AND l.from_date<@leave_fy_start
  AND NOT EXISTS (SELECT 1 FROM workforce_leave_ledger_transaction x WHERE x.tenant_id=wut.tenant_id AND x.user_id=ep.user_id AND x.idempotency_key=CONCAT('legacy-balance-transition-',wut.tenant_id,'-',ep.user_id,'-',DATE_FORMAT(@leave_fy_start,'%Y%m%d')))
GROUP BY wut.tenant_id,ep.user_id
HAVING SUM(GREATEST(0,DATEDIFF(LEAST(l.to_date,DATE_SUB(@leave_fy_start,INTERVAL 1 DAY)),l.from_date)+1))>0;
