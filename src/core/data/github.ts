import type { BundlerDataSource, BundlerDataSourceContext, BundlerDataSourceResult } from "#3c8d8166992a";

type GithubRequestOptions = {
  org: string;
  timeout?: number;
  token?: string;
  userAgent?: string;
};

type GithubRepoRow = {
  cloneUrl: string;
  language: string;
  license: string;
  name: string;
  pushedAt: string;
  url: string;
};

type GithubReleaseAsset = { kind: string; name: string; size: number; url: string };

type GithubReleaseValue = {
  assets: GithubReleaseAsset[];
  fetchedAt: string;
  org: string;
  publishedAt: string;
  releasesUrl: string;
  repo: string;
  tag: string;
  url: string;
};

type GithubReposSourceOptions = GithubRequestOptions& {
  include?: "all" | "published";
  map?: (rows: GithubRepoRow[], context: BundlerDataSourceContext) => Promise<unknown>|unknown;
  perPage?: number;
};

type GithubReleaseSourceOptions = GithubRequestOptions& {
  assetKinds?: Record<string, string[]>;
  keepUnknownAssets?: boolean;
  map?: (release: GithubReleaseValue, context: BundlerDataSourceContext) => Promise<unknown>|unknown;
  repo: string;
};

type GithubManifestOptions = GithubRequestOptions& {
  concurrency?: number;
  path: string;
  repos: string[];
};

const DEFAULT_TIMEOUT = 15000;
const DEFAULT_PER_PAGE = 100;
const DEFAULT_CONCURRENCY = 6;
const DEFAULT_ASSET_KINDS: Record<string, string[]> = {
  appimage: [".appimage"],
  deb: [".deb"],
  dmg: [".dmg"],
  exe: [".exe"],
  rpm: [".rpm"],
  tar: [".tar.gz", ".tar.xz", ".tgz"],
  zip: [".zip"],
};

function requestHeaders(options: GithubRequestOptions): Record<string, string> {
  const token = options.token || process.env.GITHUB_TOKEN || "";
  return {
    "accept": "application/vnd.github+json",
    "user-agent": options.userAgent || `${options.org}-build`,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function requestGithub<TPayload>(url: string, options: GithubRequestOptions): Promise<TPayload> {
  const response = await fetch(url, {
      headers: requestHeaders(options),
      signal: AbortSignal.timeout(options.timeout || DEFAULT_TIMEOUT),
  });
  if (!response.ok) throw new Error(`github responded ${response.status} for ${url}`);
  return await response.json() as TPayload;
}

export { DEFAULT_ASSET_KINDS, DEFAULT_CONCURRENCY, DEFAULT_PER_PAGE, requestGithub };
export type {
  GithubManifestOptions,
  GithubReleaseAsset,
  GithubReleaseSourceOptions,
  GithubReleaseValue,
  GithubRepoRow,
  GithubReposSourceOptions,
  GithubRequestOptions,
  BundlerDataSource as GithubSource,
  BundlerDataSourceResult as GithubSourceResult,
};
