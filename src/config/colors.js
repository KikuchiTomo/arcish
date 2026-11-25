// Space colours. A space has one solid colour: either a preset from the
// palette or any colour the user picked. Everything else (sidebar tint,
// accent, the matching Chrome tab-group colour) is derived from it.
export const PALETTE = Object.freeze([
  { key: 'lavender', nameKey: 'colorLavender', color: '#8b6cf6' },
  { key: 'ocean', nameKey: 'colorOcean', color: '#3b82f6' },
  { key: 'aqua', nameKey: 'colorAqua', color: '#14a9b8' },
  { key: 'mint', nameKey: 'colorMint', color: '#22b07d' },
  { key: 'lemon', nameKey: 'colorLemon', color: '#d9a514' },
  { key: 'peach', nameKey: 'colorPeach', color: '#f08a4b' },
  { key: 'cherry', nameKey: 'colorCherry', color: '#e5484d' },
  { key: 'rose', nameKey: 'colorRose', color: '#e85d8f' },
  { key: 'graphite', nameKey: 'colorGraphite', color: '#6b7280' },
]);

export const DEFAULT_COLOR = PALETTE[0].color;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isColor(value) {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

export function paletteColor(key) {
  return PALETTE.find((p) => p.key === key)?.color || DEFAULT_COLOR;
}

export function spaceColor(space) {
  return isColor(space?.color) ? space.color.toLowerCase() : DEFAULT_COLOR;
}

// Chrome's fixed tab-group colours, with the hue each one renders as.
const GROUP_COLORS = Object.freeze({ grey: '#5f6368', blue: '#1a73e8', red: '#d93025', yellow: '#f9ab00', green: '#188038', pink: '#d01884', purple: '#a142f4', cyan: '#007b83', orange: '#fa903e' });

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// The tab-group colour closest to an arbitrary colour.
export function groupColorFor(color) {
  const [r, g, b] = rgb(color);
  let best = 'grey';
  let bestDistance = Infinity;
  for (const [name, hex] of Object.entries(GROUP_COLORS)) {
    const [gr, gg, gb] = rgb(hex);
    const distance = (r - gr) ** 2 + (g - gg) ** 2 + (b - gb) ** 2;
    if (distance < bestDistance) [best, bestDistance] = [name, distance];
  }
  return best;
}
