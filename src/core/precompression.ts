import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import zlib from "node:zlib";

import type {
  BundlerPrecompressAssetsOptions,
  BundlerPrecompressFormat,
  BundlerPrecompressOptions,
  BundlerPrecompressStats,
  BundlerPrecompressedAsset,
} from "#3c8d8166992a";
import { matchesAnyPattern, normalizePathValue, normalizeStringList } from "./discovery/shared.js";

const brotliCompressAsync = promisify(zlib.brotliCompress);
const gzipAsync = promisify(zlib.gzip);

const DEFAULT_PRECOMPRESS_INCLUDE = ["**/*.js", "**/*.mjs", "**/*.cjs", "**/*.css"];
const DEFAULT_PRECOMPRESS_FORMATS: BundlerPrecompressFormat[] = ["br", "gzip"];
const DEFAULT_PRECOMPRESS_MIN_SIZE = 1024;
const DEFAULT_BROTLI_QUALITY = 11;
const DEFAULT_GZIP_LEVEL = 9;

type NormalizedBundlerPrecompressOptions = {
  brotliQuality: number;
  enabled: boolean;
  exclude: string[];
  formats: BundlerPrecompressFormat[];
  gzipLevel: number;
  include: string[];
  minSize: number;
};

function normalizeBundlerPrecompressOptions(options: BundlerPrecompressOptions | undefined): NormalizedBundlerPrecompressOptions {
  if (!options) return { ...createDefaultPrecompressOptions(), enabled: false };
  if (options === true) return createDefaultPrecompressOptions();

  const include = normalizeStringList(options.include);
  return {
    brotliQuality: clampInteger(options.brotliQuality, 0, 11, DEFAULT_BROTLI_QUALITY),
    enabled: options.enabled !== false,
    exclude: normalizeStringList(options.exclude),
    formats: normalizeFormats(options.formats),
    gzipLevel: clampInteger(options.gzipLevel, 0, 9, DEFAULT_GZIP_LEVEL),
    include: include.length ? include : DEFAULT_PRECOMPRESS_INCLUDE,
    minSize: parseSize(options.minSize, DEFAULT_PRECOMPRESS_MIN_SIZE),
  };
}

async function precompressAssets(options: BundlerPrecompressAssetsOptions): Promise<BundlerPrecompressStats> {
  const outDir = path.resolve(options.outDir);
  const normalized = normalizeBundlerPrecompressOptions({ ...options, enabled: true });
  const sources = await resolvePrecompressSources(outDir, options.outputs);
  const assets: BundlerPrecompressedAsset[] = [];

  for (const sourceAbs of sources) {
    const sourceRel = normalizePathValue(path.relative(outDir, sourceAbs));
    if (!shouldPrecompressSource(sourceRel, normalized)) continue;
    const content = await fs.readFile(sourceAbs);
    if (content.byteLength < normalized.minSize) continue;
    assets.push(...await compressSourceFile(sourceAbs, sourceRel, content, normalized));
  }

  return createPrecompressStats(assets, normalized.formats);
}

async function resolvePrecompressSources(outDir: string, outputs: readonly string[] | undefined): Promise<string[]> {
  if (outputs?.length) {
    return outputs.map((item) => path.isAbsolute(item) ? item : path.resolve(outDir, item)).sort();
  }

  const files: string[] = [];
  await walkOutputFiles(outDir, files);
  return files.sort();
}

async function walkOutputFiles(currentDir: string, files: string[]): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch (() => []);
  for (const entry of entries) {
    const abs = path.join(currentDir, entry.name);
    if (entry.isDirectory()) await walkOutputFiles(abs, files);
    else if (entry.isFile()) files.push(abs);
  }
}

function shouldPrecompressSource(sourceRel: string, options: NormalizedBundlerPrecompressOptions): boolean {
  if (!matchesAnyPattern(sourceRel, options.include)) return false;
  if (matchesAnyPattern(sourceRel, options.exclude)) return false;
  return !/\.(?:br|gz|map)$/iu.test(sourceRel);
}

async function compressSourceFile(
  sourceAbs: string,
  sourceRel: string,
  content: Buffer,
  options: NormalizedBundlerPrecompressOptions,
): Promise<BundlerPrecompressedAsset[]> {
  const assets: BundlerPrecompressedAsset[] = [];
  for (const format of options.formats) {
    const compressed = await compressBuffer(content, format, options);
    const outputRel = `${sourceRel}${format === "br" ? ".br" : ".gz"}`;
    await fs.writeFile(`${sourceAbs}${format === "br" ? ".br" : ".gz"}`, compressed);
    assets.push(createPrecompressedAsset(format, sourceRel, outputRel, content.byteLength, compressed.byteLength));
  }
  return assets;
}

async function compressBuffer(
  content: Buffer,
  format: BundlerPrecompressFormat,
  options: NormalizedBundlerPrecompressOptions,
): Promise<Buffer> {
  if (format === "br") {
    return brotliCompressAsync(content, {
        params: {[zlib.constants.BROTLI_PARAM_QUALITY]: options.brotliQuality },
    });
  }
  return gzipAsync(content, { level: options.gzipLevel });
}

function createPrecompressedAsset(
  format: BundlerPrecompressFormat,
  source: string,
  output: string,
  bytes: number,
  compressedBytes: number,
): BundlerPrecompressedAsset {
  return {
    bytes,
    compressedBytes,
    format,
    output,
    ratio: bytes > 0 ? Number((compressedBytes / bytes).toFixed(4)) : 0,
    source,
  };
}

function createPrecompressStats(
  assets: BundlerPrecompressedAsset[],
  formats: BundlerPrecompressFormat[],
): BundlerPrecompressStats {
  return {
    assets: assets.sort((a, b) => a.output.localeCompare(b.output)),
    formats,
    totalBytes: assets.reduce((sum, item) => sum + item.bytes, 0),
    totalCompressedBytes: assets.reduce((sum, item) => sum + item.compressedBytes, 0),
  };
}

function createDefaultPrecompressOptions(): NormalizedBundlerPrecompressOptions {
  return {
    brotliQuality: DEFAULT_BROTLI_QUALITY,
    enabled: true,
    exclude: [],
    formats: DEFAULT_PRECOMPRESS_FORMATS,
    gzipLevel: DEFAULT_GZIP_LEVEL,
    include: DEFAULT_PRECOMPRESS_INCLUDE,
    minSize: DEFAULT_PRECOMPRESS_MIN_SIZE,
  };
}

function normalizeFormats(values: readonly BundlerPrecompressFormat[] | undefined): BundlerPrecompressFormat[] {
  const formats = (values || DEFAULT_PRECOMPRESS_FORMATS).filter((item) => item === "br" || item === "gzip");
  return Array.from(new Set(formats.length ? formats : DEFAULT_PRECOMPRESS_FORMATS));
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function parseSize(value: number | string | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/iu);
  if (!match) return fallback;
  return Math.floor(Number(match[1]) * sizeMultiplier(match[2] || "b"));
}

function sizeMultiplier(unit: string): number {
  const normalized = unit.toLowerCase();
  if (normalized === "gb") return 1024 * 1024 * 1024;
  if (normalized === "mb") return 1024 * 1024;
  if (normalized === "kb") return 1024;
  return 1;
}

export {
  normalizeBundlerPrecompressOptions,
  precompressAssets,
};
export type { NormalizedBundlerPrecompressOptions };
