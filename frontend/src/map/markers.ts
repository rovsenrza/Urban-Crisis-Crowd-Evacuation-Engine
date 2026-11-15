/** Leaflet icons for scene markers. Looks come from `map.css`; this file only builds the markup. */
import L from "leaflet";
import { tokens } from "../design/tokens";
import { iconMarkup } from "../ui/Icon";
import type { SceneMarker } from "./scene";

const TAP = tokens.size.tap;
const HAZARDS = new Set(["fire", "collapse", "flood", "medical"]);

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function markup(marker: SceneMarker): { html: string; width: number } {
  switch (marker.kind) {
    case "origin":
      return { html: '<span class="mk mk-origin"><i></i></span>', width: TAP };
    case "pending":
      return { html: `<span class="mk mk-pending">${iconMarkup("pin", "lg")}</span>`, width: TAP };
    case "point":
      return {
        html: `<span class="mk mk-point mk-point--${marker.tone}${marker.selected ? " mk-point--selected" : ""}">${iconMarkup(marker.icon)}${marker.text ? `<b>${escapeHtml(marker.text)}</b>` : ""}</span>`,
        width: tokens.size.markerPinWidth,
      };
    case "sos":
      return {
        html: `<span class="mk mk-sos mk-hazard--${HAZARDS.has(marker.hazard) ? marker.hazard : "other"}">${iconMarkup(marker.icon)}</span>`,
        width: TAP,
      };
    case "prioritySos":
      return { html: `<span class="mk mk-sos mk-sos--priority">${iconMarkup("accessible")}<b>1</b></span>`, width: TAP };
    case "brigade":
      return {
        html: `<span class="mk mk-brigade mk-brigade--${marker.tone}">${iconMarkup("truck")}<b>${escapeHtml(marker.text)}</b></span>`,
        width: tokens.size.markerPinWidth,
      };
    case "zone":
      return {
        html: `<span class="mk-zone${marker.count > 0 ? " mk-zone--hot" : ""}">${escapeHtml(marker.text)}${marker.count > 0 ? `<b>${marker.count}</b>` : ""}</span>`,
        width: tokens.size.sidebar / 2,
      };
  }
}

// The same look returns the same icon object, so Leaflet does not rebuild the
// marker's DOM on every render.
const cache = new Map<string, L.DivIcon>();

export function markerIcon(marker: SceneMarker): L.DivIcon {
  const { html, width } = markup(marker);
  let icon = cache.get(html);
  if (!icon) {
    icon = L.divIcon({ className: "mk-box", html, iconSize: [width, TAP], iconAnchor: [width / 2, TAP / 2] });
    cache.set(html, icon);
  }
  return icon;
}

/** Stacking order: the citizen above everything, then priority, brigades, SOS, points, labels. */
export function markerZ(marker: SceneMarker): number {
  switch (marker.kind) {
    case "origin":
    case "pending":
      return 1000;
    case "prioritySos":
      return 900;
    case "brigade":
      return 800;
    case "sos":
      return 700;
    case "point":
      return marker.selected ? 600 : 500;
    case "zone":
      return 0;
  }
}
