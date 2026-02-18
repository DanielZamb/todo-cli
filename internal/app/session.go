package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

type sessionState struct {
	Token string `json:"token"`
}

func sessionPath(profile string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	if profile == "" {
		profile = "default"
	}
	return filepath.Join(home, ".todo-cli", "session_"+profile+".json"), nil
}

func saveSession(profile, token string) error {
	p, err := sessionPath(profile)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	b, err := json.Marshal(sessionState{Token: token})
	if err != nil {
		return err
	}
	return os.WriteFile(p, b, 0o600)
}

func loadSession(profile string) (string, error) {
	p, err := sessionPath(profile)
	if err != nil {
		return "", err
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return "", err
	}
	var s sessionState
	if err := json.Unmarshal(b, &s); err != nil {
		return "", err
	}
	return strings.TrimSpace(s.Token), nil
}

func clearSession(profile string) error {
	p, err := sessionPath(profile)
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
