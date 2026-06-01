#!/usr/bin/env node
type CliRunOptions = {
    cwd?: string;
    stderr?: (text: string) => void;
    stdout?: (text: string) => void;
    watchDurationMs?: number;
};
type CliRunResult = {
    exitCode: number;
};
declare function runCli(argv: string[], options?: CliRunOptions): Promise<CliRunResult>;
export { runCli };
export type { CliRunOptions, CliRunResult };
//# sourceMappingURL=run-cli.d.ts.map