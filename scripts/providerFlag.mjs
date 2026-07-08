/**
 * Provider-flag parsing for `npm run build` (spec:
 * user-stories/typescript_email_ui.md). Pure and side-effect free so the
 * exception paths are unit-testable without running a real build:
 * scripts/build.mjs calls resolveProviderFlag(process.argv.slice(2)) and
 * fails fast — before any compilation — when the flag is missing or unknown.
 */

/** Provider ids the app can be built for; new platforms add one entry here
 * and one in the composition root's provider map. */
export const KNOWN_PROVIDERS = ['gmail'];

const USAGE = 'Usage: npm run build -- --provider=<id>';

/**
 * Resolve the --provider flag from an argv slice.
 * Accepts `--provider=gmail` and `--provider gmail`.
 * @param {string[]} argv
 * @returns {string} the validated provider id
 * @throws {Error} when the flag is missing, empty, or names an unknown provider
 */
export function resolveProviderFlag(argv) {
  let value;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--provider') {
      value = argv[i + 1];
    } else if (arg.startsWith('--provider=')) {
      value = arg.slice('--provider='.length);
    }
  }

  if (value === undefined || value === '' || value.startsWith('--')) {
    throw new Error(
      `Missing required --provider flag: a production bundle must state which mail platform it ships.\n` +
        `${USAGE}\nKnown providers: ${KNOWN_PROVIDERS.join(', ')}`,
    );
  }
  if (!KNOWN_PROVIDERS.includes(value)) {
    throw new Error(
      `Unknown provider "${value}".\n${USAGE}\nKnown providers: ${KNOWN_PROVIDERS.join(', ')}`,
    );
  }
  return value;
}
