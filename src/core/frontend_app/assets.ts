import type {
  BundlerCollectedAssetLinks,
  BundlerFrontendAssetLinks,
  BundlerFrontendAssetLinksOptions,
  BundlerFontPreloadLink,
  BundlerRenderedAssetTags,
} from "#3c8d8166992a";
import { collectAssetLinks } from "#17f3fba84f54";
import { FRONTEND_CONFIG_RULE_KEY } from "#d0ppiu0440kk";
import { sortFontPreloadLinks } from "#cliwdvy5eown";

function collectFrontendAssetLinks(options: BundlerFrontendAssetLinksOptions): BundlerFrontendAssetLinks {
  const state = createAssetLinkState();
  collectRuleAssetLinks(state, options, options.globalStyleRuleKey);
  collectRuleAssetLinks(state, options, FRONTEND_CONFIG_RULE_KEY);
  if (options.globalEntryIds?.length) {
    mergeAssetLinks(state, collectAssetLinks(options.manifest, [...options.globalEntryIds], options.collect));
  }

  const relatedEntries = resolveRelatedEntryIds(options.relatedEntryMap || {}, options.pageIds || []);
  if (relatedEntries.length) {
    mergeAssetLinks(state, collectAssetLinks(options.manifest, relatedEntries, {
          ...options.collect,
          from: "source",
    }));
  }

  const links = finalizeAssetLinks(state);
  return options.renderTags ? { ...links, tags: renderAssetLinkTags(links) } : links;
}

function renderAssetLinkTags(
  links: Pick<BundlerCollectedAssetLinks, "scripts"|"styles">&
  Partial<Pick<BundlerCollectedAssetLinks, "fontPreloads">>,
): BundlerRenderedAssetTags {
  const fontPreloads = (links.fontPreloads || [])
  .map(renderFontPreloadLinkTag)
  .join("\n");
  const styles = links.styles.map((href) => `<link rel="stylesheet" href="${escapeHtmlAttribute(href)}">`).join("\n");
  const scripts = links.scripts.map((src) => `<script type="module" src="${escapeHtmlAttribute(src)}"></script>`).join("\n");
  return {
    fontPreloads,
    html: [fontPreloads, styles, scripts].filter(Boolean).join("\n"),
    scripts,
    styles,
  };
}

function collectRuleAssetLinks(
  state: ReturnType<typeof createAssetLinkState>,
  options: BundlerFrontendAssetLinksOptions,
  ruleKey?: string,
): void {
  if (!ruleKey || !options.manifest.rules[ruleKey]) return;
  mergeAssetLinks(state, collectAssetLinks(options.manifest, [ruleKey], {
        ...options.collect,
        from: "ruleKey",
  }));
}

function resolveRelatedEntryIds(
  relatedEntryMap: Record<string, readonly string[]>,
  pageIds: readonly string[],
): string[] {
  const values = pageIds.flatMap((pageId) => relatedEntryMap[pageId] || []);
  return Array.from(new Set(values)).sort();
}

function createAssetLinkState() {
  return {
    assets: new Set<string>(),
    entryKeys: new Set<string>(),
    fontPreloads: new Map<string, BundlerFontPreloadLink>(),
    missing: new Set<string>(),
    outputs: new Set<string>(),
    scripts: new Set<string>(),
    styles: new Set<string>(),
  };
}

function mergeAssetLinks(state: ReturnType<typeof createAssetLinkState>, links: BundlerCollectedAssetLinks): void {
  links.assets.forEach((value) => state.assets.add(value));
  links.entryKeys.forEach((value) => state.entryKeys.add(value));
  links.fontPreloads.forEach((value) => state.fontPreloads.set(value.href, value));
  links.missing.forEach((value) => state.missing.add(value));
  links.outputs.forEach((value) => state.outputs.add(value));
  links.scripts.forEach((value) => state.scripts.add(value));
  links.styles.forEach((value) => state.styles.add(value));
}

function finalizeAssetLinks(state: ReturnType<typeof createAssetLinkState>): BundlerCollectedAssetLinks {
  return {
    assets: sorted(state.assets),
    entryKeys: sorted(state.entryKeys),
    fontPreloads: sortFontPreloadLinks(state.fontPreloads.values()),
    missing: sorted(state.missing),
    outputs: sorted(state.outputs),
    scripts: sorted(state.scripts),
    styles: sorted(state.styles),
  };
}

function sorted(values: Iterable<string>): string[] {
  return Array.from(values).sort();
}

function renderFontPreloadLinkTag(preload: BundlerFontPreloadLink): string {
  return `<link rel="preload" href="${escapeHtmlAttribute(preload.href)}" as="font" type="${escapeHtmlAttribute(preload.type)}" crossorigin>`;
}

function escapeHtmlAttribute(value: string): string {
  return value
  .replace(/&/gu, "&amp;")
  .replace(/"/gu, "&quot;")
  .replace(/</gu, "&lt;");
}

export {
  collectFrontendAssetLinks,
  renderAssetLinkTags,
};
