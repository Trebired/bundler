#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { loadBundlerConfigModule } from "../config/index.js";
import { bundle } from "../core/build.js";
import { watch } from "../core/watch.js";
function renderHelp() {
    return [
        "Usage: trebired-bundler <command> --config <path>",
        "",
        "Commands:",
        "  build         run a one-shot bundle using the config module",
        "  watch         run bundle watch mode using the config module",
        "",
        "Config:",
        "  --config <path> must point to a module that default-exports the config object.",
        "",
    ].join("\n");
}
function parseArgs(args) {
    let configPath;
    const extra = [];
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--config") {
            const value = args[index + 1];
            if (!value) {
                throw new Error("Missing value for --config");
            }
            configPath = value;
            index += 1;
            continue;
        }
        extra.push(arg);
    }
    return { configPath, extra };
}
async function waitForStop(session, durationMs) {
    if (typeof durationMs === "number") {
        await new Promise((resolve) => setTimeout(resolve, durationMs));
        await session.dispose();
        return;
    }
    await new Promise((resolve) => {
        const stop = async () => {
            process.off("SIGINT", stop);
            process.off("SIGTERM", stop);
            await session.dispose();
            resolve();
        };
        process.on("SIGINT", stop);
        process.on("SIGTERM", stop);
    });
}
async function runCli(argv, options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const stdout = options.stdout ?? ((text) => process.stdout.write(text));
    const stderr = options.stderr ?? ((text) => process.stderr.write(text));
    const [command, ...rest] = argv;
    if (!command || command === "help" || command === "--help" || command === "-h") {
        stdout(`${renderHelp()}\n`);
        return { exitCode: 0 };
    }
    try {
        const parsed = parseArgs(rest);
        if (parsed.extra.length > 0) {
            throw new Error(`Unexpected arguments: ${parsed.extra.join(" ")}`);
        }
        if (!parsed.configPath) {
            throw new Error("Missing required --config <path> option");
        }
        const { config } = await loadBundlerConfigModule(cwd, parsed.configPath);
        if (command === "build") {
            const result = await bundle({
                ...config,
                rootDir: config.rootDir ?? cwd,
            });
            stdout(`${JSON.stringify(result)}\n`);
            return { exitCode: 0 };
        }
        if (command === "watch") {
            const session = await watch({
                ...config,
                rootDir: config.rootDir ?? cwd,
            });
            stdout("Watching for changes.\n");
            await waitForStop(session, options.watchDurationMs);
            return { exitCode: 0 };
        }
        stderr(`Unknown command: ${command}\n`);
        stderr(`${renderHelp()}\n`);
        return { exitCode: 1 };
    }
    catch (error) {
        stderr(`${error instanceof Error ? error.message : String(error)}\n`);
        return { exitCode: 1 };
    }
}
const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryPath && import.meta.url === entryPath) {
    const result = await runCli(process.argv.slice(2));
    process.exitCode = result.exitCode;
}
export { runCli };
//# sourceMappingURL=run-cli.js.map