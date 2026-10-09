// Tiny concurrency limiter with a queue that refuses after queueTimeoutMs. Protects the shared,
// fragile corp backend (spec §6: <=2-3 concurrent, refuse after 30 s).
export function createLimiter(max = 3, queueTimeoutMs = 30000) {
  let active = 0;
  const queue = [];
  const pump = () => {
    if (active >= max) return;
    const job = queue.shift();
    if (!job) return;
    clearTimeout(job.timer);
    active++;
    Promise.resolve().then(job.fn).then(
      (v) => { active--; job.resolve(v); pump(); },
      (e) => { active--; job.reject(e); pump(); },
    );
  };
  return function run(fn) {
    return new Promise((resolve, reject) => {
      const job = { fn, resolve, reject, timer: null };
      job.timer = setTimeout(() => {
        const i = queue.indexOf(job);
        if (i !== -1) { queue.splice(i, 1); reject(new Error("queue timeout")); }
      }, queueTimeoutMs);
      queue.push(job);
      pump();
    });
  };
}
