package app

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type appConfig struct {
	DBPath string `json:"db_path,omitempty"`
}

func configPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".todo-cli", "config.json"), nil
}

func loadConfig() (appConfig, error) {
	p, err := configPath()
	if err != nil {
		return appConfig{}, err
	}
	b, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return appConfig{}, nil
		}
		return appConfig{}, err
	}
	var c appConfig
	if err := json.Unmarshal(b, &c); err != nil {
		return appConfig{}, err
	}
	return c, nil
}

func saveConfig(c appConfig) error {
	p, err := configPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, b, 0o600)
}

func resolveDBPath(explicit string) string {
	explicit = strings.TrimSpace(explicit)
	if explicit != "" {
		return explicit
	}
	if env := strings.TrimSpace(os.Getenv("TODO_DB")); env != "" {
		return env
	}
	if c, err := loadConfig(); err == nil && strings.TrimSpace(c.DBPath) != "" {
		return c.DBPath
	}
	return "~/.todo-cli/todo.db"
}

func setConfigValue(key, value string) error {
	c, err := loadConfig()
	if err != nil {
		return err
	}
	switch key {
	case "db.path":
		c.DBPath = strings.TrimSpace(value)
		return saveConfig(c)
	default:
		return fmt.Errorf("unsupported config key: %s", key)
	}
}

func getConfigValue(key string) (string, error) {
	c, err := loadConfig()
	if err != nil {
		return "", err
	}
	switch key {
	case "db.path":
		return c.DBPath, nil
	default:
		return "", fmt.Errorf("unsupported config key: %s", key)
	}
}
