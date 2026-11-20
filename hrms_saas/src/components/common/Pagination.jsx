import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function usePagination(items, initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  useEffect(() => {
    setPage(1);
  }, [items]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize]
  );

  const changePageSize = (value) => {
    setPageSize(Number(value));
    setPage(1);
  };

  return { page, setPage, pageSize, changePageSize, pageItems, total, pageCount };
}

export default function Pagination({
  page,
  setPage,
  pageSize,
  changePageSize,
  total,
  pageCount,
  itemLabel = "items",
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const firstPage = Math.max(1, Math.min(page - 3, pageCount - 6));
  const pages = Array.from(
    { length: Math.min(7, pageCount) },
    (_, index) => firstPage + index
  );

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-slate-500" aria-live="polite">
        Showing <span className="font-medium text-slate-700">{start}–{end}</span> of {total} {itemLabel}
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <label className="mr-1 flex items-center gap-2 text-slate-500">
          <span className="whitespace-nowrap">Rows per page</span>
          <select
            value={pageSize}
            onChange={(event) => changePageSize(event.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            aria-label="Rows per page"
          >
            {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        ><ChevronLeft size={18} /></button>
        {pages.map((number) => (
          <button
            key={number}
            type="button"
            onClick={() => setPage(number)}
            aria-label={`Page ${number}`}
            aria-current={page === number ? "page" : undefined}
            className={`h-10 min-w-10 rounded-xl border px-3 font-medium transition ${page === number ? "border-slate-900 bg-slate-900 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
          >{number}</button>
        ))}
        <button
          type="button"
          onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          disabled={page >= pageCount}
          aria-label="Next page"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        ><ChevronRight size={18} /></button>
      </div>
    </div>
  );
}
