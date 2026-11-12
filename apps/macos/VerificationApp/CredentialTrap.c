#include <unistd.h>

void credential_call_forbidden(void) {
    static const char message[] = "Todo Verification failed: Security credential call trapped.\n";
    write(STDERR_FILENO, message, sizeof(message) - 1);
    _exit(79);
}

#define TRAP(name) \
    extern void name(void); \
    __attribute__((used, section("__DATA,__interpose"))) \
    static const struct { const void *replacement; const void *original; } trap_##name = { \
        (const void *)credential_call_forbidden, (const void *)name \
    };

#include "CredentialSymbols.inc"
TRAP(SecCopyErrorMessageString)

void todo_verification_trap_ready(void) {}
