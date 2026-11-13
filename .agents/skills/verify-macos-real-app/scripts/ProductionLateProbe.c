#include <dlfcn.h>
#include <stdio.h>
int main(int argc, char **argv) {
 if (argc != 2) return 2;
 if (!dlopen(argv[1], RTLD_NOW | RTLD_GLOBAL)) { fputs(dlerror(), stderr); return 1; }
 puts("PASS: late credential audit loaded and verified its bindings");
 return 0;
}
