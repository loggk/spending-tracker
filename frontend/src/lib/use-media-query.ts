import { useEffect, useState } from 'react';

/** Matches Tailwind's `sm` breakpoint, the point where layouts go multi-column. */
export const WIDE_SCREEN = '(min-width: 640px)';

/** Tracks a CSS media query so components can size themselves, not just restyle. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);

    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}
