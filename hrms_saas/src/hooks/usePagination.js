import { useMemo, useState } from "react";

export function usePagination(items = [], initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const safeItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const total = safeItems.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);

  const pageItems = useMemo(
    () => safeItems.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [safeItems, currentPage, pageSize]
  );

  const changePageSize = (value) => {
    setPageSize(Number(value));
    setPage(1);
  };

  return { page: currentPage, setPage, pageSize, changePageSize, pageItems, total, pageCount };
}

export default usePagination;
