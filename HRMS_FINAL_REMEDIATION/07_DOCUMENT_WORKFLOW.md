# 07. Document Workflow (`WF-09`)

- **Workflow ID:** `WF-09`
- **Roles Involved:** `employee` (`stg_emp1`), `hr` (`stg_hr1`), `manager` (`stg_mgr1`)
- **UI Screen:** `/documents` (My Documents), `/employee-documents` (Employee Documents)

## Execution & Security Evidence

1. **Document Ownership & IDOR Protection:**
   - Employee (`stg_emp1`) attempting to view another user's documents via `/api/auth/documents/:id/` was blocked with **HTTP 403 Forbidden** (`DOC-EMP-IDOR` PASS).
   - Manager access verified: Manager can only view direct reportees' documents, not employees in other departments (`rbac.test.js` PASS).
2. **Multi-Tenant Boundary:**
   - Tenant 2 HR (`stg_t2_hr`) attempting to access Tenant 1 employee documents returned **HTTP 404 / 403** (`DOC-CROSS-TENANT` PASS).
3. **Path Traversal Defenses:**
   - Requests attempting directory escape (e.g. `GET /media/documents/../../.env`) returned **HTTP 404 / 403** (`DOC-PATH-TRAVERSAL` PASS).
   - Static direct file access to `/media/documents/` blocked by middleware (`api_security.test.js` PASS).
4. **Metadata & Deletion:**
   - Multer memory storage validates MIME type and enforces file size limits (5MB max).
   - Deletion removes database metadata; cloud asset deletion requests use signed API calls.
5. **Final Status:** **PARTIAL (RBAC, IDOR, tenant isolation, and path traversal PASS; live upload blocked on Cloudinary keys)**.
