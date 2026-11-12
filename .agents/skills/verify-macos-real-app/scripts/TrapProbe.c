#include <stdio.h>
#include <dlfcn.h>
#include <string.h>

extern void todo_verification_trap_ready(void);
extern void credential_call_forbidden(void);
extern void SecItemAdd(void);

int main(int argc, char **argv) {
    todo_verification_trap_ready();
    void *volatile direct = (void *)SecItemAdd;
    void *volatile expected = (void *)credential_call_forbidden;
    if (direct != expected) {
        fputs("Credential trap did not interpose the app's direct import. No credential call attempted.\n", stderr);
        return 1;
    }
    if (argc != 2) return 2;
    void *function = dlsym(RTLD_DEFAULT, argv[1]);
    if (function != (void *)credential_call_forbidden) {
        fputs("Credential trap did not interpose the dynamic lookup. No credential call attempted.\n", stderr);
        return 1;
    }
    ((void (*)(void))function)();
    return 1;
}
