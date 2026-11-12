#include <unistd.h>

extern const int SANDBOX_CHECK_NO_REPORT;
extern int sandbox_check(pid_t, const char *, int, ...);

int verification_security_service_denied(void) {
    const int global_name_filter = 2;
    return sandbox_check(getpid(), "mach-lookup", global_name_filter | SANDBOX_CHECK_NO_REPORT, "com.apple.securityd") != 0;
}

#include <spawn.h>
#include <sys/wait.h>
#include <errno.h>

extern char **environ;

int verification_true_execution(const char *directory) {
    posix_spawn_file_actions_t actions;
    if (posix_spawn_file_actions_init(&actions) != 0) return 2;
    int setup = posix_spawn_file_actions_addchdir_np(&actions, directory);
    pid_t pid;
    char *arguments[] = { "true", NULL };
    int result = setup == 0 ? posix_spawn(&pid, "/usr/bin/true", &actions, NULL, arguments, environ) : setup;
    posix_spawn_file_actions_destroy(&actions);
    if (result == EPERM || result == EACCES) return 1;
    if (result != 0) return 2;
    int status;
    if (waitpid(pid, &status, 0) != pid) return 2;
    return WIFEXITED(status) && WEXITSTATUS(status) == 0 ? 0 : 2;
}
