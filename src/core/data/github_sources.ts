import {
  DEFAULT_ASSET_KINDS,
  DEFAULT_CONCURRENCY,
  DEFAULT_PER_PAGE,
  requestGithub,
} from "./github.js";
import type {
  GithubManifestOptions,
  GithubReleaseAsset,
  GithubReleaseSourceOptions,
  GithubReleaseValue,
  GithubRepoRow,
  GithubReposSourceOptions,
} from "./github.js";
import type { BundlerDataSource, BundlerDataSourceContext, BundlerDataSourceResult } from "#3c8d8166992a";

type RawRepo = {
  archived?: boolean;
  clone_url?: string;
  fork?: boolean;
  html_url?: string;
  language?: string | null;
  license?: { name?: string | null; spdx_id?: string | null } | null;
  name?: string;
  private?: boolean;
  pushed_at?: string;
};

type RawRelease = {
  assets?: { browser_download_url?: string; name?: string; size?: number }[];
  html_url?: string;
  published_at?: string;
  tag_name?: string;
};

function licenseLabel(license: RawRepo["license"]): string {
  const spdx = String(license?.spdx_id || "").trim();
  if (spdx && spdx !== "NOASSERTION") return spdx;
  return String(license?.name || "").trim();
}

function isPublished(repo: RawRepo): boolean {
  return Boolean(repo.name) && !repo.fork && !repo.archived && !repo.private;
}

function toRepoRow(repo: RawRepo): GithubRepoRow {
  return {
    cloneUrl: String(repo.clone_url || ""),
    language: String(repo.language || ""),
    license: licenseLabel(repo.license),
    name: String(repo.name || ""),
    pushedAt: String(repo.pushed_at || ""),
    url: String(repo.html_url || ""),
  };
}

function assetKindOf(name: string, kinds: Record<string, string[]>): string {
  const lower = name.toLowerCase();
  for (const [kind, suffixes] of Object.entries(kinds)) {
    if (suffixes.some((suffix) => lower.endsWith(suffix))) return kind;
  }
  return "other";
}

function toReleaseAssets(release: RawRelease, options: GithubReleaseSourceOptions): GithubReleaseAsset[] {
  const kinds = options.assetKinds || DEFAULT_ASSET_KINDS;
  return (release.assets || [])
  .map((asset) => ({
        kind: assetKindOf(String(asset.name || ""), kinds),
        name: String(asset.name || ""),
        size: Number(asset.size || 0),
        url: String(asset.browser_download_url || ""),
  }))
  .filter((asset) => asset.url && (options.keepUnknownAssets || asset.kind !== "other"));
}

async function readRepos(
  options: GithubReposSourceOptions,
  context: BundlerDataSourceContext,
): Promise<BundlerDataSourceResult> {
  const perPage = options.perPage || DEFAULT_PER_PAGE;
  const url = `https://api.github.com/orgs/${options.org}/repos?per_page=${perPage}&sort=pushed`;
  const payload = await requestGithub<RawRepo[]>(url, options);
  if (!Array.isArray(payload)) throw new Error(`github returned an unexpected payload for ${options.org}`);
  const filtered = options.include === "all" ? payload : payload.filter(isPublished);
  const rows = filtered.map(toRepoRow);
  if (rows.length === 0) throw new Error(`github returned no repositories for ${options.org}`);
  return {
    detail: `${rows.length} repositories from ${options.org}`,
    value: options.map ? await options.map(rows, context) : rows,
  };
}

async function readRelease(
  options: GithubReleaseSourceOptions,
  context: BundlerDataSourceContext,
): Promise<BundlerDataSourceResult> {
  const url = `https://api.github.com/repos/${options.org}/${options.repo}/releases/latest`;
  const release = await requestGithub<RawRelease>(url, options);
  const tag = String(release.tag_name || "");
  if (!tag) throw new Error(`${options.org}/${options.repo} has a release with no tag`);
  const assets = toReleaseAssets(release, options);
  if (assets.length === 0) throw new Error(`${options.org}/${options.repo} ${tag} carries no installable asset`);
  const value: GithubReleaseValue = {
    assets,
    fetchedAt: new Date().toISOString(),
    org: options.org,
    publishedAt: String(release.published_at || ""),
    releasesUrl: `https://github.com/${options.org}/${options.repo}/releases`,
    repo: options.repo,
    tag,
    url: String(release.html_url || ""),
  };
  return {
    detail: `${options.repo} ${tag}, ${assets.length} assets`,
    value: options.map ? await options.map(value, context) : value,
  };
}

function githubReposSource(options: GithubReposSourceOptions): BundlerDataSource {
  return { fetch: (context) => readRepos(options, context) };
}

function githubReleaseSource(options: GithubReleaseSourceOptions): BundlerDataSource {
  return { fetch: (context) => readRelease(options, context) };
}

async function fetchRepoFiles<TPayload>(options: GithubManifestOptions): Promise<Map<string, TPayload>> {
  const found = new Map<string, TPayload>();
  const queue = [...options.repos];
  const workers = Array.from({ length: Math.min(options.concurrency || DEFAULT_CONCURRENCY, queue.length) }, async() => {
      for (let repo = queue.shift(); repo; repo = queue.shift()) {
        const url = `https://raw.githubusercontent.com/${options.org}/${repo}/HEAD/${options.path}`;
        try {
          found.set(repo, await requestGithub<TPayload>(url, options));
        } catch {
          continue;
        }
      }
  });
  await Promise.all(workers);
  return found;
}

export { fetchRepoFiles, githubReleaseSource, githubReposSource };
