/**
 * Launch screen. The same markup and classes are inlined in `index.html`, so
 * what the browser paints before any script runs and what React renders
 * while a session starts are pixel-identical: no jump at hand-off.
 */
export function Launch({ label }: { label: string }) {
  return (
    <div className="launch" role="status" aria-label={label}>
      <Mark size="lg" />
      <span className="launch__bar"><i /></span>
    </div>
  );
}

/** The product mark: four arrows meeting at one point, the sign for an assembly point. */
export function Mark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <svg className={`mark mark--${size}`} viewBox="0 0 48 48" aria-hidden focusable="false">
      <rect width="48" height="48" rx="12" fill="currentColor" />
      <g className="mark__arrows">
        <path d="M10 10l9 2.5-6.5 6.5L10 10z" />
        <path d="M38 10l-2.5 9-6.5-6.5L38 10z" />
        <path d="M10 38l2.5-9 6.5 6.5L10 38z" />
        <path d="M38 38l-9-2.5 6.5-6.5L38 38z" />
        <circle cx="24" cy="24" r="4" />
      </g>
    </svg>
  );
}
