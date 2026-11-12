#include "ClientStallSampling.h"
#include <mach/mach_time.h>
#if defined(__arm64__)
#include <ptrauth.h>
#endif

int32_t todo_sampling_supported(void) {
#if defined(__arm64__)
    return 1;
#else
    return 0;
#endif
}

#if defined(__arm64__)
#if defined(__DARWIN_OPAQUE_ARM_THREAD_STATE64) && __DARWIN_OPAQUE_ARM_THREAD_STATE64
#define TODO_STATE_PC(state) ((uint64_t)(state).__opaque_pc)
#define TODO_STATE_FP(state) ((uint64_t)(state).__opaque_fp)
#define TODO_STATE_LR(state) ((uint64_t)(state).__opaque_lr)
#else
#define TODO_STATE_PC(state) ((uint64_t)(state).__pc)
#define TODO_STATE_FP(state) ((uint64_t)(state).__fp)
#define TODO_STATE_LR(state) ((uint64_t)(state).__lr)
#endif
static inline uint64_t todo_strip(uint64_t value) {
    return (uint64_t)ptrauth_strip((void *)value, ptrauth_key_return_address);
}
#endif

int32_t todo_sample_thread(thread_act_t thread, todo_stall_sample *out) {
    out->count = 0;
    out->lr = 0;
    out->suspended_ticks = 0;
#if defined(__arm64__)
    if (thread_suspend(thread) != KERN_SUCCESS) {
        out->status = TODO_SAMPLE_SUSPEND_FAILED;
        return out->status;
    }
    uint64_t started = mach_absolute_time();
    // ---- suspended: only kernel calls into stack-local and caller buffers below ----
    int32_t status = TODO_SAMPLE_OK;
    arm_thread_state64_t state;
    mach_msg_type_number_t state_count = ARM_THREAD_STATE64_COUNT;
    if (thread_get_state(thread, ARM_THREAD_STATE64, (thread_state_t)&state, &state_count) == KERN_SUCCESS) {
        uint32_t count = 0;
        out->pcs[count++] = todo_strip(TODO_STATE_PC(state));
        out->lr = todo_strip(TODO_STATE_LR(state));
        uint64_t fp = todo_strip(TODO_STATE_FP(state));
        while (count < TODO_STALL_MAX_FRAMES && fp != 0 && (fp & 0x7) == 0) {
            uint64_t frame[2] = {0, 0};
            vm_size_t read = 0;
            if (vm_read_overwrite(mach_task_self(), (vm_address_t)fp, sizeof(frame), (vm_address_t)frame, &read) != KERN_SUCCESS || read != sizeof(frame)) break;
            uint64_t ret = todo_strip(frame[1]);
            if (ret == 0) break;
            out->pcs[count++] = ret;
            uint64_t next = todo_strip(frame[0]);
            if (next <= fp) break; // the stack grows down: a caller's frame is higher
            fp = next;
        }
        out->count = count;
    } else {
        status = TODO_SAMPLE_STATE_FAILED;
    }
    // ---- resume on every path ----
    kern_return_t resumed = thread_resume(thread);
    out->suspended_ticks = mach_absolute_time() - started;
    if (resumed != KERN_SUCCESS) status = TODO_SAMPLE_RESUME_FAILED;
    out->status = status;
    return status;
#else
    (void)thread;
    out->status = TODO_SAMPLE_UNSUPPORTED;
    return out->status;
#endif
}
