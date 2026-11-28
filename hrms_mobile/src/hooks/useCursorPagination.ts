import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCursorPage, NormalizedPage } from "../services/paginationService";

export interface UseCursorPaginationOptions<T> {
  endpoint: string;
  limit?: number;
  params?: Record<string, any>;
  itemsKey?: string;
  enabled?: boolean;
  getItemKey?: (item: T) => string | number;
  onData?: (page: NormalizedPage<T>, isAppend: boolean) => void;
}

export function useCursorPagination<T = any>({
  endpoint,
  limit = 20,
  params = {},
  itemsKey,
  enabled = true,
  getItemKey,
  onData,
}: UseCursorPaginationOptions<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | undefined>(undefined);

  const abortRef = useRef<AbortController | null>(null);
  const inflightRef = useRef<boolean>(false);
  const pageRef = useRef<number>(1);
  const cursorRef = useRef<string | null>(null);
  const paramsKey = JSON.stringify(params);

  const onDataRef = useRef(onData);
  const getItemKeyRef = useRef(getItemKey);
  useEffect(() => {
    onDataRef.current = onData;
    getItemKeyRef.current = getItemKey;
  });

  const dedupeMerge = useCallback((prev: T[], incoming: T[]) => {
    const keyFn = getItemKeyRef.current;
    if (!keyFn) return [...prev, ...incoming];
    const seen = new Set(prev.map((x) => String(keyFn(x))));
    const merged = [...prev];
    for (const item of incoming) {
      const k = String(keyFn(item));
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(item);
      }
    }
    return merged;
  }, []);

  const loadPage = useCallback(
    async ({ append = false, isRefresh = false }: { append?: boolean; isRefresh?: boolean } = {}) => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      if (append && (inflightRef.current || !hasMore)) return;

      if (!append && abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;
      inflightRef.current = true;

      if (isRefresh) {
        setRefreshing(true);
      } else if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError("");

      const targetPage = append ? pageRef.current + 1 : 1;
      const targetCursor = append ? cursorRef.current : null;

      try {
        const parsedParams = JSON.parse(paramsKey);
        const pageRes = await fetchCursorPage<T>(endpoint, {
          cursor: targetCursor,
          limit,
          params: parsedParams,
          signal: controller.signal,
          itemsKey,
          page: targetPage,
        });

        if (controller.signal.aborted) return;

        pageRef.current = targetPage;
        cursorRef.current = pageRes.pagination.nextCursor;
        setNextCursor(pageRes.pagination.nextCursor);
        setHasMore(pageRes.pagination.hasMore);
        setTotal(pageRes.pagination.total);
        setItems((prev) => (append ? dedupeMerge(prev, pageRes.items) : pageRes.items));

        if (onDataRef.current) {
          onDataRef.current(pageRes, append);
        }
      } catch (err: any) {
        if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED" || controller.signal.aborted) {
          return;
        }
        setError(err?.response?.data?.error || err?.message || "Failed to load records.");
      } finally {
        if (!controller.signal.aborted) {
          inflightRef.current = false;
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [enabled, endpoint, hasMore, itemsKey, limit, paramsKey, dedupeMerge]
  );

  useEffect(() => {
    pageRef.current = 1;
    cursorRef.current = null;
    const t = setTimeout(() => {
      setHasMore(true);
      setNextCursor(null);
      if (enabled) {
        void loadPage({ append: false, isRefresh: false });
      } else {
        setItems([]);
        setLoading(false);
      }
    }, 0);
    return () => {
      clearTimeout(t);
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, paramsKey, limit, enabled]);

  const refresh = useCallback(() => {
    pageRef.current = 1;
    cursorRef.current = null;
    return loadPage({ append: false, isRefresh: true });
  }, [loadPage]);

  const loadMore = useCallback(() => {
    if (!loading && !refreshing && !loadingMore && hasMore) {
      return loadPage({ append: true, isRefresh: false });
    }
  }, [loading, refreshing, loadingMore, hasMore, loadPage]);

  const retry = useCallback(() => {
    if (items.length > 0 && hasMore) {
      return loadPage({ append: true, isRefresh: false });
    }
    return loadPage({ append: false, isRefresh: false });
  }, [items.length, hasMore, loadPage]);

  return {
    items,
    setItems,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore,
    nextCursor,
    total,
    refresh,
    loadMore,
    retry,
  };
}
