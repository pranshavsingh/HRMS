# HRMS Code Quality Fix Report (Bugs 12 & 13)

## 1. Bug 12 – React Hooks `set-state-in-effect` Fixes
- **`hrms_saas/src/hooks/useReverseGeocode.js`:** Derived `missing` and `invalid` states synchronously from `parseCoords(latitude, longitude)` during render and stored only async lookup state `{ key, status, location }` in `useState`.
- **`hrms_mobile/src/components/EmployeeRegisterModal.tsx`:** Replaced synchronous `setSelectedMonth` effect with employee-keyed state `{ empId, month }` and deferred async `fetchRegister()` via `Promise.resolve().then(...)` with cancellation cleanup.
- **`hrms_mobile/src/context/NotificationContext.tsx`:** Derived `effectiveUnreadCount = isAuthenticated ? unreadCount : 0` during render and deferred authenticated async fetches via `Promise.resolve().then(...)` with cancellation cleanup.

## 2. Bug 13 – Attendance JSX Structure & Location Catch Blocks
- **`hrms_saas/src/pages/Attendance.jsx`:** Removed unused `formatCoordinate` and changed `InfoCard` value wrapper from `<p>` to `<div>` so `<LocationDisplay />` never nests `<div>` inside `<p>`.
- **`hrms_saas/src/services/locationService.js`:** Replaced empty `catch {}` blocks around `clearWatch` and `onSample` with scoped `console.warn` error logging.
