#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#include <fcntl.h>
#include <pwd.h>
#include <sys/stat.h>
#include <unistd.h>

extern int sandbox_init(const char *, unsigned long long, char **);
extern void verification_temporary_bind(int);
extern double verification_hid_idle_seconds(void);
extern void todo_verification_trap_ready(void);
extern int verification_boundary_check(const char *, const char *, const char *, int, int, const char *);

static NSString *literal(NSString *value) {
    return [NSString stringWithFormat:@"\"%@\"", [[value stringByReplacingOccurrencesOfString:@"\\" withString:@"\\\\"] stringByReplacingOccurrencesOfString:@"\"" withString:@"\\\""]];
}
static int inspect(int fd, NSString *path, dev_t device, BOOL directory) {
    struct stat info; char resolved[4096];
    return fd >= 0 && !fstat(fd, &info) && info.st_uid == getuid() && (!device || info.st_dev == device)
        && (info.st_mode & S_IFMT) == (directory ? S_IFDIR : S_IFREG) && (directory || info.st_nlink == 1)
        && !(info.st_mode & 077) && !fcntl(fd, F_GETPATH, resolved) && !strcmp(resolved, path.fileSystemRepresentation);
}
int main(int argc, char **argv) { @autoreleasepool {
    todo_verification_trap_ready();
    if (argc != 1) return 78;
    const char *rawHome = getenv("HOME"), *rawTemporary = getenv("TMPDIR"), *fixed = getenv("CFFIXED_USER_HOME");
    if (!rawHome || !rawTemporary || !fixed || strcmp(rawHome, fixed)) return 78;
    NSString *home = [NSString stringWithUTF8String:rawHome], *temporary = [NSString stringWithUTF8String:rawTemporary];
    if (![home hasPrefix:@"/private/tmp/todo-mac-verify-"] || ![home hasSuffix:@"/home"]) return 78;
    NSString *root = [home substringToIndex:home.length - 5];
    if (root.pathComponents.count != 4 || ![temporary isEqualToString:[root stringByAppendingPathComponent:@"tmp"]]) return 78;
    int scope = open(root.fileSystemRepresentation, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    struct stat rootInfo;
    if (!inspect(scope, root, 0, YES) || fstat(scope, &rootInfo)) return 78;
    int homeFD = openat(scope, "home", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    int temporaryFD = openat(scope, "tmp", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (!inspect(homeFD, home, rootInfo.st_dev, YES) || !inspect(temporaryFD, temporary, rootInfo.st_dev, YES)) return 78;
    verification_temporary_bind(temporaryFD); close(temporaryFD); close(homeFD);
    NSString *manifestPath = [root stringByAppendingPathComponent:@"manifest.json"];
    int input = openat(scope, "manifest.json", O_RDONLY | O_NOFOLLOW | O_CLOEXEC); struct stat info;
    if (!inspect(input, manifestPath, rootInfo.st_dev, NO) || fstat(input, &info) || info.st_size <= 0 || info.st_size > 1048576) return 78;
    NSMutableData *data = [NSMutableData dataWithLength:(NSUInteger)info.st_size];
    if (pread(input, data.mutableBytes, data.length, 0) != data.length) return 78;
    close(input); close(scope);
    NSDictionary *manifest = [NSJSONSerialization JSONObjectWithData:data options:0 error:NULL];
    struct passwd *owner = getpwuid(getuid());
    if (!owner || !owner->pw_dir || ![manifest isKindOfClass:NSDictionary.class]) return 78;
    NSString *ownerHome = [NSString stringWithUTF8String:owner->pw_dir];
    if (![manifest[@"root"] isEqual:root] || ![manifest[@"home"] isEqual:home] || ![manifest[@"ownerHome"] isEqual:ownerHome]) return 78;
    NSString *outside = manifest[@"outsideSentinel"]; NSNumber *otherPort = manifest[@"probePort"];
    NSURL *serverURL = [NSURL URLWithString:manifest[@"serverURL"]];
    if (![outside isKindOfClass:NSString.class] || ![outside hasPrefix:@"/private/tmp/todo-mac-verify-"] || [outside containsString:@".."]
        || ![otherPort isKindOfClass:NSNumber.class] || otherPort.intValue <= 0 || otherPort.intValue > 65535 || !serverURL.port) return 78;
    NSString *profile = [NSString stringWithFormat:
        @"(version 1)(allow default)(deny file-read*)(allow file-read-data (literal \"/\"))(deny file-write*)"
         "(allow file-read* (subpath \"/System\") (subpath \"/usr/lib\") (subpath \"/usr/share\") (subpath \"/Library/Apple\") (subpath \"/Library/Fonts\") (subpath \"/private/var/db/timezone\"))"
         "(deny file-read* file-write* (subpath \"/Library/Keychains\") (subpath \"/System/Library/Keychains\") (subpath \"/private/var/Keychains\"))"
         "(allow file-read* (literal \"/dev/null\" \"/dev/random\" \"/dev/urandom\"))(allow file-write-data (literal \"/dev/null\"))"
         "(deny file-read* file-write* (subpath %@))(allow file-read* file-write* (subpath %@))"
         "(deny network-outbound)(deny process-exec)(deny mach-lookup)"
         "(allow mach-lookup (global-name \"com.apple.windowserver.active\" \"com.apple.windowserver\" \"com.apple.FontObjectsServer\" \"com.apple.coreservices.launchservicesd\"))", literal(ownerHome), literal(root)];
    char *error = NULL;
    if (sandbox_init(profile.UTF8String, 0, &error)) { if (error) write(2, error, strlen(error)); return 78; }
    if (verification_boundary_check(root.fileSystemRepresentation, ownerHome.fileSystemRepresentation, outside.fileSystemRepresentation, serverURL.port.intValue, otherPort.intValue, "driver")) return 78;
    NSRunningApplication *front = NSWorkspace.sharedWorkspace.frontmostApplication;
    NSDictionary *value = @{
        @"frontmostBundleID": front.bundleIdentifier ?: @"unknown",
        @"frontmostName": front.localizedName ?: @"unknown",
        @"frontmostBundleName": front.bundleURL.lastPathComponent ?: @"unknown",
        @"idleSeconds": @(CGEventSourceSecondsSinceLastEventType(kCGEventSourceStateCombinedSessionState, kCGAnyInputEventType)),
        @"hidIdleSeconds": @(verification_hid_idle_seconds()),
        @"uptimeSeconds": @(NSProcessInfo.processInfo.systemUptime)
    };
    NSData *encoded = [NSJSONSerialization dataWithJSONObject:value options:NSJSONWritingSortedKeys error:NULL];
    if (!encoded || encoded.length > 8192) return 78;
    static const char marker[] = "owner-preflight "; write(1, marker, sizeof(marker) - 1); write(1, encoded.bytes, encoded.length); write(1, "\n", 1);
    return [value[@"frontmostBundleID"] isEqual:@"unknown"] || [value[@"frontmostBundleName"] isEqual:@"unknown"] ? 78 : 0;
} }
