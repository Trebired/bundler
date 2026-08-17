import {
  joinLogGroup,
  packageSlug,
  readOrganizationIdentity,
  readPackageJsonUrl,
  toTrimmedString,
} from "@trebired/utils";

const packageJson = readPackageJsonUrl(new URL("../package.json", import.meta.url));
const organization = readOrganizationIdentity({ packageJson });

const PACKAGE_ORGANIZATION_NAME = organization.name;
const PACKAGE_NAME = toTrimmedString(packageJson?.name) || `@${PACKAGE_ORGANIZATION_NAME}/bundler`;
const PACKAGE_VERSION = toTrimmedString(packageJson?.version, "5.1.4");
const PACKAGE_SLUG = packageSlug(PACKAGE_NAME) || "bundler";
const PACKAGE_WORKSPACE_CONFIG_DIR = PACKAGE_ORGANIZATION_NAME ? `.${PACKAGE_ORGANIZATION_NAME}` : "";
const buildPackageLogGroup = (...parts: unknown[]) => joinLogGroup(PACKAGE_ORGANIZATION_NAME, PACKAGE_SLUG, ...parts);

export {
  buildPackageLogGroup,
  PACKAGE_NAME,
  PACKAGE_ORGANIZATION_NAME,
  PACKAGE_SLUG,
  PACKAGE_WORKSPACE_CONFIG_DIR,
  PACKAGE_VERSION,
};
