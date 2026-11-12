#ifndef CLIENT_STALL_SAMPLING_H
#define CLIENT_STALL_SAMPLING_H

#include <mach/mach.h>
#include <stdint.h>

/// Program counters kept from one sample of a thread's stack.
#define TODO_STALL_MAX_FRAMES 32

enum {
    TODO_SAMPLE_OK = 0,
    TODO_SAMPLE_UNSUPPORTED = 1,      ///< not built for arm64: attribution is disabled
    TODO_SAMPLE_SUSPEND_FAILED = 2,
    TODO_SAMPLE_STATE_FAILED = 3,     ///< resumed, no frames
    TODO_SAMPLE_RESUME_FAILED = 4
};

/// One sample. The caller preallocates it; the sampler writes only into it.
typedef struct {
    uint64_t pcs[TODO_STALL_MAX_FRAMES];
    uint32_t count;
    int32_t status;
    uint64_t lr;              ///< link register (PAC stripped): a leaf's caller before it pushes a frame
    uint64_t suspended_ticks; ///< mach_absolute_time ticks from the suspend's return to the resume's
} todo_stall_sample;

/// Suspends `thread`, reads its registers, walks its frame-pointer chain with
/// vm_read_overwrite into `out`, and resumes it. Between the suspend and the
/// resume it makes no allocation, no runtime call, no retain or release, no
/// logging, no symbol lookup and no dispatch, so it cannot wait for a lock the
/// suspended thread holds. thread_resume is reached on every path after a
/// successful suspend. Symbolication happens in the caller, after this returns.
int32_t todo_sample_thread(thread_act_t thread, todo_stall_sample *out);

/// Whether this slice can sample (arm64 only).
int32_t todo_sampling_supported(void);

#endif
