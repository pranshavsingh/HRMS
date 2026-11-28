import api from "./api";

export interface CursorPaginationMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface NormalizedPage<T> {
  items: T[];
  pagination: CursorPaginationMeta;
  raw: any;
}

/**
 * Normalizes heterogeneous backend pagination envelopes (cursor or offset) into a single contract.
 */
export function normalizePaginatedResponse<T = any>(
  payload: any,
  {
    itemsKey,
    defaultLimit = 20,
    currentPage = 1,
  }: { itemsKey?: string; defaultLimit?: number; currentPage?: number } = {}
): NormalizedPage<T> {
  const root = payload || {};
  let items: T[] = [];

  if (itemsKey && Array.isArray(root[itemsKey])) {
    items = root[itemsKey];
  } else if (Array.isArray(root)) {
    items = root;
  } else if (Array.isArray(root.data)) {
    items = root.data;
  } else if (Array.isArray(root.records)) {
    items = root.records;
  } else if (Array.isArray(root.logs)) {
    items = root.logs;
  } else if (Array.isArray(root.employees)) {
    items = root.employees;
  }

  const pag = root.pagination || {};
  const limit = Number(pag.limit || defaultLimit);
  const nextCursor = typeof pag.nextCursor === "string" && pag.nextCursor.length > 0 ? pag.nextCursor : null;
  const hasMore =
    typeof pag.hasMore === "boolean"
      ? pag.hasMore
      : typeof pag.hasNextPage === "boolean"
      ? pag.hasNextPage
      : nextCursor !== null || (pag.pages ? currentPage < Number(pag.pages) : false);

  return {
    items,
    pagination: {
      limit,
      nextCursor,
      hasMore,
      total: pag.total !== undefined ? Number(pag.total) : undefined,
    },
    raw: root,
  };
}

export async function fetchCursorPage<T = any>(
  endpoint: string,
  {
    cursor = null,
    limit = 20,
    params = {},
    signal,
    itemsKey,
    page = 1,
  }: {
    cursor?: string | null;
    limit?: number;
    params?: Record<string, any>;
    signal?: AbortSignal;
    itemsKey?: string;
    page?: number;
  } = {}
): Promise<NormalizedPage<T>> {
  const queryParams: Record<string, any> = {
    ...params,
    limit,
    cursor_mode: "true",
  };
  if (cursor) {
    queryParams.cursor = cursor;
  } else if (page > 1) {
    queryParams.page = page;
  }

  const res = await api.get(endpoint, {
    params: queryParams,
    signal,
  });

  return normalizePaginatedResponse<T>(res.data, {
    itemsKey,
    defaultLimit: limit,
    currentPage: page,
  });
}
