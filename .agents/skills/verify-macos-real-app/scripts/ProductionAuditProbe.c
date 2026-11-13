#include <fcntl.h>
#include <unistd.h>
int main(int argc, char **argv) {
 int fd = -1;
 if (argc == 2) { fd = open(argv[1], O_RDONLY | O_CLOEXEC); if (fd < 0) return 1; }
 usleep(200000);
 if (fd >= 0) close(fd);
 return 0;
}
