/**
 * Small shared pieces of the admin panel (Phase 14): stat tile, status
 * badge, pagination, date-range presets, and loading/error/empty wrappers.
 */
import Alert from '../common/Alert.jsx';

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
export const formatCount = (n) => (Number.isFinite(n) ? (n >= 10000 ? compact.format(n) : n.toLocaleString()) : '—');
export const formatDate = (iso) => (iso ? new Date(iso).toLocaleString() : '—');
export const label = (value) => (value ? value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');

/** Figure tile: label, value, optional context line. */
export function AdminStatCard({ title, value, detail }) {
  return (
    <div className="admin-stat">
      <p className="admin-stat__label">{title}</p>
      <p className="admin-stat__value">{formatCount(value)}</p>
      {detail && <p className="admin-stat__detail">{detail}</p>}
    </div>
  );
}

/** Account/report status with text (never colour alone). */
export function StatusBadge({ status }) {
  return <span className={`status-badge status-badge--${status}`}>{label(status)}</span>;
}

export function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total } = pagination;
  return (
    <nav className="admin-pagination" aria-label="Pagination">
      <button type="button" className="btn btn--small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="muted">
        Page {page} of {totalPages} · {formatCount(total)} total
      </span>
      <button type="button" className="btn btn--small" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  );
}

export const RANGE_PRESETS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

/** { from, to } (YYYY-MM-DD, UTC) for the last `days` days including today. */
export function rangeForDays(days, now = new Date()) {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

/** Date-range presets: one row above the content they scope. */
export function RangePresets({ days, onChange }) {
  return (
    <div className="admin-filters" role="group" aria-label="Date range">
      {RANGE_PRESETS.map((preset) => (
        <button
          key={preset.days}
          type="button"
          className={`btn btn--small${days === preset.days ? ' btn--primary' : ''}`}
          aria-pressed={days === preset.days}
          onClick={() => onChange(preset.days)}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

/** Loading / error / empty handling around a section. */
export function AsyncState({ loading, error, empty, emptyText, children }) {
  if (error) return <Alert type="error">{error}</Alert>;
  if (loading) return <p className="muted">Loading…</p>;
  if (empty) return <p className="muted">{emptyText}</p>;
  return children;
}
