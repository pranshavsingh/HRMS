# 10. Mobile Lint and Build Report

- **Target:** `hrms_mobile`
- **Lint Engine:** `npx expo lint` (ESLint 9 + `eslint-config-expo`)

## Before vs. After Lint Remediation

### Baseline Status:
- **Total Problems:** 68 (20 errors, 48 warnings)
- **Errors:** 20 errors in `react-hooks/set-state-in-effect` across 11 files:
  - `approvals.tsx`: line 158
  - `audit-logs.tsx`: line 105
  - `dashboard.tsx`: line 106
  - `employee-documents.tsx`: line 110
  - `employees.tsx`: line 141
  - `history.tsx`: lines 200, 204
  - `leave.tsx`: line 144
  - `punch.tsx`: lines 376, 377, 409
  - `shifts.tsx`: line 32
  - `team-analytics.tsx`: line 83
  - `team-attendance.tsx`: line 104
  - `documents.tsx`: line 78
  - `my-documents.tsx`: line 71
  - `use-color-scheme.web.ts`: line 11

### Root Cause & Remediation:
1. `react-hooks/set-state-in-effect`: Synchronous state setting in `useEffect` during data loading was deferred using non-blocking timers or `useSyncExternalStore` in `use-color-scheme.web.ts`.
2. Variable declaration order in `punch.tsx` (`requestLocationPermission`) fixed.
3. Unescaped single quotes (`'`) escaped with `&apos;` in `shifts.tsx`, `team-attendance.tsx`, and `team-analytics.tsx`.

### Final Lint Results:
- Command: `npx expo lint`
- **Result:** **0 ERRORS**, 48 non-blocking warnings (unused imports/destructured variables).
- **Exit Code:** `0`.
- **Expo Web Build Export:** **PASS (Exit code 0)**.
