import type { Metafile, Format, Platform } from "esbuild";
import type {
  LoggerAdapterEvent,
  LoggerAdapterGenericLogMethod,
  LoggerAdapterLogger,
  LoggerAdapterLogMethod,
  LoggerAdapterWriter,
  NormalizedLoggerAdapter,
} from "@trebired/logger-adapter";

type BundlerLogger = LoggerAdapterLogger;
type BundlerLoggerAdapter = LoggerAdapterWriter;
type BundlerLogMethod = LoggerAdapterLogMethod;
type BundlerGenericLogMethod = LoggerAdapterGenericLogMethod;
type BundlerLogEvent = LoggerAdapterEvent;
type NormalizedBundlerLogger = NormalizedLoggerAdapter;

type BundlerOptions = {
  entries: string[] | Record<string, string>;
  outDir: string;
  rootDir?: string;
  platform?: Platform;
  format?: Format;
  target?: string | string[];
  minify?: boolean;
  sourcemap?: boolean | "inline" | "external";
  splitting?: boolean;
  publicPath?: string;
  external?: string[];
  define?: Record<string, string>;
  clean?: boolean;
  annotateSources?: boolean;
  logger?: BundlerLogger;
  loggerAdapter?: BundlerLoggerAdapter;
};

type BundlerBuildResult = {
  outputs: string[];
  warnings: number;
  metafile?: Metafile;
  durationMs: number;
};

type BundlerWatchSession = {
  rebuild(): Promise<BundlerBuildResult>;
  dispose(): Promise<void>;
};

type LoadedBundlerConfig = {
  config: BundlerOptions;
  configPath: string;
};

export type {
  BundlerBuildResult,
  BundlerGenericLogMethod,
  BundlerLogEvent,
  BundlerLogger,
  BundlerLoggerAdapter,
  BundlerLogMethod,
  BundlerOptions,
  BundlerWatchSession,
  LoadedBundlerConfig,
  NormalizedBundlerLogger,
};
