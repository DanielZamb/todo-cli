package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"todo-cli/internal/app"
	"todo-cli/internal/domain"
	"todo-cli/internal/store/sqlite"
)

func TestHelpAndMan(t *testing.T) {
	var out, err bytes.Buffer
	code := app.Execute([]string{"--help"}, bytes.NewBuffer(nil), &out, &err)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d err=%s", code, err.String())
	}
	if !strings.Contains(out.String(), "Todo CLI: local-first task tracking") {
		t.Fatalf("unexpected help output: %s", out.String())
	}
	out.Reset()
	err.Reset()
	code = app.Execute([]string{"man", "edit"}, bytes.NewBuffer(nil), &out, &err)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d err=%s", code, err.String())
	}
	if !strings.Contains(out.String(), "optimistic concurrency") {
		t.Fatalf("expected concurrency text in man output")
	}
}

func TestHelpHumanFlagShowsOnboarding(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	var out, err bytes.Buffer
	code := app.Execute([]string{"--help-human-flag"}, bytes.NewBuffer(nil), &out, &err)
	if code != 0 {
		t.Fatalf("expected exit 0, got %d err=%s", code, err.String())
	}
	if !strings.Contains(out.String(), "# Human Onboarding") || !strings.Contains(out.String(), "Tip for humans:") {
		t.Fatalf("unexpected onboarding output: %s", out.String())
	}
}

func TestFirstRunDisclaimerOnlyOnce(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")

	var out1, err1 bytes.Buffer
	_ = app.Execute([]string{"--db", db, "init"}, bytes.NewBuffer(nil), &out1, &err1)
	first := err1.String()
	if !strings.Contains(first, "optimized for agents") {
		t.Fatalf("expected first-run disclaimer, got: %s", first)
	}

	var out2, err2 bytes.Buffer
	_ = app.Execute([]string{"--db", db, "init"}, bytes.NewBuffer(nil), &out2, &err2)
	second := err2.String()
	if strings.Count(second, "optimized for agents") > 0 {
		t.Fatalf("disclaimer should appear once, got: %s", second)
	}
}

func TestAuthGatedListAndInit(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")

	var out, err bytes.Buffer
	code := app.Execute([]string{"--db", db, "init"}, bytes.NewBuffer(nil), &out, &err)
	if code != 0 {
		t.Fatalf("init failed: code=%d err=%s", code, err.String())
	}

	out.Reset()
	err.Reset()
	code = app.Execute([]string{"--db", db, "list"}, bytes.NewBuffer(nil), &out, &err)
	if code != 3 {
		t.Fatalf("expected auth exit 3 got %d out=%s err=%s", code, out.String(), err.String())
	}
	if !strings.Contains(err.String(), "auth_required") {
		t.Fatalf("expected auth error output, got: %s", err.String())
	}
}

func TestOCCConflictExitCodeAndLatestRecord(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")
	s, err := sqlite.Open(db)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	u, err := s.CreateUser(ctx, "u1", "alice", "secret")
	if err != nil {
		t.Fatal(err)
	}
	task, err := s.CreateTask(ctx, domain.Task{ID: "t1", UserID: u.ID, EntityVersion: 1, Title: "hello", Status: domain.StatusOpen, Priority: "P2"})
	if err != nil {
		t.Fatal(err)
	}
	token := "token-1"
	_, err = s.CreateSession(ctx, "s1", u.ID, token, 24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	sessionPath := filepath.Join(home, ".todo-cli", "session_default.json")
	if err := os.MkdirAll(filepath.Dir(sessionPath), 0o700); err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(map[string]string{"token": token})
	if err := os.WriteFile(sessionPath, b, 0o600); err != nil {
		t.Fatal(err)
	}

	title := "new title"
	if _, err := s.UpdateTask(ctx, u.ID, task.ID, 1, domain.TaskPatch{Title: &title}); err != nil {
		t.Fatal(err)
	}

	var out, stderr bytes.Buffer
	code := app.Execute([]string{"--db", db, "edit", task.ID, "--title", "stale update", "--expected-version", "1"}, bytes.NewBuffer(nil), &out, &stderr)
	if code != 4 {
		t.Fatalf("expected conflict exit 4, got %d stderr=%s", code, stderr.String())
	}
	if !strings.Contains(stderr.String(), "occ_conflict") {
		t.Fatalf("expected occ_conflict in error output: %s", stderr.String())
	}
	if !strings.Contains(stderr.String(), "v:2") {
		t.Fatalf("expected latest record in error output: %s", stderr.String())
	}
}
