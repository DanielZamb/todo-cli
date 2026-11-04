import type { Task } from "@todo/domain";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { AttachmentsSection } from "../src/attachments.tsx";
import type { Request } from "../src/protocol.ts";
import "../src/index.css";
import "../src/app.css";

declare global {
  interface Window {
    cli01Task: Task;
  }
}
const request = (input: Request) => window.desktop.request(input);
const node = document.getElementById("root");
if (!node) throw new Error("Missing root");
function Preview() {
  const [task, setTask] = useState(window.cli01Task);
  return (
    <main style={{ padding: 16 }}>
      <AttachmentsSection
        task={task}
        readOnly={false}
        request={request}
        onAccepted={setTask}
      />
    </main>
  );
}
createRoot(node).render(<Preview />);
