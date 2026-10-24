/**
 * Daily column chart for ONE activity series (small multiples: each series
 * has its own chart and y-scale — never a shared or dual axis).
 *
 * Marks follow the data-viz specs, drawn in real pixels (the plot is
 * measured, never stretched): columns ≤ 24px with a 4px rounded top and a
 * square base, a 2px surface gap between columns, a hairline baseline, the
 * peak value labelled, and a per-column hover/focus tooltip on a hit area
 * the full height of the plot. One series, so the title names it (no
 * legend). Every value is also in the page's table view.
 */
import { useEffect, useRef, useState } from 'react';

const HEIGHT = 120;
const TOP_PAD = 20; // room for the peak label
const BASE = HEIGHT - 1; // baseline y
const MAX_BAR = 24;
const GAP = 2;
const FALLBACK_WIDTH = 640; // before measuring / where ResizeObserver is unavailable

const niceMax = (max) => {
  if (max <= 5) return Math.max(1, max);
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
};

/** Column with a rounded top (r ≤ 4) and square base. */
function columnPath(x, width, top, base) {
  const r = Math.min(4, width / 2, base - top);
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${base} Z`;
}

function usePlotWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(120, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function ActivityChart({ title, days, values }) {
  const [plotRef, width] = usePlotWidth();
  const [active, setActive] = useState(null);
  const count = values.length;
  const max = niceMax(Math.max(0, ...values));
  const slot = width / count;
  const barWidth = Math.max(1, Math.min(MAX_BAR, slot - GAP));
  const peakValue = Math.max(0, ...values);
  const peak = values.indexOf(peakValue);
  const total = values.reduce((a, b) => a + b, 0);
  const topOf = (value) => TOP_PAD + (BASE - TOP_PAD) * (1 - value / max);
  const centre = (i) => i * slot + slot / 2;

  return (
    <figure className="activity-chart">
      <figcaption className="activity-chart__title">
        {title} <span className="muted">· {total.toLocaleString()} in period</span>
      </figcaption>
      <div className="activity-chart__plot" ref={plotRef}>
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={`${title}: ${total} in the selected period, peak ${peakValue}`}>
          <line x1="0" x2={width} y1={BASE + 0.5} y2={BASE + 0.5} className="activity-chart__axis" />
          {values.map((value, i) =>
            value > 0 ? (
              <path
                key={`bar-${days[i]}`}
                d={columnPath(centre(i) - barWidth / 2, barWidth, topOf(value), BASE)}
                className={`activity-chart__bar${active === i ? ' activity-chart__bar--active' : ''}`}
              />
            ) : null
          )}
          {peakValue > 0 && (
            <text x={centre(peak)} y={topOf(peakValue) - 6} textAnchor="middle" className="activity-chart__peak">
              {peakValue.toLocaleString()}
            </text>
          )}
          {values.map((value, i) => (
            <rect
              key={`hit-${days[i]}`}
              x={i * slot}
              y={0}
              width={slot}
              height={HEIGHT}
              className="activity-chart__hit"
              tabIndex={0}
              aria-label={`${days[i]}: ${value}`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            />
          ))}
        </svg>
        {total === 0 && <p className="activity-chart__empty muted">No activity in this period.</p>}
        {active !== null && (
          <div className="activity-chart__tooltip" role="status" style={{ left: `${Math.min(width - 60, Math.max(60, centre(active)))}px` }}>
            <strong>{values[active].toLocaleString()}</strong>
            <span>{days[active]}</span>
          </div>
        )}
      </div>
      <div className="activity-chart__dates muted">
        <span>{days[0]}</span>
        <span>{days[count - 1]}</span>
      </div>
    </figure>
  );
}

export default ActivityChart;
