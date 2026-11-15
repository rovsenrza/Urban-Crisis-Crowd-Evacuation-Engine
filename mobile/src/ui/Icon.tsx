/**
 * The one icon set, drawn with react-native-svg. Names and path data are the
 * same as the web app's `ui/Icon.tsx`: 24-unit stroke icons, no emoji.
 */
import type { ReactNode } from "react";
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";
import { color as colors, size as sizes } from "../design/theme";

/** A filled dot; the parent sets the colour. */
const dot = (cx: number, cy: number, r = 1.2) => (c: string) => <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={c} stroke="none" />;

type Part = ReactNode | ((color: string) => ReactNode);

const ICONS = {
  map: [<Path key="a" d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />, <Path key="b" d="M9 4v14M15 6v14" />],
  list: [<Path key="a" d="M8.5 6H20M8.5 12H20M8.5 18H20" />, dot(4.5, 6), dot(4.5, 12), dot(4.5, 18)],
  settings: [
    <Path key="a" d="M4 7h9M19 7h1M4 17h1M11 17h9" />,
    <Circle key="b" cx={16} cy={7} r={2.5} />,
    <Circle key="c" cx={8} cy={17} r={2.5} />,
  ],
  check: [<Path key="a" d="M5 12.5 9.5 17 19 7.5" />],
  close: [<Path key="a" d="M6 6l12 12M18 6 6 18" />],
  chevronRight: [<Path key="a" d="M9 5l7 7-7 7" />],
  chevronLeft: [<Path key="a" d="M15 5l-7 7 7 7" />],
  arrowRight: [<Path key="a" d="M5 12h14M13 6l6 6-6 6" />],
  plus: [<Path key="a" d="M12 5v14M5 12h14" />],
  locate: [<Circle key="a" cx={12} cy={12} r={6} />, <Path key="b" d="M12 2v4M12 18v4M2 12h4M18 12h4" />, dot(12, 12, 1.6)],
  pin: [
    <Path key="a" d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z" />,
    <Circle key="b" cx={12} cy={9.5} r={2.5} />,
  ],
  alert: [<Path key="a" d="M12 3.5 2.5 20h19L12 3.5z" />, <Path key="b" d="M12 10v4.5" />, dot(12, 17.2)],
  info: [<Circle key="a" cx={12} cy={12} r={9} />, <Path key="b" d="M12 11v6" />, dot(12, 7.8)],
  accessible: [
    dot(10, 4.5, 1.9),
    <Path key="a" d="M10 8.5V14h5l2.5 5.5" />,
    <Path key="b" d="M10 10.8h4.5" />,
    <Path key="c" d="M7.4 12.3a5 5 0 1 0 7 6.2" />,
  ],
  shelter: [
    <Path key="a" d="M3 11.5 12 4l9 7.5" />,
    <Path key="b" d="M5.5 10v10h13V10" />,
    <Path key="c" d="M10 20v-5h4v5" />,
  ],
  park: [<Path key="a" d="M12 3 6.5 11.5h3L5 18h14l-4.5-6.5h3L12 3z" />, <Path key="b" d="M12 18v3" />],
  stadium: [<Ellipse key="a" cx={12} cy={12} rx={9} ry={6} />, <Ellipse key="b" cx={12} cy={12} rx={4.5} ry={2.5} />],
  fire: [<Path key="a" d="M12 3c1 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2 .8-3.4 2-4.5.2 1.6.9 2.5 2 3 .2-3-.5-6 1-9z" />],
  collapse: [
    <Path key="a" d="M3 20h18" />,
    <Path key="b" d="M5 20V6h9v14" />,
    <Path key="c" d="M14 11h5v9" />,
    <Path key="d" d="M9.5 6 8 10l3 2-2 4" />,
  ],
  flood: [
    <Path key="a" d="M3 7c2.2 0 2.2 1.6 4.5 1.6S9.8 7 12 7s2.2 1.6 4.5 1.6S18.8 7 21 7" />,
    <Path key="b" d="M3 12c2.2 0 2.2 1.6 4.5 1.6S9.8 12 12 12s2.2 1.6 4.5 1.6S18.8 12 21 12" />,
    <Path key="c" d="M3 17c2.2 0 2.2 1.6 4.5 1.6S9.8 17 12 17s2.2 1.6 4.5 1.6S18.8 17 21 17" />,
  ],
  medical: [<Path key="a" d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5V4z" />],
  sos: [
    <Circle key="a" cx={12} cy={12} r={9} />,
    <Circle key="b" cx={12} cy={12} r={3.5} />,
    <Path key="c" d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" />,
  ],
  road: [<Path key="a" d="M8 3 5 21M16 3l3 18M12 4v3M12 10.5v3M12 17v3" />],
  truck: [
    <Path key="a" d="M2 7h11v9H2z" />,
    <Path key="b" d="M13 10h4l4 3v3h-8" />,
    <Circle key="c" cx={6.5} cy={17.5} r={1.8} />,
    <Circle key="d" cx={17} cy={17.5} r={1.8} />,
  ],
  clipboard: [
    <Rect key="a" x={5} y={4.5} width={14} height={16.5} rx={2} />,
    <Path key="b" d="M9 3h6v3H9z" />,
    <Path key="c" d="M9 11h6M9 15h6" />,
  ],
  play: [<Path key="a" d="M7 4.5v15l12-7.5-12-7.5z" />],
  stop: [<Rect key="a" x={6} y={6} width={12} height={12} rx={1.5} />],
  reset: [<Path key="a" d="M4 12a8 8 0 1 0 2.6-5.9" />, <Path key="b" d="M4 4v4.5h4.5" />],
  undo: [<Path key="a" d="M4 9h10a6 6 0 0 1 0 12H8" />, <Path key="b" d="M8 5 4 9l4 4" />],
  globe: [
    <Circle key="a" cx={12} cy={12} r={9} />,
    <Path key="b" d="M3 12h18" />,
    <Path key="c" d="M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" />,
  ],
  signOut: [<Path key="a" d="M10 4H5v16h5" />, <Path key="b" d="M14 8l4 4-4 4M18 12H9" />],
  more: [dot(5, 12, 1.7), dot(12, 12, 1.7), dot(19, 12, 1.7)],
  offline: [<Path key="a" d="M4 18v-2M9 18v-5M14 18v-8M19 18V6" />, <Path key="b" d="M3 4l18 17" />],
  live: [<Path key="a" d="M3 12h4l3-7 4 14 3-7h4" />],
  bell: [<Path key="a" d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2z" />, <Path key="b" d="M10 21h4" />],
  flask: [
    <Path key="a" d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3" />,
    <Path key="b" d="M7.5 15h9" />,
  ],
  lock: [<Rect key="a" x={5} y={10.5} width={14} height={10} rx={2} />, <Path key="b" d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />],
  route: [
    <Circle key="a" cx={6} cy={18} r={2.2} />,
    <Circle key="b" cx={18} cy={6} r={2.2} />,
    <Path key="c" d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />,
  ],
  shield: [<Path key="a" d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z" />],
} satisfies Record<string, Part[]>;

export type IconName = keyof typeof ICONS;
export type IconSize = "sm" | "md" | "lg" | "xl";

const SIZES: Record<IconSize, number> = { sm: sizes.iconSm, md: sizes.icon, lg: sizes.iconLg, xl: sizes.iconXl };

interface Props {
  name: IconName;
  size?: IconSize;
  color?: string;
  /** Accessible name. Leave out when the icon sits next to text that says the same. */
  label?: string;
}

export function Icon({ name, size = "md", color = colors.ink, label }: Props) {
  const side = SIZES[size];
  const parts: Part[] = ICONS[name];
  return (
    <Svg
      width={side}
      height={side}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={Boolean(label)}
      accessibilityRole={label ? "image" : undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? "yes" : "no-hide-descendants"}
    >
      {parts.map((part) => (typeof part === "function" ? part(color) : part))}
    </Svg>
  );
}

const HAZARD_ICONS: Record<string, IconName> = { fire: "fire", collapse: "collapse", flood: "flood", medical: "medical" };
const KIND_ICONS: Record<string, IconName> = { shelter: "shelter", park: "park", stadium: "stadium" };

/** Icon for a hazard code; unknown codes (added on the server later) get the generic warning sign. */
export const hazardIcon = (code: string): IconName => HAZARD_ICONS[code] ?? "alert";
export const kindIcon = (kind: string): IconName => KIND_ICONS[kind] ?? "pin";
