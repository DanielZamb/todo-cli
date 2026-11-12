#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#include <fcntl.h>
#include <libproc.h>
#include <unistd.h>
extern int sandbox_init(const char *, unsigned long long, char **);
extern void verification_temporary_bind(int);
extern double verification_hid_idle_seconds(void);
int main(void) { @autoreleasepool {
 char policy[65536]; size_t count=0; ssize_t got; while((got=read(0,policy+count,sizeof(policy)-count-1))>0){count+=got;if(count==sizeof(policy)-1)return 2;} policy[count]=0;
 int fd=open(getenv("TMPDIR"),O_RDONLY|O_DIRECTORY|O_NOFOLLOW);verification_temporary_bind(fd);close(fd);
 char *error=NULL;if(sandbox_init(policy,0,&error)){if(error)fprintf(stderr,"%s\n",error);return 78;}
 ProcessSerialNumber serial = {0, 0}; pid_t nativePID = 0; char nativePath[PROC_PIDPATHINFO_MAXSIZE] = {0};
 OSStatus frontStatus = GetFrontProcess(&serial);
 OSStatus pidStatus = frontStatus == noErr ? GetProcessPID(&serial, &nativePID) : frontStatus;
 if (pidStatus == noErr) proc_pidpath(nativePID, nativePath, sizeof(nativePath));
 id monitor=[NSEvent addGlobalMonitorForEventsMatchingMask:NSEventMaskAny handler:^(NSEvent *event){}];
 BOOL monitorInstalled=monitor!=nil; if(monitor)[NSEvent removeMonitor:monitor];
 NSRunningApplication *front=NSWorkspace.sharedWorkspace.frontmostApplication;
 NSDictionary *value=@{@"frontmostBundleID":front.bundleIdentifier?:@"unknown",@"frontmostName":front.localizedName?:@"unknown",@"frontmostBundleName":front.bundleURL.lastPathComponent?:@"unknown",@"axTrusted":@(AXIsProcessTrusted()),@"listenTrusted":@(CGPreflightListenEventAccess()),@"idleSeconds":@(CGEventSourceSecondsSinceLastEventType(kCGEventSourceStateCombinedSessionState,kCGAnyInputEventType)),@"hidIdleSeconds":@(verification_hid_idle_seconds()),@"nativeFrontStatus":@(frontStatus),@"nativePIDStatus":@(pidStatus),@"nativePID":@(nativePID),@"nativeExecutablePath":[NSString stringWithUTF8String:nativePath],@"globalMonitorInstalled":@(monitorInstalled)};
 NSData *data=[NSJSONSerialization dataWithJSONObject:value options:NSJSONWritingSortedKeys error:NULL];if(!data)return 78;write(1,data.bytes,data.length);write(1,"\n",1);return 0;
}}
