/**
 * Reusable pill badge displaying pending approval counts.
 * Hides automatically when count is 0, loading, or in an error state.
 */
export default function PendingCountBadge({
  count = 0,
  loading = false,
  error = false,
  label = "Pending approvals",
  className = "",
}) {
  if (loading || error) {
    return null;
  }

  const numericCount = Number(count);
  if (!Number.isFinite(numericCount) || numericCount <= 0) {
    return null;
  }

  const displayText = numericCount > 99 ? "99+" : String(Math.floor(numericCount));

  return (
    <span
      role="status"
      aria-label={`${label}: ${numericCount} pending`}
      title={`${numericCount} pending`}
      className={`ml-auto inline-flex min-w-[20px] h-5 px-1.5 items-center justify-center rounded-full bg-red-600 text-white text-[11px] font-bold leading-none tabular-nums shrink-0 ${className}`.trim()}
    >
      {displayText}
    </span>
  );
}
