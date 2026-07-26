import { buildPackageLogGroup, PACKAGE_NAME } from "./package-metadata.js";

const BUNDLER_LOG_GROUP = buildPackageLogGroup();
const BUNDLER_PACKAGE_NAME = PACKAGE_NAME;

export { BUNDLER_LOG_GROUP, BUNDLER_PACKAGE_NAME };
