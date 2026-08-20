import { createDefaultBundlerLogger } from "#dcx0jw9bw3ka";

import { BUNDLER_PACKAGE_NAME } from "#0e84q8f4ubat";

function createDefaultCliLogger(): ReturnType<typeof createDefaultBundlerLogger> {
  return createDefaultBundlerLogger(BUNDLER_PACKAGE_NAME);
}

export { createDefaultCliLogger };
