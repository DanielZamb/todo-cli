// Deadlock stress for the stall sampler's suspended window (candidate 8, stall attribution).
//
// A target thread churns malloc/free and takes a pthread mutex and an os_unfair_lock, so at any
// moment it may hold the allocator's or a lock's internal state. The sampler thread suspends it
// SAMPLES times through todo_sample_thread and, after each resume, allocates and takes the same
// locks itself. If the window ever left the target suspended while holding one of them, or made a
// call that waits on one, the run would hang; a watchdog turns a hang into exit 3.
//
// --control-lock-in-window runs a deliberately wrong sampler that allocates and takes the target's
// mutex while the target is suspended (the defect the C window exists to rule out). It must hang
// and be caught by the watchdog (exit 3).
//
// Output: one JSON line with the sample count, statuses, target progress and the suspended
// window's median, p99 and max in microseconds, and how many windows exceeded 1 ms.
#include "ClientStallSampling.h"
#include <mach/mach.h>
#include <mach/mach_time.h>
#include <os/lock.h>
#include <pthread.h>
#include <pthread/qos.h>
#include <signal.h>
#include <stdatomic.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define SAMPLES 100000

static pthread_mutex_t mutex = PTHREAD_MUTEX_INITIALIZER;
static os_unfair_lock unfair = OS_UNFAIR_LOCK_INIT;
static _Atomic uint64_t progress = 0;
static _Atomic int stop = 0;
static _Atomic int ready = 0;
static thread_act_t target_port = MACH_PORT_NULL;

static void *target(void *unused) {
    (void)unused;
    target_port = mach_thread_self();
    atomic_store(&ready, 1);
    uint64_t sink = 0;
    while (!atomic_load(&stop)) {
        size_t size = 16 + (size_t)(atomic_load(&progress) % 4096);
        char *block = malloc(size);
        if (block) { memset(block, 1, size); sink += (uint64_t)block[size - 1]; free(block); }
        pthread_mutex_lock(&mutex); sink++; pthread_mutex_unlock(&mutex);
        os_unfair_lock_lock(&unfair); sink++; os_unfair_lock_unlock(&unfair);
        atomic_fetch_add(&progress, 1);
    }
    return (void *)(uintptr_t)sink;
}

/// The wrong sampler: while the target is suspended it allocates and takes a lock the target
/// also takes (the shape of a runtime, dyld or logging lock reached from inside the window).
/// A small malloc alone rarely hangs on macOS (per-CPU magazines), so the lock is what makes the
/// control certain to meet a lock held by the suspended thread.
static int32_t control_lock_in_window(thread_act_t thread, todo_stall_sample *out) {
    out->count = 0; out->lr = 0; out->suspended_ticks = 0;
    if (thread_suspend(thread) != KERN_SUCCESS) return out->status = TODO_SAMPLE_SUSPEND_FAILED;
    void *wrong = malloc(64);
    free(wrong);
    pthread_mutex_lock(&mutex); pthread_mutex_unlock(&mutex);
    thread_resume(thread);
    return out->status = TODO_SAMPLE_OK;
}

static void watchdog(int signal) {
    (void)signal;
    static const char line[] = "{\"result\":\"FAIL\",\"reason\":\"watchdog: the sampler or target hung\"}\n";
    write(1, line, sizeof(line) - 1);
    _exit(3);
}

static int compare(const void *a, const void *b) {
    uint64_t x = *(const uint64_t *)a, y = *(const uint64_t *)b;
    return x < y ? -1 : x > y;
}

int main(int argc, char **argv) {
    int control = argc > 1 && strcmp(argv[1], "--control-lock-in-window") == 0;
    if (!todo_sampling_supported()) { puts("{\"result\":\"UNSUPPORTED\",\"reason\":\"not arm64\"}"); return 2; }
    signal(SIGALRM, watchdog);
    const char *seconds = getenv("STALL_STRESS_WATCHDOG_SECONDS");
    alarm(seconds ? (unsigned)atoi(seconds) : 120);
    // STALL_STRESS_QOS=user-interactive samples at the app's watchdog QoS (MAC-C1-S1-21 review).
    const char *qos = getenv("STALL_STRESS_QOS");
    int interactive = qos && strcmp(qos, "user-interactive") == 0;
    if (interactive && pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0) != 0) { puts("{\"result\":\"FAIL\",\"reason\":\"qos\"}"); return 1; }
    pthread_t thread;
    pthread_create(&thread, NULL, target, NULL);
    while (!atomic_load(&ready)) {}
    mach_timebase_info_data_t base;
    mach_timebase_info(&base);
    uint64_t *windows = calloc(SAMPLES, sizeof(uint64_t));
    uint64_t statuses[5] = {0}, frames = 0, stalled_progress = 0;
    todo_stall_sample sample;
    uint64_t last = atomic_load(&progress);
    for (int i = 0; i < SAMPLES; i++) {
        int32_t status = control ? control_lock_in_window(target_port, &sample) : todo_sample_thread(target_port, &sample);
        if (status >= 0 && status < 5) statuses[status]++;
        windows[i] = sample.suspended_ticks * base.numer / base.denom; // ns
        frames += sample.count;
        // After each resume: allocate and take the target's locks, as the app's caller would.
        void *after = malloc(128); free(after);
        pthread_mutex_lock(&mutex); pthread_mutex_unlock(&mutex);
        os_unfair_lock_lock(&unfair); os_unfair_lock_unlock(&unfair);
        // Let the target run before the next sample, so each one lands somewhere new in its
        // loop; a target that never advances within 50 ms after a resume counts as stalled.
        uint64_t waited = mach_absolute_time(), limit = 50000000ull * base.denom / base.numer;
        while (atomic_load(&progress) == last && mach_absolute_time() - waited < limit) {}
        uint64_t now = atomic_load(&progress);
        if (now == last) stalled_progress++;
        last = now;
    }
    atomic_store(&stop, 1);
    pthread_join(thread, NULL);
    alarm(0);
    // The app's per-stall rule replayed on these windows, in stalls of 20 samples: a sample starts
    // only if spent + 1 ms still fits 2 ms. Reports the worst stall's suspended total without and
    // with that budget, and how many samples it would have refused.
    uint64_t worst_raw = 0, worst_budgeted = 0, refused = 0;
    for (int g = 0; g + 20 <= SAMPLES; g += 20) {
        uint64_t raw = 0, spent = 0;
        for (int k = 0; k < 20; k++) {
            raw += windows[g + k];
            if (spent + 1000000 <= 2000000) spent += windows[g + k]; else refused++;
        }
        if (raw > worst_raw) worst_raw = raw;
        if (spent > worst_budgeted) worst_budgeted = spent;
    }
    qsort(windows, SAMPLES, sizeof(uint64_t), compare);
    uint64_t over = 0;
    for (int i = 0; i < SAMPLES; i++) if (windows[i] > 1000000) over++;
    int pass = statuses[TODO_SAMPLE_OK] == SAMPLES && stalled_progress == 0 && frames >= SAMPLES;
    printf("{\"result\":\"%s\",\"control\":%s,\"samples\":%d,\"ok\":%llu,\"suspend_failed\":%llu,\"state_failed\":%llu,\"resume_failed\":%llu,"
           "\"frames_total\":%llu,\"target_progress\":%llu,\"no_progress_within_50ms\":%llu,"
           "\"window_us\":{\"median\":%.2f,\"p99\":%.2f,\"max\":%.2f},\"windows_over_1ms\":%llu,\"qos\":\"%s\","
           "\"stall_of_20_us\":{\"worst_unbudgeted\":%.2f,\"worst_budgeted\":%.2f,\"samples_refused\":%llu}}\n",
           pass ? "PASS" : "FAIL", control ? "true" : "false", SAMPLES,
           statuses[TODO_SAMPLE_OK], statuses[TODO_SAMPLE_SUSPEND_FAILED], statuses[TODO_SAMPLE_STATE_FAILED], statuses[TODO_SAMPLE_RESUME_FAILED],
           frames, (unsigned long long)atomic_load(&progress), stalled_progress,
           windows[SAMPLES / 2] / 1000.0, windows[SAMPLES * 99 / 100] / 1000.0, windows[SAMPLES - 1] / 1000.0, over,
           interactive ? "user-interactive" : "default", worst_raw / 1000.0, worst_budgeted / 1000.0, refused);
    return pass ? 0 : 1;
}
