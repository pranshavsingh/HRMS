# Business Logic & Operational Audit — Enterprise HRMS

**Application Platform:** Enterprise HRMS (`hrms_saas`, `node_backend`, `hrms_mobile`)  
**Core Domains Audited:** Attendance, Biometrics, Geofencing, Shifts, Rotations, Rosters, Leaves, Sandwich Policy, Holidays, Forgotten Punch-Out, and Payroll Integration  

---

## 1. Attendance & Punch-In/Out Business Rules

### 1.1 In-Geofence vs Out-of-Geofence Logic
- Every registered work site (`work_sites`) possesses GPS latitude, longitude, and a geofence radius in meters (typically 50m).
- When an employee initiates a punch:
  1. The client captures browser/device GPS coordinates (`lat`, `lng`, `accuracy`).
  2. The backend computes the Haversine distance between employee coordinates and their assigned work site.
  3. **Inside Geofence (`distance <= radius`):**
     - Punch is marked with `status = 'approved'` immediately.
     - Work hours accumulation begins.
  4. **Outside Geofence (`distance > radius`):**
     - Punch is marked with `status = 'pending'`.
     - An approval record is created in `attendance_approvals`.
     - Approval routing:
       - If employee has an assigned manager (`manager_id`), routed to Manager.
       - If employee has NO manager assigned, automatically routed to the HR/Admin fallback queue.
       - If no reviewer exists, the record remains securely pending (never auto-approved).

### 1.2 Sunday Punches (Weekly Off Handling)
- **Question:** *If an employee punches on Sunday, how is it handled in employee attendance, reports, and other pages?*
- **Operational Logic:**
  - Sundays are designated as `Weekly Off (WO)` by default in the company weekly off policy.
  - If an employee does NOT punch on Sunday, the monthly muster roll marks the date as `WO` (Paid Non-Working Day, 0 hours worked).
  - If an employee **DOES punch in and out on Sunday**:
    - The attendance record is created and marked as **Present (`P`)** or **Weekly Off Worked (`WOW`)**.
    - The actual punch-in and punch-out timestamps are recorded.
    - Actual work hours (e.g. 8.00 hrs) are calculated and added to the monthly total.
    - In Monthly Reports and Payroll Exports:
      - The day is credited as an additional working day.
      - Overtime / Compensatory Off (Comp-Off) calculation: Hours worked on a weekly off are flagged as eligible for overtime pay (1.5x / 2.0x standard rate) or added to the employee's Compensatory Off leave balance.

### 1.3 Company Holiday Punches
- **Question:** *If a holiday is marked in the holiday calendar, how does it show in attendance and reports, and if an employee punches on a holiday, how is it handled?*
- **Operational Logic:**
  - When a date is declared in `company_holidays`:
    - For employees who do not work, the day appears in reports with status **Holiday (`H`)** and is credited as a paid day without requiring leave deduction.
  - If an employee **punches in and out on an official Holiday**:
    - The attendance engine records the session under status **Present on Holiday (`PH` / `H-P`)**.
    - Punch timestamps and work hours are recorded.
    - In Payroll & Muster Roll reports:
      - The employee receives their base holiday pay PLUS holiday special duty overtime allowance (as configured in `company_policies`).
      - In analytics, holiday attendance is aggregated under "Special Duty / Holiday Coverage".

### 1.4 Forgotten Punch-Out Handling
- **Question:** *If an employee forgets to punch out, which timing shows in reports?*
- **Operational Logic:**
  - During the active shift, `punch_out_time` remains `NULL`.
  - Daily at 23:59:00, the background cron job scans for unclosed sessions exceeding the 16-hour threshold.
  - **Status Transition:** The session is marked with `status = 'pending'`.
  - **Recorded Timings in Database:**
    - `punch_in_time` = Actual recorded punch-in time (e.g. `09:12:00`).
    - `punch_out_time` = `NULL` (Remains empty to prevent fabricating hours).
    - `work_hours` = `0.00` (Zero hours credited until regularized).
  - **Presentation in Reports:**
    - In Employee Attendance History and Monthly Reports, the row displays:
      - Punch In: `09:12 AM`
      - Punch Out: `--:--` (or `Missing`)
      - Status: `Pending Regularization`
      - Work Hours: `0.00 hrs`
    - It does NOT count towards total working hours for payroll until an Attendance Regularization request is submitted by the employee and approved by their Manager or HR.

### 1.5 Night Shift Handling Across Midnight
- For shifts starting in the evening and ending the next morning (e.g. 22:00 to 06:00):
  - The attendance session is pegged to the shift start date (the calendar date of punch-in).
  - Punch-out occurring the next calendar day is reconciled against the overnight shift window without triggering duplicate records or premature forgotten punch-out cron flags.

---

## 2. Leave Management & Sandwich Leave Policy

### 2.1 Who Handles Sandwich Leave?
- **Question:** *Who handles sandwich leave?*
- **Operational Logic:**
  - Sandwich leave is **automatically calculated and enforced by the backend leave service (`node_backend/src/services/leave.service.js`)** during the leave application submission.
  - It does NOT rely on manual manager calculation.
  - When an employee applies for leave:
    1. The system evaluates whether the leave begins before a non-working weekend/holiday and ends after it.
    2. If sandwich policy is enabled in company settings, intermediate non-working days (Saturday, Sunday, Holidays) are converted to chargeable leave days and deducted from the employee's balance.
  - **Identified Gap (BUG-A05):**
    - The current algorithm only evaluates contiguous date ranges within a single application (`[fromDate, toDate]`).
    - If an employee submits two separate applications (one for Friday, one for Monday), the system processes them individually and fails to detect that the intervening weekend is sandwiched.
    - **Resolution Required:** Cross-application adjacency lookup must be added to `leave.service.js`.

---

## 3. Shift Management, Roster Planning & Work Sites

### 3.1 Roster Publishing Without Shift Assignments
- **Question:** *Can a user publish a roster calendar without shift assignments, and how are fixed shifts handled?*
- **Operational Logic:**
  - **Publishing Without Direct Shift Assignment:**
    - **YES.** When a manager or HR generates and publishes a monthly roster for a site, the system checks each employee's assigned shift template.
    - If an employee does not have an explicit fixed shift assignment or rotation rule, the roster generation engine assigns the site's **Default Shift Template** (typically "General Shift" 09:00 - 18:00) or marks the day as Weekly Off according to the site's weekly off policy.
    - Roster publishing freezes a versioned snapshot (`shift_version_id`) for every employee day record in `roster_entries`, ensuring historical auditability.
  - **Fixed Shifts Handling:**
    - Employees assigned a **Fixed Shift** retain that exact shift across all roster generation cycles unless overridden by an explicit temporary shift assignment or an approved shift swap request.
    - If a shift template is modified in the master settings, existing published rosters remain untouched because they point to immutable `shift_versions`.

### 3.2 Explanation of Roster Warning Dialog (User Screenshot)
- **Question / User Screenshot:** *Why does the warning "Select one work site in the header before generating a roster" show up?*
- **Root Cause & Operational Flow:**
  - In `hrms_saas/src/pages/Roster.jsx:491`, the "Generate Draft Roster" action calls:
    ```javascript
    if (!siteId || siteId === "all" || siteId === "unassigned") {
      popup?.showPopup("Select one work site in the header before generating a roster", "warning");
      return;
    }
    ```
  - **Why this is required by the backend:**
    - The backend endpoint `POST /api/v1/workforce/rosters/draft` requires a discrete integer `site_id` because rosters are generated per physical site (matching employees who work at that specific site with the site's shift templates).
    - If the user has "All Sites" selected in the top header filter (or hasn't selected a site), the frontend cannot determine which site's employees to schedule.
  - **UX Defect (BUG-A06):**
    - The "Generate Draft Roster" modal (shown in screenshot `media_1795432711200_a48052d0.png`) provides Start Date, End Date, and Team Filter, but does NOT contain a "Work Site" dropdown inside the modal.
    - If a user opens the modal while the global header is set to "All Sites", clicking "Generate" triggers the warning popup (`media_1795432720345_f4a43139.png`).
    - **Recommended Improvement:** Include an explicit "Work Site" dropdown directly inside the "Generate Draft Roster" modal or pre-select the user's primary assigned site.

---

## 4. Payroll Integration & Data Consistency

1. **Muster Roll Computation:**
   - Daily codes: `P` (Present), `A` (Absent), `HD` (Half Day), `WO` (Weekly Off), `H` (Holiday), `L` (Approved Leave), `PR` (Pending Regularization).
   - Payroll total days calculation:
     $$\text{Payable Days} = \text{Present Days} + \text{Half Days} \times 0.5 + \text{Weekly Offs} + \text{Paid Holidays} + \text{Paid Approved Leaves}$$
2. **Attendance Regularization Impact on Payroll:**
   - Forgotten punch-outs remain at 0 payable hours until approved.
   - Upon manager approval, the status converts to `approved`, the approved hours are written to `work_hours`, and the payable day count is updated for that billing period.
3. **Overtime Calculation:**
   - Hours worked beyond the shift duration + grace period are tracked in `overtime_hours` and aggregated into monthly payroll exports.
