#include <sys/resource.h>
#include <sys/syscall.h>
#include <unistd.h>
#include <stdio.h>
#include <execinfo.h>
static int trace_limit(int resource, const struct rlimit *limit) {
 int result=syscall(SYS_setrlimit, resource, limit);
 if(resource==RLIMIT_NOFILE) { dprintf(2,"PERF_RLIMIT pid=%d soft=%llu hard=%llu result=%d\n",getpid(),(unsigned long long)limit->rlim_cur,(unsigned long long)limit->rlim_max,result); void *frames[12];int n=backtrace(frames,12);backtrace_symbols_fd(frames,n,2); }
 return result;
}
__attribute__((used)) static struct { const void *replacement; const void *replacee; } interpose __attribute__((section("__DATA,__interpose"))) = { (const void*)trace_limit,(const void*)setrlimit };
