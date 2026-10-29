import type { Task } from "@todo/domain";
import { conflicts, type Editor, rebaseEditor } from "./model.ts";

export function acceptAttachmentTask(editor: Editor, accepted: Task): Editor {
  if (conflicts(editor, accepted).length === 0)
    return rebaseEditor(editor, accepted);
  return {
    ...editor,
    base: { ...editor.base, attachments: accepted.attachments ?? [] },
  };
}
