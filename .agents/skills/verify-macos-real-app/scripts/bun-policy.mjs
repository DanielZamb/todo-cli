// Default-loading reds precede this policy. Explicit false settings define
// the standalone executable's configuration contract.
export const bunCompileSafetyOptions = [
  '--no-env-file', '--config=/dev/null', '--no-macros',
  '--no-compile-autoload-dotenv', '--no-compile-autoload-bunfig',
  '--no-compile-autoload-tsconfig', '--no-compile-autoload-package-json',
];
