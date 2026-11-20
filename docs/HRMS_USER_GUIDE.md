# HRMS User Guide

**Audience:** Employees, managers, HR, administrators, and superadmins  
**Purpose:** Explain the current HRMS screens, common tasks, and role-based access in plain language.  
**Scope:** This guide documents the web application and server permissions present in the inspected source. It does not add or change application behavior.  
**Last reviewed:** 18 November 2026

## 1. What the HRMS is for

The HRMS brings together attendance, leave, employee records and documents, team oversight, reports, and workforce scheduling. What each person can see depends on their account role and, where applicable, their team or tenant.

The web app is organized around a left navigation menu. Choose a page from that menu, complete the form or filter controls on the page, and use the page's action buttons to save, submit, review, refresh, or export information. A successful action normally produces an on-screen confirmation. If an error appears, check that the information is complete and try again; if it continues, contact the HRMS administrator.

## 2. Sign in and basic navigation

1. Open the HRMS web address and sign in with your account.
2. The dashboard shown depends on your role. The left menu lists the areas exposed to that role.
3. Select a menu item to open its page. On pages with tabs, use the tabs to switch between the available work areas.
4. Use search, date, month, and status filters to narrow a list where those controls are present.
5. Use **Refresh** when a page offers it and you want to reload current information.
6. Sign out with **Logout** when you finish using a shared device.

Some pages require more than being signed in. For example, Shift Management is restricted to HR, admin, and superadmin at the application route. The server also checks roles on sensitive operations. A menu link being visible is not, by itself, proof that every action on that page is allowed.

### Account access

- Sign in using the account credentials issued to you. The application has login, logout, token refresh, and change-password operations.
- If you cannot sign in because you forgot your password, use the **Forgot Password** flow on the sign-in screen. The current service supports a one-time passcode request, verification, and password reset.
- Do not share your password or one-time passcode. If a reset message does not arrive, contact your administrator to confirm your account contact information and access.
- New employee accounts are created by an authorized HR, admin, or superadmin user; self-service registration is not part of the current login routes.

## 3. Current feature guide

### Personal dashboard

**Where:** Dashboard (`/dashboard`); managers also have Team Dashboard (`/team-dashboard`), HR has HR Dashboard (`/hr-dashboard`).

- The personal dashboard is the starting point for an individual account. Admin and superadmin menus distinguish the personal dashboard from the system dashboard.
- Team Dashboard provides managers an overview for team work.
- HR Dashboard presents HR-focused attendance information.
- Admin and superadmin dashboards provide system-level summary views.

The dashboards are summaries. Use the related attendance, leave, employee, and report pages for detailed records or actions.

### Attendance

**Where:** Attendance (`/attendance`).

Employees use this page to record attendance by punching in and punching out. The current application supports an attendance photo upload flow, and the server exposes a signed upload step for attendance media. The screen also displays the employee's current attendance status.

1. Open **Attendance**.
2. Follow the on-screen punch-in or punch-out action for the current work period.
3. If the page requests a photo, capture or select the required image and submit it with the punch.
4. Check the status shown on the page. If an out-of-area punch needs review, it can appear in an approval queue.

Do not submit duplicate punches to work around a loading message. Refresh once and check the displayed status first.

### Attendance history

**Where:** History (`/history`).

- Review attendance entries across a date range.
- Set a start date and end date, then select **Apply Filters**.
- Use **Reset** to return to the default recent date range.
- The table shows the date, punch times, hours, review information, and status. The page includes summary cards for the displayed records.
- The list can be paged using the rows-per-page control and page buttons.

### Leave requests

**Where:** Leave (`/leave`).

Employees can submit a leave request and review their own leave requests and their current status.

1. Open **Leave** and choose the leave type and requested date range.
2. Enter the requested reason or other fields shown in the form.
3. Submit the request and check for the confirmation message.
4. Return to the request list to see whether it is pending, approved, or rejected.

An approver's decision may close the request. The page's status and decision details are the record to consult.

### Attendance Approvals

**Where:** Attendance Approvals (`/attendance-approvals` for HR/admin roles; team route is `/team-attendance-approvals` for managers).

This is a review queue for attendance exceptions, including punch-level location reviews. Search by employee or related details, filter by status or punch type, and inspect the punch window, location, route, status, and decision history.

- Items that need a decision may show **Approve** and **Reject** actions.
- Items already decided or closed are shown as view-only or closed.
- Approval eligibility is determined by the server and the item's route; do not assume every approver can decide every item.
- The queue can be refreshed and paged. Summary cards describe the filtered queue.

The approval page describes attendance hours as counted only after required approval. An approval decision records the decision state and reviewer information shown in the interface.

### Leave Approvals

**Where:** Leave Approvals (`/leave-approvals` for HR/admin roles; `/team-leave-approvals` for managers).

Review requests routed to you, examine the employee, leave dates, reason, routing, status, and prior decision information, then approve or reject when the page allows it. Use search, status, and role filters to find items. Page controls apply to the filtered queue. A final action can close the request and record the reviewer.

### Team Attendance / Employee Attendance

**Where:** Team Attendance (`/team-attendance`), labelled **Team Attendance** for managers/HR and **Emp Attendance** for admin/superadmin.

- Choose a month to review the monthly team attendance register.
- Search for an employee by the visible employee details.
- The register shows daily attendance codes and summary totals such as present, leave, pending, absent, shortfall, and hours.
- Select an employee where supported to inspect their attendance detail over a date range.
- Use the export actions to download the register or the selected employee's history as CSV.
- Pagination applies to the visible employee rows; the register export is generated from the full matching set rather than only the currently visible page.

### Reports

**Where:** Reports (`/reports`).

1. Select the month.
2. Select the report format: basic attendance codes or attendance with punch duration details.
3. Review the preview. Use the pagination controls to move through employee rows.
4. Select **Export CSV Report** to download the monthly attendance report.

The report export fetches the month's data for the export operation. Changing the preview page does not intentionally limit the CSV to that page.

### Employees

**Where:** Manage Employees (`/employees`).

HR, admin, and superadmin have employee-management access in the current server routes. The page supports viewing employee records, creating an employee, editing employee details, and retrieving or managing related employee information as shown in the form. The employee creation flow can collect supporting documents. Review fields carefully before saving because changes affect the employee record used by other HRMS pages.

Managers can view employee documents through a separate permission, but the employee-management API itself is restricted to HR/admin/superadmin roles.

### Documents

**Where:** Documents (`/documents`) for personal documents; View Emp Documents (`/employee-documents`) for authorized staff access.

- Employees can view their own documents and submit documents through the upload flow.
- HR, admin, superadmin, and managers can retrieve employee documents, subject to the server's access checks.
- Document deletion is restricted to superadmin in the server route.
- Treat identity, tax, bank, and other personal documents as confidential. Use only the employee record and purpose for which you have authorized access.

### My Schedule and roster

**Where:** My Schedule / Team Roster (`/roster`).

- Employees can view their own roster using the self-service schedule.
- Managers can view roster information for their team.
- HR, admin, and superadmin can manage rosters.
- The roster area contains a calendar view and management actions. Authorized schedulers can generate a draft roster and publish it; a published roster is the schedule employees use to see their shifts.
- Check the selected date range and employee/team context before generating or publishing a roster.

### Shift Management

**Where:** Shift Management (`/shifts`).

The page is available to HR, admin, and superadmin. Depending on the available tabs and role permissions, it supports:

- Creating and updating shift definitions, including names, types, and timings.
- Managing shift versions and their effective dates/statuses.
- Defining breaks for a shift version.
- Managing weekly-off policies and company attendance policies.
- Defining rotation patterns and employee rotation enrollment.
- Creating, publishing, or cancelling employee shift assignments, including bulk assignment.
- Reviewing roster and assignment information.

Some management routes allow managers to read assignments, rotation details, or policy versions while reserving create, publish, and change actions for HR/admin/superadmin. Publishing changes the governing schedule or policy; review the draft and effective date before publishing.

### Company holidays

**Where:** Company Holiday Calendar (`/holidays`).

The current web app has a company holiday calendar route. The server allows signed-in users to read holiday information for their tenant. HR, admin, and superadmin can create, update, and delete holidays. Superadmin can access the tenant-list endpoint. Confirm the tenant and year before changing a holiday so the calendar is updated for the intended company.

### Team Analytics

**Where:** Team Analytics (`/team-analytics`).

Managers, HR, admin, and superadmin can access team attendance analytics in the server routes. Use this page for team-level trend or summary information rather than individual punch changes. The available data depends on the selected team/date controls shown in the interface.

### Audit Logs

**Where:** Audit Logs (`/audit-logs`).

Superadmin-only. Use it to review recorded administrative activity when investigating a change. The route is protected by a superadmin role check. Audit logs should be treated as trace evidence; do not delete or alter them as a routine cleanup action.

## 4. Role-based access currently present

The application uses these role names: **employee**, **manager**, **hr**, **admin**, and **superadmin**. This table summarizes the current navigation and explicit server-route checks found in the code. An entry such as “team-scoped” describes the intended work area; the server applies its own data-scope rules.

| Feature | Employee | Manager | HR | Admin | Superadmin |
|---|---|---|---|---|---|
| Personal dashboard, attendance, own history, own leave, own documents | Yes | Yes | Yes | Yes | Yes |
| Own roster / My Schedule | Yes | Yes | Yes | Yes | Yes |
| Team dashboard | No | Yes | Not in current sidebar | Not in current sidebar | Not in current sidebar |
| Attendance approvals | No | Yes, routed team queue | Yes | Yes | Yes |
| Leave approvals | No | Yes, routed team queue | Yes | Yes | Yes |
| Team attendance and team analytics | No | Yes | Yes | Yes | Yes |
| Employee management | No | No | Yes | Yes | Yes |
| View employee documents | No | Yes | Yes | Yes | Yes |
| Delete an employee document | No | No | No | No | Yes |
| Reports | Not in current sidebar | Not in current sidebar | Yes | Yes | Yes |
| Shift, roster, policy, and schedule administration | No | Read access to selected team scheduling data; no management writes | Yes | Yes | Yes |
| Company holiday read | Signed-in users | Signed-in users | Signed-in users | Signed-in users | Signed-in users |
| Company holiday create/update/delete | No | No | Yes | Yes | Yes |
| Audit logs | No | No | No | No | Yes |

### How the access checks work

- The sign-in requirement protects the application pages and API operations from anonymous use.
- The sidebar hides or shows navigation links based on the stored role.
- The frontend route guard explicitly restricts the Shift Management page to HR, admin, and superadmin. Other pages are generally behind authentication at the frontend, and rely on server-side route checks for role-restricted actions and data.
- The backend checks roles for sensitive endpoints. For example, employee management is limited to HR/admin/superadmin, approval actions to manager/HR/admin/superadmin, and audit logs and document deletion to superadmin.
- Several read endpoints accept more than one role, and approval queues apply employee/team routing in service logic. Role alone does not mean a person can act on every record.
- This guide describes existing checks; it does not implement additional role restrictions. If a user can open a page but receives an access error on an action, the server-side permission is authoritative.

## 5. Suggested routine workflows

### Employee: record attendance and submit leave

1. Sign in and open **Attendance** at the beginning of work.
2. Complete punch-in and any requested photo step.
3. Complete punch-out at the end of work and check the updated status.
4. For time off, open **Leave**, submit the dates and reason, then monitor the decision status.
5. Use **History** to review past attendance and **My Schedule** to check assigned shifts.

### Manager: review team requests and schedules

1. Open **Team Dashboard** to orient to current team activity.
2. Open **Attendance Approvals** and review pending, routed punch exceptions.
3. Open **Leave Approvals** and review requests assigned through the approval route.
4. Use **Team Attendance** and **Team Analytics** to inspect team patterns.
5. Use **Team Roster** to review team schedules. Management actions such as publishing remain reserved for management roles.

### HR: manage employee processes and workforce rules

1. Review HR Dashboard and pending attendance/leave queues.
2. Use **Manage Employees** to create or update employee records.
3. Use **View Emp Documents** for authorized employee document review.
4. Use **Reports** for monthly attendance preview and CSV export.
5. Use **Shift Management**, roster, policy, weekly-off, and holiday tools to maintain workforce rules and schedules.
6. Review effective dates and drafts carefully before publishing a policy, shift version, assignment, or roster.

### Admin and superadmin: oversee system operations

1. Use the system dashboard and attendance/leave review queues for broad oversight.
2. Use employee, attendance, report, and scheduling tools as permitted.
3. Superadmin can additionally view Audit Logs, delete employee documents, and access the holiday tenant list.
4. Use elevated operations only for an approved business purpose and retain the relevant audit trail.

## 6. Lists, filters, pagination, and exports

On pages that show pagination, the footer shows the visible item range and total count. Use **Rows per page** to choose 10, 25, or 50 rows. Use the numbered buttons or previous/next arrows to move between pages. Search and filters narrow the results before the page is selected. The current paging behavior is in the browser over the data returned by the page's API; it is not a guarantee of server-side pagination.

Where the page offers a CSV export, the export may use the full filtered or fetched result set and not just the currently visible page. Confirm the selected month and filters before exporting.

## 7. Status meanings and good practices

- **Pending:** A request or attendance item still needs a decision or further processing.
- **Approved:** The required approval has been recorded.
- **Rejected:** An approver rejected the request or item.
- **Closed:** A final decision has already been made, or another approver completed the item; it may be view-only.
- **Draft:** A schedule or policy is being prepared and has not yet been published.
- **Published:** A schedule or policy version has been made effective according to its configured dates.

Use filters to locate records, but check employee identity, dates, team, and decision route before taking action. Do not share exported files containing personal employee information outside approved channels.

## 8. Current limitations and items to confirm

- This document records capabilities visible in the current source tree, not a live acceptance test of every feature.
- Exact fields and buttons can vary by role, tenant, data state, and current screen version.
- Server routes demonstrate access checks, but this guide is not a security audit and does not prove every data-scope or concurrency rule.
- Some dashboards and analytics use role-specific or team-scoped data. If a screen is empty, first confirm that the account has the expected role, team association, date range, and underlying records.
- The environment's database contents are operational data and are not described here. The guide does not recreate employees, attendance, leave, schedules, or migration state.
- Role-based navigation and permissions described here are documentation of existing behavior. Adding or changing access control requires a separate code change and authorization.

## 9. Quick reference

| Need to… | Open… |
|---|---|
| Punch in or out | Attendance |
| Check personal attendance or work schedule | History or My Schedule |
| Request time off | Leave |
| Review a team's attendance exception | Attendance Approvals |
| Decide a leave request | Leave Approvals |
| See a monthly team register | Team Attendance / Emp Attendance |
| Download a monthly attendance CSV | Reports |
| Create or update employee records | Manage Employees |
| Review employee documents | View Emp Documents |
| Review or manage shifts | Shift Management |
| Review or publish team schedules | My Schedule / Team Roster |
| Maintain company holidays | Company Holiday Calendar |
| Investigate recorded admin activity | Audit Logs (superadmin only) |

## 10. End-to-end account and workday flow

### A. How a user gets an account

There is no public **Register** or self-sign-up screen. An authorized staff member creates accounts from **Manage Employees**. The first administrator account is provisioned outside this self-service flow; the inspected app does not show a first-admin signup process.

1. An authorized HR, admin, or superadmin signs in and opens **Manage Employees**.
2. Select the action to add an employee and enter the account details. The form includes username, first and last name, email, password, role, and profile information such as designation, joining date, leave allowance, manager, team, and attendance location settings where applicable.
3. Enter a password of at least 12 characters (the server accepts up to 128 characters). The app does not show a public invitation or account-activation workflow; the creator must provide the login details through the organization's approved secure process.
4. Select a work site for employee, manager, and HR accounts. The server requires a site for these roles. Admin and superadmin accounts can be created without an employee site assignment.
5. Set reporting details where applicable: an employee may be linked to a manager; a manager may have a team name. Assign an effective date for the site.
6. Add supporting employee documents if the form requests them. The form includes identity, tax, bank, CV, voter ID, and driving-license document fields; upload only documents the organization requires and is authorized to hold.
7. Save the form. The service creates the login account, organization membership, employee profile, and site assignment together, and records an account-creation audit event. The creator should confirm the person appears in the directory and has the intended role and site.

Role limits for account creation are enforced by the server: HR can create employee and manager accounts; admin can create employee, manager, and HR accounts; superadmin can create any of the listed roles. Do not treat a role label in the browser as proof of access: API permissions also apply.

### B. User's own portal: normal workday

1. Open the HRMS sign-in page and enter the issued username or email and password. If credentials are forgotten, use **Forgot password?**, request an email OTP, verify it, and set a new password. If the email does not arrive, ask an administrator to check the account email and access.
2. After sign-in, use the left menu for personal work. The dashboard is a summary; the Attendance, History, Leave, Documents, and My Schedule pages hold the related records and actions.
3. At the start of work, open **Attendance**. Start the punch-in flow, allow the camera and location prompts if requested, complete the face-verification/capture steps, then submit. Wait for the page to confirm the result before retrying. If verification or upload fails, do not assume a punch was saved; check History/current punch status or contact the administrator.
4. During work, open **My Schedule** to see the roster published for the selected dates. A draft roster is not the final employee schedule. If the schedule is missing or incorrect, ask the schedule administrator to review the date range and publication status.
5. To request time off, open **Leave**, choose leave type and dates, enter the reason, submit, then return to **My Leave Requests** to follow the status. A request is not approved until the request list shows the recorded decision.
6. At the end of work, return to **Attendance** and use **Punch Out** when available. Check the resulting status; an exception may need approval.
7. Use **History** to review past punches, dates, hours, and decision status. Use **Documents** to view or submit your own documents as the page allows.
8. Sign out when using a shared computer.

### C. Work-site setup and site-aware work

**Where:** **Shift Management → Work Sites**. The Work Sites tab is available to admin and superadmin. Site setup is a tab inside Shift Management, not a separate menu page.

1. Create each physical work location with a unique site code and a name; add an address if useful.
2. Add or edit a staff account in **Manage Employees** and select the correct site. Employee, manager, and HR accounts require a site. For an existing user, use the site assignment/transfer action and set its effective date; historical assignments keep their date ranges.
3. For an HR user or manager who must oversee a site, grant access to that site. Access can later be revoked. A site assignment may also establish HR/manager access for that site; confirm the site-access list after the assignment.
4. When a staff member transfers, set the new site and effective date. Do not deactivate a site while it still has current assignments: the server blocks that operation until those staff have been transferred.
5. HR, managers, admins, and superadmins can use the **Work site** selector in the top bar where sites are available. Admin/superadmin can choose all sites or unassigned records; HR/manager choices are limited to sites they can access.
6. The selected site is passed by the current interface to employee directory, employee document listing, attendance and leave approval queues, team attendance, reports, and roster requests. A site selection is a filter for those requests; it does not change a person's own assigned site. The server performs separate permission and site-scope checks.

### D. Manager workflow

1. Use **Team Dashboard** for a summary of team activity.
2. Review **Attendance Approvals** and **Leave Approvals** for records routed to you. Open a record, check the employee, dates/details, and history, then approve or reject only when the action is available and the decision is justified.
3. Use **Team Attendance** and **Team Analytics** to review team patterns. Select the intended month/site and employee before exporting or drilling into details.
4. Use **My Schedule / Team Roster** to review the team's published schedule. Manager access is limited to permitted team/site scope; schedule-management writes remain restricted to HR/admin/superadmin.
5. If a site is missing from the selector, ask an administrator to grant the manager access to that site.

### E. HR and administrator workflow

1. Set up work sites first, then create employees/managers/HR accounts with the correct site, manager/team, active status, and effective date.
2. Grant HR/manager site access and verify the site selector displays the intended sites.
3. Maintain shifts and policies in **Shift Management**. Create shift definitions, configure the applicable attendance and weekly-off policies, and review their effective dates and versions.
4. In **My Schedule / Team Roster**, create fixed assignments or rotation patterns, generate a draft roster for a site and date range, review it, then publish it. Published schedules are what employees use to view their shifts.
5. Review attendance and leave queues. Resolve only routed items and preserve the recorded decision information.
6. Use **Team Attendance** to inspect the site/month register, and **Reports** to preview/export attendance for the selected month/site. Check the site and month before exporting.
7. Maintain company holidays in **Company Holiday Calendar**. Superadmin may access tenant-list functions and **Audit Logs**; use those elevated tools only for approved administrative work.

### F. How the main records move through the system

- **Attendance:** user submits a punch → the system records the punch and associated status → an exception can enter an approval queue → the team attendance register and reports reflect the resulting attendance data.
- **Leave:** user submits a request → it remains pending while routed → an authorized approver records approval or rejection → the user checks the request list for the final status.
- **Scheduling:** HR/admin/superadmin configures shifts and assignments → generates a draft roster → reviews and publishes → employees view the published dates under My Schedule.
- **Documents:** user or authorized staff submits a document → it is associated with the employee record → personal and authorized employee-document views expose the record according to role checks.
- **Site scope:** an administrator creates a site and assigns staff/access → authorized users select an allowed site → supported team lists, approvals, roster, and reports request data for that scope.

These are user-facing workflow descriptions, not proof that every request succeeds in a particular deployment. Runtime availability, camera/model loading, database state, site data, and configured server services affect actual results.

## 11. Printable flowchart

The printable overview is available as [HRMS end-to-end workflow flowchart](../output/pdf/HRMS_END_TO_END_USER_FLOWCHART.pdf). Print it in **A3 landscape** (or use “fit to page” on A4 landscape) for the clearest view. The diagram shows account provisioning, role paths, daily employee use, approvals, site filtering, scheduling, and reporting.
