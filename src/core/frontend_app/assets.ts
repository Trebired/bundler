import type {
  BundlerCollectedAssetLinks,
  BundlerFrontendAssetLinks,
  BundlerFrontendAssetLinksOptions,
  BundlerRenderedAssetTags,
} from "#3c8d8166992a";
import { collectAssetLinks } from "#17f3fba84f54";

function collectFrontendAssetLinks(options: BundlerFrontendAssetLinksOptions): BundlerFrontendAssetLinks {
  const state = createAssetLinkState();
  if (options.globalStyleRuleKey) {
    mergeAssetLinks(state, collectAssetLinks(options.manifest, [options.globalStyleRuleKey], {
      ...options.collect,
      from: "ruleKey",
    }));
  }
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

function renderAssetLinkTags(links: Pick<BundlerCollectedAssetLinks, "scripts" | "styles">): BundlerRenderedAssetTags {
  const styles = links.styles.map((href) => `<link rel="stylesheet" href="${escapeHtmlAttribute(href)}">`).join("\n");
  const scripts = links.scripts.map((src) => `<script type="module" src="${escapeHtmlAttribute(src)}"></script>`).join("\n");
  return {
    html: [styles, scripts].filter(Boolean).join("\n"),
    scripts,
    styles,
  };
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
    missing: new Set<string>(),
    outputs: new Set<string>(),
    scripts: new Set<string>(),
    styles: new Set<string>(),
  };
}

function mergeAssetLinks(state: ReturnType<typeof createAssetLinkState>, links: BundlerCollectedAssetLinks): void {
  links.assets.forEach((value) => state.assets.add(value));
  links.entryKeys.forEach((value) => state.entryKeys.add(value));
  links.missing.forEach((value) => state.missing.add(value));
  links.outputs.forEach((value) => state.outputs.add(value));
  links.scripts.forEach((value) => state.scripts.add(value));
  links.styles.forEach((value) => state.styles.add(value));
}

function finalizeAssetLinks(state: ReturnType<typeof createAssetLinkState>): BundlerCollectedAssetLinks {
  return {
    assets: sorted(state.assets),
    entryKeys: sorted(state.entryKeys),
    missing: sorted(state.missing),
    outputs: sorted(state.outputs),
    scripts: sorted(state.scripts),
    styles: sorted(state.styles),
  };
}

function sorted(values: Iterable<string>): string[] {
  return Array.from(values).sort();
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
