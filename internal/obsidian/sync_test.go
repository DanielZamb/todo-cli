package obsidian

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"todo-cli/internal/domain"
)

func TestWriteProjectionDeterministicManagedBlock(t *testing.T) {
	d := t.TempDir()
	task := domain.Task{ID: "1", Priority: "P1", Title: "Task", RowVersion: 1, Status: domain.StatusOpen}
	path, err := WriteProjection(d, filepath.Join("Todo", "CLI Tasks.md"), []domain.Task{task})
	if err != nil {
		t.Fatal(err)
	}
	first, _ := os.ReadFile(path)
	if !strings.Contains(string(first), "todo-cli:begin") {
		t.Fatal("missing managed block")
	}
	path2, err := WriteProjection(d, filepath.Join("Todo", "CLI Tasks.md"), []domain.Task{task})
	if err != nil {
		t.Fatal(err)
	}
	if path != path2 {
		t.Fatal("expected same output path")
	}
	second, _ := os.ReadFile(path2)
	if !strings.Contains(string(second), "todo-cli:end") {
		t.Fatal("missing end marker")
	}
}
