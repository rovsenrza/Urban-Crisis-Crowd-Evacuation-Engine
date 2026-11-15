# Design system

This document describes the UI of the evacuation engine in enough detail to rebuild the citizen app in React Native (Expo) without reading the web code. That rebuild now exists in `mobile/`; section 12 maps it back to this document. File paths are relative to `frontend/src/` unless they start with `mobile/`.

Two products share one system:

- **Citizen app** (`/welcome`, `/app/*`): shows one thing at a time, large controls, comfortable density. This is the product that also ships as a native app (`mobile/`).
- **Dispatcher console** (`/operator/*`): dense, scanned continuously, compact density. Web only (desktop and tablet).

## 1. Direction

**"Sheet and biro."** A white ground, near-black ink and one blue accent; everything is flat, separated by hairlines, set in large type, and every other colour is reserved for a meaning. The map is the main surface on both products, so the chrome around it recedes and the route and markers lead.

What the direction answers:

- The app is used under stress, sometimes outdoors in sunlight, sometimes by someone with limited mobility. Legibility and large, unambiguous controls come before atmosphere: high contrast, 44 px minimum targets, 56 px primary actions in the lower half of the screen.
- Four colours carry meaning and are used for nothing else:

| Colour | Meaning |
|---|---|
| Green | Occupancy below the yellow limit, "safe", success |
| Yellow | Occupancy between the limits, warnings, streets with barriers |
| Red | RED alert, SOS, occupancy above the red limit, closed roads |
| Purple | Priority #1 and the barrier-free profile |

- **Colour is never the only signal.** Every meter shows the level in words next to the bar ("62% · Space available"). Map markers carry an icon (hazard type, point type, the accessibility sign plus a "1" for Priority #1). The current tab is marked by a bar and bolder text. Connection state is an icon plus a word. Badges carry text.
- Every string exists in Azerbaijani and English. Azerbaijani labels run longer, so no layout depends on a short word: buttons grow, labels wrap, tab labels may take two lines.
- Motion only where it explains a change (section 10).

## 2. Tokens

`design/tokens.ts` is the single source of truth. Values are plain numbers and strings with no CSS in them, so React Native can import the file unchanged.

On the web, `design/cssVars.ts` (`tokensToCss()`) turns the tokens into CSS custom properties. A small Vite plugin in `vite.config.ts` inlines the result into `index.html` (replacing the `/*__TOKENS__*/` marker), so the variables exist before any script runs and the launch screen can use them. No hex colour or pixel size appears outside `tokens.ts`.

Naming rule: `group.camelName` becomes `--group-camel-name`. Units are added by the generator: px for space, radius and size; rem (value / 16) for font sizes; ms for durations; em for tracking.

**The one exception:** CSS media queries cannot read custom properties, so the two breakpoints (768 px and 1100 px) are repeated literally in `@media` rules.

### 2.1 Colour (`color`)

| Token | CSS variable | Value | Use |
|---|---|---|---|
| `bg` | `--color-bg` | `#ffffff` | Page ground, sheets, cards |
| `surface` | `--color-surface` | `#f4f4f4` | Hover ground, quiet panels, map background while tiles load |
| `surfaceSunken` | `--color-surface-sunken` | `#e8e8e8` | Meter track, segmented-control track, skeleton lines |
| `ink` | `--color-ink` | `#111111` | Text, icons, brigade markers, toast ground |
| `inkMuted` | `--color-ink-muted` | `#5c5c5c` | Secondary text, labels, inactive tabs |
| `inkInverse` | `--color-ink-inverse` | `#ffffff` | Text on ink |
| `line` | `--color-line` | `#dcdcdc` | Hairlines between rows, bar borders |
| `lineStrong` | `--color-line-strong` | `#8c8c8c` | Control borders (3:1 on the ground), switch track when off |
| `accent` | `--color-accent` | `#1a4be0` | Primary button, links, focus ring, the citizen's route, own position |
| `accentPressed` | `--color-accent-pressed` | `#143aae` | Primary button hover/pressed, accent badge text |
| `accentSoft` | `--color-accent-soft` | `#e8edfc` | Selected row, info banner ground |
| `onAccent` | `--color-on-accent` | `#ffffff` | Text on accent |
| `danger` | `--color-danger` | `#c81e1e` | RED alert ground, SOS action, red meter, closed roads |
| `dangerPressed` | `--color-danger-pressed` | `#9f1616` | Danger button hover/pressed |
| `dangerSoft` | `--color-danger-soft` | `#fdecec` | Danger banner ground |
| `dangerText` | `--color-danger-text` | `#b01818` | Red text on the ground |
| `onDanger` | `--color-on-danger` | `#ffffff` | Text on red |
| `ok` | `--color-ok` | `#177a45` | Green meter, green point marker |
| `okSoft` | `--color-ok-soft` | `#e6f4ec` | OK banner/badge ground |
| `okText` | `--color-ok-text` | `#136238` | Green text on the ground |
| `onOk` | `--color-on-ok` | `#ffffff` | Text on green |
| `warn` | `--color-warn` | `#f2b600` | Yellow meter, yellow point marker |
| `warnSoft` | `--color-warn-soft` | `#fdf4d7` | Warning banner ground |
| `warnText` | `--color-warn-text` | `#7a5200` | Yellow-level text on the ground, barrier roads |
| `onWarn` | `--color-on-warn` | `#111111` | Text on yellow (ink, not white) |
| `priority` | `--color-priority` | `#6a2bc4` | Priority #1 marker and badge, barrier-free route, role switch when on |
| `prioritySoft` | `--color-priority-soft` | `#f0e9fb` | Priority banner/badge/switch ground |
| `priorityText` | `--color-priority-text` | `#5a21ab` | Purple text on the ground |
| `onPriority` | `--color-on-priority` | `#ffffff` | Text on purple |
| `hazardFire` | `--color-hazard-fire` | `#c2410c` | SOS marker: fire |
| `hazardCollapse` | `--color-hazard-collapse` | `#5b5148` | SOS marker: collapse |
| `hazardFlood` | `--color-hazard-flood` | `#0e7490` | SOS marker: flood |
| `hazardMedical` | `--color-hazard-medical` | `#be123c` | SOS marker: medical |
| `hazardOther` | `--color-hazard-other` | `#5c5c5c` | SOS marker: a hazard code the client does not know |
| `scrim` | `--color-scrim` | `rgba(17, 17, 17, 0.45)` | Behind modal sheets |

Each semantic family has a fill, a text shade that passes WCAG AA on the ground, and a soft tint. Hazard colours always appear together with the hazard icon. The hazard colours sent by the server (`/meta`) are not used; the client maps hazard codes to its own tokens.

### 2.2 Type (`font`)

| Token | CSS variable | Value | Use |
|---|---|---|---|
| `family` | `--font-family` | `"Albert Sans Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | Everything |
| `weight.regular` | `--font-weight-regular` | 400 | Body text |
| `weight.medium` | `--font-weight-medium` | 500 | Buttons, labels, row titles |
| `weight.bold` | `--font-weight-bold` | 650 | Headings, current tab, counts |
| `size.xs` | `--font-size-xs` | 13 px | Badges, tab labels, marker text. Nothing is smaller |
| `size.sm` | `--font-size-sm` | 14 px | Row subtitles, meter value, compact-density body |
| `size.md` | `--font-size-md` | 16 px | Body, field text (always 16 so phones never zoom) |
| `size.lg` | `--font-size-lg` | 18 px | `h2`, large buttons |
| `size.xl` | `--font-size-xl` | 22 px | `h1` (screen titles) |
| `size.xxl` | `--font-size-xxl` | 28 px | Large titles (welcome, route name) |
| `size.display` | `--font-size-display` | 40 px | The SOS countdown number |
| `leading.tight` | `--leading-tight` | 1.15 | Tab labels, large numbers |
| `leading.snug` | `--leading-snug` | 1.3 | Headings, buttons, row text |
| `leading.body` | `--leading-body` | 1.5 | Paragraphs |
| `tracking.display` | `--tracking-display` | −0.025 em | Large type only |
| `tracking.normal` | `--tracking-normal` | 0 | Everything else |

Numbers use tabular figures everywhere (`font-variant-numeric: tabular-nums`). Sentence case throughout; no tracked capitals.

**Typeface.** Albert Sans (variable weight), self-hosted through `@fontsource-variable/albert-sans`. This is the one runtime dependency the redesign adds; the reason is that it covers every Azerbaijani letter (ə, ğ, ı, İ, ş, ö, ü, ç) and avoids a third-party font request at startup. The font has no glyph for `№` or `≈`; those two fall back to the system font. In Expo, bundle the same font file with `expo-font`.

### 2.3 Space (`space`)

4-point scale.

| Token | CSS variable | Value |
|---|---|---|
| `space[0]` | `--space-0` | 0 |
| `space[1]` | `--space-1` | 4 px |
| `space[2]` | `--space-2` | 8 px |
| `space[3]` | `--space-3` | 12 px |
| `space[4]` | `--space-4` | 16 px |
| `space[5]` | `--space-5` | 24 px |
| `space[6]` | `--space-6` | 32 px |
| `space[7]` | `--space-7` | 48 px |
| `space[8]` | `--space-8` | 64 px |

Typical use: 4 between an icon and its text inside a badge, 8 between buttons, 12 inside rows, 16 screen and sheet padding, 24 between sections.

### 2.4 Radius (`radius`)

| Token | CSS variable | Value | Use |
|---|---|---|---|
| `sm` | `--radius-sm` | 8 px | Fields, badges, sidebar items, brigade markers |
| `md` | `--radius-md` | 12 px | Buttons, banners, toasts, the switch row |
| `lg` | `--radius-lg` | 20 px | Sheets |
| `full` | `--radius-full` | 999 px | Icon buttons, meters, round markers, counts |

### 2.5 Elevation (`elevation`)

Stored as numbers (`y`, `blur`, `opacity` of ink) so native can map them to shadow props or Android elevation. The web shadow is `0 {y}px {blur}px rgba(17, 17, 17, {opacity})`.

| Token | CSS variable | Value | Use |
|---|---|---|---|
| `raised` | `--shadow-raised` | y 2, blur 12, opacity 0.14 | Things resting on the map: docked sheet, banners, markers, raised icon button |
| `overlay` | `--shadow-overlay` | y 8, blur 32, opacity 0.22 | Things above everything: modal sheets, toasts |

Shadows are used only to separate a layer from the map or the page. Cards and lists are flat with hairlines.

### 2.6 Motion (`motion`)

| Token | CSS variable | Value | Use |
|---|---|---|---|
| `duration.fast` | `--duration-fast` | 120 ms | Press feedback, switch knob, hover ground |
| `duration.base` | `--duration-base` | 200 ms | Sheet, banner and toast entering |
| `duration.slow` | `--duration-slow` | 320 ms | Meter fill, map camera move; ×4–5 for the slow pulses |
| `easing` | `--easing` | `cubic-bezier(0.2, 0, 0, 1)` | Every transition |

### 2.7 Sizes (`size`)

| Token | CSS variable | Value | Use |
|---|---|---|---|
| `tap` | `--size-tap` | 44 px | Minimum touch target; icon button; marker hit box |
| `control` | `--size-control` | 48 px | Raised icon button |
| `controlLg` | `--size-control-lg` | 56 px | Large buttons: the citizen's primary actions |
| `hazard` | `--size-hazard` | 112 px | Minimum height of a hazard button on the SOS screen |
| `iconSm` | `--size-icon-sm` | 18 px | Icons in badges, markers and chevrons |
| `icon` | `--size-icon` | 22 px | Default icon |
| `iconLg` | `--size-icon-lg` | 28 px | Switch icon, detail header, SOS marker diameter |
| `iconXl` | `--size-icon-xl` | 40 px | Empty/error states, hazard buttons, Priority marker diameter |
| `border` | `--size-border` | 1 px | Hairlines, control borders |
| `borderStrong` | `--size-border-strong` | 2 px | Marker outlines, meter marks, focus offset |
| `focusRing` | `--size-focus-ring` | 3 px | Focus outline; current-tab bar; sidebar current-item bar |
| `tabBar` | `--size-tab-bar` | 64 px | Bottom bar height (plus the bottom safe area) |
| `topBar` | `--size-top-bar` | 56 px | Screen title bar |
| `sidebar` | `--size-sidebar` | 248 px | Console sidebar width |
| `panel` | `--size-panel` | 360 px | Console detail/feed panel width on desktop |
| `sheetMax` | `--size-sheet-max` | 440 px | Sheet width on wide screens; width of state blocks |
| `contentMax` | `--size-content-max` | 640 px | Reading column of list screens; toast width |
| `meter` | `--size-meter` | 8 px | Meter bar height |
| `meterLg` | `--size-meter-lg` | 12 px | Large meter bar height |
| `switchWidth` | `--size-switch-width` | 52 px | Switch track |
| `switchHeight` | `--size-switch-height` | 32 px | Switch track |
| `switchKnob` | `--size-switch-knob` | 24 px | Switch knob |
| `markerPinHeight` | `--size-marker-pin-height` | 28 px | Height of point and brigade pills |
| `markerOrigin` | `--size-marker-origin` | 22 px | Diameter of the citizen's own position dot |
| `markerPinWidth` | `--size-marker-pin-width` | 76 px | Hit-box width of point and brigade markers |
| `skeletonLine` | `--size-skeleton-line` | 14 px | Skeleton line height; icon inside an SOS marker |
| `mapPadding` | `--size-map-padding` | 48 px | Space kept free around a route when the camera fits it |
| `mapSheetInset` | `--size-map-sheet-inset` | 240 px | Extra bottom padding for the docked sheet when fitting a route |
| `roadTapTolerance` | `--size-road-tap-tolerance` | 24 px | How close a tap must be to a street to select it |

### 2.8 Layers (`layer`)

| Token | CSS variable | Value | Use |
|---|---|---|---|
| `map` | `--layer-map` | 0 | The map |
| `chrome` | `--layer-chrome` | 500 | Tab bar, map tools |
| `sheet` | `--layer-sheet` | 600 | Docked sheet |
| `pinned` | `--layer-pinned` | 700 | Pinned RED alert |
| `modal` | `--layer-modal` | 800 | Modal sheet |
| `toast` | `--layer-toast` | 900 | Toast |

### 2.9 Breakpoints (`breakpoint`)

| Token | Value | What changes |
|---|---|---|
| `tablet` | 768 px | Docked sheet becomes a 440 px card at the lower left; modal sheet becomes a centred card |
| `desktop` | 1100 px | Console shows the sidebar instead of the bottom bar; the live-map panel becomes a 360 px column; split views show list and detail side by side |

Not emitted as CSS variables (see the exception above).

### 2.10 Density (`density`)

Set with `data-density="compact"` on the console root; the citizen app uses the default.

| Token | CSS variable | Comfortable (citizen) | Compact (console) |
|---|---|---|---|
| `rowHeight` | `--row-height` | 64 px | 48 px |
| `rowPadding` | `--row-padding` | 16 px | 12 px |
| `textSize` | `--text-size` | 16 px | 14 px |
| `controlHeight` | `--control-height` | 48 px | 44 px |

### 2.11 Map styles (`mapStyle`)

Used by the map renderer only (not emitted as CSS variables). `dash` is a dash array in px.

| Token | Colour | Weight | Opacity | Dash | Use |
|---|---|---|---|---|---|
| `route` | `accent` | 6 | 1 | – | The citizen's route |
| `routeAccessible` | `priority` | 6 | 1 | – | The route on the barrier-free profile |
| `routeCasing` | `bg` | 11 | 0.95 | – | White casing drawn under either route |
| `closedRoad` | `danger` | 6 | 1 | `2 10` | A closed street (dotted red) |
| `barrierRoad` | `warnText` | 3 | 0.75 | `6 8` | A street with barriers (citizen, barrier-free profile only) |
| `selectedRoad` | `ink` | 14 | 0.3 | – | Halo over the street selected on the dispatcher map |
| `brigadeRoute` | `ink` | 3 | 0.85 | `8 8` | Route of a brigade that is en route |
| `alertArea` | `danger` | 2 | 1, fill 0.14 | – | Circle around an open alert (slow pulse) |
| `heatArea` | `warnText` | 1 | 0.6, fill 0.12 | – | Per-district disc that grows with its SOS count |

## 3. Icons

One set, defined in `ui/Icon.tsx` as SVG: 24-unit view box, 2-unit stroke, round caps and joins, `currentColor`. There are no emoji or Unicode glyphs in the UI. Sizes: `sm` 18, `md` 22 (default), `lg` 28, `xl` 40.

`<Icon name size label? />`: without `label` the icon is hidden from assistive tech (it sits next to text that says the same); with `label` it becomes `role="img"` with that name. `iconMarkup(name, size)` returns the same icon as an HTML string for map markers.

| Name | Used for |
|---|---|
| `map` | Map tab; "Live map" nav item; "show on map" |
| `list` | Points tab; "other points"; event feed |
| `settings` | Settings tab |
| `check` | Success, "I am safe", confirmed, SOS sent |
| `close` | Close and dismiss buttons; "close road" |
| `chevronRight` | Row that navigates; select arrow (rotated) |
| `chevronLeft` | Back |
| `arrowRight` | Continue |
| `plus` | Create (simulation) |
| `locate` | Use device location |
| `pin` | District, position, pending position pin, unknown point type |
| `alert` | Warning and error; RED alert; unknown hazard type |
| `info` | Info banner; default empty state |
| `accessible` | Special-care role, Priority #1, barrier-free route/entrance |
| `shelter` / `park` / `stadium` | Assembly-point types |
| `fire` / `collapse` / `flood` / `medical` | Hazard types |
| `sos` | The SOS action; SOS nav item |
| `road` | Road detail |
| `truck` | Brigade; Resources nav item |
| `clipboard` | Audit log |
| `play` / `stop` / `reset` | Scenario start/stop; retry, refresh, reset |
| `undo` | Undo an SOS before it is sent |
| `globe` | Language |
| `signOut` | Sign out |
| `more` | "More" in the console's bottom bar |
| `offline` / `live` | Connection state |
| `bell` | Alerts nav item |
| `flask` | Simulation |
| `lock` | Privacy note |
| `route` | Route banner, "go here", "your route" |
| `shield` | Dispatcher sign-in link |

Mappings: `hazardIcon(code)` maps `fire`, `collapse`, `flood`, `medical` to the icons of the same name and any other code to `alert`. `kindIcon(kind)` maps `shelter`, `park`, `stadium` to their icons and anything else to `pin`. A new hazard added on the server therefore still renders; give it its own icon and colour token when it becomes permanent.

**React Native:** keep the names and path data and render them with `react-native-svg` (`Svg`, `Path`, `Circle`, `Rect`, `Ellipse`).

## 4. Shared components

All in `ui/`, exported from `ui/index.ts`. None of them knows about citizens or dispatchers. Common rules:

- Every interactive element is at least 44 × 44 px, is reachable by keyboard and has an accessible name.
- One focus ring everywhere: 3 px outline in `accent`, 2 px offset, never animated. On filled dark or red grounds (toast, pinned alert) the ring is white.
- Disabled controls are 50% opaque with a not-allowed cursor.
- Pressed feedback is a scale to 0.98 over `duration.fast`.

### Button, ButtonLink (`ui/Button.tsx`)

The standard action. `Button` renders a `<button>`; `ButtonLink` has the same look and navigates (router link).

| Prop | Values | Notes |
|---|---|---|
| `variant` | `primary` \| `secondary` (default) \| `danger` \| `quiet` \| `inverse` | See below |
| `size` | `md` (default) \| `lg` | `md`: `--control-height` (48 comfortable / 44 compact). `lg`: `controlLg` (56), text `size.lg` |
| `icon` | icon name | Leading icon |
| `block` | boolean | Full width |
| `busy` | boolean (`Button` only) | Spinner replaces the icon, `aria-busy`, presses blocked |
| `disabled` | boolean | |

Variants: `primary` accent fill, white text (one per view: the main action). `secondary` white ground, `lineStrong` border, ink text. `danger` red fill, white text (SOS, confirm alert, close road). `quiet` no ground, accent text (low-emphasis actions). `inverse` white fill, ink text, for use on the red pinned alert.

States: hover darkens the fill (`accentPressed`, `dangerPressed`) or tints the ground (`surface`, `accentSoft`); pressed scales to 0.98; focus shows the ring; disabled 50%; busy shows a spinning ring. Radius `md`, weight medium, padding 8 × 24. Labels wrap rather than truncate.

### IconButton (`ui/Button.tsx`)

An icon-only action. `label` is required and becomes `aria-label` and the tooltip. Variants: `plain` (44 px circle, transparent, `surface` on hover) and `raised` (48 px circle, white ground, `raised` shadow; used on top of the map).

### ListRow, List (`ui/ListRow.tsx`)

One row of a list. `List` is a `<ul>` that draws a hairline between rows.

| Prop | Notes |
|---|---|
| `title` | Medium weight |
| `subtitle` | `size.sm`, muted |
| `icon`, `tone` | Leading icon; tone `neutral` \| `accent` \| `danger` \| `ok` \| `warn` \| `priority` |
| `children` | Content under the title (a meter, badges) |
| `trailing` | Badges, a time, a control |
| `to` | Makes the row a link and adds a chevron |
| `onPress` | Makes the row a button |
| `selected` | `accentSoft` ground; `aria-current` (link) or `aria-pressed` (button) |

Min height `--row-height` (64 / 48), padding 12 × `--row-padding`. Static, link and button rows share the layout; link and button rows get a `surface` ground on hover.

### DockedSheet (`ui/Sheet.tsx`)

A sheet that stays on screen next to the map and does not block it: the citizen's current route, the dispatcher's detail panel. A labelled `<section>` (`label` prop is its accessible name).

- `placement="bottom"` (default): floats over the lower edge of the map with 8 px margins, radius `lg`, `raised` shadow, 16 px padding, at most 60% of the map height, scrolls inside. From 768 px it is a 440 px card at the lower left.
- `placement="side"`: the same on narrow screens; from 1100 px it is a 360 px column beside the map with a left hairline and no shadow.

It rises 16 px while fading in (`duration.base`) when it appears.

**Native:** a non-modal bottom sheet (for example `@gorhom/bottom-sheet`) with one snap point sized to its content.

### ModalSheet (`ui/Sheet.tsx`)

A modal sheet: from the bottom on phones (full width, top corners `lg`, at most 85% of the height), a centred 440 px card from 768 px. Props: `open`, `onClose`, `title`, `closeLabel`, `children`. Built on `<dialog>`, which provides the focus trap, Escape to close and the scrim (`color.scrim`); a press on the scrim closes it. The header shows the title and a close icon button. Used for the location chooser and the console's "More" menu.

### TabBar (`ui/Nav.tsx`)

Bottom navigation for up to five destinations, icon above label. Props: `label` (name of the `<nav>`), `items: NavItem[]`, `action` (one extra control at the trailing end that is not a tab: the SOS action, the console's "More" button).

`NavItem`: `to`, `label`, `icon`, `count?`, `tone?` (`danger` \| `priority` \| `neutral`). A non-zero `count` shows a pill on the icon.

Height `tabBar` (64) plus the bottom safe area, top hairline, equal columns. Inactive items are muted; the current item (`aria-current="page"`) is ink, bold, and has a 3 px accent bar at the top of its cell. Labels are `size.xs` and may wrap to two lines.

### Sidebar (`ui/Nav.tsx`)

Vertical navigation for wide screens. Props: `label`, `items`, `header`, `footer`. Width `sidebar` (248), right hairline. Items are rows with icon, label and an optional count pill at the end; the current item has a `surface` ground, bold text and a 3 px accent bar on its left edge. The console puts the mark and product name in the header and the connection state, language control and sign-out button in the footer.

### Banner (`ui/Feedback.tsx`)

A message that stays until it is dismissed or the state behind it changes.

| Prop | Notes |
|---|---|
| `tone` | `info` (accent) \| `ok` \| `warn` \| `danger` \| `priority`; sets the soft ground, the border and the icon colour |
| `icon` | Defaults per tone: info, check, alert, alert, accessible |
| `title`, `children` | Bold title, then text |
| `actions` | Buttons under the text |
| `onDismiss` + `dismissLabel` | Shows a close icon button |
| `live` | `status` (default, polite) or `alert` (interrupts a screen reader) |

Radius `md`, 1 px border in the tone colour, `raised` shadow, rises in over `duration.base`.

### Toast (`ui/Feedback.tsx`)

A short-lived message about the result of an action, rendered once at the shell level. Props: `tone` (`ok` ink ground, `danger` red ground), `children`, `onDismiss`, `dismissLabel`. Fixed above the tab bar (bottom of the window on desktop), at most 640 px wide, `overlay` shadow. `role="status"` for ok, `role="alert"` for danger. The console removes it after 9 seconds; it can always be dismissed by hand.

### Meter (`ui/Meter.tsx`)

Occupancy. Props: `pct` (0–100), `level` (`green` \| `yellow` \| `red`), `label` (accessible name), `valueText` (shown next to the bar and used as `aria-valuetext`, for example "62% · Space available"), `marks` (vertical ink lines, used for the 90% re-route and 95% critical limits), `size` (`md` 8 px, `lg` 12 px).

Track `surfaceSunken`, fill and text in the level's colour, fully rounded. The fill width animates over `duration.slow`. `role="meter"` with `aria-valuenow/min/max`.

Level rule (same as the server): below the yellow limit green, up to and including the red limit yellow, above it red; limits come from `/meta` (70 and 90 by default).

### Badge (`ui/Feedback.tsx`)

A short label. Props: `tone` (`neutral` \| `accent` \| `danger` \| `ok` \| `warn` \| `priority`), `solid` (filled instead of tinted), `icon`, `children`. `size.xs`, medium weight, radius `sm`, padding 4 × 8.

### Switch (`ui/Controls.tsx`)

An on/off setting where the whole row is the control. Props: `checked`, `onChange`, `label`, `description`, `icon`, `tone` (`accent` \| `priority`; purple is reserved for the special-care role), `disabled`.

A `<button role="switch" aria-checked>`: Space or Enter toggles it. Off: white ground, `lineStrong` border, grey track. On: border and track in the tone colour, soft tone ground, knob moved to the right over `duration.fast`. Track 52 × 32, knob 24.

### SegmentedControl (`ui/Controls.tsx`)

A small set of mutually exclusive choices (the language). Props: `label`, `value`, `options` (`value`, `label`, optional `name` for screen readers, optional `lang`), `onChange`. A `radiogroup` of `radio` buttons with a roving tab index: arrow keys move and select. The chosen segment is a white pill with a `raised` shadow on a `surfaceSunken` track; each segment is at least 44 px high.

### Field, TextInput, Select (`ui/Controls.tsx`)

`Field` puts a visible label above a control and an error under it; it passes `id`, `aria-invalid` and `aria-describedby` to its child through a render prop. `TextInput` and `Select` share one look: `--control-height`, `lineStrong` border (red when invalid), radius `sm`, 16 px text at every density. `Select` adds a chevron. A placeholder is never the label.

### EmptyState, ErrorState (`ui/Feedback.tsx`)

Centred blocks with a 40 px icon, a title, a sentence and one action.

- `EmptyState` (`icon`, `title`, `children`, `action`): nothing to show yet, with the next step.
- `ErrorState` (`title`, `children`, `retryLabel`, `onRetry`, `busy`): something failed; always has a retry button; `role="alert"`; red icon.

### Skeleton, SkeletonList (`ui/Feedback.tsx`)

Placeholders while content loads. `Skeleton` (`lines`, `label`) draws rounded lines of varying width; `SkeletonList` (`rows`, `label`) draws row-shaped placeholders. Both are `role="status"` with the label as their name, and pulse slowly. The parent carries `aria-busy`.

### Shell-level pieces (`shell/`)

- `Launch` and `Mark` (`shell/Launch.tsx`): the launch screen (the mark and a thin progress bar, no text) and the product mark (a rounded ink square with four arrows meeting at one point, the sign for an assembly point).
- `TopBar` (`shell/parts.tsx`): a screen title (`h1`) with an optional back button (`backTo`) and trailing content.
- `LanguageControl`: a `SegmentedControl` over the available locales; switches the UI without a reload.
- `ConnectionStatus`: icon plus "Live" or "Offline".
- `NotFound`: an empty state for unknown URLs with a button to the home screen and a link to the dispatcher sign-in.

## 5. Platform adapters

`platform/types.ts` defines small interfaces; `platform/web.ts` is the only file that touches browser APIs for these jobs; everything else imports `platform` from `platform/index.ts`. A React Native build supplies a second implementation and changes nothing else.

| Interface | Methods | Web implementation | Suggested Expo implementation |
|---|---|---|---|
| `KeyValueStorage` | `get(key): string \| null`, `set(key, value)`, `remove(key)` | `localStorage`, falling back to an in-memory map when storage is blocked | The interface is **synchronous**: use `react-native-mmkv`, or preload the keys from `AsyncStorage` into memory before the first render and write through |
| `Geolocator` | `current(): Promise<Position>`; rejects with `LocationError` (`denied` \| `unavailable` \| `timeout`) | `navigator.geolocation.getCurrentPosition`, high accuracy, 8 s timeout | `expo-location`: `requestForegroundPermissionsAsync` then `getCurrentPositionAsync` |
| `Haptics` | `warning()` (the route changed), `success()` (SOS sent, marked safe) | `navigator.vibrate` patterns; silently skipped where unsupported | `expo-haptics`: `notificationAsync(Warning)` / `notificationAsync(Success)` |
| `Sound` | `unlock()` (call from a user gesture once), `alarm()` (three short beeps) | One shared `AudioContext`, resumed on a gesture; three 880 Hz square beeps | Console only. If needed: `expo-av` with a bundled sound; `unlock()` becomes a no-op |
| `Realtime` | `url(path): string` | `VITE_WS_BASE` if set, else `ws(s)://` + the page host | The server's WebSocket base URL from app config |
| `Platform.uuid` | `uuid(): string` | `crypto.randomUUID()` with a fallback for non-secure contexts | `expo-crypto` `randomUUID()` |

`Position` is `{ lat, lng }`.

Storage keys (`STORAGE_KEYS` in `platform/index.ts`):

| Key | Value |
|---|---|
| `evac.locale` | `az` or `en` |
| `evac.citizen_id` | Anonymous UUID, created on first use |
| `evac.role` | `standard` or `mobility_impaired` |
| `evac.onboarded` | `1` once onboarding has finished |
| `evac.citizen.zone` | Last chosen district id |
| `evac.citizen.banner` | The current route-change or info banner as JSON |
| `evac.operator_token` | Dispatcher token |
| `evac.operator.feed` | The socket messages behind the event feed (newest 60) as JSON |

Also portable as they are: `api/client.ts` (uses `fetch`), `api/types.ts`, `i18n/` (reads and writes the locale through the storage adapter; the document language and title are set in `main.tsx`, not in the i18n module), `lib/format.ts`, `lib/labels.ts`, `lib/geo.ts`, `lib/useLiveSocket.ts` (uses the standard `WebSocket` and the `Realtime` adapter; reconnects with back-off and calls `onReconnect` so the caller can reload).

## 6. Session stores

State lives above the screens, so it survives navigation between them. Screens read a store and call its actions; no screen fetches data or opens a socket.

### 6.1 Citizen session (`citizen/session.tsx`)

`CitizenSessionProvider` wraps `/welcome` and `/app/*`; screens use `useCitizen()`.

State:

| Field | Meaning |
|---|---|
| `citizenId` | Anonymous id from storage |
| `boot`, `bootError`, `retryBoot()` | `loading` \| `ready` \| `error` for the first load (`/meta` and the citizen's server state). A failed reload after a reconnect never replaces a working screen |
| `connected` | The WebSocket is open |
| `meta`, `roads`, `center`, `zoom` | Server info; the street network (loaded in the background, never blocks the first screen); map start position |
| `role`, `priority`, `setRole(role)` | The special-care role. Changing it stores it and re-plans from the recommended point |
| `plan`, `selected`, `planning`, `zoneId`, `routeVersion` | The evacuation plan, the option being routed to, a request in flight, the chosen district, a counter that changes whenever a new route should be brought into view |
| `sos`, `pendingSos`, `sosBusy`, `sosResult` | The open SOS; the SOS waiting in its undo window (`hazard`, `sendAt`); sending; the last result (`sent` \| `duplicate` \| `needPosition` \| `failed`) |
| `safe`, `safeBusy` | Marked safe |
| `banner` | The current banner as data (6.3) |
| `onboarded` | Onboarding has finished |

Actions:

| Action | What it does |
|---|---|
| `locateDevice()` | Device position → plan. Resolves to `ok` \| `denied` \| `outside` (more than 40 km from the city centre) \| `failed` |
| `chooseZone(zoneId)` | Plan from a district; remembers the district |
| `setPosition({lat, lng})` | Plan from a position picked on the map |
| `selectPoint(pointId)` | Re-plan to a chosen point |
| `startSos(hazard)` | Starts the 5-second undo window (`SOS_UNDO_MS`) |
| `undoSos()` | Cancels the pending SOS; nothing was sent |
| `sendSosNow()` | Skips the rest of the window |
| `markSafe()` | Closes the open SOS, clears the route |
| `clearSafe()` | Leaves the "safe" state to plan or call for help again |
| `dismissBanner()`, `completeOnboarding()` | |

Behaviour worth keeping:

- Every plan request carries the role, so the server always knows the profile.
- On start, a returning citizen's route is restored from the server (`GET /citizens/{id}/state`, then a plan from the stored position).
- The undo timer runs in the store, not in the SOS screen, so leaving that screen does not cancel the signal.
- An SOS uses the plan's origin; if there is none it asks the device once; if that fails the result is `needPosition`.
- Socket messages: `citizen.rerouted` replaces the plan, sets the banner and fires the warning haptic; `road.changed` updates one street; `assembly.occupancy` updates one option and its level; `assembly.activated` re-plans; `citizen.safe` sets the safe state; `system.reset` clears SOS, safe state and banner, reloads the streets and re-plans.
- After a reconnect the store reloads its server state and re-plans.

### 6.2 Dispatcher session (`operator/session.tsx`)

`OperatorSessionProvider` wraps `/operator/*`; screens use `useOperator()`. It wraps the dashboard reducer in `operator/state.ts` (one REST snapshot, then WebSocket deltas) and adds what that reducer does not keep.

- `token`, `expired`, `login(username, password)`, `logout()`. Any 401 ends the session and returns to sign-in with `expired` set.
- `meta` is loaded even when signed out (the sign-in form shows the demo credentials only when `sim_enabled` is true).
- `status` (`idle` \| `loading` \| `ready` \| `error`), `error`, `retry()`. The shell renders the error state, so a failed first request can never leave the console on "Loading…".
- `state` (the reducer's dashboard state: zones, points, brigades, open SOS sorted Priority #1 first, open alerts, roads, audit, feed, scenario) and `pastAlerts` (confirmed and dismissed, newest first, from the snapshot's `recent_alerts` plus live decisions).
- The event feed survives a refresh: the socket messages behind it are stored (newest 60) and replayed through the reducer after the first snapshot. Signing out and a system reset clear it.
- `toast`, `dismissToast()`.
- `run(action)`: runs an API call with the token; 401 → sign-in, other errors → a toast; resolves to success. `confirmAlert`, `dismissAlert`, `setRoadOpen`, `setBrigadeStatus`, `refreshAudit` are built on it.
- `selection`, `select(target)`, `focus`, `showOnMap(target, point)`: what is selected on the live map and where its camera should go. Kept in the store so "show on map" from another screen works.
- A new RED alert and a Priority #1 SOS play the alarm; a new alert also moves the live map to it.

### 6.3 Banners as data (`citizen/banner.ts`)

A banner is stored as `{ tone, kind, data }`, not as text, so it follows the language switch and survives a refresh. `rerouteBanner(push)` turns a `citizen.rerouted` message into one banner per cause; `bannerContent(banner)` returns the title and text in the current language.

| Kind | Tone | Cause |
|---|---|---|
| `road_closed` | warn | A road on the route closed; same point, new path |
| `road_closed_point` | warn | A road closed and the target point changed |
| `point_full` | warn | The target point reached the re-route limit (90%) |
| `alert_changed` | warn | An alert was confirmed and the route changed |
| `alert_info` | info | An alert was confirmed, a new point opened, the route is unchanged |
| `alert_plain` | info | An alert was confirmed near the citizen; route checked, unchanged |
| `unreachable` | danger | No assembly point is reachable now |
| `error` | danger | A request failed (not persisted) |

The shell shows the banner above every citizen screen, with a dismiss button. Route-change banners are announced as alerts.

## 7. Map

### 7.1 Scene model (`map/scene.ts`)

Screens describe what the map shows as plain data; the renderer only draws it. The decision about what to draw never lives in map-library code.

```ts
interface MapScene {
  markers: SceneMarker[];
  lines: SceneLine[];      // { id, path, style }   style = a mapStyle line name
  areas: SceneArea[];      // { id, center, radiusM, style }  style = alertArea | heatArea
  roads: SceneRoad[];      // { id, path, style }   street segments drawn over the tiles
  focus: SceneFocus | null; // { key, path? , point? }  the camera moves once each time key changes
}
```

Every marker has `id`, `position`, `label` (accessible name) and an optional `target` (`{ kind: "point" | "sos" | "brigade" | "road", id }`) that makes it selectable.

| Marker kind | Extra data | Look |
|---|---|---|
| `origin` | – | The citizen's position: 22 px accent dot with a 3 px white ring |
| `pending` | – | A position tapped on the map, waiting for confirmation: 28 px accent pin with a white fill |
| `point` | `icon`, `text` ("62%"), `tone` (`green` \| `yellow` \| `red` \| `off`), `selected` | 28 px pill: type icon plus occupancy %, filled in the level colour with a white outline. `off` (a closed reserve point): grey with a dashed outline, icon only. Selected: 8 px taller, ink outline, larger text |
| `sos` | `icon`, `hazard` | 28 px circle in the hazard colour with a white hazard icon and white outline |
| `prioritySos` | – | 40 px purple circle with the accessibility icon, a white "1" badge and a slowly pulsing purple ring |
| `brigade` | `text` ("03"), `tone` (brigade status) | Ink pill with a truck icon, the brigade number and a status dot |
| `zone` | `text`, `count` | District name label above the district centre; when it has open SOS, a red count and a shadow. Not selectable |

The hit box of every selectable marker is at least 44 × 44 px regardless of the visible size. Stacking, top to bottom: origin and pending, Priority SOS, brigades, SOS, selected point, points, district labels.

### 7.2 Scene builders

Pure functions with no map library in them; reuse them unchanged on native.

- `citizen/scene.ts`
  - `citizenRoads(roads, showBarriers)`: closed streets, plus streets with barriers when the barrier-free profile is on. Citizens see nothing else of the network.
  - `citizenScene(...)`: one `point` marker per plan option (target → point detail), the `origin`, an optional `pending` pin, the route as two lines (`routeCasing` under `route` or `routeAccessible`), and a focus that fits the route (key changes with `routeVersion`).
- `operator/scene.ts`
  - `closedRoads(edges)`: closed streets only. The rest of the network is not drawn; the tiles already show it.
  - `operatorScene(state, meta, closed, selection, focus)`: district labels and heat discs (radius 500 m + 140 m per SOS, capped at 12), a pulsing `alertArea` per open alert (the cluster radius from `/meta`, or 300 m for overcrowding), all assembly points, SOS and Priority SOS markers, brigades, a dashed line for each brigade en route, and a halo over the selected street.

### 7.3 Web renderer (`map/MapView.tsx`)

Leaflet (through react-leaflet) with OpenStreetMap raster tiles. Props: `scene`, `center`, `zoom`, `label` (accessible name of the map region), `zoomControl`, `attribution` corner, `sheetInset` (leave room at the bottom for a docked sheet when fitting a route), `onPress(lat, lng, toleranceM)`, `onSelect(target)`.

- Draws streets on one canvas and only touches segments whose style changed (the barrier-free profile can show over a thousand).
- Fits the route with 48 px padding (240 px at the bottom with `sheetInset`), zoom capped at 15; for a point focus it flies there at zoom 13 or closer.
- Markers are keyboard-focusable buttons named by their `label`; Enter selects.
- Reports a press on the map itself with a tolerance in metres equal to 24 screen px at the current zoom.
- Keeps the map sized when the layout around it changes.
- Shows the OpenStreetMap credit.

### 7.4 What a native MapView must implement

A component with the same props, built on `react-native-maps` or MapLibre:

1. Render `markers` as custom marker views with the looks in 7.1 and a hit slop that makes every target at least 44 pt.
2. Render `lines` and `roads` as polylines using `mapStyle` (colour, width, opacity, dash pattern), casing under route.
3. Render `areas` as circles.
4. Move the camera when `focus.key` changes: fit `path` with the paddings above, or animate to `point`.
5. Call `onSelect(target)` on a marker press and `onPress(lat, lng, toleranceM)` on a map press; compute the tolerance with `metresPerPixel(lat, zoom)` from `lib/geo.ts`.
6. Set accessibility labels from `label`.
7. Keep the map-data credit visible.

### 7.5 Selecting a road

Streets are thin, so they are selected by tapping near them. `nearestEdge(edges, lat, lng, maxM)` in `lib/geo.ts` returns the street nearest to the tapped position within the tolerance, or null. The dispatcher's live map calls it on every map press: a hit selects the road and opens its detail panel (name, open or closed, barriers, length, "Close road" or "Reopen road"); a miss clears the selection.

On the citizen map a press sets a pending position pin, and the sheet asks for confirmation before re-planning from it, so an accidental touch cannot move "your position".

## 8. Screens and navigation

### 8.1 Startup

1. `index.html` inlines the design tokens and the launch screen's styles and markup (the mark and a thin progress bar on a white ground, no text). Nothing is unstyled or empty before React mounts.
2. While a session starts, React renders the same launch markup (`shell/Launch.tsx`), so the hand-off does not jump.
3. `/` decides from storage alone: a stored citizen id plus the onboarded flag → `/app/map`; otherwise → `/welcome`.
4. `/app/*` without the onboarded flag redirects to `/welcome`; `/welcome` with the flag redirects to `/app/map`.
5. A returning citizen's route is restored from the server before the first screen appears.

### 8.2 Citizen app: bottom tab bar plus a persistent SOS action

Three tabs (Map, Points, Settings). SOS is not a tab, because it is an action rather than a place: it is a red control at the trailing end of the tab bar, visible on every tab. When an SOS is open it shows a check mark.

Above the screen, at the shell level: a "reconnecting" banner while the socket is down, and the current banner (6.3).

| URL | Screen | The one job | States |
|---|---|---|---|
| `/` | Start | Send first-time users to `/welcome`, everyone else to `/app/map` | – |
| `/welcome` | Onboarding | End on the map with a route already drawn | Step 2 shows skeleton rows while districts load, an error state with retry if the server is unreachable, and an inline error if location is denied, outside the city or the route request fails |
| `/app/map` | Map with a docked sheet | Know where to go | Sheet states below |
| `/app/points` | List of assembly points | Compare alternatives | Loading: skeleton rows. Empty: "set your position" with a button. No route: explanation and a "Send SOS" button. All full: a warning above the list |
| `/app/points/:id` | Point detail | Decide | Unknown id: empty state with a link back to the list. "Go here" shows a busy state |
| `/app/sos` | SOS | Call for help and see what happened | Chooser, undo window, sending, sent, safe; "position needed" error with a button |
| `/app/settings` | Settings | One-off settings | – |

**Onboarding** (`citizen/screens/Welcome.tsx`): three steps kept in `?step=`, so the browser back button works. A progress indicator ("Step 2 of 3"), a back button from step 2. The primary action sits at the bottom.

1. Language: two rows; choosing one switches the UI at once. "Continue".
2. Position: "Use my location" (primary), or a district from the list. Either computes the plan and moves on.
3. Special care: the role switch with its explanation; toggling it re-plans. "Show my route" stores the onboarded flag and opens the map.

**Map** (`citizen/screens/MapScreen.tsx`): full-bleed map, a raised locate button at the top right, and a docked sheet whose content depends on state:

| State | Sheet content |
|---|---|
| A position was tapped on the map | "Set your position here?" with "Use this spot" and "Cancel" |
| A route is being computed | Title plus skeleton lines |
| Marked safe | Badge, title, text; "Plan a route again" and "I need help again" |
| No position yet | "Where are you?"; "Use my location" and "Choose a district"; inline location error |
| No reachable point | Explanation (a different one on the barrier-free profile); "Send SOS" and "Change position" |
| Route | Badges ("Barrier-free route", "Recommended"); point name; distance and walking time; large occupancy meter with the level in words; a warning if every point is full; "Other points" and "I am safe" |

Tapping a point marker opens its detail. Choosing a district opens the location sheet (a modal sheet with "Use my location" and the district list).

**Points** (`citizen/screens/PointsScreen.tsx`): the nearest active points ranked by route distance. Each row: type icon, name, "type · distance · time", a meter with the level in words, and badges ("Your route", "Recommended"). A row opens the detail. The detail shows name, type, badges (including "Barrier-free entrance"), distance, walking time, a large meter with people inside and capacity, and one full-width primary button at the bottom: "Go here" (re-plans, then opens the map) or "Show route on map" if it is already the target.

**SOS** (`citizen/screens/SosScreen.tsx`). Two deliberate taps send an SOS:

1. The SOS action opens this screen: "What happened?" and four large hazard buttons (icon above label, at least 112 px high).
2. Tapping a hazard starts a **5-second undo window**: a large countdown, a progress bar, "Send now" and "Undo". When it ends, or on "Send now", the signal is sent.

Why the window runs before sending: the server has no endpoint to withdraw an SOS, so an "undo" after sending would be fake. The timer lives in the session store, so leaving the screen does not cancel it.

After sending: "SOS sent" (or "Priority #1 SOS sent" with the purple badge), hazard and time, "Rescuers have been notified", then "Show my route" and "I am safe". A second SOS within 60 seconds is answered by the server as a duplicate and the screen says so. After "I am safe": a confirmation with "Back to the map" and "I need help again".

**Settings** (`citizen/screens/SettingsScreen.tsx`): the special-care role switch, the language control, a privacy note (a random id on the device, no name or phone number, position sent only for a route or an SOS), a link to the dispatcher sign-in, and the connection state in the title bar.

**Offline backup route mode.** The plan carries `routing_mode` (`live` | `fallback`) and `fallback_source` (`cache` | `local_graph` | `static_matrix` | `null`). When the external routing API is down the server keeps answering from a local source, and the app says so without blocking anything:

- A `Banner` (tone `warn`, icon `offline`, live `status`) at the top of the shell's notice stack on every tab, titled "Offline backup route mode". It has no dismiss button: it stays for as long as the plan is a fallback one and disappears with the next live plan. The text depends on the source: the last saved route is shown (`cache`); routes are computed from the local street database (`local_graph`); distance and time are straight-line estimates and the line on the map is not a street route (`static_matrix`). Each text ends by saying the service keeps working.
- A `Badge` (tone `warn`, icon `offline`, "Backup mode") in the route sheet's badge row and on the point detail.
- Everything else (choosing a point, SOS, "I am safe") works unchanged.

**Map background not loading.** Tiles are a second external service. `MapView` takes `onTilesFailing(failing)`: it reports `true` after three consecutive tile errors with no successful load in between and `false` on the next successful load. The citizen map then shows one warn-coloured line at the top of the route sheet ("Map background is not loading. The route and points are still shown."); the dispatcher's live map shows the same message as a thin strip above the map. The route line, markers and lists do not depend on tiles. A native `MapView` must report the same signal from its tile source.

### 8.3 Dispatcher console: sidebar

From 1100 px a left sidebar; below that a bottom bar with the first four destinations and a "More" button that opens a sheet with the rest, the language control and sign-out. Compact density throughout.

An open **RED alert stays pinned** at the top of every console screen: a red bar with the alert number, rule and description, how many more are waiting, a link to its detail, "Confirm" (one action) and "Dismiss" (opens a reason field in place). It is the one thing the dispatcher must never miss. A new alert also plays the alarm and moves the live map to it.

Errors and results of actions appear as toasts at the shell level. A failed first load shows an error state with retry and sign-out.

| URL | Screen | Content |
|---|---|---|
| `/operator/login` | Sign-in | Username, password, error banner, "session expired" notice, language control, link back to the citizen app. The demo credentials line shows only when `sim_enabled` is true |
| `/operator/live` | Live map (home) | Status strip (open SOS, Priority SOS, open alerts, closed roads, free brigades, safe citizens); the map; a collapsible legend; a panel showing the selected road, SOS, point or brigade with its actions, or the event feed when nothing is selected |
| `/operator/alerts`, `/operator/alerts/:id` | Alerts | Open and past alerts as lists; the detail shows the description, times, hazard types, who decided, the dismissal reason or what the confirmation did, "Confirm"/"Dismiss" for an open alert, and "Show on map". List and detail side by side on desktop |
| `/operator/sos` | SOS queue | Open SOS, Priority #1 first; a row shows the SOS on the live map. SOS by district with a bar per hazard type and the counts in words. Read-only: the backend cannot resolve one SOS or send a brigade to one |
| `/operator/resources` | Resources | Assembly points with occupancy meters (marks at the 90% and 95% limits) and brigades with a status select; both can be shown on the map |
| `/operator/audit` | Audit log | Decisions with time, actor and outcome; refresh button; empty state |
| `/operator/simulation` | Simulation | Earthquake scenario with progress, SOS generator (including priority), occupancy steps, close random roads, open all roads, reset (two presses). Shown only when `/api/v1/meta` returns `sim_enabled: true` |

Everything a tooltip used to show on the map is reachable by tap in the detail panel. Closing and reopening a road goes through the simulator API, so those buttons appear only when `sim_enabled` is true.

**Roles.** Sign-in returns a role (`observer`, `dispatcher`, `admin`) and the console shows only what that role can do; nothing is drawn disabled or fake. The dispatcher session exposes `role` and `can("decide" | "simulate")` (decide = dispatcher or admin, simulate = admin).

| Element | observer | dispatcher | admin |
|---|---|---|---|
| "Confirm" / "Dismiss" on the pinned alert and the alert detail | replaced by a short read-only note | shown | shown |
| Brigade status (live detail panel, Resources) | plain status text | select | select |
| Close / reopen road in the road detail | hidden | hidden | shown when `sim_enabled` |
| Simulation in the navigation and its screen | hidden; the URL shows a "no permission" state | hidden | shown when `sim_enabled` |

The signed-in name and the localized role sit in the sidebar footer and in the "More" sheet. The sign-in hint lists both demo accounts, only when `sim_enabled` is true. A 403 from the server (a stale role) becomes a toast.

**Staying usable in a flood of SOS.** The SOS queue draws at most 100 rows, Priority #1 first, with a line "Shown: 100 / N"; the live map draws at most 300 SOS markers. The counts in the status strip, the navigation badge and the district table stay exact. Socket messages are applied together every 100 ms, and the alarm plays at most once per batch.

**Citizen side.** When the server turns an SOS away, the shell banner says what happened in the citizen's terms: too many requests, with the seconds to wait taken from the response ("Too many requests. Try again in 42 seconds."), or that an SOS from this spot was already received and rescuers have been informed. Both are error banners, so they are not kept across a refresh.

`/citizen` and `/operator` still work as redirects to `/app/map` and `/operator/live`. Unknown URLs show a "not found" screen instead of redirecting silently.

## 9. Copy

- Labels say what a control does in plain words: a verb and an object ("Use my location", "Show my route", "Close road").
- Titles name the thing on the screen ("Assembly points", "SOS queue").
- An error says what happened and what to do next ("Could not get your location. Choose a district or tap the map.").
- Every key exists in `i18n/az.json` and `i18n/en.json`; `i18n/index.ts` enforces matching keys at compile time. Text that depends on data (banners, feed entries, toasts) is stored as data or as a render function, so it follows the language switch.
- Proper names from the server (districts, assembly points) stay as they are in both languages.

## 10. Motion

Motion appears only where it explains a change:

| Where | What | Why |
|---|---|---|
| Docked sheet, banner, toast, modal sheet | Rise 16 px while fading in, `duration.base` | Shows that something arrived and where it came from |
| Map camera | Fits the new route or flies to the alert, `duration.slow` | A route was redrawn, an alert was raised |
| Meter fill | Width over `duration.slow` | Occupancy changed |
| Switch knob, button press | `duration.fast` | Direct feedback |
| Priority #1 marker ring, open alert area | Slow opacity pulse | The two things that must be found at a glance |
| SOS countdown bar | Shrinks over the 5 seconds | Shows how long "Undo" remains |
| Skeleton lines, spinner | Pulse, rotation | Work in progress |

The focus ring never animates. Under `prefers-reduced-motion: reduce` every animation and transition is switched off; nothing stays hidden as a result. On native, check `AccessibilityInfo.isReduceMotionEnabled()` and skip the same animations.

## 11. Accessibility checklist

- Text contrast meets WCAG AA: body text is ink on white; muted text is `inkMuted` (over 4.5:1 on `bg` and `surface`); coloured text uses the `*Text` shades; text on fills uses the `on*` tokens (ink on yellow).
- Control borders use `lineStrong` (3:1 on the ground).
- Every touch target is at least 44 × 44 px, including map markers, the language control and selects; primary citizen actions are 56 px high and sit in the lower half of the screen.
- Every interactive element has an accessible name; icon-only buttons require a `label`.
- One visible focus ring on every control; modal sheets trap focus and close on Escape; the segmented control uses arrow keys.
- Colour is never the only signal (section 1).
- Live regions: route-change banners and errors are `role="alert"`; statuses, toasts and skeletons are `role="status"`; the pinned RED alert is `role="alert"`.
- Meters expose `role="meter"` with a value text that includes the level in words.
- The document language follows the UI language; language names carry their own `lang`.
- Field text is 16 px at every density, so phones do not zoom on focus.
- Layout works from 360 px wide; nothing depends on a short word fitting.
- Reduced motion is respected.

## 12. Mobile app

The citizen app has been built against this document in `mobile/` (Expo SDK 58, React Native, Expo Router). It uses the same backend, the same REST and WebSocket contract, and it includes the dispatcher console as native screens (sign-in, live map, alerts with confirm and dismiss, SOS queue, resources). Simulation and the audit log stay web-only. It has been type-checked, bundled by Metro and opened in Expo Go on the iOS simulator; it has not been run on Android or on a real device.

### 12.1 File map

| Web (`frontend/src/`) | Mobile (`mobile/src/`) | Relation |
|---|---|---|
| `design/tokens.ts` | `design/tokens.ts` | Identical copy |
| `design/cssVars.ts`, `design/base.css` | `design/theme.ts` | Replaced: text presets per token size and weight, shadows as style objects, tone table |
| `api/types.ts`, `lib/*`, `i18n/az.json`, `i18n/en.json` | same paths | Identical copies |
| `api/client.ts` | `api/client.ts` | Copy; the base URL comes from `config.ts` (`EXPO_PUBLIC_API_URL`, default `http://localhost:8000`) |
| `i18n/index.ts` | `i18n/index.ts` | Copy plus `reloadLocale()`, called once storage has been read from disk |
| `platform/types.ts` | `platform/types.ts` | Identical copy |
| `platform/web.ts` | `platform/native.ts` | Rewritten: AsyncStorage behind an in-memory map (see 12.3), `expo-location`, `expo-haptics`, `expo-crypto`; sound is a no-op (the alarm belongs to the console) |
| `citizen/session.tsx` | `citizen/session.tsx` | Copy plus one `useLocale()` call so every screen re-renders on a language change |
| `citizen/banner.ts`, `scene.ts`, `labels.ts`, `useLocate.ts`, `map/scene.ts` | same paths | Identical copies |
| `ui/*` (React DOM + CSS) | `ui/*` (React Native) | Rewritten with the same exported names and props; links become `onPress`; `ButtonLink`, `Sidebar`, `Toast`, `Field` are not ported |
| `shell/Launch.tsx`, `shell/parts.tsx` | same paths | Rewritten: mark and activity indicator, `TopBar`, `LanguageControl`, `ConnectionStatus` |
| `map/MapView.tsx` (Leaflet) | `map/MapView.tsx` (`react-native-maps`) | Rewritten against the contract in 7.4 |
| `citizen/CitizenShell.tsx`, `App.tsx` | `app/_layout.tsx`, `app/(app)/_layout.tsx`, route files | Rewritten for Expo Router |
| `citizen/screens/*` | `citizen/screens/*` | Rewritten screen by screen |
| `operator/session.tsx`, `state.ts`, `describe.ts`, `scene.ts` | same files | Copied; the store only needed React 19 ref typings |
| `operator/screens/*` | `operator/screens/*` | Rewritten for React Native: OperatorLogin, LiveScreen, AlertsScreen, SosQueueScreen, ResourcesScreen; Simulation and Audit are not ported |

The copies are kept in sync by hand. Moving them into one shared package is the next step.

### 12.2 Native map

`mobile/src/map/MapView.tsx` draws the same `MapScene` with `react-native-maps` (Apple Maps on iOS).

- Lines and roads are `Polyline`s styled from `mapStyle`; dash strings become dash arrays. Line opacity is not applied.
- Markers are `Marker`s with custom views inside a 44 pt hit box. `tracksViewChanges` is off; the marker key carries its visible state, so a changed marker is redrawn.
- Citizen scenes use the `origin`, `pending` and `point` markers. The dispatcher's marker kinds are not implemented.
- The camera moves once per focus key: `fitToCoordinates` for a route (with the sheet inset as bottom padding), `animateToRegion` for a point.
- A press on the map reports the coordinate; marker presses that iOS also reports to the map are ignored there.
- Streets with barriers are drawn only within 2.5 km of the citizen, because a native map slows down with over a thousand overlays. Closed roads are always drawn.

### 12.3 Differences from the web app

- **Storage.** The storage port is synchronous; AsyncStorage is not. Values are read into memory once at start-up (`hydrateStorage`) before the first screen renders, then served from memory and written through in the background.
- **Navigation.** A stack inside the app shell with a custom tab bar: three tabs plus the SOS action in the same row. The point detail pushes onto the stack; tabs use `router.navigate`.
- **Onboarding.** The step lives in component state, not in the URL.
- **Settings.** The dispatcher sign-in row opens the in-app console (`/operator/login`).
- **Dispatcher console on a phone.** A header with the signed-in name and role, the pinned RED alert as one tappable bar (it opens the alert, where confirm and dismiss are), and a four-item tab bar (Live, Alerts, SOS, Resources). The map detail is a docked sheet.
- **Safe areas.** The shell pads the top inset; the tab bar pads the bottom inset.
- **Notices.** The route-change banner, the reconnecting notice and the offline backup route notice sit above the screen, as on the web. The map-tiles note does not exist (there is no tile layer to fail).
- **Sheet buttons.** Buttons in the map sheet are stacked full width; side by side, long Azerbaijani labels broke mid-word.
- **Top bar.** It has the same side inset as the screen content, so titles line up with it.
- **React Compiler** is off in `app.json`: it would cache `t()` calls and freeze the language switch.

## 13. What the mobile app still lacks

- **Offline tiles.** Apple Maps needs a connection; the route and markers still draw without a base map.
- **Push notifications** for re-routes and alerts while the app is in the background. Today these arrive only over the WebSocket while the app is open; the server would need a push channel.
- **Background and continuous location.** The citizen's position is a single fix taken on request; movement is not tracked.
- **Android and real devices.** Untested. `react-native-maps` uses Google Maps on Android and needs an API key there.
- **A shared package** for the files that are currently copied (12.1).
- **Automated tests**, and store assets: the icon and splash image are still the template's.
- **Font fallback** for `№` and `≈`, which Albert Sans lacks; they render in the system face.
- **Deep links** for `/points/:id` and `/sos` if notifications should open them.
