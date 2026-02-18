package sqlite

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"todo-cli/internal/domain"
)

func setupStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "todo.db"))
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	return s
}

func TestCreateAndListTask(t *testing.T) {
	s := setupStore(t)
	defer s.Close()
	ctx := context.Background()
	u, err := s.CreateUser(ctx, "u1", "alice", "secret")
	if err != nil {
		t.Fatal(err)
	}
	task, err := s.CreateTask(ctx, domain.Task{ID: "t1", UserID: u.ID, EntityVersion: 1, Title: "hello", Status: domain.StatusOpen, Priority: "P2"})
	if err != nil {
		t.Fatal(err)
	}
	if task.RowVersion != 1 {
		t.Fatalf("expected row version 1 got %d", task.RowVersion)
	}
	items, err := s.ListTasks(ctx, u.ID, ListFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 task got %d", len(items))
	}
}

func TestOCCConflictReturnsLatest(t *testing.T) {
	s := setupStore(t)
	defer s.Close()
	ctx := context.Background()
	u, _ := s.CreateUser(ctx, "u1", "alice", "secret")
	_, _ = s.CreateTask(ctx, domain.Task{ID: "t1", UserID: u.ID, EntityVersion: 1, Title: "hello", Status: domain.StatusOpen, Priority: "P2"})

	newTitle := "updated"
	res, err := s.UpdateTask(ctx, u.ID, "t1", 1, domain.TaskPatch{Title: &newTitle})
	if err != nil {
		t.Fatal(err)
	}
	if res.Task.RowVersion != 2 {
		t.Fatalf("expected row version 2 got %d", res.Task.RowVersion)
	}

	newTitle2 := "stale"
	res2, err := s.UpdateTask(ctx, u.ID, "t1", 1, domain.TaskPatch{Title: &newTitle2})
	if !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("expected conflict err got %v", err)
	}
	if !res2.Conflict {
		t.Fatal("expected conflict result")
	}
	if res2.Task.RowVersion != 2 {
		t.Fatalf("expected latest row version 2 got %d", res2.Task.RowVersion)
	}
}

func TestUserScopingIsolation(t *testing.T) {
	s := setupStore(t)
	defer s.Close()
	ctx := context.Background()
	u1, _ := s.CreateUser(ctx, "u1", "alice", "secret")
	u2, _ := s.CreateUser(ctx, "u2", "bob", "secret")
	_, _ = s.CreateTask(ctx, domain.Task{ID: "t1", UserID: u1.ID, EntityVersion: 1, Title: "a", Status: domain.StatusOpen, Priority: "P3"})
	_, _ = s.CreateTask(ctx, domain.Task{ID: "t2", UserID: u2.ID, EntityVersion: 1, Title: "b", Status: domain.StatusOpen, Priority: "P3"})

	a, err := s.ListTasks(ctx, u1.ID, ListFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if len(a) != 1 || a[0].UserID != u1.ID {
		t.Fatalf("unexpected user1 data: %#v", a)
	}
	if _, err := s.TaskByID(ctx, u2.ID, "t1"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expected not found for cross-user read, got %v", err)
	}
}

func TestSecurityHashesStoredNotPlaintext(t *testing.T) {
	s := setupStore(t)
	defer s.Close()
	ctx := context.Background()
	u, err := s.CreateUser(ctx, "u-sec", "sec-user", "secret-password")
	if err != nil {
		t.Fatal(err)
	}
	_, passHash, err := s.UserByUsername(ctx, "sec-user")
	if err != nil {
		t.Fatal(err)
	}
	if passHash == "secret-password" || !strings.HasPrefix(passHash, "argon2id$") {
		t.Fatalf("password hash not stored securely: %s", passHash)
	}

	_, err = s.CreateSession(ctx, "sess-sec", u.ID, "plain-token", 24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	var tokenHash string
	err = s.db.QueryRowContext(ctx, `SELECT token_hash FROM sessions WHERE id=?`, "sess-sec").Scan(&tokenHash)
	if err != nil {
		t.Fatal(err)
	}
	if tokenHash == "plain-token" || tokenHash == "" {
		t.Fatalf("token hash not stored securely: %q", tokenHash)
	}
}
