import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type PackageJson = {
  config?: {
    organization?: {
      name?: string;
    };
  };
  name?: string;
};

function findPackageMetadataPath(): string | null {
  let current = path.dirname(fileURLToPath(import.meta.url));

  for (let index = 0; index < 8; index += 1) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate)) return candidate;

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

function readPackageMetadata(): PackageJson {
  const packageJsonPath = findPackageMetadataPath();
  if (!packageJsonPath) return {};

  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as PackageJson;
  } catch {
    return {};
  }
}

function packageScope(name: string): string {
  return new RegExp("^@([^/]+)/").exec(name)?.[1] ?? "";
}

function packageSlug(name: string): string {
  return name.replace(new RegExp("^@[^/]+/"), "").trim();
}

const packageJson = readPackageMetadata();
const PACKAGE_JSON_NAME = typeof packageJson.name === "string" ? packageJson.name.trim() : "";
const PACKAGE_CONFIG_ORGANIZATION_NAME = typeof packageJson.config?.organization?.name === "string"
? packageJson.config.organization.name.trim()
: "";
const PACKAGE_NAME = PACKAGE_JSON_NAME || (PACKAGE_CONFIG_ORGANIZATION_NAME ? `@${PACKAGE_CONFIG_ORGANIZATION_NAME}/bundler` : "bundler");
const PACKAGE_ORGANIZATION_NAME = PACKAGE_CONFIG_ORGANIZATION_NAME || packageScope(PACKAGE_JSON_NAME);
const PACKAGE_SLUG = packageSlug(PACKAGE_NAME) || "bundler";
const PACKAGE_WORKSPACE_CONFIG_DIR = PACKAGE_ORGANIZATION_NAME ? `.${PACKAGE_ORGANIZATION_NAME}` : "";

function buildPackageLogGroup(...parts: string[]): string {
  return [PACKAGE_ORGANIZATION_NAME, PACKAGE_SLUG, ...parts]
  .map((part) => part.trim())
  .filter(Boolean)
  .join(".");
}

export {
  buildPackageLogGroup,
  PACKAGE_NAME,
  PACKAGE_ORGANIZATION_NAME,
  PACKAGE_SLUG,
  PACKAGE_WORKSPACE_CONFIG_DIR,
};
