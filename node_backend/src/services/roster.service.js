// ============================================================================
// Service: node_backend/src/services/roster.service.js
// Description: Enterprise Roster Management Engine.
//              Generates draft rosters from fixed assignments and rotations,
//              provides multi-view calendar queries (Daily, Weekly, Monthly),
//              handles atomic publication with RFC 8785 snapshots, and supports
//              employee self-service roster lookups.
// ============================================================================

import { db } from "../db/index.js";
import { config } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";
import { formatDateToYMD } from "./shift-validation.service.js";
import { canonicalizeJson, generateSnapshotPayloadHash } from "./shift-snapshot.service.js";
import { shiftAssignmentService } from "./shift-assignment.service.js";
import { rotationService } from "./rotation.service.js";
import { rosterValidationService } from "./roster-validation.service.js";
import { auditService } from "./audit.service.js";
import realtimeService from "./realtime.service.js";
import { siteService } from "./site.service.js";

function wrapTx(conn) {
  if (!conn) return conn;
  if (!conn.get) conn.get = (sql, params = []) => db.get(sql, params, conn);
  if (!conn.all) conn.all = (sql, params = []) => db.all(sql, params, conn);
  if (!conn.run) conn.run = (sql, params = []) => db.run(sql, params, conn);
  return conn;
}

async function runWithTx(existingTx, fn) {
  if (existingTx) {
    return fn(wrapTx(existingTx));
  }
  return db.transaction(fn);
}

let rosterSourceTypeColumnCheck;
async function hasRosterSourceTypeColumn() {
  if (!rosterSourceTypeColumnCheck) {
    const check = config.dbClient === "mysql"
      ? db.get(
        `SELECT 1 AS present FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'workforce_roster_entry'
           AND COLUMN_NAME = 'source_type'
         LIMIT 1`
      ).then(Boolean)
      : db.all("PRAGMA table_info(workforce_roster_entry)").then((columns) =>
        columns.some((column) => column.name === "source_type")
      );
    rosterSourceTypeColumnCheck = check.catch((error) => {
      rosterSourceTypeColumnCheck = null;
      throw error;
    });
  }
  return rosterSourceTypeColumnCheck;
}

export const rosterService = {
  /**
   * List roster headers for a tenant.
   */
  async listRosterHeaders(tenantId, { status = null, teamName = null, startDate = null, endDate = null, siteScope = null } = {}) {
    const whereConditions = ["tenant_id = ?"];
    const params = [tenantId];
    if (siteScope?.unassigned) whereConditions.push("site_id IS NULL");
    else if (siteScope?.siteIds) {
      if (!siteScope.siteIds.length) whereConditions.push("1 = 0");
      else { whereConditions.push(`site_id IN (${siteScope.siteIds.map(() => "?").join(",")})`); params.push(...siteScope.siteIds); }
    }

    if (status) {
      whereConditions.push("status = ?");
      params.push(status);
    }
    if (teamName) {
      whereConditions.push("team_name = ?");
      params.push(teamName);
    }
    if (startDate) {
      whereConditions.push("end_date >= ?");
      params.push(formatDateToYMD(startDate));
    }
    if (endDate) {
      whereConditions.push("start_date <= ?");
      params.push(formatDateToYMD(endDate));
    }

    const sql = `
      SELECT rh.*,
             u.username as published_by_username,
             (SELECT COUNT(*) FROM workforce_roster_entry WHERE roster_header_id = rh.id AND tenant_id = rh.tenant_id) as entry_count
      FROM workforce_roster_header rh
      LEFT JOIN accounts_user u ON u.id = rh.published_by
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY rh.start_date DESC, rh.id DESC
    `;

    const rows = await db.all(sql, params);
    return rows.map(r => ({
      ...r,
      start_date: formatDateToYMD(r.start_date),
      end_date: formatDateToYMD(r.end_date),
    }));
  },

  /**
   * Get single roster header by ID with its entries.
   */
  async getRosterHeaderById(tenantId, headerId, managerId = null) {
    const header = await db.get(
      "SELECT * FROM workforce_roster_header WHERE id = ? AND tenant_id = ?",
      [headerId, tenantId]
    );
    if (!header) {
      throw new AppError("Roster header not found", 404);
    }

    const entriesSql = `
      SELECT re.*,
             u.first_name,
             u.last_name,
             u.email,
             ep.team_name,
             s.name as shift_name,
             s.code as shift_code,
             sv.start_time,
             sv.end_time,
             ROUND(sv.duration_minutes / 60.0, 2) as total_work_hours,
             sv.duration_minutes
      FROM workforce_roster_entry re
      JOIN accounts_user u ON u.id = re.user_id
      LEFT JOIN accounts_employeeprofile ep ON ep.user_id = re.user_id
      JOIN workforce_shift s ON s.id = re.shift_id AND s.tenant_id = re.tenant_id
      JOIN workforce_shift_version sv ON sv.id = re.shift_version_id AND sv.tenant_id = re.tenant_id
      WHERE re.roster_header_id = ? AND re.tenant_id = ? ${managerId ? "AND ep.manager_id = ?" : ""}
      ORDER BY re.work_date ASC, re.user_id ASC
    `;
    const entries = await db.all(entriesSql, managerId ? [headerId, tenantId, managerId] : [headerId, tenantId]);

    return {
      ...header,
      start_date: formatDateToYMD(header.start_date),
      end_date: formatDateToYMD(header.end_date),
      entries: entries.map(e => ({
        ...e,
        work_date: formatDateToYMD(e.work_date),
      })),
    };
  },

  /**
   * Generate a draft roster for a given date range and team/all scope.
   * Pulls from fixed assignments and rotation patterns deterministically.
   */
  async generateDraftRoster(tenantId, options, actorUserId, existingTx = null) {
    const result = await runWithTx(existingTx, async (tx) => {
      const {
        start_date,
        end_date,
        team_name = null,
        scope_type = "all",
        name = null,
        site_id = null,
        siteScope = null,
      } = options;

      if (!site_id || siteScope?.unassigned || (siteScope?.siteIds && !siteScope.siteIds.includes(Number(site_id)))) {
        throw new AppError("Select an authorized work site before generating a roster", 403);
      }

      if (!start_date || !end_date) {
        throw new AppError("start_date and end_date are required", 400);
      }

      const formattedStart = formatDateToYMD(start_date);
      const formattedEnd = formatDateToYMD(end_date);

      if (formattedStart > formattedEnd) {
        throw new AppError("start_date cannot be later than end_date", 400);
      }

      // 1. Create draft roster header
      const rosterName = name || `Roster ${formattedStart} to ${formattedEnd}${team_name ? ` (${team_name})` : ""}`;
      const headerSql = `
        INSERT INTO workforce_roster_header
          (tenant_id, site_id, team_name, name, scope_type, start_date, end_date, status, version_number, created_by)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?)
      `;
      const headerRes = await tx.run(headerSql, [
        tenantId,
        Number(site_id),
        team_name || null,
        rosterName,
        scope_type,
        formattedStart,
        formattedEnd,
        actorUserId || null,
      ]);
      const headerId = headerRes.lastID || headerRes.insertId;

      // 2. Fetch employees in scope
      let empSql = `
        SELECT u.id, u.username, u.first_name, u.last_name, ep.team_name
        FROM accounts_user u
        JOIN workforce_user_tenant wut ON wut.user_id = u.id AND wut.tenant_id = ?
        LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id
        WHERE wut.is_active = 1 AND u.is_active = 1 AND u.role IN ('employee', 'manager', 'hr')
      `;
      const empParams = [tenantId];
      if (team_name) {
        empSql += " AND ep.team_name = ?";
        empParams.push(team_name);
      }
      empSql += ` AND EXISTS (SELECT 1 FROM workforce_employee_site_assignment esa WHERE esa.tenant_id = ? AND esa.user_id = u.id AND esa.site_id = ? AND esa.effective_from <= ? AND (esa.effective_to IS NULL OR esa.effective_to >= ?)) ORDER BY u.id ASC`;
      empParams.push(tenantId, Number(site_id), formattedEnd, formattedStart);

      const employees = await tx.all(empSql, empParams);
      const holidays = await tx.all(
        `SELECT holiday_date FROM workforce_company_holiday
         WHERE tenant_id = ? AND is_optional = 0 AND holiday_date BETWEEN ? AND ?`,
        [tenantId, formattedStart, formattedEnd]
      );
      const holidayDates = new Set(holidays.map((holiday) => formatDateToYMD(holiday.holiday_date)));

      // 3. Generate date array
      const dateList = [];
      const curDate = new Date(`${formattedStart}T00:00:00Z`);
      const endDateObj = new Date(`${formattedEnd}T00:00:00Z`);
      while (curDate <= endDateObj) {
        dateList.push(curDate.toISOString().slice(0, 10));
        curDate.setUTCDate(curDate.getUTCDate() + 1);
      }

      // Default canonical shift fallback (Shift 10 - Standard Day Shift Version 1)
      const defaultShift = await tx.get(
        `SELECT s.id as shift_id, sv.id as shift_version_id, sv.start_time, sv.end_time
         FROM workforce_shift s
         JOIN workforce_shift_version sv ON sv.shift_id = s.id AND sv.tenant_id = s.tenant_id
         WHERE s.tenant_id = ? AND s.is_active = 1 AND sv.status = 'published'
           AND sv.effective_from <= ? AND (sv.effective_to IS NULL OR sv.effective_to >= ?)
         ORDER BY sv.effective_from DESC, sv.version_number DESC, s.id ASC LIMIT 1`,
        [tenantId, formattedStart, formattedStart]
      );

      let entriesCreated = 0;
      const restViolations = [];

      // 4. Resolve shift for each employee and date
      for (const emp of employees) {
        let prevShiftInfo = null;

        for (const dateStr of dateList) {
          const employeeSiteId = await siteService.getEmployeeSiteId(tenantId, emp.id, dateStr, tx);
          if (Number(employeeSiteId) !== Number(site_id)) {
            prevShiftInfo = null;
            continue;
          }
          if (holidayDates.has(dateStr)) {
            prevShiftInfo = null;
            continue;
          }
          let resolvedShift = null;
          let sourceType = "manual";
          let sourceId = null;

          // Priority A: Fixed Assignment
          const fixedAssn = await shiftAssignmentService.getActiveAssignmentForEmployee(
            tenantId,
            emp.id,
            dateStr,
            tx
          );

          if (fixedAssn) {
            resolvedShift = {
              shift_id: fixedAssn.shift_id,
              shift_version_id: fixedAssn.shift_version_id,
              start_time: fixedAssn.start_time,
              end_time: fixedAssn.end_time,
              is_overnight: fixedAssn.end_time < fixedAssn.start_time,
            };
            sourceType = "fixed_assignment";
            sourceId = fixedAssn.id;
          } else {
            // Priority B: Rotating Assignment
            const rotSchedule = await rotationService.calculateShiftForDate(
              tenantId,
              emp.id,
              dateStr,
              tx
            );

            if (rotSchedule) {
              if (rotSchedule.is_off_day) {
                // Off day in rotation schedule, do not insert work entry
                prevShiftInfo = null;
                continue;
              }
              resolvedShift = {
                shift_id: rotSchedule.shift_id,
                shift_version_id: rotSchedule.shift_version_id,
                start_time: rotSchedule.start_time,
                end_time: rotSchedule.end_time,
                is_overnight: rotSchedule.end_time < rotSchedule.start_time,
              };
              sourceType = "rotation";
              sourceId = rotSchedule.rotation_id;
            } else if (defaultShift) {
              // Priority C: Company default fallback
              resolvedShift = {
                shift_id: defaultShift.shift_id,
                shift_version_id: defaultShift.shift_version_id,
                start_time: defaultShift.start_time,
                end_time: defaultShift.end_time,
                is_overnight: defaultShift.end_time < defaultShift.start_time,
              };
              sourceType = "manual";
            }
          }

          if (resolvedShift && resolvedShift.shift_version_id) {
            const policyVersion = await tx.get(
              `SELECT wopv.days_of_week FROM workforce_shift_version sv
               JOIN workforce_weekly_off_policy_version wopv ON wopv.id = sv.weekly_off_policy_version_id
                 AND wopv.tenant_id = sv.tenant_id AND wopv.status = 'published'
                 AND wopv.effective_from <= ? AND (wopv.effective_to IS NULL OR wopv.effective_to >= ?)
               WHERE sv.id = ? AND sv.tenant_id = ?`,
              [dateStr, dateStr, resolvedShift.shift_version_id, tenantId]
            );
            let weeklyOffDays = [];
            try {
              const rawDays = policyVersion?.days_of_week || [];
              const parsedDays = typeof rawDays === "string" ? JSON.parse(rawDays) : rawDays;
              weeklyOffDays = Array.isArray(parsedDays) ? parsedDays.map(Number) : [];
            } catch { weeklyOffDays = []; }
            if (weeklyOffDays.includes(new Date(`${dateStr}T00:00:00Z`).getUTCDay())) {
              prevShiftInfo = null;
              continue;
            }
            // Validate minimum rest with previous day if applicable
            if (prevShiftInfo) {
              const restValidation = rosterValidationService.validateConsecutiveShiftRest(prevShiftInfo, {
                work_date: dateStr,
                start_time: resolvedShift.start_time,
              });
              if (!restValidation.valid) {
                restViolations.push({
                  user_id: emp.id,
                  work_date: dateStr,
                  prev_date: prevShiftInfo.work_date,
                  rest_hours: restValidation.restHours,
                  required_hours: restValidation.requiredRestHours,
                  violation: restValidation.violation,
                });
              }
            }

            // Insert roster entry (ignore if duplicate)
            await tx.run(
              `INSERT IGNORE INTO workforce_roster_entry
                 (tenant_id, roster_header_id, user_id, site_id, work_date, shift_id, shift_version_id, status, source_type, source_id)
               VALUES
                 (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
              [
                tenantId,
                headerId,
                emp.id,
                Number(site_id),
                dateStr,
                resolvedShift.shift_id,
                resolvedShift.shift_version_id,
                sourceType,
                sourceId,
              ]
            );
            entriesCreated++;
            prevShiftInfo = {
              work_date: dateStr,
              end_time: resolvedShift.end_time,
              is_overnight: resolvedShift.is_overnight,
            };
          }
        }
      }

      const actualEntryCount = await tx.get(
        "SELECT COUNT(*) AS entry_count FROM workforce_roster_entry WHERE tenant_id = ? AND roster_header_id = ?",
        [tenantId, headerId]
      );
      entriesCreated = Number(actualEntryCount?.entry_count || 0);

      await auditService.log(
        { id: actorUserId, role: "admin" },
        "ROSTER_DRAFT_GENERATED",
        headerId,
        `Generated draft roster header ID ${headerId} with ${entriesCreated} scheduled entries for ${employees.length} employees`,
        null,
        "INFO",
        tx
      );

      if (restViolations.length > 0) {
        await auditService.log(
          { id: actorUserId, role: "admin" },
          "ROSTER_REST_PERIOD_WARNING",
          headerId,
          `Draft roster header ID ${headerId} has ${restViolations.length} minimum rest period violations`,
          JSON.stringify(restViolations.slice(0, 10)),
          "WARNING",
          tx
        );
      }

      return {
        id: headerId,
        tenant_id: tenantId,
        name: rosterName,
        team_name,
        start_date: formattedStart,
        end_date: formattedEnd,
        status: "draft",
        employees_count: employees.length,
        entries_count: entriesCreated,
        rest_violations_count: restViolations.length,
        rest_violations: restViolations,
      };
    });
    if (!existingTx) realtimeService.emitToTenant(tenantId, "schedule_update", { type: "roster_draft_generated", rosterId: result.id });
    return result;
  },

  /**
   * Retrieve structured calendar matrix (Daily, Weekly, Monthly).
   */
  async getRosterCalendar(tenantId, { start_date, end_date, team_name = null, user_id = null, status = null, siteScope = null, manager_id = null }) {
    if (!start_date || !end_date) {
      throw new AppError("start_date and end_date are required", 400);
    }

    const formattedStart = formatDateToYMD(start_date);
    const formattedEnd = formatDateToYMD(end_date);

    const whereConditions = [
      "re.tenant_id = ?",
      "re.work_date >= ?",
      "re.work_date <= ?",
    ];
    const params = [tenantId, formattedStart, formattedEnd];
    if (siteScope?.unassigned) whereConditions.push("re.site_id IS NULL");
    else if (siteScope?.siteIds) {
      if (!siteScope.siteIds.length) whereConditions.push("1 = 0");
      else { whereConditions.push(`re.site_id IN (${siteScope.siteIds.map(() => "?").join(",")})`); params.push(...siteScope.siteIds); }
    }
    // Migration 015 introduced source_type after the original roster tables.
    // Older installations can still render their calendar while that migration
    // is pending; migration 015's schema default for historical rows is manual.
    const sourceTypeColumnExists = await hasRosterSourceTypeColumn();

    if (team_name) {
      whereConditions.push("ep.team_name = ?");
      params.push(team_name);
    }
    if (user_id) {
      whereConditions.push("re.user_id = ?");
      params.push(user_id);
    }
    if (status) {
      whereConditions.push("re.status = ?");
      params.push(status);
    }
    if (manager_id) {
      whereConditions.push("ep.manager_id = ?");
      params.push(manager_id);
    }

    const sql = `
      SELECT 
        re.id as entry_id,
        re.roster_header_id,
        rh.status as roster_status,
        re.user_id,
        u.first_name,
        u.last_name,
        u.email,
        ep.team_name,
        ep.designation,
        re.work_date,
        re.shift_id,
        s.name as shift_name,
        s.code as shift_code,
        re.shift_version_id,
        sv.version_number as shift_version_number,
        sv.start_time,
        sv.end_time,
        ROUND(sv.duration_minutes / 60.0, 2) as total_work_hours,
        sv.duration_minutes,
        sv.is_overnight,
        re.status as entry_status,
        ${sourceTypeColumnExists ? "re.source_type" : "'manual'"} as source_type
      FROM workforce_roster_entry re
      JOIN workforce_roster_header rh ON rh.id = re.roster_header_id AND rh.tenant_id = re.tenant_id
      JOIN accounts_user u ON u.id = re.user_id
      LEFT JOIN accounts_employeeprofile ep ON ep.user_id = re.user_id
      JOIN workforce_shift s ON s.id = re.shift_id AND s.tenant_id = re.tenant_id
      JOIN workforce_shift_version sv ON sv.id = re.shift_version_id AND sv.tenant_id = re.tenant_id
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY u.first_name ASC, re.work_date ASC, rh.id DESC, re.id DESC
    `;

    const rows = await db.all(sql, params);

    // Build unique employee map and matrix
    const employeeMap = new Map();
    const calendarGrid = {};

    for (const r of rows) {
      const dateStr = formatDateToYMD(r.work_date);
      if (!employeeMap.has(r.user_id)) {
        employeeMap.set(r.user_id, {
          user_id: r.user_id,
          name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email,
          email: r.email,
          team: r.team_name || "Unassigned",
          designation: r.designation || null,
        });
        calendarGrid[r.user_id] = {};
      }

      const currentCell = calendarGrid[r.user_id][dateStr];
      if (!currentCell || (currentCell.roster_status !== "published" && r.roster_status === "published")) calendarGrid[r.user_id][dateStr] = {
        entry_id: r.entry_id,
        roster_header_id: r.roster_header_id,
        roster_status: r.roster_status,
        shift_id: r.shift_id,
        shift_name: r.shift_name,
        shift_code: r.shift_code,
        shift_version_id: r.shift_version_id,
        start_time: r.start_time,
        end_time: r.end_time,
        total_work_hours: Number(r.total_work_hours),
        is_overnight: Boolean(r.is_overnight),
        status: r.entry_status,
        source_type: r.source_type,
      };
    }

    return {
      start_date: formattedStart,
      end_date: formattedEnd,
      employees: Array.from(employeeMap.values()),
      total_entries: rows.length,
      grid: calendarGrid,
    };
  },

  /**
   * Atomically publish a roster header and freeze canonical snapshots on all its entries.
   * Adheres to monotonic locking hierarchy: roster_header -> roster_entries.
   */
  async publishRoster(tenantId, rosterHeaderId, actorUserId, existingTx = null) {
    const result = await runWithTx(existingTx, async (tx) => {
      // 1. Lock header row exclusively
      const header = await tx.get(
        "SELECT * FROM workforce_roster_header WHERE id = ? AND tenant_id = ? FOR UPDATE",
        [rosterHeaderId, tenantId]
      );
      if (!header) {
        throw new AppError("Roster header not found", 404);
      }
      if (header.status === "published") {
        throw new AppError("Roster is already published", 400);
      }

      // 2. Fetch and lock all entries
      const entries = await tx.all(
        `SELECT re.*, sv.start_time, sv.end_time, ROUND(sv.duration_minutes / 60.0, 2) as total_work_hours, sv.duration_minutes, sv.is_overnight, s.name as shift_name, s.code as shift_code
         FROM workforce_roster_entry re
         JOIN workforce_shift s ON s.id = re.shift_id AND s.tenant_id = re.tenant_id
         JOIN workforce_shift_version sv ON sv.id = re.shift_version_id AND sv.tenant_id = re.tenant_id
         WHERE re.roster_header_id = ? AND re.tenant_id = ?
         ORDER BY re.id ASC
         FOR UPDATE`,
        [rosterHeaderId, tenantId]
      );

      if (entries.length === 0) {
        throw new AppError("Cannot publish empty roster without entries", 400);
      }

      // 3. Freeze canonical snapshots on each entry
      for (const entry of entries) {
        const snapshotPayload = {
          entry_id: entry.id,
          user_id: entry.user_id,
          work_date: formatDateToYMD(entry.work_date),
          shift_id: entry.shift_id,
          shift_version_id: entry.shift_version_id,
          shift_name: entry.shift_name,
          shift_code: entry.shift_code,
          start_time: entry.start_time,
          end_time: entry.end_time,
          total_work_hours: Number(entry.total_work_hours),
          published_at: new Date().toISOString(),
        };

        const canonicalJson = canonicalizeJson(snapshotPayload);
        const snapshotHash = generateSnapshotPayloadHash(canonicalJson);

        await tx.run(
          `UPDATE workforce_roster_entry
           SET shift_snapshot = ?, snapshot_hash = ?
           WHERE id = ?`,
          [canonicalJson, snapshotHash, entry.id]
        );
      }

      // 4. Update header status
      await tx.run(
        `UPDATE workforce_roster_header
         SET status = 'published',
             published_by = ?,
             published_at = CURRENT_TIMESTAMP,
             updated_by = ?
         WHERE id = ?`,
        [actorUserId || null, actorUserId || null, rosterHeaderId]
      );

      await auditService.log(
        { id: actorUserId, role: "admin" },
        "ROSTER_PUBLISHED",
        rosterHeaderId,
        `Published roster header ID ${rosterHeaderId} with ${entries.length} frozen entries`,
        null,
        "INFO",
        tx
      );

      return {
        id: rosterHeaderId,
        tenant_id: tenantId,
        status: "published",
        entries_published: entries.length,
      };
    });
    if (!existingTx) realtimeService.emitToTenant(tenantId, "schedule_update", { type: "roster_published", rosterId: Number(rosterHeaderId) });
    return result;
  },

  /**
   * Employee self-service schedule retrieval (`my-roster`).
   * Returns current assigned shift, today's timings, and upcoming published roster schedule.
   */
  async getMyRoster(tenantId, userId, { start_date = null, end_date = null } = {}) {
    const localNow = new Date();
    const today = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-${String(localNow.getDate()).padStart(2, "0")}`;
    const formattedStart = start_date ? formatDateToYMD(start_date) : today;

    // Default to 14 days ahead if end_date not provided
    const defaultEnd = new Date(`${today}T00:00:00Z`);
    defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 13);
    const formattedEnd = end_date ? formatDateToYMD(end_date) : defaultEnd.toISOString().slice(0, 10);

    // 1. Fetch upcoming published entries
    const sql = `
      SELECT 
        re.id as entry_id,
        re.work_date,
        re.status,
        s.name as shift_name,
        s.code as shift_code,
        s.timezone,
        sv.version_number,
        sv.start_time,
        sv.end_time,
        ROUND(sv.duration_minutes / 60.0, 2) as total_work_hours,
        sv.duration_minutes,
        sv.is_overnight
      FROM workforce_roster_entry re
      JOIN workforce_roster_header rh ON rh.id = re.roster_header_id AND rh.tenant_id = re.tenant_id
      JOIN workforce_shift s ON s.id = re.shift_id AND s.tenant_id = re.tenant_id
      JOIN workforce_shift_version sv ON sv.id = re.shift_version_id AND sv.tenant_id = re.tenant_id
      WHERE re.tenant_id = ?
        AND re.user_id = ?
        AND rh.status = 'published'
        AND re.work_date >= ?
        AND re.work_date <= ?
      ORDER BY re.work_date ASC, rh.published_at DESC, rh.id DESC, re.id DESC
    `;
    const entries = await db.all(sql, [tenantId, userId, formattedStart, formattedEnd]);
    const holidays = await db.all(
      `SELECT holiday_date FROM workforce_company_holiday
       WHERE tenant_id = ? AND is_optional = 0 AND holiday_date BETWEEN ? AND ?`,
      [tenantId, formattedStart, formattedEnd]
    );
    const holidayDates = new Set(holidays.map((holiday) => formatDateToYMD(holiday.holiday_date)));
    const weeklyOffCache = new Map();
    const isWeeklyOff = async (shiftVersionId, dateStr) => {
      if (!shiftVersionId) return false;
      const cacheKey = `${shiftVersionId}:${dateStr}`;
      if (!weeklyOffCache.has(cacheKey)) {
        const policy = await db.get(
          `SELECT wopv.days_of_week FROM workforce_shift_version sv
           JOIN workforce_weekly_off_policy_version wopv ON wopv.id = sv.weekly_off_policy_version_id
             AND wopv.tenant_id = sv.tenant_id AND wopv.status = 'published'
             AND wopv.effective_from <= ? AND (wopv.effective_to IS NULL OR wopv.effective_to >= ?)
           WHERE sv.id = ? AND sv.tenant_id = ?`,
          [dateStr, dateStr, shiftVersionId, tenantId]
        );
        try {
          const rawDays = policy?.days_of_week || [];
          const parsedDays = typeof rawDays === "string" ? JSON.parse(rawDays) : rawDays;
          weeklyOffCache.set(cacheKey, new Set(Array.isArray(parsedDays) ? parsedDays.map(Number) : []));
        } catch { weeklyOffCache.set(cacheKey, new Set()); }
      }
      return weeklyOffCache.get(cacheKey).has(new Date(`${dateStr}T00:00:00Z`).getUTCDay());
    };

    // Build map of published entries by work_date
    const entryDateMap = new Map();
    for (const e of entries) {
      const entryDate = formatDateToYMD(e.work_date);
      if (!entryDateMap.has(entryDate)) entryDateMap.set(entryDate, e);
    }

    // Fetch published roster headers covering this employee during the date range.
    // Any date inside a published roster's range where the employee has NO scheduled entry
    // represents an intentional Off Day / Rest Day in the published roster.
    // We must NOT fall back to fixed or rotation shifts on those dates (avoids phantom shifts).
    const publishedHeaders = await db.all(
      `SELECT DISTINCT rh.id, rh.start_date, rh.end_date
       FROM workforce_roster_header rh
       WHERE rh.tenant_id = ?
         AND rh.status = 'published'
         AND rh.start_date <= ?
         AND rh.end_date >= ?
         AND (
           rh.scope_type = 'all'
           OR EXISTS (
             SELECT 1 FROM workforce_roster_entry re
             WHERE re.roster_header_id = rh.id AND re.tenant_id = rh.tenant_id AND re.user_id = ?
           )
           OR (
             rh.team_name IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM accounts_employeeprofile ep
               WHERE ep.user_id = ? AND ep.team_name = rh.team_name
             )
           )
         )`,
      [tenantId, formattedEnd, formattedStart, userId, userId]
    );

    const publishedRosterDateSet = new Set();
    for (const h of publishedHeaders) {
      const hStart = formatDateToYMD(h.start_date);
      const hEnd = formatDateToYMD(h.end_date);
      const curH = new Date(`${hStart}T00:00:00Z`);
      const endH = new Date(`${hEnd}T00:00:00Z`);
      while (curH <= endH) {
        publishedRosterDateSet.add(curH.toISOString().slice(0, 10));
        curH.setUTCDate(curH.getUTCDate() + 1);
      }
    }

    // Build schedule by prioritizing published roster entries, falling back to active fixed assignment
    const schedule = [];
    const curDate = new Date(`${formattedStart}T00:00:00Z`);
    const endDateObj = new Date(`${formattedEnd}T00:00:00Z`);

    while (curDate <= endDateObj) {
      const dateStr = curDate.toISOString().slice(0, 10);
      if (entryDateMap.has(dateStr)) {
        const e = entryDateMap.get(dateStr);
        schedule.push({
          entry_id: e.entry_id,
          work_date: dateStr,
          status: e.status,
          shift_name: e.shift_name,
          shift_code: e.shift_code,
          timezone: e.timezone,
          version_number: e.version_number,
          start_time: e.start_time,
          end_time: e.end_time,
          total_work_hours: Number(e.total_work_hours),
          duration_minutes: e.duration_minutes,
          is_overnight: Boolean(e.is_overnight),
          source: "published_roster",
        });
      } else if (publishedRosterDateSet.has(dateStr)) {
        // Date is inside an active published roster covering this employee, but has no entry =>
        // Intentionally scheduled Off Day in the published roster.
        // DO NOT fall back to fixed or rotating shifts to prevent phantom shifts.
      } else {
        const fixed = await shiftAssignmentService.getActiveAssignmentForEmployee(tenantId, userId, dateStr);
        if (fixed && !holidayDates.has(dateStr) && !(await isWeeklyOff(fixed.shift_version_id, dateStr))) {
          schedule.push({
            entry_id: `fixed-${fixed.id}-${dateStr}`,
            work_date: dateStr,
            status: "published",
            shift_name: fixed.shift_name,
            shift_code: fixed.shift_code,
            timezone: fixed.timezone || "UTC",
            version_number: fixed.version_number,
            start_time: fixed.start_time,
            end_time: fixed.end_time,
            total_work_hours: Number(fixed.total_work_hours),
            duration_minutes: fixed.duration_minutes,
            is_overnight: fixed.end_time < fixed.start_time,
            source: "fixed_assignment",
          });
        } else if (!fixed && !holidayDates.has(dateStr)) {
          const rotation = await rotationService.calculateShiftForDate(tenantId, userId, dateStr);
          if (rotation && !rotation.is_off_day && rotation.shift_version_id && !(await isWeeklyOff(rotation.shift_version_id, dateStr))) {
            schedule.push({
              entry_id: `rotation-${rotation.rotation_id}-${dateStr}`,
              work_date: dateStr,
              status: "published",
              shift_name: rotation.shift_name,
              shift_code: rotation.shift_code,
              timezone: rotation.timezone || "UTC",
              start_time: rotation.start_time,
              end_time: rotation.end_time,
              total_work_hours: Number(rotation.total_work_hours),
              duration_minutes: rotation.duration_minutes,
              is_overnight: rotation.end_time < rotation.start_time,
              source: "rotation",
            });
          }
        }
      }
      curDate.setUTCDate(curDate.getUTCDate() + 1);
    }

    // 2. Fetch today's current shift
    const todayEntry = schedule.find(e => e.work_date === today) || null;

    return {
      today,
      current_shift: todayEntry,
      schedule,
    };
  }
};
