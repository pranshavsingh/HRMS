/**
 * HRMS Standard Server-Side Pagination Utilities
 */

/**
 * Parse pagination parameters from request query with safe bounding.
 * 
 * @param {object} query - Express req.query
 * @param {number} defaultLimit - Default items per page (default: 50)
 * @param {number} maxLimit - Upper bound limit to prevent memory exhaustion (default: 100)
 * @returns {{ page: number, limit: number, offset: number }}
 */
export function parsePagination(query = {}, defaultLimit = 50, maxLimit = 100) {
  let page = parseInt(query.page, 10);
  if (isNaN(page) || page < 1) {
    page = 1;
  }

  let limit = parseInt(query.limit, 10);
  if (isNaN(limit) || limit < 1) {
    limit = defaultLimit;
  } else if (limit > maxLimit) {
    limit = maxLimit;
  }

  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Format a standardized pagination response envelope.
 * 
 * @param {Array<any>} data - The items on current page
 * @param {number} total - Total records matching query filter
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {object} extra - Optional additional metadata fields to attach to root
 * @returns {object} Standardized response envelope
 */
export function formatPaginationResponse(data = [], total = 0, page = 1, limit = 50, extra = {}) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const totalPages = safeTotal === 0 ? 1 : Math.ceil(safeTotal / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total: safeTotal,
      totalPages,
      pages: totalPages, // Compatibility with legacy UI expecting .pages
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    ...extra,
  };
}

export default {
  parsePagination,
  formatPaginationResponse,
};
