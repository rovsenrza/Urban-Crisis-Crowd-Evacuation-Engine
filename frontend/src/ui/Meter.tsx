import type { Level } from "../api/types";
import "./meter.css";

interface Props {
  /** 0–100. */
  pct: number;
  level: Level;
  /** Accessible name, e.g. "Occupancy". */
  label: string;
  /** Text shown next to the bar, e.g. "62% · Space available". Colour is never the only signal. */
  valueText: string;
  /** Marker lines (the 90% re-route and 95% critical limits). */
  marks?: number[];
  size?: "md" | "lg";
}

export function Meter({ pct, level, label, valueText, marks = [], size = "md" }: Props) {
  return (
    <div className={`ui-meter ui-meter--${size} ui-meter--${level}`}>
      <div
        className="ui-meter__track"
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={valueText}
      >
        <div className="ui-meter__fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
        {marks.map((mark) => (
          <i key={mark} className="ui-meter__mark" style={{ left: `${mark}%` }} />
        ))}
      </div>
      <span className="ui-meter__value">{valueText}</span>
    </div>
  );
}
