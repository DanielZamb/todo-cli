package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"todo-cli/internal/auth"
	"todo-cli/internal/domain"

	_ "github.com/mattn/go-sqlite3"
)

type Store struct {
	db *sql.DB
}

type User struct {
	ID        string
	Username  string
	Status    string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Session struct {
	ID        string
	UserID    string
	TokenHash string
	ExpiresAt time.Time
	CreatedAt time.Time
	RevokedAt *time.Time
}

type ListFilter struct {
	Status   string
	Project  string
	Priority string
	Tag      string
	Today    bool
	Overdue  bool
	Inbox    bool
}

type MutateResult struct {
	Task     domain.Task
	Conflict bool
}

func Open(dbPath string) (*Store, error) {
	if strings.HasPrefix(dbPath, "~") {
		home, _ := os.UserHomeDir()
		dbPath = filepath.Join(home, strings.TrimPrefix(dbPath, "~/"))
	}
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o700); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(5)
	if _, err = db.Exec(`PRAGMA foreign_keys = ON;`); err != nil {
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) Migrate(ctx context.Context) error {
	_, thisFile, _, _ := runtime.Caller(0)
	migrationPath := filepath.Join(filepath.Dir(thisFile), "migrations", "0001_init.sql")
	b, err := os.ReadFile(migrationPath)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, string(b))
	return err
}

func now() time.Time { return time.Now().UTC().Truncate(time.Second) }

func (s *Store) CreateUser(ctx context.Context, id, username, password string) (User, error) {
	h, err := auth.HashPassword(password)
	if err != nil {
		return User{}, err
	}
	t := now()
	_, err = s.db.ExecContext(ctx, `INSERT INTO users(id, username, password_hash, status, created_at, updated_at) VALUES (?,?,?,?,?,?)`, id, username, h, "active", t.Format(time.RFC3339), t.Format(time.RFC3339))
	if err != nil {
		return User{}, err
	}
	return User{ID: id, Username: username, Status: "active", CreatedAt: t, UpdatedAt: t}, nil
}

func (s *Store) UserByUsername(ctx context.Context, username string) (User, string, error) {
	var u User
	var created, updated string
	var passwordHash string
	err := s.db.QueryRowContext(ctx, `SELECT id, username, password_hash, status, created_at, updated_at FROM users WHERE username=?`, username).Scan(&u.ID, &u.Username, &passwordHash, &u.Status, &created, &updated)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, "", domain.ErrNotFound
		}
		return User{}, "", err
	}
	u.CreatedAt, _ = time.Parse(time.RFC3339, created)
	u.UpdatedAt, _ = time.Parse(time.RFC3339, updated)
	return u, passwordHash, nil
}

func (s *Store) CreateSession(ctx context.Context, id, userID, token string, ttl time.Duration) (Session, error) {
	t := now()
	exp := t.Add(ttl)
	h := auth.HashToken(token)
	_, err := s.db.ExecContext(ctx, `INSERT INTO sessions(id, user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?,?)`, id, userID, h, exp.Format(time.RFC3339), t.Format(time.RFC3339))
	if err != nil {
		return Session{}, err
	}
	return Session{ID: id, UserID: userID, TokenHash: h, ExpiresAt: exp, CreatedAt: t}, nil
}

func (s *Store) SessionByToken(ctx context.Context, token string) (Session, error) {
	h := auth.HashToken(token)
	var sess Session
	var exp, created string
	var revoked sql.NullString
	err := s.db.QueryRowContext(ctx, `SELECT id, user_id, token_hash, expires_at, created_at, revoked_at FROM sessions WHERE token_hash=?`, h).Scan(&sess.ID, &sess.UserID, &sess.TokenHash, &exp, &created, &revoked)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Session{}, domain.ErrAuth
		}
		return Session{}, err
	}
	sess.ExpiresAt, _ = time.Parse(time.RFC3339, exp)
	sess.CreatedAt, _ = time.Parse(time.RFC3339, created)
	if revoked.Valid {
		rt, _ := time.Parse(time.RFC3339, revoked.String)
		sess.RevokedAt = &rt
	}
	if sess.RevokedAt != nil || now().After(sess.ExpiresAt) {
		return Session{}, domain.ErrAuth
	}
	return sess, nil
}

func (s *Store) RevokeSession(ctx context.Context, token string) error {
	h := auth.HashToken(token)
	t := now().Format(time.RFC3339)
	res, err := s.db.ExecContext(ctx, `UPDATE sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL`, t, h)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (s *Store) UserByID(ctx context.Context, userID string) (User, error) {
	var u User
	var created, updated string
	err := s.db.QueryRowContext(ctx, `SELECT id, username, status, created_at, updated_at FROM users WHERE id=?`, userID).Scan(&u.ID, &u.Username, &u.Status, &created, &updated)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, domain.ErrNotFound
		}
		return User{}, err
	}
	u.CreatedAt, _ = time.Parse(time.RFC3339, created)
	u.UpdatedAt, _ = time.Parse(time.RFC3339, updated)
	return u, nil
}

func strPtr(ns sql.NullString) *time.Time {
	if !ns.Valid {
		return nil
	}
	t, _ := time.Parse(time.RFC3339, ns.String)
	return &t
}

func scanTask(scanner interface{ Scan(dest ...any) error }) (domain.Task, error) {
	var t domain.Task
	var scheduled, due, completed sql.NullString
	var description, project, recurrence, source sql.NullString
	var energy, estimate sql.NullInt64
	var created, updated string
	err := scanner.Scan(
		&t.ID, &t.UserID, &t.EntityVersion, &t.RowVersion, &t.Title,
		&description, &t.Status, &project, &t.Priority,
		&scheduled, &due, &recurrence, &energy, &estimate,
		&source, &created, &updated, &completed,
	)
	if err != nil {
		return domain.Task{}, err
	}
	t.Description = description.String
	t.Project = project.String
	t.Recurrence = recurrence.String
	if energy.Valid {
		e := int(energy.Int64)
		t.Energy = &e
	}
	if estimate.Valid {
		e := int(estimate.Int64)
		t.EstimateMin = &e
	}
	t.Source = source.String
	t.CreatedAt, _ = time.Parse(time.RFC3339, created)
	t.UpdatedAt, _ = time.Parse(time.RFC3339, updated)
	t.ScheduledAt = strPtr(scheduled)
	t.DueAt = strPtr(due)
	t.CompletedAt = strPtr(completed)
	return t, nil
}

func (s *Store) loadTags(ctx context.Context, taskID string) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT tag FROM task_tags WHERE task_id=? ORDER BY tag`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var tags []string
	for rows.Next() {
		var tag string
		if err := rows.Scan(&tag); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, rows.Err()
}

func (s *Store) CreateTask(ctx context.Context, t domain.Task) (domain.Task, error) {
	if err := domain.ValidateTask(t); err != nil {
		return domain.Task{}, fmt.Errorf("%w: %v", domain.ErrInvalid, err)
	}
	if t.Source == "" {
		t.Source = "manual"
	}
	if t.EntityVersion == 0 {
		t.EntityVersion = 1
	}
	if t.RowVersion == 0 {
		t.RowVersion = 1
	}
	t.CreatedAt = now()
	t.UpdatedAt = t.CreatedAt
	t.Tags = domain.NormalizeTags(t.Tags)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Task{}, err
	}
	defer tx.Rollback()
	_, err = tx.ExecContext(ctx, `INSERT INTO tasks(id, user_id, entity_version, row_version, title, description, status, project, priority, scheduled_at, due_at, recurrence, energy, estimate_min, source, created_at, updated_at, completed_at)
	VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		t.ID, t.UserID, t.EntityVersion, t.RowVersion, t.Title, nullableStr(t.Description), t.Status, nullableStr(t.Project), t.Priority, fmtTime(t.ScheduledAt), fmtTime(t.DueAt), nullableStr(t.Recurrence), nullableInt(t.Energy), nullableInt(t.EstimateMin), t.Source, t.CreatedAt.Format(time.RFC3339), t.UpdatedAt.Format(time.RFC3339), fmtTime(t.CompletedAt))
	if err != nil {
		return domain.Task{}, err
	}
	for _, tag := range t.Tags {
		if _, err := tx.ExecContext(ctx, `INSERT INTO task_tags(task_id, tag) VALUES (?,?)`, t.ID, tag); err != nil {
			return domain.Task{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return domain.Task{}, err
	}
	return s.TaskByID(ctx, t.UserID, t.ID)
}

func nullableStr(v string) any {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	return v
}

func nullableInt(v *int) any {
	if v == nil {
		return nil
	}
	return *v
}

func fmtTime(v *time.Time) any {
	if v == nil {
		return nil
	}
	return v.UTC().Format(time.RFC3339)
}

func (s *Store) TaskByID(ctx context.Context, userID, id string) (domain.Task, error) {
	row := s.db.QueryRowContext(ctx, `SELECT id, user_id, entity_version, row_version, title, description, status, project, priority, scheduled_at, due_at, recurrence, energy, estimate_min, source, created_at, updated_at, completed_at FROM tasks WHERE id=? AND user_id=?`, id, userID)
	t, err := scanTask(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return domain.Task{}, domain.ErrNotFound
		}
		return domain.Task{}, err
	}
	t.Tags, err = s.loadTags(ctx, t.ID)
	if err != nil {
		return domain.Task{}, err
	}
	return t, nil
}

func (s *Store) ListTasks(ctx context.Context, userID string, f ListFilter) ([]domain.Task, error) {
	query := `SELECT id, user_id, entity_version, row_version, title, description, status, project, priority, scheduled_at, due_at, recurrence, energy, estimate_min, source, created_at, updated_at, completed_at FROM tasks WHERE user_id=?`
	args := []any{userID}
	if f.Status != "" {
		query += ` AND status=?`
		args = append(args, f.Status)
	}
	if f.Project != "" {
		query += ` AND project=?`
		args = append(args, f.Project)
	}
	if f.Priority != "" {
		query += ` AND priority=?`
		args = append(args, f.Priority)
	}
	if f.Today {
		today := now().Format("2006-01-02")
		query += ` AND ((date(scheduled_at)=?) OR (date(due_at)=?))`
		args = append(args, today, today)
	}
	if f.Overdue {
		today := now().Format("2006-01-02")
		query += ` AND due_at IS NOT NULL AND date(due_at) < date(?) AND status='open'`
		args = append(args, today)
	}
	if f.Inbox {
		query += ` AND (project IS NULL OR project='')`
	}
	if f.Tag != "" {
		query += ` AND id IN (SELECT task_id FROM task_tags WHERE tag=?)`
		args = append(args, strings.ToLower(f.Tag))
	}
	query += ` ORDER BY priority ASC, due_at ASC, created_at ASC`
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Task
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		t.Tags, err = s.loadTags(ctx, t.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) UpdateTask(ctx context.Context, userID, id string, expected int, patch domain.TaskPatch) (MutateResult, error) {
	_, err := s.TaskByID(ctx, userID, id)
	if err != nil {
		return MutateResult{}, err
	}
	sets := []string{"updated_at=?", "row_version=row_version+1"}
	args := []any{now().Format(time.RFC3339)}
	if patch.Title != nil {
		sets = append(sets, "title=?")
		args = append(args, *patch.Title)
	}
	if patch.Description != nil {
		sets = append(sets, "description=?")
		args = append(args, nullableStr(*patch.Description))
	}
	if patch.Project != nil {
		sets = append(sets, "project=?")
		args = append(args, nullableStr(*patch.Project))
	}
	if patch.Priority != nil {
		if err := domain.ValidatePriority(*patch.Priority); err != nil {
			return MutateResult{}, fmt.Errorf("%w: %v", domain.ErrInvalid, err)
		}
		sets = append(sets, "priority=?")
		args = append(args, *patch.Priority)
	}
	if patch.ScheduledAt != nil {
		sets = append(sets, "scheduled_at=?")
		args = append(args, fmtTime(*patch.ScheduledAt))
	}
	if patch.DueAt != nil {
		sets = append(sets, "due_at=?")
		args = append(args, fmtTime(*patch.DueAt))
	}
	if patch.Recurrence != nil {
		sets = append(sets, "recurrence=?")
		args = append(args, nullableStr(*patch.Recurrence))
	}
	if patch.Energy != nil {
		sets = append(sets, "energy=?")
		args = append(args, nullableInt(*patch.Energy))
	}
	if patch.EstimateMin != nil {
		sets = append(sets, "estimate_min=?")
		args = append(args, nullableInt(*patch.EstimateMin))
	}
	if patch.Status != nil {
		if err := domain.ValidateStatus(*patch.Status); err != nil {
			return MutateResult{}, fmt.Errorf("%w: %v", domain.ErrInvalid, err)
		}
		sets = append(sets, "status=?")
		args = append(args, *patch.Status)
		if *patch.Status == domain.StatusDone {
			sets = append(sets, "completed_at=?")
			n := now()
			args = append(args, n.Format(time.RFC3339))
		} else {
			sets = append(sets, "completed_at=NULL")
		}
	}
	if patch.Source != nil {
		sets = append(sets, "source=?")
		args = append(args, *patch.Source)
	}
	q := `UPDATE tasks SET ` + strings.Join(sets, ",") + ` WHERE id=? AND user_id=? AND row_version=?`
	args = append(args, id, userID, expected)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return MutateResult{}, err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, q, args...)
	if err != nil {
		return MutateResult{}, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		if err := tx.Commit(); err != nil {
			return MutateResult{}, err
		}
		latest, lerr := s.TaskByID(ctx, userID, id)
		if lerr != nil {
			return MutateResult{}, lerr
		}
		return MutateResult{Task: latest, Conflict: true}, domain.ErrConflict
	}
	if patch.Tags != nil {
		if _, err := tx.ExecContext(ctx, `DELETE FROM task_tags WHERE task_id=?`, id); err != nil {
			return MutateResult{}, err
		}
		for _, tag := range domain.NormalizeTags(*patch.Tags) {
			if _, err := tx.ExecContext(ctx, `INSERT INTO task_tags(task_id, tag) VALUES (?,?)`, id, tag); err != nil {
				return MutateResult{}, err
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return MutateResult{}, err
	}
	updated, err := s.TaskByID(ctx, userID, id)
	if err != nil {
		return MutateResult{}, err
	}
	return MutateResult{Task: updated}, nil
}

func (s *Store) DeleteTask(ctx context.Context, userID, id string, expected int, force bool) (MutateResult, error) {
	if !force {
		return MutateResult{}, fmt.Errorf("%w: use --force", domain.ErrInvalid)
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return MutateResult{}, err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `DELETE FROM tasks WHERE id=? AND user_id=? AND row_version=?`, id, userID, expected)
	if err != nil {
		return MutateResult{}, err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		if err := tx.Commit(); err != nil {
			return MutateResult{}, err
		}
		latest, lerr := s.TaskByID(ctx, userID, id)
		if lerr != nil {
			if errors.Is(lerr, domain.ErrNotFound) {
				return MutateResult{}, domain.ErrNotFound
			}
			return MutateResult{}, lerr
		}
		return MutateResult{Task: latest, Conflict: true}, domain.ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return MutateResult{}, err
	}
	return MutateResult{}, nil
}
