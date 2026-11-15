/**
 * Turns the typed tokens into CSS custom properties.
 *
 * `vite.config.ts` calls `tokensToCss()` and inlines the result in
 * `index.html`, so the variables exist before any script runs and the launch
 * screen can use them. A React Native app skips this file and reads
 * `tokens.ts` directly.
 */
import { tokens, type Tokens } from "./tokens";

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const px = (value: number) => (value === 0 ? "0" : `${value}px`);
/** Font sizes in rem, so the browser's text-size setting still applies. */
const rem = (value: number) => `${value / 16}rem`;

function shadow(e: { y: number; blur: number; opacity: number }): string {
  return `0 ${px(e.y)} ${px(e.blur)} rgba(17, 17, 17, ${e.opacity})`;
}

function densityVars(d: Tokens["density"][keyof Tokens["density"]]): [string, string][] {
  return [
    ["row-height", px(d.rowHeight)],
    ["row-padding", px(d.rowPadding)],
    ["text-size", rem(d.textSize)],
    ["control-height", px(d.controlHeight)],
  ];
}

function block(selector: string, vars: [string, string][]): string {
  return `${selector}{${vars.map(([name, value]) => `--${name}:${value}`).join(";")}}`;
}

export function tokensToCss(t: Tokens = tokens): string {
  const vars: [string, string][] = [];
  const group = <V>(prefix: string, values: Record<string, V>, format: (value: V) => string) => {
    for (const [name, value] of Object.entries(values)) vars.push([`${prefix}-${kebab(name)}`, format(value)]);
  };

  group("color", t.color, String);
  vars.push(["font-family", t.font.family]);
  group("font-weight", t.font.weight, String);
  group("font-size", t.font.size, rem);
  group("leading", t.font.leading, String);
  group("tracking", t.font.tracking, (v) => (v === 0 ? "0" : `${v}em`));
  group("space", t.space, px);
  group("radius", t.radius, px);
  group("shadow", t.elevation, shadow);
  group("duration", t.motion.duration, (v) => `${v}ms`);
  vars.push(["easing", t.motion.easing]);
  group("size", t.size, px);
  group("layer", t.layer, String);
  vars.push(...densityVars(t.density.comfortable));

  return [block(":root", vars), block('[data-density="compact"]', densityVars(t.density.compact))].join("\n");
}
