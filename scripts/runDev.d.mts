/** Type declarations for scripts/runDev.mjs (consumed by vitest tests). */
export interface DevIo {
  run(command: string, args: string[]): number | null;
  log(message: string): void;
}
export declare function runDev(argv: string[], io: DevIo): number;
