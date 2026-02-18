package domain

import "testing"

func TestNormalizeTags(t *testing.T) {
	in := []string{"Work", "work", "", "home"}
	got := NormalizeTags(in)
	if len(got) != 2 || got[0] != "home" || got[1] != "work" {
		t.Fatalf("unexpected tags: %#v", got)
	}
}

func TestValidatePriority(t *testing.T) {
	if err := ValidatePriority("P1"); err != nil {
		t.Fatalf("expected valid priority")
	}
	if err := ValidatePriority("P0"); err == nil {
		t.Fatalf("expected invalid priority")
	}
}
