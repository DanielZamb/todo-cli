// Wire this into compiler invocations only after the default-loading red has
// been recorded. Explicit false settings also document the runtime contract.
export const bunCompileSafetyOptions = [
  '--no-env-file', '--config=/dev/null', '--no-macros',
  '--no-compile-autoload-dotenv', '--no-compile-autoload-bunfig',
  '--no-compile-autoload-tsconfig', '--no-compile-autoload-package-json',
];
