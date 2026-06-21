import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const packageJsonPath = path.join(rootDir, "package.json");

async function main() {
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  const aliasTargets = Object.fromEntries(
    Object.entries(packageJson.imports || {}).map(([alias, target]) => [alias, String(target)]),
  );
  await promotePublicDistFiles();

  const files = await collectDistFiles(distDir);
  await Promise.all(files.map(async (filePath) => {
    const kind = filePath.endsWith(".d.ts") ? "types" : "runtime";
    const original = await fs.readFile(filePath, "utf8");
    const rewritten = rewriteAliasImports(original, filePath, aliasTargets, kind);
    if (rewritten !== original) await fs.writeFile(filePath, rewritten);
  }));
}

async function collectDistFiles(startDir) {
  const files = [];
  const stack = [startDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
        continue;
      }
      if (entry.isFile() && (nextPath.endsWith(".js") || nextPath.endsWith(".d.ts"))) {
        files.push(nextPath);
      }
    }
  }

  return files;
}

function rewriteAliasImports(source, filePath, aliasTargets, kind) {
  return source.replace(/(["'])(#[^"']+)\1/g, (match, quote, alias) => {
    const target = aliasTargets[alias];
    if (!target) return match;

    const compiledPath = resolveCompiledTarget(target, kind);
    if (!compiledPath) return match;

    const relativePath = toRelativeImport(path.relative(path.dirname(filePath), compiledPath));
    return `${quote}${relativePath}${quote}`;
  });
}

function resolveCompiledTarget(target, kind) {
  const normalized = normalizePath(target);
  if (!normalized.startsWith("src/") && !normalized.startsWith("internal/")) return undefined;

  const baseDir = normalized.startsWith("src/") ? "dist/src" : "dist/internal";
  const relativeTarget = normalized.replace(/^(src|internal)\//u, "");
  const compiledRelative = relativeTarget.replace(/\.(ts|tsx|js|jsx)$/u, kind === "types" ? ".d.ts" : ".js");
  return path.join(rootDir, baseDir, compiledRelative);
}

function toRelativeImport(value) {
  const normalized = normalizePath(value);
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

function normalizePath(value) {
  return value.replace(/\\/g, "/").replace(/^\.\//u, "");
}

async function promotePublicDistFiles() {
  const publicDistDir = path.join(distDir, "src");
  await fs.cp(publicDistDir, distDir, { force: true, recursive: true });
}

await main();
