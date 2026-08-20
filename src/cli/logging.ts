import { createLog, type LogInstance } from "@package/logger";

import { BUNDLER_PACKAGE_NAME } from "#0e84q8f4ubat";

function createDefaultCliLogger(): LogInstance {
  return createLog({
      console: true,
      quiet: true,
      save: false,
      source: BUNDLER_PACKAGE_NAME,
  });
}

export { createDefaultCliLogger };
