import type {
  BundlerFrontendRuntimeConfig,
  NormalizedBundlerLogger,
} from "#3c8d8166992a";
import { resolveLogger } from "#dcx0jw9bw3ka";

type RuntimeStepState = {
  logger: NormalizedBundlerLogger;
};

function resolveRuntimeLogger(config: BundlerFrontendRuntimeConfig): NormalizedBundlerLogger {
  return resolveLogger(config.clientOptions.logger, config.clientOptions.loggerAdapter || config.ssrOptions?.loggerAdapter);
}

async function timeRuntimeStep<T>(
  state: RuntimeStepState,
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  state.logger.info("frontend.runtime", `${label} start`);
  try {
    const value = await run();
    state.logger.info("frontend.runtime", `${label} ready`, { took_ms: elapsedMs(startedAt) });
    return value;
  } catch (error) {
    state.logger.fail("frontend.runtime", `${label} failed`, {
        error: error instanceof Error ? error.message : String(error),
        took_ms: elapsedMs(startedAt),
    });
    throw error;
  }
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

export {
  resolveRuntimeLogger,
  timeRuntimeStep,
};
