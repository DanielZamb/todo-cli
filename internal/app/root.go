package app

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"todo-cli/internal/auth"
	"todo-cli/internal/docs"
	"todo-cli/internal/domain"
	jsonrender "todo-cli/internal/render/json"
	mdrender "todo-cli/internal/render/md"
	tablerender "todo-cli/internal/render/table"
	"todo-cli/internal/store/sqlite"

	"todo-cli/internal/obsidian"

	"github.com/spf13/cobra"
	"golang.org/x/term"
)

type cliError struct {
	Exit   int
	Code   string
	Msg    string
	Latest *domain.Task
}

func (e *cliError) Error() string { return e.Msg }

type runtimeConfig struct {
	Format    string
	DBPath    string
	Profile   string
	HelpHuman bool
	Out       io.Writer
	Err       io.Writer
	In        io.Reader
}

const sharedExitCodesHelp = `Exit codes:
  0 success
  1 runtime failure
  2 validation/usage error
  3 not found/auth missing
  4 OCC conflict`

const customHelpTemplate = `{{with (or .Long .Short)}}{{.}}{{end}}

Usage:
  {{.UseLine}}
{{if .HasAvailableSubCommands}}
Available Commands:{{range .Commands}}{{if (or .IsAvailableCommand (eq .Name "help"))}}
  {{rpad .Name .NamePadding }} {{.Short}}{{end}}{{end}}{{end}}{{if .HasAvailableLocalFlags}}

Flags:
{{.LocalFlags.FlagUsages | trimTrailingWhitespaces}}{{end}}{{if .HasAvailableInheritedFlags}}
Global Flags:
{{.InheritedFlags.FlagUsages | trimTrailingWhitespaces}}{{end}}

` + sharedExitCodesHelp + `

Examples:
{{if .Example}}{{.Example}}{{else}}  {{.CommandPath}} --help
  {{.CommandPath}} --format json{{end}}{{if .HasHelpSubCommands}}

Use "{{.CommandPath}} [command] --help" for more information about a command.{{end}}
`

func Execute(args []string, in io.Reader, out, errOut io.Writer) int {
	cfg := &runtimeConfig{Format: "md", DBPath: "", Profile: "default", Out: out, Err: errOut, In: in}
	printFirstRunDisclaimer(errOut)
	if hasHelpHumanFlag(args) {
		printHumanOnboarding(out)
		return 0
	}
	cmd := newRootCmd(cfg)
	cmd.SetOut(out)
	cmd.SetErr(errOut)
	cmd.SetArgs(args)
	if err := cmd.Execute(); err != nil {
		ce := toCliError(err)
		printError(cfg.Format, errOut, ce.Code, ce.Msg, ce.Latest)
		return ce.Exit
	}
	return 0
}

func toCliError(err error) *cliError {
	var ce *cliError
	if errors.As(err, &ce) {
		return ce
	}
	return &cliError{Exit: 1, Code: "runtime_error", Msg: err.Error()}
}

func printError(format string, w io.Writer, code, msg string, latest *domain.Task) {
	if code == "" {
		code = "runtime_error"
	}
	switch format {
	case "json":
		out, err := jsonrender.Error(code, msg)
		if err == nil {
			_, _ = io.WriteString(w, out)
		}
		if latest != nil {
			out, _ = jsonrender.Task(*latest)
			_, _ = io.WriteString(w, out)
		}
	case "table":
		_, _ = io.WriteString(w, tablerender.Error(code, msg))
		if latest != nil {
			_, _ = io.WriteString(w, tablerender.Task(*latest))
		}
	default:
		_, _ = io.WriteString(w, mdrender.RenderError(code, msg))
		if latest != nil {
			_, _ = io.WriteString(w, "\n## Latest Record\n\n")
			_, _ = io.WriteString(w, mdrender.RenderTask(*latest))
		}
	}
}

func newRootCmd(cfg *runtimeConfig) *cobra.Command {
	root := &cobra.Command{
		Use:           "todo",
		Short:         "Track tasks with markdown-first output",
		Long:          "Todo CLI: local-first task tracking with OCC, auth, and markdown-first output.",
		Example:       "  todo init --username alice --password secret\n  todo login --username alice\n  todo add \"Pay rent\" --priority P1 --due 2026-02-20T10:00:00Z\n  todo list --format md",
		SilenceErrors: true,
		SilenceUsage:  true,
	}
	root.SetHelpTemplate(customHelpTemplate)
	root.PersistentFlags().StringVar(&cfg.Format, "format", "md", "output format: md|json|table")
	root.PersistentFlags().StringVar(&cfg.DBPath, "db", "", "sqlite db path (optional; resolved from TODO_DB/config/default)")
	root.PersistentFlags().StringVar(&cfg.Profile, "profile", "default", "profile name")
	root.PersistentFlags().BoolVar(&cfg.HelpHuman, "help-human-flag", false, "show human onboarding guide")
	root.PersistentFlags().Bool("no-color", false, "disable color output")
	root.PersistentPreRunE = func(cmd *cobra.Command, args []string) error {
		cfg.DBPath = resolveDBPath(cfg.DBPath)
		return nil
	}
	root.AddCommand(newInitCmd(cfg), newLoginCmd(cfg), newLogoutCmd(cfg), newWhoamiCmd(cfg))
	root.AddCommand(newAddCmd(cfg), newListCmd(cfg), newShowCmd(cfg), newEditCmd(cfg), newDoneCmd(cfg), newCancelCmd(cfg), newReopenCmd(cfg), newRmCmd(cfg))
	root.AddCommand(newReviewCmd(cfg), newExportCmd(cfg), newSyncCmd(cfg), newManCmd(), newConfigCmd(cfg))
	return root
}

func hasHelpHumanFlag(args []string) bool {
	for _, a := range args {
		if a == "--help-human-flag" {
			return true
		}
	}
	return false
}

func printHumanOnboarding(w io.Writer) {
	_, _ = io.WriteString(w, `# Human Onboarding

This CLI is strict for agent reliability (especially optimistic concurrency).
If you are human, use this fast workflow:

1. Initialize and login
   - todo --db /tmp/todo.db init --username <you> --password <pass>
   - todo --db /tmp/todo.db login --username <you>

2. Add task quickly
   - todo --db /tmp/todo.db add "Pay rent" --priority P1 --due 2026-03-05
   - Date-only values default to 08:00 UTC.

3. Edit and complete with OCC
   - todo --db /tmp/todo.db show <task-id>   (read current v:<row_version>)
   - todo --db /tmp/todo.db edit <task-id> --title "Updated" --expected-version <v>
   - todo --db /tmp/todo.db done <task-id> --expected-version <v+1>

4. Plan views
   - todo --db /tmp/todo.db review daily
   - todo --db /tmp/todo.db review weekly

Tip for humans:
- If you get occ_conflict, re-run show/list and retry with the latest version shown in output.
- Set your default DB once: todo config set db.path /path/to/todo.db
`)
}

func printFirstRunDisclaimer(w io.Writer) {
	home, err := os.UserHomeDir()
	if err != nil {
		return
	}
	dir := filepath.Join(home, ".todo-cli")
	marker := filepath.Join(dir, ".first_run_disclaimer_seen")
	if _, err := os.Stat(marker); err == nil {
		return
	}
	_, _ = io.WriteString(w, "Notice: This CLI is optimized for agents and strict consistency. Human? run `todo --help-human-flag` for guided onboarding.\n")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return
	}
	_ = os.WriteFile(marker, []byte(time.Now().UTC().Format(time.RFC3339)+"\n"), 0o600)
}

func withStore(ctx context.Context, cfg *runtimeConfig, fn func(*sqlite.Store) error) error {
	s, err := sqlite.Open(cfg.DBPath)
	if err != nil {
		return &cliError{Exit: 1, Code: "db_open_failed", Msg: err.Error()}
	}
	defer s.Close()
	if err := fn(s); err != nil {
		return err
	}
	return nil
}

func requireUser(ctx context.Context, cfg *runtimeConfig, s *sqlite.Store) (sqlite.User, error) {
	token, err := loadSession(cfg.Profile)
	if err != nil || token == "" {
		return sqlite.User{}, &cliError{Exit: 3, Code: "auth_required", Msg: "run todo login"}
	}
	sess, err := s.SessionByToken(ctx, token)
	if err != nil {
		return sqlite.User{}, &cliError{Exit: 3, Code: "auth_required", Msg: "invalid or expired session"}
	}
	u, err := s.UserByID(ctx, sess.UserID)
	if err != nil {
		return sqlite.User{}, &cliError{Exit: 3, Code: "user_not_found", Msg: "session user not found"}
	}
	return u, nil
}

func renderTask(cfg *runtimeConfig, t domain.Task) error {
	switch cfg.Format {
	case "json":
		out, err := jsonrender.Task(t)
		if err != nil {
			return err
		}
		_, _ = io.WriteString(cfg.Out, out)
	case "table":
		_, _ = io.WriteString(cfg.Out, tablerender.Task(t))
	default:
		_, _ = io.WriteString(cfg.Out, mdrender.RenderTask(t))
	}
	return nil
}

func renderTasks(cfg *runtimeConfig, tasks []domain.Task, filters map[string]string) error {
	switch cfg.Format {
	case "json":
		out, err := jsonrender.Tasks(tasks, filters)
		if err != nil {
			return err
		}
		_, _ = io.WriteString(cfg.Out, out)
	case "table":
		_, _ = io.WriteString(cfg.Out, tablerender.Tasks(tasks))
	default:
		_, _ = io.WriteString(cfg.Out, mdrender.RenderTasks(tasks))
	}
	return nil
}

func readPassword(prompt string, in io.Reader) (string, error) {
	fmt.Fprint(os.Stderr, prompt)
	if in == os.Stdin && term.IsTerminal(int(os.Stdin.Fd())) {
		b, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(os.Stderr)
		return strings.TrimSpace(string(b)), err
	}
	s := bufio.NewScanner(in)
	if !s.Scan() {
		return "", s.Err()
	}
	return strings.TrimSpace(s.Text()), nil
}

func parseOptTime(v string) (*time.Time, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil, nil
	}
	// Full RFC3339 keeps existing strict machine-friendly format.
	if t, err := time.Parse(time.RFC3339, v); err == nil {
		u := t.UTC()
		return &u, nil
	}

	// Human-friendly date-only formats default to 08:00:00 UTC.
	dateLayouts := []string{"2006-01-02", "01/02/2006"}
	for _, layout := range dateLayouts {
		if d, err := time.ParseInLocation(layout, v, time.UTC); err == nil {
			u := time.Date(d.Year(), d.Month(), d.Day(), 8, 0, 0, 0, time.UTC)
			return &u, nil
		}
	}

	// Human-friendly date+hour/minute formats (seconds default to 0).
	timeLayouts := []string{
		"2006-01-02 15",
		"2006-01-02 15:04",
		"01/02/2006 15",
		"01/02/2006 15:04",
	}
	for _, layout := range timeLayouts {
		if t, err := time.ParseInLocation(layout, v, time.UTC); err == nil {
			u := t.UTC()
			return &u, nil
		}
	}

	return nil, fmt.Errorf("invalid datetime format: %s", v)
}

func parseOptInt(v string) (*int, error) {
	if strings.TrimSpace(v) == "" {
		return nil, nil
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		return nil, err
	}
	return &i, nil
}

func newInitCmd(cfg *runtimeConfig) *cobra.Command {
	var username, password string
	cmd := &cobra.Command{Use: "init", Short: "Initialize database schema", RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		return withStore(ctx, cfg, func(s *sqlite.Store) error {
			if err := s.Migrate(ctx); err != nil {
				return &cliError{Exit: 1, Code: "migration_failed", Msg: err.Error()}
			}
			if username != "" {
				if password == "" {
					p, err := readPassword("Password: ", cfg.In)
					if err != nil {
						return &cliError{Exit: 1, Code: "password_read_failed", Msg: err.Error()}
					}
					password = p
				}
				if _, err := s.CreateUser(ctx, newID(), username, password); err != nil {
					return &cliError{Exit: 1, Code: "create_user_failed", Msg: err.Error()}
				}
			}
			_, _ = io.WriteString(cfg.Out, "initialized\n")
			return nil
		})
	}}
	cmd.Flags().StringVar(&username, "username", "", "optional bootstrap username")
	cmd.Flags().StringVar(&password, "password", "", "bootstrap password")
	return cmd
}

func newLoginCmd(cfg *runtimeConfig) *cobra.Command {
	var username string
	cmd := &cobra.Command{Use: "login", Short: "Authenticate and create local session", RunE: func(cmd *cobra.Command, args []string) error {
		if strings.TrimSpace(username) == "" {
			return &cliError{Exit: 2, Code: "invalid_args", Msg: "--username is required"}
		}
		password, err := readPassword("Password: ", cfg.In)
		if err != nil {
			return &cliError{Exit: 1, Code: "password_read_failed", Msg: err.Error()}
		}
		ctx := cmd.Context()
		return withStore(ctx, cfg, func(s *sqlite.Store) error {
			u, hash, err := s.UserByUsername(ctx, username)
			if err != nil {
				return &cliError{Exit: 3, Code: "auth_failed", Msg: "invalid credentials"}
			}
			if !auth.VerifyPassword(hash, password) {
				return &cliError{Exit: 3, Code: "auth_failed", Msg: "invalid credentials"}
			}
			tok, err := auth.GenerateToken()
			if err != nil {
				return &cliError{Exit: 1, Code: "token_generation_failed", Msg: err.Error()}
			}
			sess, err := s.CreateSession(ctx, newID(), u.ID, tok, 24*time.Hour)
			if err != nil {
				return &cliError{Exit: 1, Code: "create_session_failed", Msg: err.Error()}
			}
			if err := saveSession(cfg.Profile, tok); err != nil {
				return &cliError{Exit: 1, Code: "save_session_failed", Msg: err.Error()}
			}
			_, _ = io.WriteString(cfg.Out, fmt.Sprintf("logged in as %s (expires %s)\n", u.Username, sess.ExpiresAt.Format(time.RFC3339)))
			return nil
		})
	}}
	cmd.Flags().StringVar(&username, "username", "", "username")
	return cmd
}

func newLogoutCmd(cfg *runtimeConfig) *cobra.Command {
	return &cobra.Command{Use: "logout", Short: "Revoke local session", RunE: func(cmd *cobra.Command, args []string) error {
		token, _ := loadSession(cfg.Profile)
		ctx := cmd.Context()
		_ = withStore(ctx, cfg, func(s *sqlite.Store) error {
			if token != "" {
				_ = s.RevokeSession(ctx, token)
			}
			return nil
		})
		if err := clearSession(cfg.Profile); err != nil {
			return &cliError{Exit: 1, Code: "logout_failed", Msg: err.Error()}
		}
		_, _ = io.WriteString(cfg.Out, "logged out\n")
		return nil
	}}
}

func newWhoamiCmd(cfg *runtimeConfig) *cobra.Command {
	return &cobra.Command{Use: "whoami", Short: "Show active authenticated user", RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		return withStore(ctx, cfg, func(s *sqlite.Store) error {
			u, err := requireUser(ctx, cfg, s)
			if err != nil {
				return err
			}
			token, _ := loadSession(cfg.Profile)
			sess, _ := s.SessionByToken(ctx, token)
			_, _ = io.WriteString(cfg.Out, fmt.Sprintf("%s (%s) expires %s\n", u.Username, u.ID, sess.ExpiresAt.Format(time.RFC3339)))
			return nil
		})
	}}
}

func newAddCmd(cfg *runtimeConfig) *cobra.Command {
	var desc, project, priority, scheduled, due, recurrence, energyStr, estimateStr, source string
	var tags []string
	cmd := &cobra.Command{Use: "add <title>", Short: "Create task", Args: cobra.ExactArgs(1), RunE: func(cmd *cobra.Command, args []string) error {
		title := strings.TrimSpace(args[0])
		if title == "" {
			return &cliError{Exit: 2, Code: "invalid_args", Msg: "title is required"}
		}
		ctx := cmd.Context()
		return withStore(ctx, cfg, func(s *sqlite.Store) error {
			u, err := requireUser(ctx, cfg, s)
			if err != nil {
				return err
			}
			sch, err := parseOptTime(scheduled)
			if err != nil {
				return &cliError{Exit: 2, Code: "invalid_args", Msg: "invalid --scheduled (RFC3339 required)"}
			}
			dueAt, err := parseOptTime(due)
			if err != nil {
				return &cliError{Exit: 2, Code: "invalid_args", Msg: "invalid --due (RFC3339 required)"}
			}
			energy, err := parseOptInt(energyStr)
			if err != nil {
				return &cliError{Exit: 2, Code: "invalid_args", Msg: "invalid --energy"}
			}
			estimate, err := parseOptInt(estimateStr)
			if err != nil {
				return &cliError{Exit: 2, Code: "invalid_args", Msg: "invalid --estimate"}
			}
			if priority == "" {
				priority = "P3"
			}
			t := domain.Task{ID: newID(), UserID: u.ID, EntityVersion: 1, RowVersion: 1, Title: title, Description: desc, Status: domain.StatusOpen, Project: project, Priority: priority, ScheduledAt: sch, DueAt: dueAt, Recurrence: recurrence, Energy: energy, EstimateMin: estimate, Source: source, Tags: tags}
			created, err := s.CreateTask(ctx, t)
			if err != nil {
				return &cliError{Exit: 2, Code: "create_task_failed", Msg: err.Error()}
			}
			return renderTask(cfg, created)
		})
	}}
	cmd.Flags().StringVar(&desc, "desc", "", "description")
	cmd.Flags().StringVar(&project, "project", "", "project")
	cmd.Flags().StringSliceVar(&tags, "tag", nil, "tag(s)")
	cmd.Flags().StringVar(&priority, "priority", "P3", "priority P1..P4")
	cmd.Flags().StringVar(&scheduled, "scheduled", "", "scheduled at RFC3339")
	cmd.Flags().StringVar(&due, "due", "", "due at RFC3339")
	cmd.Flags().StringVar(&recurrence, "recurrence", "", "recurrence expression")
	cmd.Flags().StringVar(&energyStr, "energy", "", "energy 1..5")
	cmd.Flags().StringVar(&estimateStr, "estimate", "", "estimate minutes")
	cmd.Flags().StringVar(&source, "source", "manual", "source manual|agent|import")
	return cmd
}

func newListCmd(cfg *runtimeConfig) *cobra.Command {
	var f sqlite.ListFilter
	cmd := &cobra.Command{Use: "list", Short: "List tasks", RunE: func(cmd *cobra.Command, args []string) error {
		ctx := cmd.Context()
		return withStore(ctx, cfg, func(s *sqlite.Store) error {
			u, err := requireUser(ctx, cfg, s)
			if err != nil {
				return err
			}
			tasks, err := s.ListTasks(ctx, u.ID, f)
			if err != nil {
				return &cliError{Exit: 1, Code: "list_failed", Msg: err.Error()}
			}
			filters := map[string]string{}
			if f.Status != "" {
				filters["status"] = f.Status
			}
			return renderTasks(cfg, tasks, filters)
		})
	}}
	cmd.Flags().StringVar(&f.Status, "status", "", "status filter")
	cmd.Flags().StringVar(&f.Project, "project", "", "project filter")
	cmd.Flags().StringVar(&f.Tag, "tag", "", "tag filter")
	cmd.Flags().StringVar(&f.Priority, "priority", "", "priority filter")
	cmd.Flags().BoolVar(&f.Today, "today", false, "today filter")
	cmd.Flags().BoolVar(&f.Overdue, "overdue", false, "overdue filter")
	cmd.Flags().BoolVar(&f.Inbox, "inbox", false, "inbox filter")
	return cmd
}

func newShowCmd(cfg *runtimeConfig) *cobra.Command {
	return &cobra.Command{Use: "show <task-id>", Args: cobra.ExactArgs(1), Short: "Show task", RunE: func(cmd *cobra.Command, args []string) error {
		id := args[0]
		ctx := cmd.Context()
		return withStore(ctx, cfg, func(s *sqlite.Store) error {
			u, err := requireUser(ctx, cfg, s)
			if err != nil {
				return err
			}
			t, err := s.TaskByID(ctx, u.ID, id)
			if err != nil {
				return &cliError{Exit: 3, Code: "not_found", Msg: "task not found"}
			}
			return renderTask(cfg, t)
		})
	}}
}

func expectedVersion(flag int) error {
	if flag <= 0 {
		return &cliError{Exit: 2, Code: "invalid_args", Msg: "--expected-version is required and must be > 0"}
	}
	return nil
}

func newEditCmd(cfg *runtimeConfig) *cobra.Command {
	var expected int
	var title, desc, project, priority, scheduled, due, recurrence, energyStr, estimateStr, source string
	var tags []string
	cmd := &cobra.Command{Use: "edit <task-id>", Args: cobra.ExactArgs(1), Short: "Edit task", RunE: func(cmd *cobra.Command, args []string) error {
		if err := expectedVersion(expected); err != nil {
			return err
		}
		id := args[0]
		ctx := cmd.Context()
		return withStore(ctx, cfg, func(s *sqlite.Store) error {
			u, err := requireUser(ctx, cfg, s)
			if err != nil {
				return err
			}
			patch := domain.TaskPatch{}
			if cmd.Flags().Changed("title") {
				patch.Title = &title
			}
			if cmd.Flags().Changed("desc") {
				patch.Description = &desc
			}
			if cmd.Flags().Changed("project") {
				patch.Project = &project
			}
			if cmd.Flags().Changed("priority") {
				patch.Priority = &priority
			}
			if cmd.Flags().Changed("scheduled") {
				t, err := parseOptTime(scheduled)
				if err != nil {
					return &cliError{Exit: 2, Code: "invalid_args", Msg: "invalid --scheduled"}
				}
				patch.ScheduledAt = &t
			}
			if cmd.Flags().Changed("due") {
				t, err := parseOptTime(due)
				if err != nil {
					return &cliError{Exit: 2, Code: "invalid_args", Msg: "invalid --due"}
				}
				patch.DueAt = &t
			}
			if cmd.Flags().Changed("recurrence") {
				patch.Recurrence = &recurrence
			}
			if cmd.Flags().Changed("energy") {
				v, err := parseOptInt(energyStr)
				if err != nil {
					return &cliError{Exit: 2, Code: "invalid_args", Msg: "invalid --energy"}
				}
				patch.Energy = &v
			}
			if cmd.Flags().Changed("estimate") {
				v, err := parseOptInt(estimateStr)
				if err != nil {
					return &cliError{Exit: 2, Code: "invalid_args", Msg: "invalid --estimate"}
				}
				patch.EstimateMin = &v
			}
			if cmd.Flags().Changed("source") {
				patch.Source = &source
			}
			if cmd.Flags().Changed("tag") {
				patch.Tags = &tags
			}
			res, err := s.UpdateTask(ctx, u.ID, id, expected, patch)
			if err != nil {
				if errors.Is(err, domain.ErrConflict) {
					return &cliError{Exit: 4, Code: "occ_conflict", Msg: "stale row version", Latest: &res.Task}
				}
				if errors.Is(err, domain.ErrNotFound) {
					return &cliError{Exit: 3, Code: "not_found", Msg: "task not found"}
				}
				return &cliError{Exit: 2, Code: "update_failed", Msg: err.Error()}
			}
			return renderTask(cfg, res.Task)
		})
	}}
	cmd.Flags().IntVar(&expected, "expected-version", 0, "expected row_version")
	cmd.Flags().StringVar(&title, "title", "", "title")
	cmd.Flags().StringVar(&desc, "desc", "", "description")
	cmd.Flags().StringVar(&project, "project", "", "project")
	cmd.Flags().StringSliceVar(&tags, "tag", nil, "tags")
	cmd.Flags().StringVar(&priority, "priority", "", "priority")
	cmd.Flags().StringVar(&scheduled, "scheduled", "", "scheduled RFC3339")
	cmd.Flags().StringVar(&due, "due", "", "due RFC3339")
	cmd.Flags().StringVar(&recurrence, "recurrence", "", "recurrence")
	cmd.Flags().StringVar(&energyStr, "energy", "", "energy 1..5")
	cmd.Flags().StringVar(&estimateStr, "estimate", "", "estimate minutes")
	cmd.Flags().StringVar(&source, "source", "", "source")
	return cmd
}

func statusMutCmd(cfg *runtimeConfig, use, short, status string) *cobra.Command {
	var expected int
	cmd := &cobra.Command{Use: use + " <task-id>", Args: cobra.ExactArgs(1), Short: short, RunE: func(cmd *cobra.Command, args []string) error {
		if err := expectedVersion(expected); err != nil {
			return err
		}
		id := args[0]
		ctx := cmd.Context()
		return withStore(ctx, cfg, func(s *sqlite.Store) error {
			u, err := requireUser(ctx, cfg, s)
			if err != nil {
				return err
			}
			patch := domain.TaskPatch{Status: &status}
			res, err := s.UpdateTask(ctx, u.ID, id, expected, patch)
			if err != nil {
				if errors.Is(err, domain.ErrConflict) {
					return &cliError{Exit: 4, Code: "occ_conflict", Msg: "stale row version", Latest: &res.Task}
				}
				if errors.Is(err, domain.ErrNotFound) {
					return &cliError{Exit: 3, Code: "not_found", Msg: "task not found"}
				}
				return &cliError{Exit: 2, Code: "update_failed", Msg: err.Error()}
			}
			return renderTask(cfg, res.Task)
		})
	}}
	cmd.Flags().IntVar(&expected, "expected-version", 0, "expected row_version")
	return cmd
}
func newDoneCmd(cfg *runtimeConfig) *cobra.Command {
	return statusMutCmd(cfg, "done", "Mark task done", domain.StatusDone)
}
func newCancelCmd(cfg *runtimeConfig) *cobra.Command {
	return statusMutCmd(cfg, "cancel", "Cancel task", domain.StatusCancelled)
}
func newReopenCmd(cfg *runtimeConfig) *cobra.Command {
	return statusMutCmd(cfg, "reopen", "Reopen task", domain.StatusOpen)
}

func newRmCmd(cfg *runtimeConfig) *cobra.Command {
	var expected int
	var force bool
	cmd := &cobra.Command{Use: "rm <task-id>", Args: cobra.ExactArgs(1), Short: "Delete task", RunE: func(cmd *cobra.Command, args []string) error {
		if err := expectedVersion(expected); err != nil {
			return err
		}
		ctx := cmd.Context()
		return withStore(ctx, cfg, func(s *sqlite.Store) error {
			u, err := requireUser(ctx, cfg, s)
			if err != nil {
				return err
			}
			res, err := s.DeleteTask(ctx, u.ID, args[0], expected, force)
			if err != nil {
				if errors.Is(err, domain.ErrConflict) {
					return &cliError{Exit: 4, Code: "occ_conflict", Msg: "stale row version", Latest: &res.Task}
				}
				if errors.Is(err, domain.ErrNotFound) {
					return &cliError{Exit: 3, Code: "not_found", Msg: "task not found"}
				}
				return &cliError{Exit: 2, Code: "delete_failed", Msg: err.Error()}
			}
			_, _ = io.WriteString(cfg.Out, "deleted\n")
			return nil
		})
	}}
	cmd.Flags().IntVar(&expected, "expected-version", 0, "expected row_version")
	cmd.Flags().BoolVar(&force, "force", false, "hard-delete")
	return cmd
}

func newReviewCmd(cfg *runtimeConfig) *cobra.Command {
	review := &cobra.Command{Use: "review", Short: "Review tasks"}
	daily := &cobra.Command{Use: "daily", Short: "Daily review", RunE: func(cmd *cobra.Command, args []string) error {
		return withStore(cmd.Context(), cfg, func(s *sqlite.Store) error {
			u, err := requireUser(cmd.Context(), cfg, s)
			if err != nil {
				return err
			}
			tasks, err := s.ListTasks(cmd.Context(), u.ID, sqlite.ListFilter{})
			if err != nil {
				return &cliError{Exit: 1, Code: "review_failed", Msg: err.Error()}
			}
			switch cfg.Format {
			case "json":
				out, _ := jsonrender.Tasks(tasks, map[string]string{"review": "daily"})
				_, _ = io.WriteString(cfg.Out, out)
			case "table":
				_, _ = io.WriteString(cfg.Out, tablerender.Tasks(tasks))
			default:
				_, _ = io.WriteString(cfg.Out, mdrender.RenderReviewDaily(tasks))
			}
			return nil
		})
	}}
	weekly := &cobra.Command{Use: "weekly", Short: "Weekly review", RunE: func(cmd *cobra.Command, args []string) error {
		return withStore(cmd.Context(), cfg, func(s *sqlite.Store) error {
			u, err := requireUser(cmd.Context(), cfg, s)
			if err != nil {
				return err
			}
			tasks, err := s.ListTasks(cmd.Context(), u.ID, sqlite.ListFilter{})
			if err != nil {
				return &cliError{Exit: 1, Code: "review_failed", Msg: err.Error()}
			}
			switch cfg.Format {
			case "json":
				out, _ := jsonrender.Tasks(tasks, map[string]string{"review": "weekly"})
				_, _ = io.WriteString(cfg.Out, out)
			case "table":
				_, _ = io.WriteString(cfg.Out, tablerender.Tasks(tasks))
			default:
				_, _ = io.WriteString(cfg.Out, mdrender.RenderReviewWeekly(tasks))
			}
			return nil
		})
	}}
	review.AddCommand(daily, weekly)
	return review
}

func newExportCmd(cfg *runtimeConfig) *cobra.Command {
	var scope, template, output string
	cmd := &cobra.Command{Use: "export", Short: "Export tasks", RunE: func(cmd *cobra.Command, args []string) error {
		return withStore(cmd.Context(), cfg, func(s *sqlite.Store) error {
			u, err := requireUser(cmd.Context(), cfg, s)
			if err != nil {
				return err
			}
			tasks := make([]domain.Task, 0)
			switch {
			case strings.HasPrefix(scope, "id:"):
				id := strings.TrimSpace(strings.TrimPrefix(scope, "id:"))
				if id == "" {
					return &cliError{Exit: 2, Code: "invalid_args", Msg: "empty id scope"}
				}
				t, err := s.TaskByID(cmd.Context(), u.ID, id)
				if err != nil {
					if errors.Is(err, domain.ErrNotFound) {
						return &cliError{Exit: 3, Code: "not_found", Msg: "task not found"}
					}
					return &cliError{Exit: 1, Code: "export_failed", Msg: err.Error()}
				}
				tasks = append(tasks, t)
			default:
				filter := sqlite.ListFilter{}
				if strings.HasPrefix(scope, "project:") {
					filter.Project = strings.TrimPrefix(scope, "project:")
				}
				if scope == "today" {
					filter.Today = true
				}
				all, err := s.ListTasks(cmd.Context(), u.ID, filter)
				if err != nil {
					return &cliError{Exit: 1, Code: "export_failed", Msg: err.Error()}
				}
				if scope == "weekly" {
					now := time.Now().UTC()
					end := now.AddDate(0, 0, 7)
					for _, t := range all {
						if t.DueAt == nil {
							continue
						}
						if t.DueAt.Before(now) || t.DueAt.Equal(now) || t.DueAt.Before(end) {
							tasks = append(tasks, t)
						}
					}
				} else {
					tasks = all
				}
			}
			var out string
			switch cfg.Format {
			case "json":
				out, err = jsonrender.Tasks(tasks, map[string]string{"scope": scope, "template": template})
			default:
				if template == "jira-context" {
					var b strings.Builder
					b.WriteString("# Jira Context\n\n## Summary\n\n")
					b.WriteString(fmt.Sprintf("- total_tasks: %d\n\n", len(tasks)))
					b.WriteString("## Tasks\n\n")
					b.WriteString(mdrender.RenderTasks(tasks))
					b.WriteString("\n## Agent Instructions\n\nUse this context and transform into Jira markdown.\n")
					out = b.String()
				} else {
					out = mdrender.RenderTasks(tasks)
				}
			}
			if err != nil {
				return &cliError{Exit: 1, Code: "render_failed", Msg: err.Error()}
			}
			if output != "" {
				if err := os.WriteFile(output, []byte(out), 0o644); err != nil {
					return &cliError{Exit: 1, Code: "write_failed", Msg: err.Error()}
				}
				_, _ = io.WriteString(cfg.Out, output+"\n")
				return nil
			}
			_, _ = io.WriteString(cfg.Out, out)
			if !strings.HasSuffix(out, "\n") {
				_, _ = io.WriteString(cfg.Out, "\n")
			}
			return nil
		})
	}}
	cmd.Flags().StringVar(&scope, "scope", "all", "today|weekly|project:<name>|id:<task-id>|all")
	cmd.Flags().StringVar(&template, "template", "default", "default|jira-context")
	cmd.Flags().StringVar(&output, "output", "", "write output to file")
	return cmd
}

func newSyncCmd(cfg *runtimeConfig) *cobra.Command {
	syncCmd := &cobra.Command{Use: "sync", Short: "Sync projections"}
	var vault, file string
	obs := &cobra.Command{Use: "obsidian", Short: "Sync to Obsidian markdown projection", RunE: func(cmd *cobra.Command, args []string) error {
		if strings.TrimSpace(vault) == "" {
			return &cliError{Exit: 2, Code: "invalid_args", Msg: "--vault is required"}
		}
		return withStore(cmd.Context(), cfg, func(s *sqlite.Store) error {
			u, err := requireUser(cmd.Context(), cfg, s)
			if err != nil {
				return err
			}
			tasks, err := s.ListTasks(cmd.Context(), u.ID, sqlite.ListFilter{})
			if err != nil {
				return &cliError{Exit: 1, Code: "sync_failed", Msg: err.Error()}
			}
			path, err := obsidian.WriteProjection(vault, file, tasks)
			if err != nil {
				return &cliError{Exit: 1, Code: "sync_failed", Msg: err.Error()}
			}
			_, _ = io.WriteString(cfg.Out, path+"\n")
			return nil
		})
	}}
	obs.Flags().StringVar(&vault, "vault", "", "obsidian vault path")
	obs.Flags().StringVar(&file, "file", "", "relative target markdown file")
	syncCmd.AddCommand(obs)
	return syncCmd
}

func newManCmd() *cobra.Command {
	return &cobra.Command{Use: "man [command]", Short: "Manual pages", RunE: func(cmd *cobra.Command, args []string) error {
		key := "index"
		if len(args) == 1 {
			key = args[0]
		}
		txt, ok := docs.Manual[key]
		if !ok {
			return &cliError{Exit: 3, Code: "not_found", Msg: "manual page not found"}
		}
		_, _ = io.WriteString(cmd.OutOrStdout(), txt+"\n")
		return nil
	}}
}

func newConfigCmd(cfg *runtimeConfig) *cobra.Command {
	config := &cobra.Command{
		Use:   "config",
		Short: "Manage local CLI configuration",
		Example: "  todo config show\n" +
			"  todo config set db.path /tmp/todo.db\n" +
			"  todo config get db.path",
	}
	show := &cobra.Command{
		Use:   "show",
		Short: "Show current configuration",
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := loadConfig()
			if err != nil {
				return &cliError{Exit: 1, Code: "config_read_failed", Msg: err.Error()}
			}
			path := c.DBPath
			if strings.TrimSpace(path) == "" {
				path = "(unset)"
			}
			_, _ = io.WriteString(cfg.Out, fmt.Sprintf("db.path=%s\n", path))
			return nil
		},
	}
	get := &cobra.Command{
		Use:   "get <key>",
		Short: "Get a config value",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			v, err := getConfigValue(args[0])
			if err != nil {
				return &cliError{Exit: 2, Code: "invalid_args", Msg: err.Error()}
			}
			_, _ = io.WriteString(cfg.Out, v+"\n")
			return nil
		},
	}
	set := &cobra.Command{
		Use:   "set <key> <value>",
		Short: "Set a config value",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := setConfigValue(args[0], args[1]); err != nil {
				return &cliError{Exit: 2, Code: "invalid_args", Msg: err.Error()}
			}
			_, _ = io.WriteString(cfg.Out, "ok\n")
			return nil
		},
	}
	config.AddCommand(show, get, set)
	return config
}
