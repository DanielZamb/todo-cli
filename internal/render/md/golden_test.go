package md

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"todo-cli/internal/domain"
)

func TestRenderTasksGolden(t *testing.T) {
	due := time.Date(2026, 2, 20, 10, 0, 0, 0, time.UTC)
	tasks := []domain.Task{{ID: "gold-1", Priority: "P2", Title: "Golden Task", RowVersion: 2, Status: domain.StatusOpen, Project: "work", DueAt: &due, Tags: []string{"alpha"}}}
	got := RenderTasks(tasks)
	goldenPath := filepath.Join("testdata", "tasks.golden")
	wantBytes, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatal(err)
	}
	if got != string(wantBytes) {
		t.Fatalf("golden mismatch\nwant:\n%s\ngot:\n%s", string(wantBytes), got)
	}
}
