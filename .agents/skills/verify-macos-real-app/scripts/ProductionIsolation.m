#include <dlfcn.h>
#include <fcntl.h>
#include <libproc.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/proc_info.h>
#include <sys/stat.h>
#include <unistd.h>

extern const void *todo_verification_handler(const char *);
static pthread_t watcher;
static atomic_int stopped;
static int receipt = -1;
static char home[4096];
static unsigned samples, descriptors, bindings;

void verification_child_cleanup(void) {}

static int beneath(const char *path, const char *root) {
 size_t length = strlen(root);
 return !strncmp(path, root, length) && (!path[length] || path[length] == '/');
}
static int protected_path(const char *path) {
 char root[8192];
 const char *suffixes[] = { "/.todo-cli", "/Library/Keychains" };
 for (unsigned i = 0; i < sizeof(suffixes) / sizeof(*suffixes); i++) {
  snprintf(root, sizeof(root), "%s%s", home, suffixes[i]); if (beneath(path, root)) return 1;
  snprintf(root, sizeof(root), "/System/Volumes/Data%s%s", home, suffixes[i]); if (beneath(path, root)) return 1;
 }
 const char *system[] = { "/Library/Keychains", "/System/Library/Keychains", "/private/var/Keychains", "/var/Keychains" };
 for (unsigned i = 0; i < sizeof(system) / sizeof(*system); i++) if (beneath(path, system[i])) return 1;
 return 0;
}
static void inspect_descriptors(void) {
 int capacity = proc_pidinfo(getpid(), PROC_PIDLISTFDS, 0, NULL, 0);
 if (capacity <= 0) _exit(78);
 capacity += 32 * sizeof(struct proc_fdinfo);
 struct proc_fdinfo *files = malloc(capacity); if (!files) _exit(78);
 int bytes = proc_pidinfo(getpid(), PROC_PIDLISTFDS, 0, files, capacity); if (bytes <= 0 || bytes >= capacity) _exit(78);
 for (unsigned i = 0; i < bytes / sizeof(*files); i++) {
  if (files[i].proc_fdtype != PROX_FDTYPE_VNODE) continue;
  struct vnode_fdinfowithpath value;
  int size = proc_pidfdinfo(getpid(), files[i].proc_fd, PROC_PIDFDVNODEPATHINFO, &value, sizeof(value));
  if (size != sizeof(value)) continue;
  descriptors++;
  if (protected_path(value.pvip.vip_path)) {
   dprintf(receipt, "{\"pid\":%d,\"protectedDescriptor\":true,\"fd\":%d}\n", getpid(), files[i].proc_fd);
   fsync(receipt); _exit(78);
  }
 }
 free(files); samples++;
}
static void *watch(void *unused) {
 while (!atomic_load(&stopped)) { inspect_descriptors(); usleep(10000); }
 return NULL;
}
__attribute__((constructor)) static void begin_audit(void) {
 const char *evidence = getenv("TODO_PROOF_AUDIT"), *owner = getenv("TODO_PROOF_OWNER_HOME");
 if (!evidence || !owner || owner[0] != '/' || strlen(owner) >= sizeof(home)) _exit(78);
 strcpy(home, owner);
 struct stat info;
 int directory = open(evidence, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
 if (directory < 0 || fstat(directory, &info) || info.st_uid != getuid() || (info.st_mode & 077)) _exit(78);
 char name[64]; snprintf(name, sizeof(name), "process-%d.jsonl", getpid());
 receipt = openat(directory, name, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600); close(directory);
 if (receipt < 0) _exit(78);
#define TRAP(api) if (dlsym(RTLD_DEFAULT, #api) != todo_verification_handler(#api)) { dprintf(receipt, "{\"pid\":%d,\"missingCredentialBinding\":\"%s\",\"originalCalled\":false}\n", getpid(), #api); dprintf(2, "Production audit refused: credential binding absent: %s; no original call attempted.\n", #api); _exit(79); } else bindings++;
#include "CredentialSymbols.inc"
#undef TRAP
 if (dlsym(RTLD_DEFAULT, "SecTrustReportNetworkingAnalytics") != todo_verification_handler("SecTrustReportNetworkingAnalytics")) _exit(79);
 bindings++;
 inspect_descriptors();
 dprintf(receipt, "{\"pid\":%d,\"started\":true,\"credentialBindingsChecked\":%u,\"protectedDescriptor\":false,\"intervalMicroseconds\":10000}\n", getpid(), bindings);
 if (pthread_create(&watcher, NULL, watch, NULL)) _exit(78);
}
__attribute__((destructor)) static void end_audit(void) {
 atomic_store(&stopped, 1); pthread_join(watcher, NULL); inspect_descriptors();
 dprintf(receipt, "{\"pid\":%d,\"finished\":true,\"samples\":%u,\"descriptorsInspected\":%u,\"protectedDescriptor\":false,\"credentialBindingsChecked\":%u}\n", getpid(), samples, descriptors, bindings);
 fsync(receipt); close(receipt);
}
