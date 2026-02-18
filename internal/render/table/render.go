package table

import (
	"fmt"
	"strings"

	"todo-cli/internal/domain"
)

func Tasks(tasks []domain.Task) string {
	var b strings.Builder
	b.WriteString("ID\tV\tSTATUS\tPRIO\tTITLE\n")
	for _, t := range tasks {
		b.WriteString(fmt.Sprintf("%s\t%d\t%s\t%s\t%s\n", t.ID, t.RowVersion, t.Status, t.Priority, t.Title))
	}
	return b.String()
}

func Task(t domain.Task) string {
	return Tasks([]domain.Task{t})
}

func Error(code, message string) string {
	return fmt.Sprintf("ERROR\t%s\t%s\n", code, message)
}
