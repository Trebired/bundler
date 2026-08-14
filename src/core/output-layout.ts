import fs from "node:fs/promises";
import path from "node:path";
import type { BuildResult } from "esbuild";

import type {
  BundlerOutputLayoutKind,
  BundlerOutputLayoutOptions,
  BundlerOutputLayoutStats,
} from "#3c8d8166992a";
import { resolveOutputs } from "./shared.js";
import { escapeRegExp, normalizePathValue, toPosixPath } from "./discovery/shared.js";

type NormalizedBundlerOutputLayoutOptions = {
  enabled: boolean;
  patterns: {
    asset?: string;
    css?: string;
    js?: string;
    map?: string | "alongside";
  };
};

type OutputPlan = {
  bytes: number;
  kind: BundlerOutputLayoutKind;
  oldAbs: string;
  oldKey: string;
  oldRel: string;
  newAbs: string;
  newKey: string;
  newRel: string;
};

const DEFAULT_OUTPUT_LAYOUT_PATTERNS = {
  asset: "assets/[path][ext]",
  css: "css/[path][ext]",
  js: "js/[path][ext]",
  map: "alongside"as const,
};
const DOT_SLASH_PREFIX = new RegExp("^\\.\\/", "u");

function normalizeBundlerOutputLayoutOptions(options: BundlerOutputLayoutOptions | undefined): NormalizedBundlerOutputLayoutOptions {
  if (!options) return { enabled: false, patterns: {} };
  if (options === true) return { enabled: true, patterns: DEFAULT_OUTPUT_LAYOUT_PATTERNS };
  return {
    enabled: true,
    patterns: {
      asset: normalizePattern(options.asset),
      css: normalizePattern(options.css),
      js: normalizePattern(options.js),
      map: options.map === "alongside" ? "alongside" : normalizePattern(options.map) || "alongside",
    },
  };
}

async function applyOutputLayout(args: {
    outDir: string;
    outputLayout: NormalizedBundlerOutputLayoutOptions;
    publicPath?: string;
    result: BuildResult<any>;
    rootDir: string;
}): Promise<{outputs:string[];stats?:BundlerOutputLayoutStats}> {
  const outputs = resolveOutputs(args.result, args.rootDir);
  if (!args.outputLayout.enabled || !args.result.metafile) return { outputs };

  const plans = createOutputPlans(args);
  await rewriteAndMoveOutputs(plans, args.publicPath);
  updateMetafileOutputs(args.result, plans, args.rootDir, args.outDir);
  return {
    outputs: plans.map((plan) => plan.newAbs).sort(),
    stats: { moved: plans.filter((plan) => plan.oldRel !== plan.newRel).map(toLayoutMove) },
  };
}

function createOutputPlans(args: {
    outDir: string;
    outputLayout: NormalizedBundlerOutputLayoutOptions;
    result: BuildResult<any>;
    rootDir: string;
}): OutputPlan[] {
  const outDir = path.resolve(args.outDir);
  const records = Object.entries(args.result.metafile?.outputs || {}).map(([oldKey, info]) => ({
        bytes: info.bytes,
        kind: detectOutputKind(oldKey),
        oldAbs: path.isAbsolute(oldKey) ? oldKey : path.resolve(args.rootDir, oldKey),
        oldKey,
        oldRel: normalizePathValue(path.relative(
            outDir,
            path.isAbsolute(oldKey) ? oldKey : path.resolve(args.rootDir, oldKey),
        )),
  }));
  const planned = planOutputTargets(records, args.outputLayout.patterns);
  validateOutputPlans(planned);
  return planned.map((plan) => ({
        ...plan,
        newAbs: path.resolve(outDir, plan.newRel),
        newKey: toMetafileKey(plan.oldKey, args.rootDir, outDir, plan.newRel),
  }));
}

function planOutputTargets(
  records: Array<Omit<OutputPlan, "newAbs"|"newKey"|"newRel">>,
  patterns: NormalizedBundlerOutputLayoutOptions["patterns"],
): Array<Omit<OutputPlan, "newAbs"|"newKey">> {
  const nonMapTargets = new Map<string, string>();
  const planned = records.map((record) => {
      const newRel = record.kind === "map" ? "" : applyOutputPattern(record.oldRel, patterns[record.kind]);
      if (newRel) nonMapTargets.set(record.oldRel, newRel);
      return { ...record, newRel };
  });

  return planned.map((record) => record.newRel ? record : {
      ...record,
      newRel: resolveMapOutputTarget(record.oldRel, nonMapTargets, patterns.map),
  });
}

function resolveMapOutputTarget(oldRel: string, nonMapTargets: Map<string, string>, pattern: string | "alongside" | undefined): string {
  if (pattern === "alongside") {
    const mappedParent = nonMapTargets.get(oldRel.replace(/\.map$/iu, ""));
    if (mappedParent) return `${mappedParent}.map`;
  }
  return applyOutputPattern(oldRel, pattern === "alongside" ? undefined : pattern);
}

function applyOutputPattern(oldRel: string, patternValue: string | undefined): string {
  if (!patternValue) return oldRel;
  const ext = path.posix.extname(oldRel);
  const pathWithoutExt = ext ? oldRel.slice(0, -ext.length) : oldRel;
  const dir = path.posix.dirname(oldRel);
  const normalizedDir = dir === "." ? "" : dir;
  const name = path.posix.basename(pathWithoutExt);

  return normalizePathValue(patternValue
    .replace(/\[dir\]/gu, normalizedDir)
    .replace(/\[ext\]/gu, ext)
    .replace(/\[name\]/gu, name)
    .replace(/\[path\]/gu, pathWithoutExt));
}

async function rewriteAndMoveOutputs(plans: OutputPlan[], publicPath: string | undefined): Promise<void> {
  await createOutputParents(plans);
  await Promise.all(plans.filter((plan) => !needsContentRewrite(plan)).map(moveOutputFile));
  const payloads = await Promise.all(plans.filter(needsContentRewrite).map(async(plan) => ({
          content: await readOutputContent(plan, plans, publicPath),
          plan,
  })));
  await Promise.all(payloads.map(async(payload) => {
        await fs.writeFile(payload.plan.newAbs, payload.content);
        payload.plan.bytes = payload.content.byteLength;
  }));
  await removeOldOutputs(plans);
}

async function createOutputParents(plans: OutputPlan[]): Promise<void> {
  const dirs = Array.from(new Set(plans.map((plan) => path.dirname(plan.newAbs))));
  await Promise.all(dirs.map((dir) => fs.mkdir(dir, { recursive: true })));
}

function needsContentRewrite(plan: OutputPlan): boolean {
  return plan.kind === "js" || plan.kind === "css" || plan.kind === "map";
}

async function moveOutputFile(plan: OutputPlan): Promise<void> {
  if (plan.oldAbs === plan.newAbs) return;
  try {
    await fs.rename(plan.oldAbs, plan.newAbs);
  } catch (error) {
    if (!isCrossDeviceRenameError(error)) throw error;
    await fs.copyFile(plan.oldAbs, plan.newAbs);
  }
}

function isCrossDeviceRenameError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "EXDEV");
}

async function readOutputContent(plan: OutputPlan, plans: OutputPlan[], publicPath: string | undefined): Promise<Buffer> {
  const content = await fs.readFile(plan.oldAbs);
  if (plan.kind === "map") return Buffer.from(rewriteSourceMap(content.toString("utf8"), plan));
  if (plan.kind === "js" || plan.kind === "css") {
    return Buffer.from(rewriteOutputReferences(content.toString("utf8"), plan, plans, publicPath));
  }
  return content;
}

function rewriteOutputReferences(text: string, source: OutputPlan, plans: OutputPlan[], publicPath: string | undefined): string {
  let next = text;
  for (const target of plans) {
    next = replaceOutputReference(next, toRelativeReference(source.oldRel, target.oldRel), toRelativeReference(source.newRel, target.newRel));
    if (publicPath) next = replaceOutputReference(next, toPublicReference(publicPath, target.oldRel), toPublicReference(publicPath, target.newRel));
  }
  return next;
}

function rewriteSourceMap(text: string, plan: OutputPlan): string {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed.file === "string") parsed.file = sourceMapFileReference(plan);
    if (Array.isArray(parsed.sources)) parsed.sources = parsed.sources.map((item: unknown) => rewriteSourceMapSource(String(item), plan));
    return `${JSON.stringify(parsed)}\n`;
  } catch {
    return text;
  }
}

function rewriteSourceMapSource(source: string, plan: OutputPlan): string {
  if (!source || /^[a-z]+:/iu.test(source) || source.startsWith("/")) return source;
  const original = normalizePathValue(path.posix.join(path.posix.dirname(plan.oldRel), source));
  return toRelativeReference(plan.newRel, original);
}

function sourceMapFileReference(plan: OutputPlan): string {
  if (!plan.newRel.endsWith(".map")) return path.posix.basename(plan.newRel);
  const parent = plan.newRel.slice(0, -".map".length);
  return toRelativeReference(plan.newRel, parent);
}

function replaceOutputReference(text: string, from: string, to: string): string {
  if (!from ||from === to) return text;
  const replacements: Array<[string, string]> = [[from, to]];
  if (from.startsWith("./")) {
    replacements.push([from.slice(2), to.replace(DOT_SLASH_PREFIX, "")]);
  }
  if (!replacements.some(([value]) => text.includes(value))) return text;
  const pattern = new RegExp(replacements.map(([value]) => escapeRegExp(value)).join("|"), "gu");
  const byReference = new Map(replacements);
  return text.replace(pattern, (match: string, offset: number, sourceText: string) => {
      if (match !== from &&!isBareOutputReference(sourceText, offset, match.length)) {
        return match;
      }
      return byReference.get(match) || match;
  });
}

function isBareOutputReference(text: string, start: number, length: number): boolean {
  const before = start > 0 ? text[start - 1] : "";
  const after = text[start + length] || "";
  return !/[./\w~-]/u.test(before) && !/[./\w~-]/u.test(after);
}

async function removeOldOutputs(plans: OutputPlan[]): Promise<void> {
  const newPaths = new Set(plans.map((plan) => path.resolve(plan.newAbs)));
  await Promise.all(plans
    .filter((plan) => plan.oldAbs !== plan.newAbs && !newPaths.has(path.resolve(plan.oldAbs)))
    .map((plan) => fs.rm(plan.oldAbs, { force: true })));
}

function updateMetafileOutputs(result: BuildResult<any>, plans: OutputPlan[], rootDir: string, outDir: string): void {
  if (!result.metafile) return;
  const byOldRel = new Map(plans.map((plan) => [plan.oldRel, plan]));
  const outputs = Object.fromEntries(plans.map((plan) => {
        const previous = result.metafile!.outputs[plan.oldKey];
        return [plan.newKey, remapOutputInfo(previous, byOldRel, rootDir, outDir, plan.bytes)];
  }));
  result.metafile.outputs = outputs;
}

function remapOutputInfo(
  output: NonNullable<BuildResult<any>["metafile"]>["outputs"][string],
  byOldRel: Map<string, OutputPlan>,
  rootDir: string,
  outDir: string,
  bytes: number,
) {
  return {
    ...output,
    bytes,
    cssBundle: output.cssBundle ? remapMetafilePath(output.cssBundle, byOldRel, rootDir, outDir) : undefined,
    imports: output.imports.map((item) => item.external ? item : { ...item, path: remapMetafilePath(item.path, byOldRel, rootDir, outDir) }),
  };
}

function remapMetafilePath(value: string, byOldRel: Map<string, OutputPlan>, rootDir: string, outDir: string): string {
  const abs = path.isAbsolute(value) ? value : path.resolve(rootDir, value);
  const oldRel = normalizePathValue(path.relative(path.resolve(outDir), abs));
  const plan = byOldRel.get(oldRel);
  if (!plan) return value;
  return path.isAbsolute(value) ? plan.newAbs : normalizePathValue(path.relative(rootDir, plan.newAbs));
}

function detectOutputKind(outputPath: string): BundlerOutputLayoutKind {
  const normalized = outputPath.toLowerCase();
  if (normalized.endsWith(".map")) return "map";
  if (/\.(?:[cm]?js)$/iu.test(normalized)) return "js";
  if (normalized.endsWith(".css")) return "css";
  return "asset";
}

function toRelativeReference(fromRel: string, toRel: string): string {
  const fromDir = path.posix.dirname(normalizePathValue(fromRel));
  const relative = normalizePathValue(path.posix.relative(fromDir === "." ? "" : fromDir, normalizePathValue(toRel)));
  if (!relative || relative.startsWith("..")) return relative;
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function toPublicReference(publicPath: string, outputRel: string): string {
  const base = String(publicPath || "").trim();
  const normalized = normalizePathValue(outputRel);
  if (!base) return normalized;
  if (base === "/") return `/${normalized}`;
  return `${base.replace(/\/+$/gu, "")}/${normalized}`;
}

function toMetafileKey(oldKey: string, rootDir: string, outDir: string, newRel: string): string {
  const newAbs = path.resolve(outDir, newRel);
  return path.isAbsolute(oldKey) ? newAbs : normalizePathValue(path.relative(rootDir, newAbs));
}

function validateOutputPlans(plans: Array<Omit<OutputPlan, "newAbs"|"newKey">>): void {
  const seen = new Map<string, string>();
  for (const plan of plans) {
    if (!plan.newRel || plan.newRel.startsWith("..")) throw new Error(`bundler-output-layout-invalid-path :: ${plan.oldRel}`);
    const existing = seen.get(plan.newRel);
    if (existing && existing !== plan.oldRel) throw new Error(`bundler-output-layout-conflict :: ${existing} :: ${plan.oldRel} -> ${plan.newRel}`);
    seen.set(plan.newRel, plan.oldRel);
  }
}

function normalizePattern(value: string | undefined): string | undefined {
  return value ? toPosixPath(String(value).trim()).replace(/^\.\/+/, "") : undefined;
}

function toLayoutMove(plan: OutputPlan) {
  return {
    bytes: plan.bytes,
    from: plan.oldRel,
    kind: plan.kind,
    to: plan.newRel,
  };
}

export {
  applyOutputLayout,
  normalizeBundlerOutputLayoutOptions,
};
export type { NormalizedBundlerOutputLayoutOptions };
