#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <unistd.h>

extern int sandbox_init(const char *, unsigned long long, char **);
extern void sandbox_free_error(char *);

int main(void) {
    char policy[65536];
    size_t count = 0;
    while (count < sizeof(policy) - 1) {
        ssize_t received = read(STDIN_FILENO, policy + count, sizeof(policy) - count - 1);
        if (received < 0) return 2;
        if (received == 0) break;
        count += (size_t)received;
    }
    if (count == 0 || count == sizeof(policy) - 1) return 2;
    policy[count] = 0;
    char *error = NULL;
    if (sandbox_init(policy, 0, &error)) {
        if (error) { fprintf(stderr, "%s\n", error); sandbox_free_error(error); }
        return 2;
    }
    int descriptor = open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC);
    if (descriptor >= 0) {
        close(descriptor);
        puts("open root directory: accepted; no directory entry was read");
        return 0;
    }
    printf("open root directory: errno=%d\n", errno);
    return errno == EPERM ? 78 : 1;
}
