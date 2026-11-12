#import <Foundation/Foundation.h>
#import <objc/runtime.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
extern int sandbox_init(const char *, unsigned long long, char **);
extern void verification_temporary_bind(int);

@interface VerificationProofDefaults : NSUserDefaults
@property(nonatomic, strong) NSMutableDictionary *memory;
@property(nonatomic, strong) NSRecursiveLock *mutex;
@end
@implementation VerificationProofDefaults
- (id)init { self = [super initWithSuiteName:@"local.todo.production-proof.memory"]; if (self) { _memory = [NSMutableDictionary dictionary]; _mutex = [NSRecursiveLock new]; } return self; }
- (id)objectForKey:(NSString *)key { [_mutex lock]; id value = _memory[key]; [_mutex unlock]; return value; }
- (void)setObject:(id)value forKey:(NSString *)key { [self willChangeValueForKey:key]; [_mutex lock]; if (value) _memory[key] = value; else [_memory removeObjectForKey:key]; [_mutex unlock]; [self didChangeValueForKey:key]; [[NSNotificationCenter defaultCenter] postNotificationName:NSUserDefaultsDidChangeNotification object:self]; }
- (void)removeObjectForKey:(NSString *)key { [self setObject:nil forKey:key]; }
- (NSDictionary *)dictionaryRepresentation { [_mutex lock]; NSDictionary *value = [_memory copy]; [_mutex unlock]; return value; }
- (void)registerDefaults:(NSDictionary *)values { [_mutex lock]; for (NSString *key in values) if (!_memory[key]) _memory[key] = values[key]; [_mutex unlock]; }
- (void)addSuiteNamed:(NSString *)name {}
- (void)removeSuiteNamed:(NSString *)name {}
- (NSDictionary *)volatileDomainForName:(NSString *)name { return @{}; }
- (void)setVolatileDomain:(NSDictionary *)value forName:(NSString *)name {}
- (void)removeVolatileDomainForName:(NSString *)name {}
- (NSDictionary *)persistentDomainForName:(NSString *)name { return nil; }
- (void)setPersistentDomain:(NSDictionary *)value forName:(NSString *)name {}
- (void)removePersistentDomainForName:(NSString *)name {}
- (BOOL)synchronize { return YES; }
@end
static NSUserDefaults *memory;
static NSString *temporary;
static id isolatedDefaults(id receiver, SEL selector) { return memory; }
static id isolatedTemporary(id receiver, SEL selector) { return [NSURL fileURLWithPath:temporary isDirectory:YES]; }
static NSString *literal(NSString *value) { return [NSString stringWithFormat:@"\"%@\"", [[value stringByReplacingOccurrencesOfString:@"\\" withString:@"\\\\"] stringByReplacingOccurrencesOfString:@"\"" withString:@"\\\""]]; }

__attribute__((constructor)) static void isolateProductionProof(void) {
 @autoreleasepool {
  const char *base = getenv("TODO_PROOF_ROOT"), *repository = getenv("TODO_PROOF_REPOSITORY");
  if (!base || !repository || strncmp(base, "/private/tmp/todo-mac-verify-", 29)) _exit(78);
  int scope = open(base, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC); struct stat info; char actual[4096];
  if (scope < 0 || fstat(scope, &info) || info.st_uid != getuid() || (info.st_mode & 077) || fcntl(scope, F_GETPATH, actual) || strcmp(actual, base)) _exit(78);
  temporary = [[NSString stringWithUTF8String:base] stringByAppendingPathComponent:@"tmp"];
  int temp = open(temporary.fileSystemRepresentation, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  verification_temporary_bind(temp); close(temp); close(scope);
  NSString *root = [NSString stringWithUTF8String:base], *repo = [NSString stringWithUTF8String:repository];
  NSMutableString *policy = [NSMutableString stringWithFormat:@"(version 1)(allow default)(deny file-read*)(deny file-write*)(allow file-read-data (literal \"/\"))(allow file-read* (subpath \"/System\") (subpath \"/usr/lib\") (subpath \"/usr/share\") (subpath \"/Library/Apple\") (subpath \"/Library/Fonts\") (subpath \"/Applications/Xcode.app\"))(allow file-read* (literal \"/dev/null\" \"/dev/random\" \"/dev/urandom\"))(allow file-write-data (literal \"/dev/null\"))(allow file-read* (subpath %@))(allow file-read* file-write* (subpath %@))", literal(repo), literal(root)];
  [policy appendFormat:@"(allow file-write* (subpath %@))", literal([repo stringByAppendingPathComponent:@"apps/macos/DerivedData/V01Proof"])];
  NSString *evidence = [NSString stringWithUTF8String:getenv("TODO_PROOF_EVIDENCE") ?: ""];
  if (![evidence hasPrefix:[repo stringByAppendingPathComponent:@"docs/evidence/mac-verification-app/"]]) _exit(78);
  [policy appendFormat:@"(allow file-write* (subpath %@))", literal(evidence)];
  [policy appendFormat:@"(deny process-exec)(allow process-exec (subpath %@))(deny network-outbound)", literal(root)];
  NSString *ports = [NSString stringWithUTF8String:getenv("TODO_PROOF_PORTS") ?: ""];
  for (NSString *port in [ports componentsSeparatedByString:@","]) { NSInteger value = port.integerValue; if (value > 0 && value <= 65535 && [[NSString stringWithFormat:@"%ld", (long)value] isEqualToString:port]) [policy appendFormat:@"(allow network-outbound (remote ip4 \"localhost:%ld\"))", (long)value]; }
  [policy appendString:@"(deny mach-lookup)(allow mach-lookup (global-name \"com.apple.windowserver.active\" \"com.apple.windowserver\" \"com.apple.FontObjectsServer\"))"];
  char *error = NULL;
  if (sandbox_init(policy.UTF8String, 0, &error)) { if (error) write(2, error, strlen(error)); _exit(78); }
  memory = [VerificationProofDefaults new];
  method_setImplementation(class_getClassMethod(NSUserDefaults.class, @selector(standardUserDefaults)), (IMP)isolatedDefaults);
  method_setImplementation(class_getInstanceMethod(NSFileManager.class, @selector(temporaryDirectory)), (IMP)isolatedTemporary);
  static const char receipt[] = "production-proof isolation: linked credential trap, memory defaults, scratch temp/files and credential-broker denials installed\n";
  write(2, receipt, sizeof(receipt) - 1);
 }
}
