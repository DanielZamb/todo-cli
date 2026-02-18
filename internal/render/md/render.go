package md

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"todo-cli/internal/domain"
)

func oneLineTask(t domain.Task) string {
	parts := []string{fmt.Sprintf("- [%s] [%s] %s (id: %s, v:%d)", checkbox(t.Status), t.Priority, t.Title, t.ID, t.RowVersion)}
	for _, tag := range t.Tags {
		parts = append(parts, "#"+tag)
	}
	if t.Project != "" {
		parts = append(parts, "@"+t.Project)
	}
	if t.DueAt != nil {
		parts = append(parts, "due:"+t.DueAt.Format("2006-01-02"))
	}
	if t.Energy != nil {
		parts = append(parts, fmt.Sprintf("energy:%d", *t.Energy))
	}
	if t.EstimateMin != nil {
		parts = append(parts, fmt.Sprintf("est:%dm", *t.EstimateMin))
	}
	return strings.Join(parts, " ")
}

func checkbox(status string) string {
	if status == domain.StatusDone {
		return "x"
	}
	return " "
}

func RenderTasks(tasks []domain.Task) string {
	if len(tasks) == 0 {
		return "# Tasks\n\n_No tasks found._\n"
	}
	var b strings.Builder
	b.WriteString("# Tasks\n\n")
	for _, t := range tasks {
		b.WriteString(oneLineTask(t))
		b.WriteString("\n")
	}
	return b.String()
}

func RenderTask(t domain.Task) string {
	var b strings.Builder
	b.WriteString("# Task\n\n")
	b.WriteString(oneLineTask(t) + "\n\n")
	b.WriteString(fmt.Sprintf("- status: %s\n- entity_version: %d\n- created_at: %s\n- updated_at: %s\n", t.Status, t.EntityVersion, t.CreatedAt.Format(time.RFC3339), t.UpdatedAt.Format(time.RFC3339)))
	if t.Description != "" {
		b.WriteString("\n## Description\n\n")
		b.WriteString(t.Description + "\n")
	}
	return b.String()
}

func RenderReviewDaily(tasks []domain.Task) string {
	today := time.Now().UTC().Format("2006-01-02")
	var overdue, scheduled, inbox []domain.Task
	for _, t := range tasks {
		if t.Status != domain.StatusOpen {
			continue
		}
		if t.DueAt != nil && t.DueAt.Format("2006-01-02") < today {
			overdue = append(overdue, t)
		}
		if (t.ScheduledAt != nil && t.ScheduledAt.Format("2006-01-02") == today) || (t.DueAt != nil && t.DueAt.Format("2006-01-02") == today) {
			scheduled = append(scheduled, t)
		}
		if t.Project == "" {
			inbox = append(inbox, t)
		}
	}
	return renderReview("Today", overdue, scheduled, inbox)
}

func RenderReviewWeekly(tasks []domain.Task) string {
	now := time.Now().UTC()
	cut := now.AddDate(0, 0, 7)
	staleCut := now.AddDate(0, 0, -7)
	var overdue, scheduled, inbox, missing []domain.Task
	for _, t := range tasks {
		if t.Status != domain.StatusOpen {
			continue
		}
		if t.DueAt != nil && t.DueAt.Before(now) {
			overdue = append(overdue, t)
		}
		if t.DueAt != nil && (t.DueAt.Equal(now) || (t.DueAt.After(now) && t.DueAt.Before(cut))) {
			scheduled = append(scheduled, t)
		}
		if t.Project == "" {
			if !t.CreatedAt.IsZero() && t.CreatedAt.Before(staleCut) {
				inbox = append(inbox, t)
			}
		}
		if t.Project == "" || (t.DueAt == nil && t.ScheduledAt == nil) {
			missing = append(missing, t)
		}
	}
	return renderReviewWeekly("Weekly", overdue, scheduled, inbox, missing)
}

func renderReview(title string, overdue, scheduled, inbox []domain.Task) string {
	sort.SliceStable(overdue, func(i, j int) bool { return overdue[i].ID < overdue[j].ID })
	sort.SliceStable(scheduled, func(i, j int) bool { return scheduled[i].ID < scheduled[j].ID })
	sort.SliceStable(inbox, func(i, j int) bool { return inbox[i].ID < inbox[j].ID })
	var b strings.Builder
	b.WriteString("# " + title + "\n\n")
	b.WriteString("## Overdue\n")
	if len(overdue) == 0 {
		b.WriteString("_None_\n")
	}
	for _, t := range overdue {
		b.WriteString(oneLineTask(t) + "\n")
	}
	b.WriteString("\n## Scheduled\n")
	if len(scheduled) == 0 {
		b.WriteString("_None_\n")
	}
	for _, t := range scheduled {
		b.WriteString(oneLineTask(t) + "\n")
	}
	b.WriteString("\n## Inbox\n")
	if len(inbox) == 0 {
		b.WriteString("_None_\n")
	}
	for _, t := range inbox {
		b.WriteString(oneLineTask(t) + "\n")
	}
	return b.String()
}

func renderReviewWeekly(title string, overdue, scheduled, inbox, missing []domain.Task) string {
	sort.SliceStable(overdue, func(i, j int) bool { return overdue[i].ID < overdue[j].ID })
	sort.SliceStable(scheduled, func(i, j int) bool { return scheduled[i].ID < scheduled[j].ID })
	sort.SliceStable(inbox, func(i, j int) bool { return inbox[i].ID < inbox[j].ID })
	sort.SliceStable(missing, func(i, j int) bool { return missing[i].ID < missing[j].ID })
	var b strings.Builder
	b.WriteString("# " + title + "\n\n")
	b.WriteString("## Overdue\n")
	if len(overdue) == 0 {
		b.WriteString("_None_\n")
	}
	for _, t := range overdue {
		b.WriteString(oneLineTask(t) + "\n")
	}
	b.WriteString("\n## Scheduled\n")
	if len(scheduled) == 0 {
		b.WriteString("_None_\n")
	}
	for _, t := range scheduled {
		b.WriteString(oneLineTask(t) + "\n")
	}
	b.WriteString("\n## Stale Inbox\n")
	if len(inbox) == 0 {
		b.WriteString("_None_\n")
	}
	for _, t := range inbox {
		b.WriteString(oneLineTask(t) + "\n")
	}
	b.WriteString("\n## Missing Metadata\n")
	if len(missing) == 0 {
		b.WriteString("_None_\n")
	}
	for _, t := range missing {
		b.WriteString(oneLineTask(t) + "\n")
	}
	return b.String()
}

func RenderError(code, msg string) string {
	return fmt.Sprintf("# Error\n\n- code: %s\n- message: %s\n", code, msg)
}
