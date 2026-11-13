#include <fcntl.h>
#include <stdio.h>
#include <unistd.h>
extern int sandbox_check(pid_t, const char *, int, ...);
extern const int SANDBOX_CHECK_NO_REPORT;
int main(int argc, char **argv) {
 if (argc < 4) return 2;
 int failures = 0;
 for (int i = 2; i < argc; i++) {
  if (sandbox_check(getpid(), "file-read-data", 1 | SANDBOX_CHECK_NO_REPORT, argv[i]) != 1) failures++;
  if (sandbox_check(getpid(), "file-write-data", 1 | SANDBOX_CHECK_NO_REPORT, argv[i]) != 1) failures++;
 }
 const char *services[] = { "com.apple.securityd", "com.apple.securityd.xpc", "com.apple.secd", "com.apple.security.agent", "com.apple.SecurityServer", "com.apple.security.authhost", "com.apple.security.authorizationhost" };
 for (unsigned i = 0; i < sizeof(services) / sizeof(*services); i++) if (sandbox_check(getpid(), "mach-lookup", 2 | SANDBOX_CHECK_NO_REPORT, services[i]) != 1) failures++;
 int fd = open(argv[1], O_RDONLY | O_CLOEXEC); if (fd < 0) failures++; else close(fd);
 puts(failures ? "FAIL: deny-only policy decisions" : "PASS: protected paths/brokers denied, synthetic ordinary file allowed; protected paths never opened");
 return failures ? 1 : 0;
}
