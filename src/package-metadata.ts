import { readPackageIdentity } from "@trebired/utils";

const packageIdentity = readPackageIdentity({
    fallbackSlug: "bundler",
    fallbackVersion: "5.1.4",
    packageJsonUrl: new URL("../package.json", import.meta.url),
});
const PACKAGE_NAME = packageIdentity.name;
const PACKAGE_VERSION = packageIdentity.version;
const PACKAGE_ORGANIZATION_NAME = packageIdentity.organizationName;
const PACKAGE_SLUG = packageIdentity.slug;
const PACKAGE_WORKSPACE_CONFIG_DIR = packageIdentity.workspaceConfigDir;
const buildPackageLogGroup = packageIdentity.buildLogGroup;

export {
  buildPackageLogGroup,
  PACKAGE_NAME,
  PACKAGE_ORGANIZATION_NAME,
  PACKAGE_SLUG,
  PACKAGE_WORKSPACE_CONFIG_DIR,
  PACKAGE_VERSION,
};
