/**
 * Design tokens: the single source of truth for colour, type, spacing, radius,
 * elevation, motion and component sizes.
 *
 * Values are plain numbers and strings with no CSS in them, so a React Native
 * app can import this file unchanged. The web app turns them into CSS custom
 * properties with `tokensToCss()` (see `cssVars.ts`); nothing else in the code
 * base may contain a hex colour or a pixel size.
 *
 * Direction ("sheet and biro"): white ground, near-black ink, one blue accent.
 * Every other colour carries a meaning and is never used for decoration.
 */

/** Colours. Each semantic family has a fill, a text shade that passes AA on the ground, and a soft tint. */
export const color = {
  // Neutrals: about 90% of every screen.
  bg: "#ffffff",
  surface: "#f4f4f4",
  surfaceSunken: "#e8e8e8",
  ink: "#111111",
  inkMuted: "#5c5c5c",
  inkInverse: "#ffffff",
  line: "#dcdcdc",
  lineStrong: "#8c8c8c",

  // Accent: primary action, links, focus ring, the citizen's route.
  accent: "#1a4be0",
  accentPressed: "#143aae",
  accentSoft: "#e8edfc",
  onAccent: "#ffffff",

  // Red: RED alert, SOS, occupancy above the red limit, closed roads.
  danger: "#c81e1e",
  dangerPressed: "#9f1616",
  dangerSoft: "#fdecec",
  dangerText: "#b01818",
  onDanger: "#ffffff",

  // Green: occupancy below the yellow limit, "safe", success.
  ok: "#177a45",
  okSoft: "#e6f4ec",
  okText: "#136238",
  onOk: "#ffffff",

  // Yellow: occupancy between the limits, warnings, roads with barriers.
  warn: "#f2b600",
  warnSoft: "#fdf4d7",
  warnText: "#7a5200",
  onWarn: "#111111",

  // Purple: Priority #1 and the barrier-free profile. Used for nothing else.
  priority: "#6a2bc4",
  prioritySoft: "#f0e9fb",
  priorityText: "#5a21ab",
  onPriority: "#ffffff",

  // Hazard types on SOS markers. Always paired with the hazard icon.
  hazardFire: "#c2410c",
  hazardCollapse: "#5b5148",
  hazardFlood: "#0e7490",
  hazardMedical: "#be123c",
  hazardOther: "#5c5c5c",

  // Scrim behind modal sheets.
  scrim: "rgba(17, 17, 17, 0.45)",
} as const;

export const font = {
  /** One family in several weights. Albert Sans covers every Azerbaijani letter. */
  family: '"Albert Sans Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  weight: { regular: 400, medium: 500, bold: 650 },
  /** px. Nothing below 13. */
  size: { xs: 13, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28, display: 40 },
  /** Unitless line heights. */
  leading: { tight: 1.15, snug: 1.3, body: 1.5 },
  /** em. Tight tracking on large type only. */
  tracking: { display: -0.025, normal: 0 },
} as const;

/** 4-point spacing scale, px. */
export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 } as const;

/** Corner radius, px. */
export const radius = { sm: 8, md: 12, lg: 20, full: 999 } as const;

/** Shadows as numbers (y offset, blur, opacity of ink) so native can map them to elevation. */
export const elevation = {
  /** Things resting on the map: sheets, the tab bar, markers. */
  raised: { y: 2, blur: 12, opacity: 0.14 },
  /** Things above everything: modal sheets, toasts. */
  overlay: { y: 8, blur: 32, opacity: 0.22 },
} as const;

/** Durations in ms and one easing curve. Motion only explains a change. */
export const motion = {
  duration: { fast: 120, base: 200, slow: 320 },
  easing: "cubic-bezier(0.2, 0, 0, 1)",
} as const;

/** Component sizes, px. */
export const size = {
  /** Minimum touch target. */
  tap: 44,
  /** Default control height (buttons, fields, rows). */
  control: 48,
  /** Large control: the citizen's primary actions. */
  controlLg: 56,
  /** Hazard buttons on the SOS screen. */
  hazard: 112,
  iconSm: 18,
  icon: 22,
  iconLg: 28,
  iconXl: 40,
  border: 1,
  borderStrong: 2,
  focusRing: 3,
  tabBar: 64,
  topBar: 56,
  sidebar: 248,
  panel: 360,
  sheetMax: 440,
  contentMax: 640,
  meter: 8,
  meterLg: 12,
  switchWidth: 52,
  switchHeight: 32,
  switchKnob: 24,
  /** Map markers. The hit box is always `tap`; these are the visible parts. */
  markerPinHeight: 28,
  markerOrigin: 22,
  skeletonLine: 14,
  /** Space kept free around a route when the map zooms to it. */
  mapPadding: 48,
  /** Extra space at the bottom of the map for the docked sheet. */
  mapSheetInset: 240,
  /** How close (in screen px) a tap must be to a street to select it. */
  roadTapTolerance: 24,
  markerPinWidth: 76,
} as const;

/** Stacking order. */
export const layer = { map: 0, chrome: 500, sheet: 600, pinned: 700, modal: 800, toast: 900 } as const;

/** Breakpoints, px. CSS media queries cannot read custom properties, so these values are repeated there. */
export const breakpoint = { tablet: 768, desktop: 1100 } as const;

/**
 * Density. The citizen app shows one thing at a time ("comfortable"); the
 * dispatcher console is dense and scanned continuously ("compact").
 */
export const density = {
  comfortable: { rowHeight: 64, rowPadding: 16, textSize: 16, controlHeight: 48 },
  compact: { rowHeight: 48, rowPadding: 12, textSize: 14, controlHeight: 44 },
} as const;

/** Lines and areas drawn on the map. Dash arrays are in px. */
export const mapStyle = {
  route: { color: color.accent, weight: 6, opacity: 1, dash: null },
  routeAccessible: { color: color.priority, weight: 6, opacity: 1, dash: null },
  routeCasing: { color: color.bg, weight: 11, opacity: 0.95, dash: null },
  closedRoad: { color: color.danger, weight: 6, opacity: 1, dash: "2 10" },
  barrierRoad: { color: color.warnText, weight: 3, opacity: 0.75, dash: "6 8" },
  selectedRoad: { color: color.ink, weight: 14, opacity: 0.3, dash: null },
  brigadeRoute: { color: color.ink, weight: 3, opacity: 0.85, dash: "8 8" },
  alertArea: { color: color.danger, weight: 2, opacity: 1, fillOpacity: 0.14 },
  heatArea: { color: color.warnText, weight: 1, opacity: 0.6, fillOpacity: 0.12 },
} as const;

export type MapLineStyle = "route" | "routeAccessible" | "routeCasing" | "closedRoad" | "barrierRoad" | "selectedRoad" | "brigadeRoute";
export type MapAreaStyle = "alertArea" | "heatArea";

export const tokens = { color, font, space, radius, elevation, motion, size, layer, breakpoint, density, mapStyle } as const;
export type Tokens = typeof tokens;
