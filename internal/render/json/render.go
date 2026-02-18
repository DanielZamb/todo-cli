package json

import (
	"encoding/json"
	"time"

	"todo-cli/internal/domain"
)

type Envelope struct {
	GeneratedAt string            `json:"generated_at"`
	Filters     map[string]string `json:"filters,omitempty"`
	Tasks       []domain.Task     `json:"tasks,omitempty"`
	Task        *domain.Task      `json:"task,omitempty"`
	Code        string            `json:"code,omitempty"`
	Message     string            `json:"message,omitempty"`
}

func Tasks(tasks []domain.Task, filters map[string]string) (string, error) {
	b, err := json.MarshalIndent(Envelope{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Filters: filters, Tasks: tasks}, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b) + "\n", nil
}

func Task(task domain.Task) (string, error) {
	b, err := json.MarshalIndent(Envelope{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Task: &task}, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b) + "\n", nil
}

func Error(code, message string) (string, error) {
	b, err := json.MarshalIndent(Envelope{GeneratedAt: time.Now().UTC().Format(time.RFC3339), Code: code, Message: message}, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b) + "\n", nil
}
