package json

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"
	"time"

	"todo-cli/internal/domain"
)

func normalizeGeneratedAt(s string) string {
	re := regexp.MustCompile(`"generated_at":\s*"[^"]+"`)
	return re.ReplaceAllString(s, `"generated_at": "<GENERATED_AT>"`)
}

func TestTasksGolden(t *testing.T) {
	created := time.Date(2026, 2, 18, 10, 0, 0, 0, time.UTC)
	updated := time.Date(2026, 2, 18, 10, 0, 0, 0, time.UTC)
	tasks := []domain.Task{{ID: "gold-1", UserID: "u1", EntityVersion: 1, RowVersion: 2, Title: "Golden Task", Status: domain.StatusOpen, Priority: "P2", Source: "manual", CreatedAt: created, UpdatedAt: updated}}
	out, err := Tasks(tasks, map[string]string{"status": "open"})
	if err != nil {
		t.Fatal(err)
	}
	got := normalizeGeneratedAt(out)
	goldenPath := filepath.Join("testdata", "tasks.golden")
	wantBytes, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatal(err)
	}
	if got != string(wantBytes) {
		t.Fatalf("golden mismatch\nwant:\n%s\ngot:\n%s", string(wantBytes), got)
	}
}
