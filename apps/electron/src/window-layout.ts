import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { Schema } from "effect";
import type { BrowserWindow } from "electron";

const Preferences = Schema.Struct({ compact: Schema.Boolean });

export function createWindowLayout(
  window: BrowserWindow,
  preferencesPath: string,
) {
  const saved = existsSync(preferencesPath)
    ? Schema.decodeUnknownSync(Preferences)(
        JSON.parse(readFileSync(preferencesPath, "utf8")),
      )
    : { compact: false };
  let compact = false;
  let expandedBounds = window.getBounds();
  const setCompact = (next: boolean) => {
    if (compact === next) return;
    if (next) {
      expandedBounds = window.getBounds();
      const content = window.getContentBounds();
      window.setMinimumSize(393, 426 + expandedBounds.height - content.height);
      window.setContentSize(393, 426);
    } else {
      window.setMinimumSize(960, 640);
      window.setBounds(expandedBounds);
    }
    compact = next;
    mkdirSync(dirname(preferencesPath), { recursive: true, mode: 0o700 });
    writeFileSync(`${preferencesPath}.tmp`, JSON.stringify({ compact }), {
      mode: 0o600,
    });
    renameSync(`${preferencesPath}.tmp`, preferencesPath);
  };
  setCompact(saved.compact);
  return {
    get compact() {
      return compact;
    },
    setCompact,
  };
}
