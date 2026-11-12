#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <net/if.h>
#include <netinet/in.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/xattr.h>
#include <unistd.h>

extern int sandbox_check(pid_t, const char *, int, ...);
extern const int SANDBOX_CHECK_NO_REPORT;

static void quoted(const char *value) {
    putchar('"');
    for (const unsigned char *p = (const unsigned char *)value; *p; p++) {
        if (*p == '"' || *p == '\\') { putchar('\\'); putchar(*p); }
        else if (*p < 32) printf("\\u%04x", *p);
        else putchar(*p);
    }
    putchar('"');
}
static int row(const char *role, const char *label, const char *operation, const char *path, int policy, int observed_errno, int expected_errno) {
    int passed = policy == 1 && observed_errno == expected_errno;
    fputs("boundary-proof {\"role\":", stdout); quoted(role);
    printf(",\"pid\":%d,\"label\":", getpid()); quoted(label);
    fputs(",\"operation\":", stdout); quoted(operation); fputs(",\"path\":", stdout); quoted(path);
    printf(",\"policyDenied\":%s,\"errno\":%d,\"expectedErrno\":%d,\"passed\":%s,\"payloadBytesRead\":0}\n", policy == 1 ? "true" : "false", observed_errno, expected_errno, passed ? "true" : "false");
    fflush(stdout); return passed ? 0 : 1;
}
static int deny_read(const char *role, const char *label, const char *path, int synthetic) {
    int policy = sandbox_check(getpid(), "file-read-data", 1 | SANDBOX_CHECK_NO_REPORT, path);
    int error = -1;
    // An allowed protected path fails without opening it. Synthetic controls
    // may open their own sentinel but never read a byte from the descriptor.
    if (policy == 1 || synthetic) {
        errno = 0; int fd = open(path, O_RDONLY | O_CLOEXEC);
        error = fd < 0 ? errno : 0; if (fd >= 0) close(fd);
    }
    return row(role, label, "file-read-data/open", path, policy, error, EPERM);
}
static int deny_write(const char *role, const char *label, const char *path) {
    int policy = sandbox_check(getpid(), "file-write-data", 1 | SANDBOX_CHECK_NO_REPORT, path), error = -1;
    if (policy == 1) { errno = 0; int fd = open(path, O_WRONLY | O_CLOEXEC); error = fd < 0 ? errno : 0; if (fd >= 0) close(fd); }
    return row(role, label, "file-write-data/open", path, policy, error, EPERM);
}
static int connection(const char *role, const char *label, const char *ip, int port, int family) {
    int datagram = 1;
    int fd = socket(family, datagram ? SOCK_DGRAM : SOCK_STREAM, 0); if (fd < 0) return 1;
    unsigned index = if_nametoindex("lo0"), bound = 0; socklen_t size = sizeof(bound);
    // Even an intentionally permissive mutant cannot send a packet off lo0.
    if (!index || setsockopt(fd, family == AF_INET ? IPPROTO_IP : IPPROTO_IPV6, family == AF_INET ? IP_BOUND_IF : IPV6_BOUND_IF, &index, sizeof(index)) || getsockopt(fd, family == AF_INET ? IPPROTO_IP : IPPROTO_IPV6, family == AF_INET ? IP_BOUND_IF : IPV6_BOUND_IF, &bound, &size) || bound != index) { close(fd); return 1; }
    fcntl(fd, F_SETFL, O_NONBLOCK);
    int value;
    errno = 0;
    if (family == AF_INET) {
        struct sockaddr_in address = { .sin_len = sizeof(address), .sin_family = AF_INET, .sin_port = htons((uint16_t)port) };
        inet_pton(AF_INET, ip, &address.sin_addr); value = connect(fd, (struct sockaddr *)&address, sizeof(address));
    } else {
        struct sockaddr_in6 address = { .sin6_len = sizeof(address), .sin6_family = AF_INET6, .sin6_port = htons((uint16_t)port) };
        inet_pton(AF_INET6, ip, &address.sin6_addr); value = connect(fd, (struct sockaddr *)&address, sizeof(address));
    }
    int error = value < 0 ? errno : 0; close(fd);
    char destination[128]; snprintf(destination, sizeof(destination), "%s:%d;interface=lo0", ip, port);
    return row(role, label, datagram ? "network-outbound/datagram-connect-no-send" : "network-outbound/connect", destination, error == EPERM ? 1 : 0, error, EPERM);
}

int verification_boundary_check(const char *root, const char *owner, const char *outside, int port, int other_port, const char *role) {
    int failures = 0; char path[4096];
    if (strncmp(root, "/private/tmp/todo-mac-verify-", 29) || (strcmp(role, "app") && strcmp(role, "server") && strcmp(role, "driver"))) return 78;
    int scope = open(root, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    struct stat root_info; char resolved[4096];
    if (scope < 0 || fstat(scope, &root_info) || root_info.st_uid != getuid() || (root_info.st_mode & 077) || fcntl(scope, F_GETPATH, resolved) || strcmp(resolved, root)) { if (scope >= 0) close(scope); return 78; }
    int root_fd = open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC);
    printf("boundary-root {\"role\":\"%s\",\"pid\":%d,\"readable\":%s,\"directoryEntriesRead\":0}\n", role, getpid(), root_fd >= 0 ? "true" : "false");
    if (root_fd >= 0) close(root_fd); else failures++;
    int attribute_policy = sandbox_check(getpid(), "file-read-xattr", 1 | SANDBOX_CHECK_NO_REPORT, "/");
    int attribute_error = -1;
    if (attribute_policy == 1) { errno = 0; getxattr("/", "local.todo.verification.nonexistent", NULL, 0, 0, 0); attribute_error = errno; }
    failures += row(role, "root-attributes", "file-read-xattr/getxattr", "/", attribute_policy, attribute_error, EPERM);
    failures += deny_read(role, "Users", "/Users", 0);
    failures += deny_read(role, "real-home", owner, 0);
    snprintf(path, sizeof(path), "/System/Volumes/Data%s", owner);
    failures += deny_read(role, "System-data-home-alias", path, 0);
    const char *suffixes[] = { "/.todo-cli", "/.todo-cli/todo.db", "/Library", "/Library/Application Support", "/Library/Keychains", "/Library/Preferences", "/Library/Caches" };
    const char *labels[] = { "real-Todo-directory", "real-Todo-database", "real-Library", "real-Application-Support", "real-Keychains-directory", "real-Preferences", "real-Caches" };
    for (unsigned n = 0; n < sizeof(suffixes) / sizeof(*suffixes); n++) { snprintf(path, sizeof(path), "%s%s", owner, suffixes[n]); failures += deny_read(role, labels[n], path, 0); }
    failures += deny_read(role, "system-temp-outside", "/private/var/folders", 0);
    failures += deny_read(role, "etc-directory", "/etc", 0);
    failures += deny_read(role, "etc-contents", "/etc/hosts", 0);
    failures += deny_read(role, "outside-sentinel", outside, 1);
    failures += deny_write(role, "outside-write", outside);
    int root_write = sandbox_check(getpid(), "file-write-data", 1 | SANDBOX_CHECK_NO_REPORT, "/");
    failures += row(role, "root-write", "file-write-data/policy-query-only", "/", root_write, root_write == 1 ? EPERM : -1, EPERM);
    const char *base = strrchr(outside, '/');
    if (!base || strncmp(outside, "/private/tmp/", 13)) return 78;
    snprintf(path, sizeof(path), "%s/../%s", root, outside + 13);
    failures += deny_read(role, "parent-component-escape", path, 1);
    char directory[4096]; snprintf(directory, sizeof(directory), "%s/boundary-%s", root, role);
    char component[64]; snprintf(component, sizeof(component), "boundary-%s", role);
    if (mkdirat(scope, component, 0700)) { close(scope); return 78; }
    int output = openat(scope, component, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    struct stat info;
    if (output < 0 || fstat(output, &info) || info.st_dev != root_info.st_dev || info.st_uid != getuid() || (info.st_mode & 077) || fcntl(output, F_GETPATH, resolved) || strcmp(resolved, directory)) { if (output >= 0) close(output); close(scope); return 78; }
    snprintf(path, sizeof(path), "%s/escape", directory);
    if (symlinkat(outside, output, "escape")) { close(output); close(scope); return 78; }
    failures += deny_read(role, "symlink-escape", path, 1);
    int removed = unlinkat(output, "escape", 0); close(output); close(scope); if (removed) return 78;
    failures += connection(role, "other-loopback-port", "127.0.0.1", other_port, AF_INET);
    failures += connection(role, "other-loopback-address", "127.0.0.2", port, AF_INET);
    failures += connection(role, "IPv6-loopback", "::1", port, AF_INET6);
    failures += connection(role, "off-loopback", "192.0.2.1", other_port, AF_INET);
    const char *services[] = { "com.apple.securityd", "com.apple.securityd.xpc", "com.apple.secd", "com.apple.akd", "com.apple.ctkd", "com.apple.accountsd", "com.apple.AuthenticationServicesCore.AuthenticationServicesAgent", "com.apple.AuthenticationServices.CredentialProvider", "com.apple.LocalAuthentication.RemoteService", "com.apple.CoreAuthentication.daemon", "com.apple.cloudd", "com.apple.CloudKit", "com.apple.bird", "com.apple.kvs", "com.apple.ubiquity", "com.apple.cfprefsd.agent", "com.apple.lsd.open", "com.apple.lsd.mapdb", "local.todo.unlisted-credential-service" };
    for (unsigned n = 0; n < sizeof(services) / sizeof(*services); n++) {
        int denied = sandbox_check(getpid(), "mach-lookup", 2 | SANDBOX_CHECK_NO_REPORT, services[n]);
        failures += row(role, "broker", "mach-lookup/policy-query-only", services[n], denied, denied == 1 ? EPERM : -1, EPERM);
    }
    printf("boundary-complete {\"role\":\"%s\",\"pid\":%d,\"failures\":%d}\n", role, getpid(), failures); fflush(stdout);
    return failures ? 78 : 0;
}
