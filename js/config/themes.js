/**
 * config/themes.js
 * ------------------------------------------------------------
 * Metadata for the color-theme swatch picker.
 *
 * IMPORTANT: this list only feeds the *picker UI* (the `id` sets
 * `data-theme` on the device, and `swatch` is the preview dot
 * color). The actual CSS custom properties for each theme live
 * in css/variables.css under `[data-theme="<id>"]` — the `id`
 * values here must match those selectors exactly.
 *
 * To add a new colorway: add a block to variables.css AND an
 * entry here with the same `id`.
 */

export const THEMES = [
  { id: 'orange', label: 'Orange', swatch: '#e8720c' },
  { id: 'green', label: 'Green', swatch: '#5cb82a' },
  { id: 'blue', label: 'Blue', swatch: '#29a8c2' },
  { id: 'purple', label: 'Purple', swatch: '#9a2fc0' },
  { id: 'pink', label: 'Pink', swatch: '#e83f82' },
  { id: 'graphite', label: 'Graphite', swatch: '#6b7178' },
];
