import { resolveLogger as resolveSharedLogger } from "@trebired/logger-adapter";
import { BUNDLER_PACKAGE_NAME } from "./constants.js";
function resolveLogger(logger, adapter) {
    return resolveSharedLogger({
        adapter,
        fallback: "console",
        logger,
        source: BUNDLER_PACKAGE_NAME,
    });
}
export { resolveLogger };
//# sourceMappingURL=logging.js.map