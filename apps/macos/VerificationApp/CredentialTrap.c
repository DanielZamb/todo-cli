#include <string.h>
#include <unistd.h>

extern void verification_child_cleanup(void);
static void credential_forbidden(const char *name) {
    static const char message[] = "Todo Verification failed: Security credential call trapped: ";
    write(STDERR_FILENO, message, sizeof(message) - 1);
    write(STDERR_FILENO, name, strlen(name)); write(STDERR_FILENO, "\n", 1);
    verification_child_cleanup(); _exit(79);
}

#define TRAP(name) \
    extern void name(void); \
    static void forbidden_##name(void) { credential_forbidden(#name); } \
    __attribute__((used, section("__DATA,__interpose"))) \
    static const struct { const void *replacement; const void *original; } trap_##name = { \
        (const void *)forbidden_##name, (const void *)name \
    };
#include "CredentialSymbols.inc"
#undef TRAP

const void *todo_verification_handler(const char *name) {
#define TRAP(api) if (strcmp(name, #api) == 0) return (const void *)forbidden_##api;
#include "CredentialSymbols.inc"
#undef TRAP
    return NULL;
}
void todo_verification_trap_ready(void) {}

extern const void *NSTemporaryDirectory(void);
extern const void *verification_temporary_directory(void);
__attribute__((used, section("__DATA,__interpose")))
static const struct { const void *replacement; const void *original; } temporary_directory_binding = {
    (const void *)verification_temporary_directory, (const void *)NSTemporaryDirectory
};
