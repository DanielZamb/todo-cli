import {
  type Attachment,
  attachmentLimit,
  ImageMime,
  type Task,
} from "@todo/domain";
import { Schema } from "effect";
import {
  FileImage,
  FileText,
  FolderOpen,
  Link2,
  MoreHorizontal,
  Paperclip,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu.tsx";
import { Input } from "./components/ui/input.tsx";
import type { Reply, Request } from "./protocol.ts";
import "./attachments.css";

type Send = (request: Request) => Promise<Reply>;
export const jiraAttachment = (task: Task) =>
  task.attachments?.find(
    (attachment) => attachment.label?.toLowerCase() === "jira",
  );
function AttachmentBadge({ label }: { label: string }) {
  return (
    <span className="jira-marker" title={label}>
      {label.toLowerCase() === "jira" ? "Jira" : label}
    </span>
  );
}
export function JiraMarker({ task }: { task: Task }) {
  return jiraAttachment(task) ? (
    <span
      className="task-jira-marker"
      role="img"
      aria-label="Jira draft attached"
    >
      <AttachmentBadge label="jira" />
    </span>
  ) : null;
}
function AttachmentRow({
  attachment,
  send,
  disabled,
  remove,
  label,
}: {
  attachment: Attachment;
  send: Send;
  disabled: boolean;
  remove: () => void;
  label: (value: string | null) => Promise<boolean>;
}) {
  const [status, setStatus] = useState<{
    exists: boolean | null;
    preview: string | null;
  }>({ exists: null, preview: null });
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(attachment.label ?? "");
  useEffect(() => {
    let live = true;
    void send({ _tag: "attachmentStatus", attachment }).then((reply) => {
      if (live && reply._tag === "attachmentStatus") setStatus(reply);
    });
    return () => {
      live = false;
    };
  }, [attachment, send]);
  const title =
    attachment.name ??
    (attachment.kind === "link"
      ? new URL(attachment.url).hostname
      : attachment.path.split("/").pop()) ??
    "Attachment";
  const location =
    attachment.kind === "link" ? attachment.url : attachment.path;
  const split = location.lastIndexOf("/");
  const open = async (action: "open" | "reveal") => {
    const reply = await send({ _tag: "openAttachment", attachment, action });
    setError(reply._tag === "error" ? reply.message : "");
  };
  const saveLabel = () => {
    void label(draft.trim() || null).then((accepted) => {
      if (accepted) setEditing(false);
    });
  };
  return (
    <li className="attachment-row">
      <div className="attachment-preview">
        {status.preview ? (
          <img src={status.preview} alt={`Preview of ${title}`} />
        ) : attachment.kind === "link" ? (
          <Link2 />
        ) : attachment.kind === "image" ? (
          <FileImage />
        ) : (
          <FileText />
        )}
      </div>
      <div className="attachment-details">
        <div className="attachment-title-line">
          <button
            type="button"
            className="attachment-name"
            onClick={() => void open("open")}
            disabled={status.exists === false}
            title={location}
          >
            {title}
          </button>
          {attachment.label && <AttachmentBadge label={attachment.label} />}
        </div>
        {attachment.kind === "image" && attachment.byte_size !== undefined ? (
          <span
            className="attachment-path"
            title={location}
            aria-description={location}
          >
            Copied image ·{" "}
            {attachment.byte_size < 1024
              ? `${attachment.byte_size} B`
              : attachment.byte_size < 1024 * 1024
                ? `${(attachment.byte_size / 1024).toFixed(1)} KB`
                : `${(attachment.byte_size / (1024 * 1024)).toFixed(1)} MB`}
          </span>
        ) : (
          <span
            className="attachment-path"
            title={location}
            aria-description={location}
          >
            <span className="attachment-path-prefix">
              {location.slice(0, split)}
            </span>
            <span className="attachment-path-name">
              <span className="attachment-filename-prefix">
                {location.slice(split, -12)}
              </span>
              <span className="attachment-filename-tail">
                {location.slice(Math.max(split, location.length - 12))}
              </span>
            </span>
          </span>
        )}
        {status.exists === false && (
          <span className="attachment-missing">Missing file</span>
        )}
        {editing && (
          <div className="attachment-label-form">
            <Input
              aria-label={`Label for ${title}`}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveLabel();
                }
              }}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={disabled}
              autoFocus
            />
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={saveLabel}
            >
              Save label
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        )}
        {error && (
          <span role="alert" className="attachment-missing">
            {error}
          </span>
        )}
      </div>
      <div className="attachment-row-actions">
        {attachment.kind !== "link" && status.exists === true && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Reveal ${title} in Finder`}
            disabled={status.exists !== true}
            onClick={() => void open("reveal")}
          >
            <FolderOpen />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Attachment actions for ${title}`}
                disabled={disabled}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="attachment-menu">
            {attachment.label?.toLowerCase() !== "jira" && (
              <DropdownMenuItem onClick={() => void label("jira")}>
                Mark as Jira draft
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                setDraft(attachment.label ?? "");
                setEditing(true);
              }}
            >
              Edit label…
            </DropdownMenuItem>
            {attachment.label && (
              <DropdownMenuItem onClick={() => void label(null)}>
                Clear label
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove attachment ${title}`}
          disabled={disabled}
          onClick={remove}
        >
          <X />
        </Button>
      </div>
    </li>
  );
}
export function AttachmentsSection({
  task,
  readOnly,
  request,
  onAccepted,
}: {
  task: Task;
  readOnly: boolean;
  request: Send;
  onAccepted: (task: Task) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [link, setLink] = useState("");
  const [hasImage, setHasImage] = useState(false);
  const current = useRef(task);
  if (
    task.id !== current.current.id ||
    task.profile_id !== current.current.profile_id ||
    task.row_version >= current.current.row_version
  )
    current.current = task;
  const disabled = readOnly || busy;
  const perform = async (operation: (task: Task) => Request) => {
    const reply = await request(operation(current.current));
    if (reply._tag === "task") {
      current.current = reply.task;
      onAccepted(reply.task);
      return true;
    }
    if (reply._tag === "conflict" && reply.latest) {
      current.current = reply.latest;
      onAccepted(reply.latest);
    }
    setError(
      reply._tag === "error"
        ? reply.message
        : "Task changed. Your draft is preserved. Retry the Attachment action.",
    );
    return false;
  };
  const target = (value: Task) => ({
    profile: value.profile_id,
    task: value.id,
  });
  const path = (value: string) =>
    perform((task) => ({
      _tag: "attach",
      ...target(task),
      payload: {
        from_version: task.row_version,
        location: /\.(png|jpe?g|gif|webp)$/i.test(value)
          ? { kind: "image", path: value }
          : { kind: "file", path: value },
      },
    }));
  const upload = (
    mime: typeof ImageMime.Type,
    data: string,
    name = "Image.png",
  ) =>
    perform((task) => ({
      _tag: "uploadAttachment",
      ...target(task),
      payload: { from_version: task.row_version, mime_type: mime, data, name },
    }));
  const action = async (work: () => Promise<unknown>) => {
    if (disabled) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not attach the file",
      );
    } finally {
      setBusy(false);
    }
  };
  const files = async (values: File[]) => {
    for (const file of values) {
      if (file.type.startsWith("image/")) {
        const mime = file.type;
        if (!Schema.is(ImageMime)(mime))
          throw new Error("Use a PNG, JPEG, GIF or WebP image.");
        if (file.size > attachmentLimit)
          throw new Error("Images must be 20 MiB or smaller");
        const encoded = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Could not read the image"));
          reader.onload = () =>
            resolve(String(reader.result).split(",")[1] ?? "");
          reader.readAsDataURL(file);
        });
        if (!(await upload(mime, encoded, file.name || "Image.png"))) break;
      } else {
        const local = window.desktop.filePath(file);
        if (!local) throw new Error("Use Add File to attach this file");
        if (!(await path(local))) break;
      }
    }
  };
  const refreshClipboard = () => {
    setHasImage(false);
    void request({ _tag: "attachmentClipboard" }).then((reply) =>
      setHasImage(reply._tag === "attachmentClipboard" && reply.hasImage),
    );
  };
  const saveLink = () => {
    void action(async () => {
      const url = new URL(link);
      if (!["https:", "http:"].includes(url.protocol))
        throw new Error("Use an HTTP/HTTPS link");
      if (
        await perform((task) => ({
          _tag: "attach",
          ...target(task),
          payload: {
            from_version: task.row_version,
            location: { kind: "link", url: url.href },
          },
        }))
      ) {
        setLink("");
        setAddingLink(false);
      }
    });
  };
  return (
    <section
      className="attachments-section"
      aria-label="Attachments"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void action(() => files([...event.dataTransfer.files]));
      }}
      onPaste={(event) => {
        const images = [...event.clipboardData.files].filter((file) =>
          file.type.startsWith("image/"),
        );
        if (images.length) {
          event.preventDefault();
          void action(() => files(images));
        }
      }}
    >
      <div className="attachment-heading">
        <h3>
          <Paperclip /> Attachments
        </h3>
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) refreshClipboard();
          }}
        >
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="sm"
                disabled={disabled}
                variant="outline"
                aria-label="Add attachment"
              />
            }
          >
            <Plus /> Add
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="attachment-menu">
            <DropdownMenuItem
              onClick={() =>
                void action(async () => {
                  const reply = await request({ _tag: "pickAttachment" });
                  if (reply._tag === "attachmentPaths")
                    for (const value of reply.paths) {
                      if (!(await path(value))) break;
                    }
                })
              }
            >
              Add File…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAddingLink(true)}>
              Add Link…
            </DropdownMenuItem>
            {hasImage && (
              <DropdownMenuItem
                onClick={() =>
                  void action(async () => {
                    const reply = await request({ _tag: "pasteAttachment" });
                    if (reply._tag === "attachmentImage")
                      await upload(reply.mime_type, reply.data);
                    else if (reply._tag === "error") setError(reply.message);
                  })
                }
              >
                Paste Image
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {task.attachments?.length ? (
        <ul className="attachment-list">
          {task.attachments.map((value) => (
            <AttachmentRow
              key={value.id}
              attachment={value}
              send={request}
              disabled={disabled}
              remove={() =>
                void action(() =>
                  perform((task) => ({
                    _tag: "detach",
                    ...target(task),
                    payload: {
                      from_version: task.row_version,
                      attachment_id: value.id,
                    },
                  })),
                )
              }
              label={async (label) => {
                let accepted = false;
                await action(async () => {
                  accepted = await perform((task) => ({
                    _tag: "labelAttachment",
                    ...target(task),
                    payload: {
                      from_version: task.row_version,
                      attachment_id: value.id,
                      label,
                    },
                  }));
                });
                return accepted;
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="attachment-hint">Drop files or paste an image here.</p>
      )}
      {addingLink && (
        <div className="attachment-link-form">
          <Input
            aria-label="Attachment URL"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveLink();
              }
            }}
            placeholder="https://"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            disabled={disabled}
            autoFocus
          />
          <div>
            <Button
              type="button"
              size="sm"
              disabled={disabled || !link.trim()}
              onClick={saveLink}
            >
              Attach link
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setAddingLink(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p className="attachment-missing" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
