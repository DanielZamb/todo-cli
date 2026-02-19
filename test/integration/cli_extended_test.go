package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"todo-cli/internal/app"
	"todo-cli/internal/domain"
	"todo-cli/internal/store/sqlite"
)

type jsonTaskEnvelope struct {
	Task *domain.Task `json:"task"`
}

func runCmd(t *testing.T, in string, args ...string) (int, string, string) {
	t.Helper()
	var out, err bytes.Buffer
	code := app.Execute(args, bytes.NewBufferString(in), &out, &err)
	return code, out.String(), err.String()
}

func writeSessionToken(t *testing.T, home, profile, token string) {
	t.Helper()
	p := filepath.Join(home, ".todo-cli", "session_"+profile+".json")
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(map[string]string{"token": token})
	if err := os.WriteFile(p, b, 0o600); err != nil {
		t.Fatal(err)
	}
}

func createUserSessionAndTask(t *testing.T, db, home, userID, username, token, taskID string) {
	t.Helper()
	s, err := sqlite.Open(db)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	u, err := s.CreateUser(ctx, userID, username, "secret")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateSession(ctx, "sess-"+userID, u.ID, token, 24*time.Hour); err != nil {
		t.Fatal(err)
	}
	writeSessionToken(t, home, "default", token)
	if taskID != "" {
		if _, err := s.CreateTask(ctx, domain.Task{ID: taskID, UserID: u.ID, EntityVersion: 1, Title: "task-" + userID, Status: domain.StatusOpen, Priority: "P2"}); err != nil {
			t.Fatal(err)
		}
	}
}

func mustTaskFromJSON(t *testing.T, out string) domain.Task {
	t.Helper()
	var env jsonTaskEnvelope
	if err := json.Unmarshal([]byte(out), &env); err != nil {
		t.Fatalf("json decode failed: %v; out=%s", err, out)
	}
	if env.Task == nil {
		t.Fatalf("missing task in output: %s", out)
	}
	return *env.Task
}

func TestCLIFullHappyPathInitLoginAddListShowEditDoneLogout(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")

	code, _, stderr := runCmd(t, "", "--db", db, "init", "--username", "alice", "--password", "secret")
	if code != 0 {
		t.Fatalf("init failed: %d %s", code, stderr)
	}
	code, _, stderr = runCmd(t, "secret\n", "--db", db, "login", "--username", "alice")
	if code != 0 {
		t.Fatalf("login failed: %d %s", code, stderr)
	}

	code, out, stderr := runCmd(t, "", "--db", db, "--format", "json", "add", "Task One", "--project", "work", "--priority", "P2")
	if code != 0 {
		t.Fatalf("add failed: %d %s", code, stderr)
	}
	added := mustTaskFromJSON(t, out)

	code, out, stderr = runCmd(t, "", "--db", db, "--format", "json", "list")
	if code != 0 || !strings.Contains(out, "Task One") {
		t.Fatalf("list failed: %d out=%s err=%s", code, out, stderr)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "--format", "json", "show", added.ID)
	if code != 0 {
		t.Fatalf("show failed: %d %s", code, stderr)
	}
	shown := mustTaskFromJSON(t, out)
	if shown.ID != added.ID {
		t.Fatalf("show returned different task: %s != %s", shown.ID, added.ID)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "--format", "json", "edit", added.ID, "--title", "Task Updated", "--expected-version", "1")
	if code != 0 {
		t.Fatalf("edit failed: %d %s", code, stderr)
	}
	edited := mustTaskFromJSON(t, out)
	if edited.RowVersion != 2 || edited.Title != "Task Updated" {
		t.Fatalf("unexpected edited task: %#v", edited)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "--format", "json", "done", added.ID, "--expected-version", "2")
	if code != 0 {
		t.Fatalf("done failed: %d %s", code, stderr)
	}
	done := mustTaskFromJSON(t, out)
	if done.Status != domain.StatusDone || done.RowVersion != 3 {
		t.Fatalf("unexpected done task: %#v", done)
	}

	code, _, stderr = runCmd(t, "", "--db", db, "logout")
	if code != 0 {
		t.Fatalf("logout failed: %d %s", code, stderr)
	}

	code, _, stderr = runCmd(t, "", "--db", db, "list")
	if code != 3 || !strings.Contains(stderr, "auth_required") {
		t.Fatalf("expected auth required after logout, got code=%d err=%s", code, stderr)
	}
}

func TestOCCConflictOutputJSONAndTable(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")

	createUserSessionAndTask(t, db, home, "u1", "alice", "tok1", "t1")

	s, _ := sqlite.Open(db)
	defer s.Close()
	title := "bump"
	_, _ = s.UpdateTask(context.Background(), "u1", "t1", 1, domain.TaskPatch{Title: &title})

	code, _, stderr := runCmd(t, "", "--db", db, "--format", "json", "edit", "t1", "--title", "stale", "--expected-version", "1")
	if code != 4 || !strings.Contains(stderr, "\"code\": \"occ_conflict\"") || !strings.Contains(stderr, "\"row_version\": 2") {
		t.Fatalf("unexpected json conflict output: code=%d err=%s", code, stderr)
	}

	code, _, stderr = runCmd(t, "", "--db", db, "--format", "table", "edit", "t1", "--title", "stale", "--expected-version", "1")
	if code != 4 || !strings.Contains(stderr, "ERROR\tocc_conflict") || !strings.Contains(stderr, "\t2\t") {
		t.Fatalf("unexpected table conflict output: code=%d err=%s", code, stderr)
	}
}

func TestAuthLifecycleExpiryRevocationWhoamiFailures(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")
	s, _ := sqlite.Open(db)
	defer s.Close()
	ctx := context.Background()
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	u, _ := s.CreateUser(ctx, "u1", "alice", "secret")

	_, _ = s.CreateSession(ctx, "sess-exp", u.ID, "expired-token", -1*time.Hour)
	writeSessionToken(t, home, "default", "expired-token")
	code, _, stderr := runCmd(t, "", "--db", db, "whoami")
	if code != 3 || !strings.Contains(stderr, "auth_required") {
		t.Fatalf("expected expired session auth error: code=%d err=%s", code, stderr)
	}

	_, _ = s.CreateSession(ctx, "sess-ok", u.ID, "ok-token", 24*time.Hour)
	writeSessionToken(t, home, "default", "ok-token")
	if err := s.RevokeSession(ctx, "ok-token"); err != nil {
		t.Fatal(err)
	}
	code, _, stderr = runCmd(t, "", "--db", db, "whoami")
	if code != 3 || !strings.Contains(stderr, "auth_required") {
		t.Fatalf("expected revoked session auth error: code=%d err=%s", code, stderr)
	}

	_ = os.Remove(filepath.Join(home, ".todo-cli", "session_default.json"))
	code, _, stderr = runCmd(t, "", "--db", db, "whoami")
	if code != 3 || !strings.Contains(stderr, "auth_required") {
		t.Fatalf("expected missing session auth error: code=%d err=%s", code, stderr)
	}
}

func TestCLIUserIsolationForShow(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")

	s, _ := sqlite.Open(db)
	defer s.Close()
	ctx := context.Background()
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	u1, _ := s.CreateUser(ctx, "u1", "alice", "secret")
	u2, _ := s.CreateUser(ctx, "u2", "bob", "secret")
	if _, err := s.CreateTask(ctx, domain.Task{ID: "t-user1", UserID: u1.ID, EntityVersion: 1, Title: "private", Status: domain.StatusOpen, Priority: "P2"}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateSession(ctx, "sess-u2", u2.ID, "tok-u2", 24*time.Hour); err != nil {
		t.Fatal(err)
	}
	writeSessionToken(t, home, "default", "tok-u2")

	code, _, stderr := runCmd(t, "", "--db", db, "show", "t-user1")
	if code != 3 || !strings.Contains(stderr, "not_found") {
		t.Fatalf("expected user isolation not_found, got code=%d err=%s", code, stderr)
	}
}

func TestRMMatrixForceConflictAndSuccess(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")
	createUserSessionAndTask(t, db, home, "u1", "alice", "tok1", "t-rm")

	code, _, stderr := runCmd(t, "", "--db", db, "rm", "t-rm", "--expected-version", "1")
	if code != 2 || !strings.Contains(stderr, "delete_failed") {
		t.Fatalf("expected force required error, got code=%d err=%s", code, stderr)
	}

	s, _ := sqlite.Open(db)
	defer s.Close()
	title := "updated"
	_, _ = s.UpdateTask(context.Background(), "u1", "t-rm", 1, domain.TaskPatch{Title: &title})

	code, _, stderr = runCmd(t, "", "--db", db, "rm", "t-rm", "--expected-version", "1", "--force")
	if code != 4 || !strings.Contains(stderr, "occ_conflict") {
		t.Fatalf("expected rm conflict, got code=%d err=%s", code, stderr)
	}

	code, _, stderr = runCmd(t, "", "--db", db, "rm", "t-rm", "--expected-version", "2", "--force")
	if code != 0 {
		t.Fatalf("expected rm success, got code=%d err=%s", code, stderr)
	}

	code, _, stderr = runCmd(t, "", "--db", db, "show", "t-rm")
	if code != 3 || !strings.Contains(stderr, "not_found") {
		t.Fatalf("expected deleted task not found, got code=%d err=%s", code, stderr)
	}
}

func TestHelpManCompletenessAndOutputSuites(t *testing.T) {
	code, out, stderr := runCmd(t, "", "--help")
	if code != 0 {
		t.Fatalf("help failed: %d %s", code, stderr)
	}
	for _, k := range []string{"--format", "--db", "--profile", "--no-color"} {
		if !strings.Contains(out, k) {
			t.Fatalf("missing global flag %s in help", k)
		}
	}

	code, out, stderr = runCmd(t, "", "add", "--help")
	if code != 0 {
		t.Fatalf("add --help failed: %d %s", code, stderr)
	}
	for _, k := range []string{"--desc", "--project", "--priority", "--due", "--scheduled", "--energy", "--estimate"} {
		if !strings.Contains(out, k) {
			t.Fatalf("missing add flag %s", k)
		}
	}

	code, out, stderr = runCmd(t, "", "man", "edit")
	if code != 0 {
		t.Fatalf("man edit failed: %d %s", code, stderr)
	}
	if !strings.Contains(out, "optimistic concurrency") || !strings.Contains(out, "exit code 4") {
		t.Fatalf("man edit missing concurrency/exit-code details: %s", out)
	}

	code, out, stderr = runCmd(t, "", "man", "rm")
	if code != 0 || !strings.Contains(out, "--force") {
		t.Fatalf("man rm missing force: code=%d out=%s err=%s", code, out, stderr)
	}
	for _, expected := range []string{"## Synopsis", "## Concurrency", "## Auth"} {
		if !strings.Contains(out, expected) {
			t.Fatalf("man rm missing section %s: %s", expected, out)
		}
	}
	code, out, stderr = runCmd(t, "", "man", "export")
	if code != 0 || !strings.Contains(out, "## Synopsis") || !strings.Contains(out, "--scope") || !strings.Contains(out, "## Auth") {
		t.Fatalf("man export missing required sections: code=%d out=%s err=%s", code, out, stderr)
	}

	// Output suites: list/review/export across md/json with deterministic key sections.
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")
	createUserSessionAndTask(t, db, home, "u3", "carol", "tok3", "t-out")

	today := time.Now().UTC().Format(time.RFC3339)
	code, _, stderr = runCmd(t, "", "--db", db, "edit", "t-out", "--due", today, "--expected-version", "1")
	if code != 0 {
		t.Fatalf("edit due failed: %d %s", code, stderr)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "list")
	if code != 0 || !strings.Contains(out, "# Tasks") {
		t.Fatalf("md list failed: code=%d out=%s err=%s", code, out, stderr)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "--format", "json", "list")
	if code != 0 || !strings.Contains(out, "\"tasks\"") {
		t.Fatalf("json list failed: code=%d out=%s err=%s", code, out, stderr)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "review", "daily")
	if code != 0 || !strings.Contains(out, "## Overdue") || !strings.Contains(out, "## Scheduled") || !strings.Contains(out, "## Inbox") {
		t.Fatalf("daily review failed: code=%d out=%s err=%s", code, out, stderr)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "review", "weekly")
	if code != 0 || !strings.Contains(out, "# Weekly") {
		t.Fatalf("weekly review failed: code=%d out=%s err=%s", code, out, stderr)
	}
	if !strings.Contains(out, "## Stale Inbox") || !strings.Contains(out, "## Missing Metadata") {
		t.Fatalf("weekly review missing metadata/stale sections: %s", out)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "export", "--template", "jira-context")
	if code != 0 || !strings.Contains(out, "# Jira Context") || !strings.Contains(out, "## Agent Instructions") {
		t.Fatalf("md export failed: code=%d out=%s err=%s", code, out, stderr)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "--format", "json", "export", "--template", "default")
	if code != 0 || !strings.Contains(out, "\"tasks\"") {
		t.Fatalf("json export failed: code=%d out=%s err=%s", code, out, stderr)
	}

	if matched, _ := regexp.MatchString(`"generated_at"\s*:\s*"[^"]+"`, out); !matched {
		t.Fatalf("json export missing generated_at: %s", out)
	}
}

func TestCancelReopenAndConflict(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")
	createUserSessionAndTask(t, db, home, "u10", "alice", "tok10", "t10")

	code, out, stderr := runCmd(t, "", "--db", db, "--format", "json", "cancel", "t10", "--expected-version", "1")
	if code != 0 {
		t.Fatalf("cancel failed: %d %s", code, stderr)
	}
	c := mustTaskFromJSON(t, out)
	if c.Status != domain.StatusCancelled || c.RowVersion != 2 {
		t.Fatalf("unexpected cancel result: %#v", c)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "--format", "json", "reopen", "t10", "--expected-version", "2")
	if code != 0 {
		t.Fatalf("reopen failed: %d %s", code, stderr)
	}
	r := mustTaskFromJSON(t, out)
	if r.Status != domain.StatusOpen || r.RowVersion != 3 {
		t.Fatalf("unexpected reopen result: %#v", r)
	}

	code, _, stderr = runCmd(t, "", "--db", db, "--format", "json", "cancel", "t10", "--expected-version", "2")
	if code != 4 || !strings.Contains(stderr, "occ_conflict") {
		t.Fatalf("expected cancel conflict: code=%d err=%s", code, stderr)
	}
	if !strings.Contains(stderr, "\"row_version\": 3") {
		t.Fatalf("expected latest row in conflict output: %s", stderr)
	}
}

func TestExportScopeVariants(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")
	createUserSessionAndTask(t, db, home, "u11", "eve", "tok11", "base")

	s, _ := sqlite.Open(db)
	defer s.Close()
	ctx := context.Background()
	if _, err := s.CreateTask(ctx, domain.Task{ID: "p1", UserID: "u11", EntityVersion: 1, Title: "work task", Status: domain.StatusOpen, Priority: "P2", Project: "work"}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateTask(ctx, domain.Task{ID: "p2", UserID: "u11", EntityVersion: 1, Title: "home task", Status: domain.StatusOpen, Priority: "P2", Project: "home"}); err != nil {
		t.Fatal(err)
	}
	soon := time.Now().UTC().Add(24 * time.Hour)
	soonPtr := &soon
	if _, err := s.UpdateTask(ctx, "u11", "p1", 1, domain.TaskPatch{DueAt: &soonPtr}); err != nil {
		t.Fatal(err)
	}

	code, out, stderr := runCmd(t, "", "--db", db, "export", "--scope", "project:work")
	if code != 0 || !strings.Contains(out, "work task") || strings.Contains(out, "home task") {
		t.Fatalf("project scope failed: code=%d out=%s err=%s", code, out, stderr)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "export", "--scope", "id:p1")
	if code != 0 || !strings.Contains(out, "work task") || strings.Contains(out, "home task") {
		t.Fatalf("id scope failed: code=%d out=%s err=%s", code, out, stderr)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "export", "--scope", "weekly")
	if code != 0 || !strings.Contains(out, "work task") {
		t.Fatalf("weekly scope failed: code=%d out=%s err=%s", code, out, stderr)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "export", "--scope", "all")
	if code != 0 || !strings.Contains(out, "work task") || !strings.Contains(out, "home task") {
		t.Fatalf("all scope failed: code=%d out=%s err=%s", code, out, stderr)
	}

	todayDue := time.Now().UTC().Format(time.RFC3339)
	code, _, stderr = runCmd(t, "", "--db", db, "edit", "p2", "--due", todayDue, "--expected-version", "1")
	if code != 0 {
		t.Fatalf("edit p2 due failed: code=%d err=%s", code, stderr)
	}
	code, out, stderr = runCmd(t, "", "--db", db, "export", "--scope", "today")
	if code != 0 || !strings.Contains(out, "home task") {
		t.Fatalf("today scope failed: code=%d out=%s err=%s", code, out, stderr)
	}

	outFile := filepath.Join(t.TempDir(), "export.md")
	code, out, stderr = runCmd(t, "", "--db", db, "export", "--scope", "project:work", "--output", outFile)
	if code != 0 || !strings.Contains(out, outFile) {
		t.Fatalf("export output path failed: code=%d out=%s err=%s", code, out, stderr)
	}
	fileBody, err := os.ReadFile(outFile)
	if err != nil {
		t.Fatalf("failed to read export output file: %v", err)
	}
	if !strings.Contains(string(fileBody), "work task") {
		t.Fatalf("export output file missing task: %s", string(fileBody))
	}
}

func TestListFilterMatrixCLI(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")
	createUserSessionAndTask(t, db, home, "u12", "sam", "tok12", "seed")

	s, _ := sqlite.Open(db)
	defer s.Close()
	ctx := context.Background()
	today := time.Now().UTC()
	yesterday := today.Add(-24 * time.Hour)
	if _, err := s.CreateTask(ctx, domain.Task{ID: "f1", UserID: "u12", EntityVersion: 1, Title: "prio1", Status: domain.StatusOpen, Priority: "P1", Project: "work", Tags: []string{"alpha"}, DueAt: &today}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateTask(ctx, domain.Task{ID: "f2", UserID: "u12", EntityVersion: 1, Title: "overdue-inbox", Status: domain.StatusOpen, Priority: "P3", DueAt: &yesterday, Tags: []string{"beta"}}); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		args  []string
		must  []string
		not   []string
		label string
	}{
		{args: []string{"--priority", "P1"}, must: []string{"prio1"}, not: []string{"overdue-inbox"}, label: "priority"},
		{args: []string{"--tag", "alpha"}, must: []string{"prio1"}, not: []string{"overdue-inbox"}, label: "tag"},
		{args: []string{"--today"}, must: []string{"prio1"}, label: "today"},
		{args: []string{"--overdue"}, must: []string{"overdue-inbox"}, not: []string{"prio1"}, label: "overdue"},
		{args: []string{"--inbox"}, must: []string{"overdue-inbox"}, not: []string{"prio1"}, label: "inbox"},
	}
	for _, tc := range cases {
		cmdArgs := append([]string{"--db", db, "list"}, tc.args...)
		code, out, stderr := runCmd(t, "", cmdArgs...)
		if code != 0 {
			t.Fatalf("list %s failed: %d %s", tc.label, code, stderr)
		}
		for _, m := range tc.must {
			if !strings.Contains(out, m) {
				t.Fatalf("list %s missing %q: %s", tc.label, m, out)
			}
		}
		for _, n := range tc.not {
			if strings.Contains(out, n) {
				t.Fatalf("list %s should not include %q: %s", tc.label, n, out)
			}
		}
	}
}

func TestLoginFailuresAndMalformedSession(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")

	code, _, stderr := runCmd(t, "", "--db", db, "init", "--username", "alice", "--password", "secret")
	if code != 0 {
		t.Fatalf("init failed: %d %s", code, stderr)
	}

	code, _, stderr = runCmd(t, "wrong\n", "--db", db, "login", "--username", "alice")
	if code != 3 || !strings.Contains(stderr, "auth_failed") {
		t.Fatalf("expected wrong password auth_failed: code=%d err=%s", code, stderr)
	}

	code, _, stderr = runCmd(t, "secret\n", "--db", db, "login", "--username", "nobody")
	if code != 3 || !strings.Contains(stderr, "auth_failed") {
		t.Fatalf("expected unknown user auth_failed: code=%d err=%s", code, stderr)
	}

	sessionPath := filepath.Join(home, ".todo-cli", "session_default.json")
	if err := os.MkdirAll(filepath.Dir(sessionPath), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(sessionPath, []byte("not-json"), 0o600); err != nil {
		t.Fatal(err)
	}
	code, _, stderr = runCmd(t, "", "--db", db, "list")
	if code != 3 || !strings.Contains(stderr, "auth_required") {
		t.Fatalf("expected malformed session auth_required: code=%d err=%s", code, stderr)
	}
}

func TestLoginWithPasswordStdinFlag(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")

	code, _, stderr := runCmd(t, "", "--db", db, "init", "--username", "alex", "--password", "secret")
	if code != 0 {
		t.Fatalf("init failed: %d %s", code, stderr)
	}
	code, out, stderr := runCmd(t, "secret\n", "--db", db, "login", "--username", "alex", "--password-stdin")
	if code != 0 {
		t.Fatalf("login --password-stdin failed: %d %s", code, stderr)
	}
	if !strings.Contains(out, "logged in as alex") {
		t.Fatalf("unexpected login output: %s", out)
	}

	code, _, stderr = runCmd(t, "", "--db", db, "list")
	if code != 0 {
		t.Fatalf("expected authenticated list after password-stdin login, got %d err=%s", code, stderr)
	}
}

func TestEditClearSemantics(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")
	createUserSessionAndTask(t, db, home, "u13", "mia", "tok13", "t-clear")

	s, _ := sqlite.Open(db)
	defer s.Close()
	ctx := context.Background()
	nowDue := time.Now().UTC().Add(48 * time.Hour)
	nowSched := time.Now().UTC().Add(24 * time.Hour)
	energy := 4
	est := 30
	desc := "desc"
	project := "work"
	nowDuePtr := &nowDue
	nowSchedPtr := &nowSched
	energyPtr := &energy
	estPtr := &est
	if _, err := s.UpdateTask(ctx, "u13", "t-clear", 1, domain.TaskPatch{Description: &desc, Project: &project, DueAt: &nowDuePtr, ScheduledAt: &nowSchedPtr, Energy: &energyPtr, EstimateMin: &estPtr}); err != nil {
		t.Fatal(err)
	}

	code, out, stderr := runCmd(t, "", "--db", db, "--format", "json", "edit", "t-clear", "--desc", "", "--project", "", "--due", "", "--scheduled", "", "--energy", "", "--estimate", "", "--expected-version", "2")
	if code != 0 {
		t.Fatalf("clear edit failed: %d %s", code, stderr)
	}
	task := mustTaskFromJSON(t, out)
	if task.Description != "" || task.Project != "" || task.DueAt != nil || task.ScheduledAt != nil || task.Energy != nil || task.EstimateMin != nil {
		t.Fatalf("expected cleared fields, got: %#v", task)
	}
}

func TestProfileSessionIsolation(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")
	createUserSessionAndTask(t, db, home, "u20", "alice", "tok-default", "t-default")

	code, out, stderr := runCmd(t, "", "--db", db, "list")
	if code != 0 || !strings.Contains(out, "t-default") {
		t.Fatalf("default profile list failed: code=%d out=%s err=%s", code, out, stderr)
	}

	code, _, stderr = runCmd(t, "", "--db", db, "--profile", "friend", "list")
	if code != 3 || !strings.Contains(stderr, "auth_required") {
		t.Fatalf("expected profile isolation auth_required: code=%d err=%s", code, stderr)
	}

	writeSessionToken(t, home, "friend", "tok-default")
	code, out, stderr = runCmd(t, "", "--db", db, "--profile", "friend", "list")
	if code != 0 || !strings.Contains(out, "t-default") {
		t.Fatalf("friend profile list failed after token write: code=%d out=%s err=%s", code, out, stderr)
	}
}

func TestWhoamiSuccessPath(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")

	code, _, stderr := runCmd(t, "", "--db", db, "init", "--username", "alice", "--password", "secret")
	if code != 0 {
		t.Fatalf("init failed: %d %s", code, stderr)
	}
	code, _, stderr = runCmd(t, "secret\n", "--db", db, "login", "--username", "alice")
	if code != 0 {
		t.Fatalf("login failed: %d %s", code, stderr)
	}
	code, out, stderr := runCmd(t, "", "--db", db, "whoami")
	if code != 0 {
		t.Fatalf("whoami failed: %d %s", code, stderr)
	}
	if !strings.Contains(out, "alice") || !strings.Contains(out, "expires") {
		t.Fatalf("whoami output missing expected fields: %s", out)
	}
}

func TestHumanDateInputsOnAddAndEdit(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")

	code, _, stderr := runCmd(t, "", "--db", db, "init", "--username", "Daniel", "--password", "hola123")
	if code != 0 {
		t.Fatalf("init failed: %d %s", code, stderr)
	}
	code, _, stderr = runCmd(t, "hola123\n", "--db", db, "login", "--username", "Daniel")
	if code != 0 {
		t.Fatalf("login failed: %d %s", code, stderr)
	}

	code, out, stderr := runCmd(t, "", "--db", db, "--format", "json", "add", "Human Date Task", "--due", "2026-03-05")
	if code != 0 {
		t.Fatalf("add with date-only failed: %d %s", code, stderr)
	}
	task := mustTaskFromJSON(t, out)
	if task.DueAt == nil || task.DueAt.Format(time.RFC3339) != "2026-03-05T08:00:00Z" {
		t.Fatalf("expected date-only due default hour 08:00:00Z, got %#v", task.DueAt)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "--format", "json", "edit", task.ID, "--due", "03/06/2026 17:00", "--expected-version", "1")
	if code != 0 {
		t.Fatalf("edit with MM/DD/YYYY HH:MM failed: %d %s", code, stderr)
	}
	task = mustTaskFromJSON(t, out)
	if task.DueAt == nil || task.DueAt.Format(time.RFC3339) != "2026-03-06T17:00:00Z" {
		t.Fatalf("expected due 2026-03-06T17:00:00Z, got %#v", task.DueAt)
	}
}

func TestExitCodeMatrix(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	db := filepath.Join(t.TempDir(), "todo.db")

	// 1: runtime
	code, _, _ := runCmd(t, "", "--db", "/dev/null/todo.db", "init")
	if code != 1 {
		t.Fatalf("expected exit 1 for runtime failure, got %d", code)
	}

	// 3: auth/not found
	code, _, stderr := runCmd(t, "", "--db", db, "init")
	if code != 0 {
		t.Fatalf("init failed: %d %s", code, stderr)
	}
	code, _, stderr = runCmd(t, "", "--db", db, "list")
	if code != 3 {
		t.Fatalf("expected exit 3 for auth required, got %d err=%s", code, stderr)
	}

	// Setup authenticated user + task for validation/conflict checks.
	createUserSessionAndTask(t, db, home, "u30", "m", "tok30", "t30")

	// 2: validation/usage
	code, _, stderr = runCmd(t, "", "--db", db, "edit", "t30", "--title", "x")
	if code != 2 {
		t.Fatalf("expected exit 2 for validation error, got %d err=%s", code, stderr)
	}

	// 4: OCC conflict
	s, _ := sqlite.Open(db)
	defer s.Close()
	title := "updated"
	_, _ = s.UpdateTask(context.Background(), "u30", "t30", 1, domain.TaskPatch{Title: &title})
	code, _, stderr = runCmd(t, "", "--db", db, "edit", "t30", "--title", "stale", "--expected-version", "1")
	if code != 4 {
		t.Fatalf("expected exit 4 for occ conflict, got %d err=%s", code, stderr)
	}

	// 0: success
	code, _, stderr = runCmd(t, "", "--db", db, "list")
	if code != 0 {
		t.Fatalf("expected exit 0 for success, got %d err=%s", code, stderr)
	}
}

func TestHelpAndManCoverageAcrossCommands(t *testing.T) {
	helpCommands := [][]string{
		{"--help"},
		{"init", "--help"},
		{"login", "--help"},
		{"logout", "--help"},
		{"whoami", "--help"},
		{"add", "--help"},
		{"list", "--help"},
		{"show", "--help"},
		{"edit", "--help"},
		{"done", "--help"},
		{"cancel", "--help"},
		{"reopen", "--help"},
		{"rm", "--help"},
		{"review", "--help"},
		{"review", "daily", "--help"},
		{"review", "weekly", "--help"},
		{"export", "--help"},
		{"sync", "--help"},
		{"sync", "obsidian", "--help"},
		{"config", "--help"},
		{"config", "set", "--help"},
		{"config", "get", "--help"},
		{"config", "show", "--help"},
		{"man", "--help"},
	}
	for _, args := range helpCommands {
		code, out, stderr := runCmd(t, "", args...)
		if code != 0 {
			t.Fatalf("help failed for %v: code=%d err=%s", args, code, stderr)
		}
		if !strings.Contains(out, "Exit codes:") || !strings.Contains(out, "Examples:") {
			t.Fatalf("help missing required sections for %v: %s", args, out)
		}
	}

	manCommands := []string{"init", "login", "logout", "whoami", "add", "list", "show", "edit", "done", "cancel", "reopen", "rm", "review", "export", "sync"}
	for _, c := range manCommands {
		code, out, stderr := runCmd(t, "", "man", c)
		if code != 0 {
			t.Fatalf("man failed for %s: code=%d err=%s", c, code, stderr)
		}
		for _, section := range []string{"## Synopsis", "## Detailed behavior", "## Flags", "## Output contracts", "## Concurrency", "## Auth", "## Practical examples"} {
			if !strings.Contains(out, section) {
				t.Fatalf("man page %s missing section %s: %s", c, section, out)
			}
		}
	}
}

func TestConfigSetGetShowAndDBResolution(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	dbCfg := filepath.Join(t.TempDir(), "cfg.db")

	code, out, stderr := runCmd(t, "", "config", "set", "db.path", dbCfg)
	if code != 0 || !strings.Contains(out, "ok") {
		t.Fatalf("config set failed: code=%d out=%s err=%s", code, out, stderr)
	}
	code, out, stderr = runCmd(t, "", "config", "get", "db.path")
	if code != 0 || strings.TrimSpace(out) != dbCfg {
		t.Fatalf("config get failed: code=%d out=%q err=%s", code, out, stderr)
	}
	code, out, stderr = runCmd(t, "", "config", "show")
	if code != 0 || !strings.Contains(out, "db.path="+dbCfg) {
		t.Fatalf("config show failed: code=%d out=%s err=%s", code, out, stderr)
	}

	// No --db provided: should use configured db.path.
	code, _, stderr = runCmd(t, "", "init", "--username", "Daniel", "--password", "hola123")
	if code != 0 {
		t.Fatalf("init via configured db failed: code=%d err=%s", code, stderr)
	}
	if _, err := os.Stat(dbCfg); err != nil {
		t.Fatalf("expected configured db file to exist: %v", err)
	}

	// Env var should override config.
	dbEnv := filepath.Join(t.TempDir(), "env.db")
	t.Setenv("TODO_DB", dbEnv)
	code, _, stderr = runCmd(t, "", "init")
	if code != 0 {
		t.Fatalf("init via TODO_DB override failed: code=%d err=%s", code, stderr)
	}
	if _, err := os.Stat(dbEnv); err != nil {
		t.Fatalf("expected env db file to exist: %v", err)
	}
}
