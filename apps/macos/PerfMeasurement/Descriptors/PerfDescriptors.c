#include "PerfDescriptors.h"
#include <libproc.h>
#include <stdlib.h>
#include <sys/proc_info.h>
#include <unistd.h>
int mac_perf_descriptors(int *descriptors, int *sockets) {
    int capacity = proc_pidinfo(getpid(), PROC_PIDLISTFDS, 0, 0, 0);
    if (capacity <= 0) return -1;
    capacity += 64 * sizeof(struct proc_fdinfo);
    struct proc_fdinfo *entries = malloc(capacity);
    if (!entries) return -2;
    int bytes = proc_pidinfo(getpid(), PROC_PIDLISTFDS, 0, entries, capacity);
    if (bytes <= 0) { free(entries); return -3; }
    *descriptors = bytes / sizeof(struct proc_fdinfo);
    *sockets = 0;
    for (int index = 0; index < *descriptors; index++)
        if (entries[index].proc_fdtype == PROX_FDTYPE_SOCKET) (*sockets)++;
    free(entries);
    return 0;
}
