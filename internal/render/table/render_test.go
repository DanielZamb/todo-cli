package table

import (
	"strings"
	"testing"

	"todo-cli/internal/domain"
)

func TestTasksAndTaskRender(t *testing.T) {
	out := Tasks([]domain.Task{{ID: "t1", RowVersion: 3, Status: domain.StatusOpen, Priority: "P2", Title: "Task"}})
	if !strings.Contains(out, "ID\tV\tSTATUS\tPRIO\tTITLE") || !strings.Contains(out, "t1\t3\topen\tP2\tTask") {
		t.Fatalf("unexpected tasks table: %s", out)
	}
	one := Task(domain.Task{ID: "x", RowVersion: 1, Status: domain.StatusDone, Priority: "P1", Title: "Done"})
	if !strings.Contains(one, "x\t1\tdone\tP1\tDone") {
		t.Fatalf("unexpected single task table: %s", one)
	}
}

func TestErrorRender(t *testing.T) {
	out := Error("occ_conflict", "stale row version")
	if out != "ERROR\tocc_conflict\tstale row version\n" {
		t.Fatalf("unexpected error table: %q", out)
	}
}
