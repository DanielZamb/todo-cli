import { ProfileId } from "@todo/domain";
import { Schema } from "effect";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BatchEditDialog } from "../src/batch-edit.tsx";
import { Button } from "../src/components/ui/button.tsx";
import type { Request } from "../src/protocol.ts";
import "../src/index.css";
import "../src/app.css";

const request = (input: Request) => window.desktop.request(input);
const node = document.getElementById("root");
if (!node) throw new Error("Missing root");
function Preview() {
  const [open, setOpen] = useState(false);
  return (
    <main style={{ padding: 16 }}>
      <Button onClick={() => setOpen(true)}>Edit Tasks…</Button>
      {open && (
        <BatchEditDialog
          profile={Schema.decodeUnknownSync(ProfileId)("work")}
          request={request}
          canWrite
          onClose={() => setOpen(false)}
          onApplied={() => {}}
        />
      )}
    </main>
  );
}
createRoot(node).render(<Preview />);
