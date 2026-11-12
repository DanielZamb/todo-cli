#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <libproc.h>
#include <signal.h>
#include <stdint.h>
#include <string.h>

#include <stdlib.h>
#include <sys/proc_info.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>

static pid_t child_pid;
static uint64_t child_start_sec, child_start_usec;
static int cleanup_registered;
static struct { int fd; uint32_t flags; } sealed[32];
static unsigned seal_count;

static int own_child(pid_t pid, struct proc_bsdinfo *info) {
    return proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, info, sizeof(*info)) == sizeof(*info)
        && info->pbi_ppid == getpid() && info->pbi_uid == getuid();
}

void verification_child_cleanup(void) {
    struct proc_bsdinfo info;
    if (child_pid > 1 && own_child(child_pid, &info)
        && info.pbi_start_tvsec == child_start_sec && info.pbi_start_tvusec == child_start_usec) {
        kill(child_pid, SIGTERM);
        for (int attempt = 0; attempt < 100; attempt++) {
            if (waitpid(child_pid, NULL, WNOHANG) != 0) break;
            usleep(10000);
        }
        if (own_child(child_pid, &info) && info.pbi_start_tvsec == child_start_sec && info.pbi_start_tvusec == child_start_usec) {
            kill(child_pid, SIGKILL); waitpid(child_pid, NULL, 0);
        }
    }
    child_pid = 0;
    while (seal_count) { --seal_count; fchflags(sealed[seal_count].fd, sealed[seal_count].flags); close(sealed[seal_count].fd); }
}

static void refuse(void) { verification_child_cleanup(); _exit(78); }

static void register_cleanup(void) {
    if (!cleanup_registered) { atexit(verification_child_cleanup); cleanup_registered = 1; }
}

void verification_child_register(pid_t pid) {
    struct proc_bsdinfo info;
    if (!own_child(pid, &info)) refuse();
    child_pid = pid; child_start_sec = info.pbi_start_tvsec; child_start_usec = info.pbi_start_tvusec;
    register_cleanup();
}

int verification_seal_register(int fd, uint32_t flags) {
    if (seal_count == 32) return -1;
    int copy = fcntl(fd, F_DUPFD_CLOEXEC, 3); if (copy < 0) return -1;
    sealed[seal_count].fd = copy; sealed[seal_count].flags = flags; ++seal_count;
    register_cleanup(); return 0;
}

int verification_child_inspect(pid_t pid, uint64_t device, uint64_t inode, uint16_t port) {
    struct proc_bsdinfo info;
    if (pid != child_pid || !own_child(pid, &info) || info.pbi_start_tvsec != child_start_sec || info.pbi_start_tvusec != child_start_usec) return 0;
    int size = proc_pidinfo(pid, PROC_PIDLISTFDS, 0, NULL, 0);
    if (size <= 0 || size > 16 * 1024 * 1024) return 0;
    struct proc_fdinfo *fds = malloc(size); if (!fds) return 0;
    int bytes = proc_pidinfo(pid, PROC_PIDLISTFDS, 0, fds, size);
    int database = 0, listener = 0;
    for (int n = 0; n < bytes / (int)sizeof(*fds); n++) {
        if (fds[n].proc_fdtype == PROX_FDTYPE_VNODE) {
            struct vnode_fdinfowithpath file;
            if (proc_pidfdinfo(pid, fds[n].proc_fd, PROC_PIDFDVNODEPATHINFO, &file, sizeof(file)) != sizeof(file)) continue;
            struct vinfo_stat *s = &file.pvip.vip_vi.vi_stat;
            if (s->vst_dev == device && s->vst_ino == inode && s->vst_nlink == 1 && s->vst_uid == getuid() && (s->vst_mode & S_IFMT) == S_IFREG) database = 1;
        } else if (fds[n].proc_fdtype == PROX_FDTYPE_SOCKET) {
            struct socket_fdinfo socket;
            if (proc_pidfdinfo(pid, fds[n].proc_fd, PROC_PIDFDSOCKETINFO, &socket, sizeof(socket)) != sizeof(socket)) continue;
            struct tcp_sockinfo *tcp = &socket.psi.soi_proto.pri_tcp;
            if (socket.psi.soi_kind == SOCKINFO_TCP && tcp->tcpsi_state == TSI_S_LISTEN
                && socket.psi.soi_family == AF_INET && ntohs((uint16_t)tcp->tcpsi_ini.insi_lport) == port
                && tcp->tcpsi_ini.insi_laddr.ina_46.i46a_addr4.s_addr == htonl(INADDR_LOOPBACK)) listener++;
        }
    }
    free(fds); return database && listener == 1;
}

#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOKitLib.h>
double verification_hid_idle_seconds(void) {
    io_iterator_t iterator = 0;
    if (IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("IOHIDSystem"), &iterator) != KERN_SUCCESS) return -1;
    io_registry_entry_t entry = IOIteratorNext(iterator); IOObjectRelease(iterator);
    if (!entry) return -1;
    CFTypeRef value = IORegistryEntryCreateCFProperty(entry, CFSTR("HIDIdleTime"), kCFAllocatorDefault, 0);
    IOObjectRelease(entry);
    int64_t nanoseconds = -1;
    if (value && CFGetTypeID(value) == CFNumberGetTypeID()) CFNumberGetValue(value, kCFNumberSInt64Type, &nanoseconds);
    if (value) CFRelease(value);
    return nanoseconds < 0 ? -1 : (double)nanoseconds / 1e9;
}

static CFStringRef scratch_temporary;
void verification_temporary_bind(int fd) {
    struct stat info; char path[MAXPATHLEN];
    if (fstat(fd, &info) || (info.st_mode & S_IFMT) != S_IFDIR || info.st_uid != getuid() || (info.st_mode & 077)
        || fcntl(fd, F_GETPATH, path) || strncmp(path, "/private/tmp/todo-mac-verify-", 29) != 0) refuse();
    size_t length = strlen(path);
    if (length + 2 > sizeof(path) || length < 4 || strcmp(path + length - 4, "/tmp")) refuse();
    path[length] = '/'; path[length + 1] = 0;
    CFStringRef value = CFStringCreateWithCString(kCFAllocatorDefault, path, kCFStringEncodingUTF8);
    if (!value) refuse();
    if (scratch_temporary && !CFEqual(scratch_temporary, value)) refuse();
    if (scratch_temporary) CFRelease(value); else scratch_temporary = value;
}
CFStringRef verification_temporary_directory(void) {
    return scratch_temporary ? scratch_temporary : CFSTR("/nonexistent/todo-verification-unbound/");
}
