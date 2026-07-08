/** Type declarations for scripts/runBuild.mjs (consumed by vitest tests). */
export interface BuildIo {
  run(command: string, args: string[], extraEnv: Record<string, string>): number | null;
  writeFile(path: string, content: string): void;
  log(message: string): void;
}
export declare function runBuild(argv: string[], io: BuildIo): number;
