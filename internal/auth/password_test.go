package auth

import "testing"

func TestHashAndVerify(t *testing.T) {
	h, err := HashPassword("secret")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword(h, "secret") {
		t.Fatal("expected password to verify")
	}
	if VerifyPassword(h, "wrong") {
		t.Fatal("expected password mismatch")
	}
}

func TestTokenHashStable(t *testing.T) {
	a := HashToken("abc")
	b := HashToken("abc")
	if a != b {
		t.Fatalf("hash must be stable")
	}
}
