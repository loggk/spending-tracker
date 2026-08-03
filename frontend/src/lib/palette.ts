/**
 * Category colors.
 */
export const CATEGORY_COLORS = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
] as const;

/** Chart color for a single-series plot, where hue carries no identity. */
export const SERIES_COLOR = CATEGORY_COLORS[0];

export const FALLBACK_COLOR = '#8a8a85';
