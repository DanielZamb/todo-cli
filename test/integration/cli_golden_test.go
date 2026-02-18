package integration

import (
	"context"
	"os"
	"path/filepath"
	"regexp"
	"testing"
	"time"

	"todo-cli/internal/domain"
	"todo-cli/internal/store/sqlite"
)

func setupGoldenCLIData(t *testing.T) (db string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	db = filepath.Join(t.TempDir(), "todo.db")

	s, err := sqlite.Open(db)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	ctx := context.Background()
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	u, err := s.CreateUser(ctx, "u-golden", "golden", "secret")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateSession(ctx, "sess-golden", u.ID, "tok-golden", 24*time.Hour); err != nil {
		t.Fatal(err)
	}
	writeSessionToken(t, home, "default", "tok-golden")

	overdue := time.Date(2000, 1, 1, 9, 0, 0, 0, time.UTC)
	if _, err := s.CreateTask(ctx, domain.Task{ID: "a-overdue", UserID: u.ID, EntityVersion: 1, Title: "Overdue Task", Status: domain.StatusOpen, Priority: "P1", Project: "work", DueAt: &overdue}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateTask(ctx, domain.Task{ID: "b-inbox", UserID: u.ID, EntityVersion: 1, Title: "Inbox Task", Status: domain.StatusOpen, Priority: "P3"}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateTask(ctx, domain.Task{ID: "c-done", UserID: u.ID, EntityVersion: 1, Title: "Done Task", Status: domain.StatusDone, Priority: "P4", Project: "work"}); err != nil {
		t.Fatal(err)
	}

	return db
}

func readGolden(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func normalizeExportJSON(s string) string {
	re := regexp.MustCompile(`"generated_at"\s*:\s*"[^"]+"`)
	s = re.ReplaceAllString(s, `"generated_at": "<TS>"`)
	re = regexp.MustCompile(`"created_at"\s*:\s*"[^"]+"`)
	s = re.ReplaceAllString(s, `"created_at": "<TS>"`)
	re = regexp.MustCompile(`"updated_at"\s*:\s*"[^"]+"`)
	s = re.ReplaceAllString(s, `"updated_at": "<TS>"`)
	return s
}

func TestCLIGoldenReviewAndExportSnapshots(t *testing.T) {
	db := setupGoldenCLIData(t)

	code, out, stderr := runCmd(t, "", "--db", db, "review", "daily")
	if code != 0 {
		t.Fatalf("daily review failed: %d %s", code, stderr)
	}
	if out != readGolden(t, "review_daily.golden") {
		t.Fatalf("daily snapshot mismatch\nwant:\n%s\ngot:\n%s", readGolden(t, "review_daily.golden"), out)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "review", "weekly")
	if code != 0 {
		t.Fatalf("weekly review failed: %d %s", code, stderr)
	}
	if out != readGolden(t, "review_weekly.golden") {
		t.Fatalf("weekly snapshot mismatch\nwant:\n%s\ngot:\n%s", readGolden(t, "review_weekly.golden"), out)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "export")
	if code != 0 {
		t.Fatalf("export default failed: %d %s", code, stderr)
	}
	if out != readGolden(t, "export_default_md.golden") {
		t.Fatalf("export default snapshot mismatch\nwant:\n%s\ngot:\n%s", readGolden(t, "export_default_md.golden"), out)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "export", "--template", "jira-context")
	if code != 0 {
		t.Fatalf("export jira-context failed: %d %s", code, stderr)
	}
	if out != readGolden(t, "export_jira_md.golden") {
		t.Fatalf("export jira snapshot mismatch\nwant:\n%s\ngot:\n%s", readGolden(t, "export_jira_md.golden"), out)
	}

	code, out, stderr = runCmd(t, "", "--db", db, "--format", "json", "export")
	if code != 0 {
		t.Fatalf("export json failed: %d %s", code, stderr)
	}
	n := normalizeExportJSON(out)
	if n != readGolden(t, "export_default_json.golden") {
		t.Fatalf("export json snapshot mismatch\nwant:\n%s\ngot:\n%s", readGolden(t, "export_default_json.golden"), n)
	}
}
