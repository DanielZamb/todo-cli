package md

import (
	"strings"
	"testing"
	"time"

	"todo-cli/internal/domain"
)

func TestRenderTasksDeterministic(t *testing.T) {
	e := 3
	est := 25
	due := time.Date(2026, 2, 20, 10, 0, 0, 0, time.UTC)
	tasks := []domain.Task{{ID: "a1", Priority: "P2", Title: "Pay rent", RowVersion: 2, Status: domain.StatusOpen, Project: "home", DueAt: &due, Energy: &e, EstimateMin: &est, Tags: []string{"finance"}}}

	got := RenderTasks(tasks)
	want := "# Tasks\n\n- [ ] [P2] Pay rent (id: a1, v:2) #finance @home due:2026-02-20 energy:3 est:25m\n"
	if got != want {
		t.Fatalf("unexpected render\nwant:\n%s\ngot:\n%s", want, got)
	}
}

func TestRenderReviewDailyAndWeeklySections(t *testing.T) {
	now := time.Now().UTC()
	yesterday := now.Add(-24 * time.Hour)
	today := now
	in2Days := now.Add(48 * time.Hour)
	old := now.AddDate(0, 0, -10)

	tasks := []domain.Task{
		{ID: "a", Priority: "P1", Title: "Overdue Inbox", RowVersion: 1, Status: domain.StatusOpen, DueAt: &yesterday, CreatedAt: old},
		{ID: "b", Priority: "P2", Title: "Today Scheduled", RowVersion: 1, Status: domain.StatusOpen, Project: "work", DueAt: &today},
		{ID: "c", Priority: "P3", Title: "Weekly Item", RowVersion: 1, Status: domain.StatusOpen, Project: "work", DueAt: &in2Days},
		{ID: "d", Priority: "P4", Title: "Missing Meta", RowVersion: 1, Status: domain.StatusOpen, Project: ""},
	}

	daily := RenderReviewDaily(tasks)
	if !strings.Contains(daily, "# Today") || !strings.Contains(daily, "## Overdue") || !strings.Contains(daily, "## Scheduled") || !strings.Contains(daily, "## Inbox") {
		t.Fatalf("daily missing sections: %s", daily)
	}
	if !strings.Contains(daily, "Overdue Inbox") || !strings.Contains(daily, "Today Scheduled") {
		t.Fatalf("daily missing expected tasks: %s", daily)
	}

	weekly := RenderReviewWeekly(tasks)
	if !strings.Contains(weekly, "# Weekly") || !strings.Contains(weekly, "Weekly Item") {
		t.Fatalf("weekly missing expected content: %s", weekly)
	}
	if !strings.Contains(weekly, "## Stale Inbox") || !strings.Contains(weekly, "## Missing Metadata") {
		t.Fatalf("weekly missing new sections: %s", weekly)
	}
	if !strings.Contains(weekly, "Overdue Inbox") || !strings.Contains(weekly, "Missing Meta") {
		t.Fatalf("weekly missing stale/metadata tasks: %s", weekly)
	}
}
