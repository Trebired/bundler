#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { loadConfigModule } from "#rk4f8tlkdhh7";
import { bundle } from "#9b50ca986572";
import { watch } from "#644f3e1f42a8";
import { writeNamespaceModule } from "#3su2sutz3358";
import type { BundlerOptions } from "#3c8d8166992a";
import { createDefaultCliLogger } from "./logging.js";

type CliRunOptions = {
  cwd?: string;
  stderr?: (text: string) => void;
  stdout?: (text: string) => void;
  watchDurationMs?: number;
};

type CliRunResult = {
  exitCode: number;
};

function renderHelp(): string {
  return [
    "Usage: package-bundler <command>",
    "",
    "Commands:",
    "  build         run a one-shot bundle using the config module",
    "  namespace     write a generated namespace helper module",
    "  watch         run bundle watch mode using the config module",
    "",
    "Config:",
    "  build/watch: --config <path> must point to a module that default-exports the bundler config object.",
    "  namespace: --out <path> writes helpers from .trebired/bundler/config.ts.",
    "",
  ].join("\n");
}

function parseArgs(args: string[]): { configPath?: string; extra: string[]; outFile?: string } {
  let configPath: string | undefined;
  let outFile: string | undefined;
  const extra: string[] = [];

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

    if (arg === "--out") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Missing value for --out");
      }

      outFile = value;
      index += 1;
      continue;
    }

    extra.push(arg);
  }

  return { configPath, extra, outFile };
}

async function waitForStop(session: Awaited<ReturnType<typeof watch>>, durationMs?: number): Promise<void> {
  if (typeof durationMs === "number") {
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    await session.dispose();
    return;
  }

  await new Promise<void>((resolve) => {
      const stop = async() => {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
        await session.dispose();
        resolve();
      };

      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
  });
}

async function runCli(argv: string[], options: CliRunOptions = {}): Promise<CliRunResult> {
  const io = resolveCliIo(options);
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    io.stdout(`${renderHelp()}\n`);
    return { exitCode: 0 };
  }

  try {
    return await runCliCommand(command, rest, options, io);
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return { exitCode: 1 };
  }
}

function resolveCliIo(options: CliRunOptions) {
  return {
    cwd: options.cwd ?? process.cwd(),
    stdout: options.stdout ?? ((text: string) => process.stdout.write(text)),
    stderr: options.stderr ?? ((text: string) => process.stderr.write(text)),
  };
}

async function runCliCommand(
  command: string,
  rest: string[],
  options: CliRunOptions,
  io: ReturnType<typeof resolveCliIo>,
): Promise<CliRunResult> {
  const parsed = parseArgs(rest);
  if (parsed.extra.length > 0) throw new Error(`Unexpected arguments: ${parsed.extra.join(" ")}`);

  if (command === "namespace") return runNamespaceCommand(parsed, io.cwd, io.stdout);
  if (!parsed.configPath) throw new Error("Missing required --config <path> option");
  const { config } = await loadConfigModule(io.cwd, parsed.configPath);
  const logger = shouldUseDefaultCliLogger(options) ? createDefaultCliLogger() : null;
  if (command === "build") return runBuildCommand(config, io.cwd, io.stdout, logger);
  if (command === "watch") return runWatchCommand(config, io.cwd, io.stdout, options.watchDurationMs, logger);

  io.stderr(`Unknown command: ${command}\n`);
  io.stderr(`${renderHelp()}\n`);
  return { exitCode: 1 };
}

function shouldUseDefaultCliLogger(options: CliRunOptions): boolean {
  return !options.stdout && !options.stderr;
}

function withCliDefaults(
  config: Awaited<ReturnType<typeof loadConfigModule>>["config"],
  cwd: string,
  logger: ReturnType<typeof createDefaultCliLogger>|null,
): BundlerOptions {
  const next: BundlerOptions = { ...config, rootDir: config.rootDir ?? cwd };
  if (!next.logger && !next.loggerAdapter && logger) next.logger = logger;
  return next;
}

async function runNamespaceCommand(
  parsed: ReturnType<typeof parseArgs>,
  cwd: string,
  stdout: (text: string) => void,
): Promise<CliRunResult> {
  if (!parsed.outFile) throw new Error("Missing required --out <path> option");
  const outFile = await writeNamespaceModule({
      configPath: parsed.configPath,
      outFile: parsed.outFile,
      rootDir: cwd,
  });
  stdout(`${outFile}\n`);
  return { exitCode: 0 };
}

async function runBuildCommand(
  config: Awaited<ReturnType<typeof loadConfigModule>>["config"],
  cwd: string,
  stdout: (text: string) => void,
  logger: ReturnType<typeof createDefaultCliLogger>|null,
): Promise<CliRunResult> {
  const result = await bundle(withCliDefaults(config, cwd, logger));
  stdout(`${JSON.stringify(result)}\n`);
  return { exitCode: 0 };
}

async function runWatchCommand(
  config: Awaited<ReturnType<typeof loadConfigModule>>["config"],
  cwd: string,
  stdout: (text: string) => void,
  watchDurationMs?: number,
  logger: ReturnType<typeof createDefaultCliLogger>|null = null,
): Promise<CliRunResult> {
  const session = await watch(withCliDefaults(config, cwd, logger));
  stdout("Watching for changes.\n");
  await waitForStop(session, watchDurationMs);
  return { exitCode: 0 };
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryPath && import.meta.url === entryPath) {
  const result = await runCli(process.argv.slice(2));
  process.exitCode = result.exitCode;
}

export { runCli };
export type { CliRunOptions, CliRunResult };
