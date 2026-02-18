package json

import (
	"encoding/json"
	"testing"
	"time"

	"todo-cli/internal/domain"
)

func TestTasksEnvelopeShape(t *testing.T) {
	task := domain.Task{ID: "t1", UserID: "u1", EntityVersion: 1, RowVersion: 2, Title: "x", Status: domain.StatusOpen, Priority: "P3"}
	out, err := Tasks([]domain.Task{task}, map[string]string{"status": "open"})
	if err != nil {
		t.Fatal(err)
	}
	var env Envelope
	if err := json.Unmarshal([]byte(out), &env); err != nil {
		t.Fatal(err)
	}
	if _, err := time.Parse(time.RFC3339, env.GeneratedAt); err != nil {
		t.Fatalf("invalid generated_at: %v", err)
	}
	if env.Filters["status"] != "open" {
		t.Fatalf("missing filters: %#v", env.Filters)
	}
	if len(env.Tasks) != 1 || env.Tasks[0].RowVersion != 2 {
		t.Fatalf("unexpected task payload: %#v", env.Tasks)
	}
}
