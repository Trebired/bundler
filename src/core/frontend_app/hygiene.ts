import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type { BundlerLogger, BundlerQuarantineResult } from "#3c8d8166992a";
import { pathExists } from "#47cd321d28f1";

async function quarantineUnwritableOutputDir(
  dir: string,
  options: { logger?: BundlerLogger } = {},
): Promise<BundlerQuarantineResult> {
  const resolvedDir = path.resolve(dir);
  if (!await pathExists(resolvedDir)) return { dir: resolvedDir, quarantined: false };
  if (await canWriteDirectory(resolvedDir)) return { dir: resolvedDir, quarantined: false };

  const quarantineDir = await resolveQuarantineDir(resolvedDir);
  await fs.rename(resolvedDir, quarantineDir);
  warnLogger(options.logger, `quarantine-output-dir :: ${resolvedDir} -> ${quarantineDir}`);
  return { dir: resolvedDir, quarantineDir, quarantined: true };
}

async function canWriteDirectory(dir: string): Promise<boolean> {
  try {
    await fs.access(dir, fsConstants.W_OK);
    const probe = path.join(dir, `.bundler-write-${process.pid}-${Date.now()}`);
    await fs.writeFile(probe, "");
    await fs.rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

async function resolveQuarantineDir(dir: string): Promise<string> {
  const parent = path.dirname(dir);
  const name = path.basename(dir);
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? "" : `-${index}`;
    const candidate = path.join(parent, `${name}.quarantine-${Date.now()}${suffix}`);
    if (!await pathExists(candidate)) return candidate;
  }
  throw new Error(`bundler-output-dir-quarantine-conflict :: ${dir}`);
}

function warnLogger(logger: BundlerLogger | undefined, message: string): void {
  const candidate = logger as { warn?: (group: string, message: string) => void } | undefined;
  candidate?.warn?.("build", message);
}

export {
  quarantineUnwritableOutputDir,
};
