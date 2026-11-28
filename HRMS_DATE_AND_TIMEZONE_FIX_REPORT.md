# HRMS Date & Timezone Fix Report (Bug 9)

## 1. Bug 9A – Invalid `re.is_weekly_off` SQL Query (`node_backend/src/services/manager-team.service.js`)
- **Root Cause:** `manager-team.service.js:256-261` queried `re.is_weekly_off` from `workforce_roster_entry`, which does not have an `is_weekly_off` column, silently swallowing the SQL error with `.catch(() => [])`.
- **Fix:** Replaced with a schema-valid join across `workforce_roster_entry` -> `workforce_roster_header` (`status='published'`) -> `workforce_shift_version` -> `workforce_weekly_off_policy_version` (`days_of_week`), removing `.catch(() => [])` and evaluating `days_of_week` against `targetDateObj.getUTCDay()` (falling back to Sunday only when no weekly-off policy applies).

## 2. Bug 9B – Local-Timezone `Date` Shift (`manager-team.service.js`, `leave.service.js`)
- **Root Cause:** `ymd()` in `manager-team.service.js:17-23` and the approved leave attendance loop in `leave.service.js:601-623` used local `getFullYear()`/`getMonth()`/`getDate()` on UTC-midnight `Date` objects returned by `mysql2` (`timezone: "Z"`).
- **Fix:**
  - Updated `ymd()` to return `val.toISOString().slice(0, 10)` for `Date` instances.
  - Updated `leave.service.js` approved leave date iteration to parse `dateOnly(...)` as UTC (`${startStr}T00:00:00Z`) and step with `setUTCDate(getUTCDate() + 1)`.
