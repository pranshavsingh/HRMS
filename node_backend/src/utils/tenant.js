import { db } from "../db/index.js";
import { AppError } from "../middleware/errorHandler.js";

/**
 * Resolves and validates the tenant ID for the current authenticated request.
 * Strictly enforces tenant isolation boundaries:
 * - Superadmins can optionally specify X-Tenant-ID header or ?tenant_id query to operate on behalf of a tenant.
 * - Non-superadmins are strictly locked to their assigned tenant in workforce_user_tenant.
 * 
 * @param {import("express").Request} req 
 * @returns {Promise<number>} Resolved tenantId
 */
export async function resolveTenantId(req) {
  if (!req.user) {
    throw new AppError("Authentication required for tenant resolution", 401);
  }

  const requestedTenantRaw = req.headers["x-tenant-id"] || req.query.tenant_id;
  const requestedTenantId = requestedTenantRaw ? parseInt(requestedTenantRaw, 10) : null;

  if (requestedTenantRaw && (isNaN(requestedTenantId) || requestedTenantId <= 0)) {
    throw new AppError("Invalid tenant ID format", 400);
  }

  const isSuperadmin = req.user.role === "superadmin" || req.user.is_superuser === 1 || req.user.is_superuser === true;

  if (isSuperadmin) {
    if (requestedTenantId) {
      let tenantRow = null;
      try {
        tenantRow = await db.get("SELECT id, is_active FROM workforce_tenant WHERE id = ?", [requestedTenantId]);
      } catch {}
      if (!tenantRow || !tenantRow.is_active) {
        throw new AppError(`Tenant ${requestedTenantId} not found or inactive`, 404);
      }
      return requestedTenantId;
    }

    // Default for superadmin: check workforce_user_tenant or fallback
    let userTenant = null;
    try {
      userTenant = await db.get(
        "SELECT tenant_id FROM workforce_user_tenant WHERE user_id = ? AND is_active = 1 LIMIT 1",
        [req.user.id]
      );
    } catch {}
    return userTenant ? Number(userTenant.tenant_id) : (req.user.tenant_id ? Number(req.user.tenant_id) : (req.user.organization_id ? Number(req.user.organization_id) : 1));
  }

  // Non-superadmin: Lookup tenant association
  let userTenant = null;
  try {
    userTenant = await db.get(
      "SELECT tenant_id FROM workforce_user_tenant WHERE user_id = ? AND is_active = 1 LIMIT 1",
      [req.user.id]
    );
  } catch {}

  const assignedTenantId = userTenant 
    ? Number(userTenant.tenant_id) 
    : (req.user.tenant_id ? Number(req.user.tenant_id) : (req.user.organization_id ? Number(req.user.organization_id) : 1));

  if (requestedTenantId && requestedTenantId !== assignedTenantId) {
    throw new AppError("Cross-tenant access prohibited", 403);
  }

  return assignedTenantId;
}

/**
 * Express middleware to resolve and attach req.tenantId to the request context.
 */
export async function attachTenantContext(req, res, next) {
  try {
    req.tenantId = await resolveTenantId(req);
    next();
  } catch (err) {
    next(err);
  }
}
