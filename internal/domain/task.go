package domain

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

const (
	StatusOpen      = "open"
	StatusDone      = "done"
	StatusCancelled = "cancelled"
	StatusSnoozed   = "snoozed"
)

var allowedStatuses = map[string]struct{}{
	StatusOpen:      {},
	StatusDone:      {},
	StatusCancelled: {},
	StatusSnoozed:   {},
}

var allowedPriorities = map[string]struct{}{
	"P1": {}, "P2": {}, "P3": {}, "P4": {},
}

type Task struct {
	ID            string     `json:"id"`
	UserID        string     `json:"user_id"`
	EntityVersion int        `json:"entity_version"`
	RowVersion    int        `json:"row_version"`
	Title         string     `json:"title"`
	Description   string     `json:"description,omitempty"`
	Status        string     `json:"status"`
	Project       string     `json:"project,omitempty"`
	Priority      string     `json:"priority"`
	ScheduledAt   *time.Time `json:"scheduled_at,omitempty"`
	DueAt         *time.Time `json:"due_at,omitempty"`
	Recurrence    string     `json:"recurrence,omitempty"`
	Energy        *int       `json:"energy,omitempty"`
	EstimateMin   *int       `json:"estimate_min,omitempty"`
	Source        string     `json:"source"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	CompletedAt   *time.Time `json:"completed_at,omitempty"`
	Tags          []string   `json:"tags,omitempty"`
}

type TaskPatch struct {
	Title       *string
	Description *string
	Project     *string
	Priority    *string
	ScheduledAt **time.Time
	DueAt       **time.Time
	Recurrence  *string
	Energy      **int
	EstimateMin **int
	Status      *string
	Source      *string
	Tags        *[]string
}

func ValidateStatus(s string) error {
	if _, ok := allowedStatuses[s]; !ok {
		return fmt.Errorf("invalid status: %s", s)
	}
	return nil
}

func ValidatePriority(p string) error {
	if _, ok := allowedPriorities[p]; !ok {
		return fmt.Errorf("invalid priority: %s", p)
	}
	return nil
}

func ValidateTask(t Task) error {
	if strings.TrimSpace(t.ID) == "" {
		return errors.New("id is required")
	}
	if strings.TrimSpace(t.UserID) == "" {
		return errors.New("user_id is required")
	}
	if strings.TrimSpace(t.Title) == "" {
		return errors.New("title is required")
	}
	if err := ValidateStatus(t.Status); err != nil {
		return err
	}
	if err := ValidatePriority(t.Priority); err != nil {
		return err
	}
	if t.Energy != nil && (*t.Energy < 1 || *t.Energy > 5) {
		return errors.New("energy must be 1..5")
	}
	if t.EstimateMin != nil && *t.EstimateMin <= 0 {
		return errors.New("estimate_min must be > 0")
	}
	return nil
}

func NormalizeTags(tags []string) []string {
	set := map[string]struct{}{}
	for _, t := range tags {
		t = strings.TrimSpace(strings.ToLower(t))
		if t == "" {
			continue
		}
		set[t] = struct{}{}
	}
	out := make([]string, 0, len(set))
	for t := range set {
		out = append(out, t)
	}
	sort.Strings(out)
	return out
}
