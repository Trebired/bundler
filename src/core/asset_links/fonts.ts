import type { BundlerFontPreloadLink } from "#3c8d8166992a";

function sortFontPreloadLinks(values: Iterable<BundlerFontPreloadLink>): BundlerFontPreloadLink[] {
  return Array.from(values).sort((left, right) => left.href.localeCompare(right.href));
}

export { sortFontPreloadLinks };
