# Install feature map

| Feature | Recipe |
| --- | --- |
| Build and install destinations | [destinations.md](destinations.md) |
| Database preservation | [preservation.md](preservation.md) |
| Installed CLI and HTTP behavior | [installed-behavior.md](installed-behavior.md) |
| Signed desktop output and launcher | [desktop-launcher.md](desktop-launcher.md) |

The parent skill's launch command drives the CLI and server recipes with real
binaries and checks the signing dry run. The separate read-only desktop command
checks existing installed and staged apps.
