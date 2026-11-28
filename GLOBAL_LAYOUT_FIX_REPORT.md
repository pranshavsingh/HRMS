# Global Layout Fix Report

## 1. Objective

Resolve the global fixed-navbar overlap and top content clipping across all HRMS Web (`hrms_saas`) pages via a centralized layout and CSS token architecture, without adding per-page margin/padding workarounds or redesigning the navbar/sidebar.

## 2. Files Modified

1. **`f:\hrms\hrms_saas\src\index.css`**
   - Added centralized CSS variables:
     - `--hrms-navbar-height: 4rem;` (`64px`)
     - `--hrms-sidebar-width: 16rem;` (`256px`)
   - Added `html { scroll-padding-top: calc(var(--hrms-navbar-height) + 1rem); }` so focus/anchor scrolling clears the fixed navbar.

2. **`f:\hrms\hrms_saas\src\components\layout\Layout.jsx`**
   - Replaced `overflow`-unconstrained outer container with `min-h-screen w-full bg-gray-100 overflow-x-clip` (using `overflow-x: clip` rather than `hidden` so `position: sticky` table headers in `Roster.jsx`, `TeamAttendance.jsx`, etc. continue working).
   - Replaced `lg:ml-64 min-w-0` with `lg:pl-[var(--hrms-sidebar-width)] min-w-0 flex flex-col min-h-screen`.
   - Replaced `<div className="pt-20 p-4 sm:p-6 bg-gray-100 min-h-screen min-w-0">` with semantic:
     ```jsx
     <main className="flex-1 min-w-0 bg-gray-100 px-4 pb-4 pt-[calc(var(--hrms-navbar-height)+1rem)] sm:px-6 sm:pb-6 sm:pt-[calc(var(--hrms-navbar-height)+1.5rem)]">
       {children}
     </main>
     ```
   - Eliminated shorthand `p-4` / `sm:p-6` entirely so `padding-top` is never overridden at any breakpoint (`80px` on `< 640px`, `88px` on `>= 640px`, clearing the `64px` fixed navbar by `16px` and `24px` respectively).

3. **`f:\hrms\hrms_saas\src\components\layout\Navbar.jsx`**
   - Updated line 81 to reference `lg:left-[var(--hrms-sidebar-width)]` and `h-[var(--hrms-navbar-height)]`, keeping exact visual styling, `z-40`, and fixed positioning.

4. **`f:\hrms\hrms_saas\src\components\layout\Sidebar.jsx`**
   - Updated line 60 to reference `w-[var(--hrms-sidebar-width)]` and `h-screen supports-[height:100dvh]:h-dvh`, preserving `z-50` drawer overlay and responsive collapse behavior.

5. **`f:\hrms\hrms_saas\src\App.jsx`**
   - Added `<ScrollToTop />` inside `<BrowserRouter>` to reset `window.scrollTo({ top: 0, left: 0, behavior: "auto" })` on `pathname` or `search` changes.

## 3. Build & Lint Verification

- **Production Build:** `cd f:\hrms\hrms_saas && npm run build` -> **Passed** (`vite build` succeeded in `3.35s`, 1,865 modules, generating `dist/assets/index-CoC2WCko.css`).
- **ESLint (Modified Layout & App Files):** `npx eslint src/components/layout/Layout.jsx src/components/layout/Navbar.jsx src/components/layout/Sidebar.jsx src/App.jsx` -> **Passed (0 errors, 0 warnings)**.
  *(Note: Full-repo `npm run lint` reports 4 pre-existing unrelated errors in `src/hooks/useReverseGeocode.js`, `src/pages/Attendance.jsx`, and `src/services/locationService.js`.)*
