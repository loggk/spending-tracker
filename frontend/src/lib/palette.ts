/**
 * Default colors offered when creating a category. Stored colors come back from
 * the API, so changing this list only affects categories created from now on.
 */
export const CATEGORY_COLORS = [
  '#34508a', // navy
  '#5f86a6', // slate blue
  '#6f9772', // sage
  '#9a9a5a', // olive
  '#c99a45', // ochre
  '#b8664a', // terracotta
  '#d7a294', // clay
  '#8f5a76', // plum
] as const;

/** Chart color for a single-series plot, where hue carries no identity. */
export const SERIES_COLOR = 'var(--primary)';

/** Day-of-week bars: Monday–Thursday against Friday–Sunday. */
export const WEEKDAY_COLOR = 'var(--weekday)';
export const WEEKEND_COLOR = 'var(--primary)';

/** Stands in for a category that was deleted. */
export const FALLBACK_COLOR = '#8a8a85';
