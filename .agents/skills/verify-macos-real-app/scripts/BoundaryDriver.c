#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
extern int sandbox_init(const char *, unsigned long long, char **);
extern int verification_boundary_check(const char *, const char *, const char *, int, int, const char *);
int main(int argc, char **argv) {
    if (argc != 6) return 2;
    char policy[65536]; size_t count = 0; ssize_t received;
    while ((received = read(0, policy + count, sizeof(policy) - count - 1)) > 0) { count += (size_t)received; if (count == sizeof(policy) - 1) return 2; }
    if (received < 0 || !count) return 2; policy[count] = 0;
    char *error = NULL; if (sandbox_init(policy, 0, &error)) { fprintf(stderr, "%s\n", error); return 2; }
    return verification_boundary_check(argv[1], argv[2], argv[3], atoi(argv[4]), atoi(argv[5]), "driver");
}
