package domain

import "errors"

var (
	ErrNotFound  = errors.New("not found")
	ErrConflict  = errors.New("conflict")
	ErrAuth      = errors.New("auth required")
	ErrInvalid   = errors.New("invalid input")
	ErrForbidden = errors.New("forbidden")
)
