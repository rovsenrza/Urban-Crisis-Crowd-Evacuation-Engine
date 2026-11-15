/**
 * React Native view of the design tokens. Values come from `tokens.ts`,
 * which is byte-identical to the web app's file; this module only adapts
 * them (font family per weight, shadows as style objects, text presets).
 */
import { Platform, type TextStyle, type ViewStyle } from "react-native";
import { color, density, elevation, font, layer, motion, radius, size, space } from "./tokens";

export { color, density, layer, motion, radius, size, space };

/** Loaded in the root layout from @expo-google-fonts/albert-sans. */
export const fontFamily = {
  regular: "AlbertSans_400Regular",
  medium: "AlbertSans_500Medium",
  bold: "AlbertSans_700Bold",
} as const;

export const fontSize = font.size;

function text(sizeKey: keyof typeof font.size, weight: keyof typeof fontFamily, leading: keyof typeof font.leading): TextStyle {
  return {
    fontFamily: fontFamily[weight],
    fontSize: font.size[sizeKey],
    lineHeight: Math.round(font.size[sizeKey] * font.leading[leading]),
    color: color.ink,
  };
}

/** Text presets. Every <Text> uses one of these, so type stays on the scale. */
export const type = {
  display: { ...text("xxl", "bold", "tight"), letterSpacing: font.size.xxl * font.tracking.display },
  title: { ...text("xl", "bold", "tight"), letterSpacing: font.size.xl * font.tracking.display },
  heading: text("lg", "bold", "snug"),
  subheading: text("md", "bold", "snug"),
  bodyLarge: text("lg", "medium", "snug"),
  body: text("md", "regular", "body"),
  bodyMedium: text("md", "medium", "snug"),
  small: text("sm", "regular", "snug"),
  smallMedium: text("sm", "medium", "snug"),
  label: text("xs", "medium", "snug"),
} satisfies Record<string, TextStyle>;

export const muted: TextStyle = { color: color.inkMuted };

function shadow(e: { y: number; blur: number; opacity: number }): ViewStyle {
  return Platform.select<ViewStyle>({
    android: { elevation: Math.round(e.blur / 2) },
    default: { shadowColor: color.ink, shadowOffset: { width: 0, height: e.y }, shadowRadius: e.blur / 2, shadowOpacity: e.opacity },
  })!;
}

export const shadows = { raised: shadow(elevation.raised), overlay: shadow(elevation.overlay) } as const;

/** Tone → colours, shared by badges, banners, icons and rows. */
export const tones = {
  neutral: { fill: color.ink, on: color.inkInverse, soft: color.surface, text: color.ink, icon: color.inkMuted },
  accent: { fill: color.accent, on: color.onAccent, soft: color.accentSoft, text: color.accentPressed, icon: color.accent },
  info: { fill: color.accent, on: color.onAccent, soft: color.accentSoft, text: color.accentPressed, icon: color.accent },
  danger: { fill: color.danger, on: color.onDanger, soft: color.dangerSoft, text: color.dangerText, icon: color.dangerText },
  ok: { fill: color.ok, on: color.onOk, soft: color.okSoft, text: color.okText, icon: color.okText },
  warn: { fill: color.warn, on: color.onWarn, soft: color.warnSoft, text: color.warnText, icon: color.warnText },
  priority: { fill: color.priority, on: color.onPriority, soft: color.prioritySoft, text: color.priorityText, icon: color.priorityText },
} as const;

export type ToneName = keyof typeof tones;
