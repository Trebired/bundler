import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
function defineBundlerConfig(config) {
    return config;
}
async function pathExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
async function loadBundlerConfigModule(projectRoot, configPath) {
    const resolvedPath = path.resolve(projectRoot, configPath);
    if (!await pathExists(resolvedPath)) {
        throw new Error(`Config module was not found: ${resolvedPath}`);
    }
    const imported = await import(pathToFileURL(resolvedPath).href);
    const config = imported.default;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new Error("Config module must default-export a config object");
    }
    return {
        config: config,
        configPath: resolvedPath,
    };
}
export { defineBundlerConfig, loadBundlerConfigModule };
//# sourceMappingURL=index.js.map