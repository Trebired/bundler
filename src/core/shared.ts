import fs from "node:fs/promises";
import path from "node:path";
import type { BuildResult, Message } from "esbuild";

import type { BundlerBuildResult, BundlerEntryRecord, NormalizedBundlerLogger } from "../types.js";
import { buildAssetManifest } from "./asset-manifest.js";
import { toPublicEntryMap } from "./discovery.js";
import type { DuplicateBundlerEntryRecord } from "./discovery.js";
import { writeBundlerManifest } from "./manifest.js";
import type { NormalizedManifestOptions } from "./discovery.js";

function formatEsbuildMessage(message: Partial<Message>): string {
  const location = message.location
    ? `${message.location.file}:${message.location.line}:${message.location.column}`
    : "";
  const pieces = [location, message.text].filter(Boolean);
  return pieces.join(" :: ");
}

function logWarnings(logger: NormalizedBundlerLogger, warnings: Message[]): void {
  for (const warning of warnings) {
    logger.warn("build", formatEsbuildMessage(warning));
  }
}

function formatEntryPath(record: BundlerEntryRecord, rootDir: string): string {
  return record.source === "virtual"
    ? `virtual:${record.name}`
    : toPublicEntryMap([record], rootDir)[record.name] || record.path;
}

function logDuplicateEntries(args: {
  duplicates: DuplicateBundlerEntryRecord[];
  logger: NormalizedBundlerLogger;
  rootDir: string;
}): void {
  for (const duplicate of args.duplicates) {
    args.logger.warn("entries", "duplicate-entry-pruned", {
      dropped_entry: duplicate.dropped.name,
      dropped_path: formatEntryPath(duplicate.dropped, args.rootDir),
      dropped_source: duplicate.dropped.source,
      kept_entry: duplicate.kept.name,
      kept_path: formatEntryPath(duplicate.kept, args.rootDir),
      kept_source: duplicate.kept.source,
    });
  }
}

function resolveOutputs(result: BuildResult<any>, rootDir: string): string[] {
  if (!result.metafile) return [];

  return Object.keys(result.metafile.outputs)
    .map((value) => path.isAbsolute(value) ? value : path.resolve(rootDir, value))
    .sort();
}

async function toBuildResult(args: {
  entries: BundlerEntryRecord[];
  manifest: NormalizedManifestOptions;
  outDir: string;
  result: BuildResult<any>;
  rootDir: string;
  startedAt: number;
}): Promise<BundlerBuildResult> {
  const outputs = resolveOutputs(args.result, args.rootDir);
  const assetManifest = args.result.metafile
    ? buildAssetManifest({
      metafile: args.result.metafile,
      outDir: args.outDir,
      rootDir: args.rootDir,
      resolvedEntries: args.entries,
    })
    : undefined;
  const manifestWrite = await writeBundlerManifest({
    entries: args.entries,
    metafile: args.result.metafile,
    manifest: args.manifest,
    outDir: args.outDir,
    rootDir: args.rootDir,
  });

  return {
    entries: toPublicEntryMap(args.entries, args.rootDir),
    outputs,
    warnings: args.result.warnings.length,
    metafile: args.result.metafile,
    assetManifest,
    manifestPath: manifestWrite.manifestPath,
    durationMs: Date.now() - args.startedAt,
  };
}

async function cleanOutDir(outDir: string): Promise<void> {
  await fs.rm(outDir, { force: true, recursive: true });
}

function formatFailure(error: unknown): string {
  if (error && typeof error === "object" && Array.isArray((error as { errors?: unknown[] }).errors)) {
    const errors = (error as { errors: Partial<Message>[] }).errors;
    return errors.map(formatEsbuildMessage).join(" | ");
  }

  return error instanceof Error ? error.message : String(error);
}

export { cleanOutDir, formatFailure, logDuplicateEntries, logWarnings, toBuildResult };
