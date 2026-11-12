#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
int main(int argc, char **argv) {
    if (argc != 3) return 2;
    pid_t child = fork();
    if (child < 0) return 2;
    if (child == 0) {
        char *arguments[] = { "/usr/bin/sandbox-exec", "-p", argv[1], argv[2], NULL };
        execv(arguments[0], arguments); _exit(78);
    }
    printf("owned-relay {\"parentPID\":%d,\"childPID\":%d,\"groupPID\":%d}\n", getpid(), child, getpgrp()); fflush(stdout);
    for (;;) pause();
}
