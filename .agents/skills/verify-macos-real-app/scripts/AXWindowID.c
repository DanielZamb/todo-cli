#include <ApplicationServices/ApplicationServices.h>
#include <dlfcn.h>

CGWindowID verification_window_id(AXUIElementRef window) {
    typedef AXError (*WindowIDFunction)(AXUIElementRef, CGWindowID *);
    WindowIDFunction function = (WindowIDFunction)dlsym(RTLD_DEFAULT, "_AXUIElementGetWindow");
    CGWindowID result = 0;
    if (function == NULL || function(window, &result) != kAXErrorSuccess) return 0;
    return result;
}
