import fs from "node:fs";
import path from "node:path";

import { toObject } from "#5zpn5tshpwdi";

type PackageJson = {
  exports?: Record<string, unknown>|string;
  sass?: string;
  style?: string;
};

type PackageSpecifier = {
  packageName: string;
  subpath: string;
};

type PackageResolutionContext = {
  resolveSassFileCandidate(candidatePath: string): string;
  rootDir: string;
};

function parsePackageSpecifier(specifier: string): PackageSpecifier | null {
  if (
    !specifier
    ||specifier.startsWith(".")
    ||specifier.startsWith("/")
    ||specifier.startsWith("#")
    ||/^[a-z][a-z0-9+.-]*:/iu.test(specifier)
  ) {
    return null;
  }

  const parts = specifier.split("/");
  const scoped = specifier.startsWith("@");
  const packageName = scoped ? parts.slice(0, 2).join("/") : parts[0] || "";
  if (!packageName || (scoped && parts.length < 2)) return null;
  const subpathParts = parts.slice(scoped ? 2 : 1);
  return {
    packageName,
    subpath: subpathParts.length > 0 ? `./${subpathParts.join("/")}` : ".",
  };
}

function findPackageManifestPath(rootDir: string, packageName: string): string {
  let current = path.resolve(rootDir);

  while (true) {
    const candidate = path.join(current, "node_modules", packageName, "package.json");
    if (fs.existsSync(candidate)) return candidate;

    const parent = path.dirname(current);
    if (parent === current) return "";
    current = parent;
  }
}

function readPackageManifest(packageJsonPath: string): PackageJson {
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as PackageJson;
}

function resolvePackageExportTarget(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const resolved = resolvePackageExportTarget(entry);
      if (resolved) return resolved;
    }
  }
  const record = toObject(value);
  if (Object.keys(record).length > 0) {
    for (const condition of ["sass", "style", "import", "default"]) {
      const resolved = resolvePackageExportTarget(record[condition]);
      if (resolved) return resolved;
    }
  }
  return "";
}

function resolvePackageExport(packageJson: PackageJson, subpath: string): string {
  if (subpath === ".") {
    const rootExport = resolvePackageExportTarget(packageJson.exports);
    if (rootExport) return rootExport;
    return packageJson.sass || packageJson.style || "";
  }

  return resolvePackageExportTarget(toObject(packageJson.exports)[subpath]);
}

function resolvePackageFallbackPath(
  context: PackageResolutionContext,
  packageRoot: string,
  subpath: string,
): string {
  if (subpath === ".") return "";
  return context.resolveSassFileCandidate(path.resolve(packageRoot, subpath.slice(2)));
}

function resolvePackageFilePath(context: PackageResolutionContext, specifier: string): string {
  const parsed = parsePackageSpecifier(specifier);
  if (!parsed) return "";
  const packageJsonPath = findPackageManifestPath(context.rootDir, parsed.packageName);
  if (!packageJsonPath) return "";
  const packageRoot = path.dirname(packageJsonPath);
  const packageJson = readPackageManifest(packageJsonPath);
  const exported = resolvePackageExport(packageJson, parsed.subpath);
  if (exported) {
    if (!exported.startsWith("./")) return "";
    return context.resolveSassFileCandidate(path.resolve(packageRoot, exported));
  }
  return resolvePackageFallbackPath(context, packageRoot, parsed.subpath);
}

export { resolvePackageFilePath };
