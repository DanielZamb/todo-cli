package obsidian

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	"todo-cli/internal/domain"
	mdrender "todo-cli/internal/render/md"
)

const startMarker = "<!-- todo-cli:begin -->"
const endMarker = "<!-- todo-cli:end -->"

func BuildManaged(tasks []domain.Task) string {
	var b strings.Builder
	b.WriteString(startMarker + "\n")
	b.WriteString("# CLI Tasks\n\n")
	b.WriteString("Last synced: " + time.Now().UTC().Format(time.RFC3339) + "\n\n")
	b.WriteString(mdrender.RenderTasks(tasks))
	if !strings.HasSuffix(b.String(), "\n") {
		b.WriteString("\n")
	}
	b.WriteString(endMarker + "\n")
	return b.String()
}

func WriteProjection(vaultPath, relativeFile string, tasks []domain.Task) (string, error) {
	if relativeFile == "" {
		relativeFile = filepath.Join("Todo", "CLI Tasks.md")
	}
	outPath := filepath.Join(vaultPath, relativeFile)
	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		return "", err
	}
	managed := BuildManaged(tasks)
	curr, err := os.ReadFile(outPath)
	if err != nil && !os.IsNotExist(err) {
		return "", err
	}
	body := string(curr)
	if s := strings.Index(body, startMarker); s >= 0 {
		e := strings.Index(body, endMarker)
		if e > s {
			e += len(endMarker)
			body = body[:s] + managed + body[e:]
		} else {
			body += "\n" + managed
		}
	} else {
		if strings.TrimSpace(body) != "" && !strings.HasSuffix(body, "\n") {
			body += "\n"
		}
		body += managed
	}
	if err := os.WriteFile(outPath, []byte(body), 0o644); err != nil {
		return "", err
	}
	return outPath, nil
}
