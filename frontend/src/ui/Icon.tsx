/**
 * The one icon set: 24-unit stroke icons drawn as SVG, so they look the same
 * on every platform. No emoji or Unicode glyphs anywhere in the UI.
 *
 * A React Native build keeps the names and path data and renders them with
 * react-native-svg.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import "./icon.css";

const dot = (cx: number, cy: number, r = 1.2) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;

const ICONS = {
  map: (
    <>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  list: (
    <>
      <path d="M8.5 6H20M8.5 12H20M8.5 18H20" />
      {dot(4.5, 6)}
      {dot(4.5, 12)}
      {dot(4.5, 18)}
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M19 7h1M4 17h1M11 17h9" />
      <circle cx="16" cy="7" r="2.5" />
      <circle cx="8" cy="17" r="2.5" />
    </>
  ),
  check: <path d="M5 12.5 9.5 17 19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  locate: (
    <>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      {dot(12, 12, 1.6)}
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5 2.5 20h19L12 3.5z" />
      <path d="M12 10v4.5" />
      {dot(12, 17.2)}
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      {dot(12, 7.8)}
    </>
  ),
  accessible: (
    <>
      {dot(10, 4.5, 1.9)}
      <path d="M10 8.5V14h5l2.5 5.5" />
      <path d="M10 10.8h4.5" />
      <path d="M7.4 12.3a5 5 0 1 0 7 6.2" />
    </>
  ),
  shelter: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v10h13V10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  park: (
    <>
      <path d="M12 3 6.5 11.5h3L5 18h14l-4.5-6.5h3L12 3z" />
      <path d="M12 18v3" />
    </>
  ),
  stadium: (
    <>
      <ellipse cx="12" cy="12" rx="9" ry="6" />
      <ellipse cx="12" cy="12" rx="4.5" ry="2.5" />
    </>
  ),
  fire: <path d="M12 3c1 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2 .8-3.4 2-4.5.2 1.6.9 2.5 2 3 .2-3-.5-6 1-9z" />,
  collapse: (
    <>
      <path d="M3 20h18" />
      <path d="M5 20V6h9v14" />
      <path d="M14 11h5v9" />
      <path d="M9.5 6 8 10l3 2-2 4" />
    </>
  ),
  flood: (
    <>
      <path d="M3 7c2.2 0 2.2 1.6 4.5 1.6S9.8 7 12 7s2.2 1.6 4.5 1.6S18.8 7 21 7" />
      <path d="M3 12c2.2 0 2.2 1.6 4.5 1.6S9.8 12 12 12s2.2 1.6 4.5 1.6S18.8 12 21 12" />
      <path d="M3 17c2.2 0 2.2 1.6 4.5 1.6S9.8 17 12 17s2.2 1.6 4.5 1.6S18.8 17 21 17" />
    </>
  ),
  medical: <path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5V4z" />,
  sos: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" />
    </>
  ),
  road: <path d="M8 3 5 21M16 3l3 18M12 4v3M12 10.5v3M12 17v3" />,
  truck: (
    <>
      <path d="M2 7h11v9H2z" />
      <path d="M13 10h4l4 3v3h-8" />
      <circle cx="6.5" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4.5" width="14" height="16.5" rx="2" />
      <path d="M9 3h6v3H9z" />
      <path d="M9 11h6M9 15h6" />
    </>
  ),
  play: <path d="M7 4.5v15l12-7.5-12-7.5z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" />,
  reset: (
    <>
      <path d="M4 12a8 8 0 1 0 2.6-5.9" />
      <path d="M4 4v4.5h4.5" />
    </>
  ),
  undo: (
    <>
      <path d="M4 9h10a6 6 0 0 1 0 12H8" />
      <path d="M8 5 4 9l4 4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" />
    </>
  ),
  signOut: (
    <>
      <path d="M10 4H5v16h5" />
      <path d="M14 8l4 4-4 4M18 12H9" />
    </>
  ),
  more: (
    <>
      {dot(5, 12, 1.7)}
      {dot(12, 12, 1.7)}
      {dot(19, 12, 1.7)}
    </>
  ),
  offline: (
    <>
      <path d="M4 18v-2M9 18v-5M14 18v-8M19 18V6" />
      <path d="M3 4l18 17" />
    </>
  ),
  live: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2z" />
      <path d="M10 21h4" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3" />
      <path d="M7.5 15h9" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />
    </>
  ),
  shield: <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;
export type IconSize = "sm" | "md" | "lg" | "xl";

interface Props {
  name: IconName;
  size?: IconSize;
  /** Accessible name. Leave out when the icon sits next to text that says the same. */
  label?: string;
}

export function Icon({ name, size = "md", label }: Props) {
  return (
    <svg
      className={`ui-icon ui-icon--${size}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}

/** Icon as an HTML string, for map markers that are built outside React. */
export function iconMarkup(name: IconName, size: IconSize = "sm"): string {
  return renderToStaticMarkup(<Icon name={name} size={size} />);
}

const HAZARD_ICONS: Record<string, IconName> = { fire: "fire", collapse: "collapse", flood: "flood", medical: "medical" };
const KIND_ICONS: Record<string, IconName> = { shelter: "shelter", park: "park", stadium: "stadium" };

/** Icon for a hazard code; unknown codes (added on the server later) get the generic warning sign. */
export const hazardIcon = (code: string): IconName => HAZARD_ICONS[code] ?? "alert";
export const kindIcon = (kind: string): IconName => KIND_ICONS[kind] ?? "pin";
