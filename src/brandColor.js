// Every surface painted with a vendor's brand color (event form header,
// subbar and buttons, dashboard/profile headers) carries white text, and the
// color is also used for links on white. So a brand color is only usable if
// white text on it meets WCAG AA contrast (4.5:1) — a light color like sky
// blue fails and washes out. Colors that fail are darkened (same hue) just
// until they pass, both when a vendor picks one and when one is displayed,
// so colors saved before this check existed are fixed too.

export const DEFAULT_BRAND_COLOR = '#0C447C';
const MIN_CONTRAST = 4.5;

function parseHex(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function toHex(rgb) {
  return '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastWithWhite(rgb) {
  return 1.05 / (luminance(rgb) + 0.05);
}

// Returns the color itself if white text on it is readable, otherwise the
// closest darker shade of the same hue that is.
export function readableBrandColor(hex) {
  const rgb = parseHex(hex) || parseHex(DEFAULT_BRAND_COLOR);
  if (contrastWithWhite(rgb) >= MIN_CONTRAST) return toHex(rgb);
  // Lower HSL lightness only: mixing in black instead would also dull the
  // saturation and turn e.g. sky blue into a muddy grey-blue.
  const [h, s, l] = rgbToHsl(rgb);
  for (let newL = l - 0.01; newL > 0; newL -= 0.01) {
    const darker = hslToRgb([h, s, newL]);
    if (contrastWithWhite(darker) >= MIN_CONTRAST) return toHex(darker);
  }
  return '#000000';
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6
    : max === g ? ((b - r) / d + 2) / 6
    : ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)].map((v) => v * 255);
}

// The lighter companion shade (subbar, icon tile, focus ring): up to 25%
// white mixed in, but never so light that white text stops being readable.
function lightVariant(rgb) {
  for (let t = 0.25; t > 0; t -= 0.01) {
    const lighter = rgb.map((v) => v + (255 - v) * t);
    if (contrastWithWhite(lighter) >= MIN_CONTRAST) return toHex(lighter);
  }
  return toHex(rgb);
}

// Sets --brand-color / --brand-color-light on `el` (default: the page root)
// and returns the readable color actually applied.
export function applyBrandColor(hex, el = document.documentElement) {
  const color = readableBrandColor(hex);
  el.style.setProperty('--brand-color', color);
  el.style.setProperty('--brand-color-light', lightVariant(parseHex(color)));
  return color;
}
