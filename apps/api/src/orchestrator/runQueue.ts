/**
 * Tiny serial in-process queue. Runs are processed one at a time so concurrent
 * `npm install` invocations don't fight for the same npm cache or CPU. This is
 * intentionally minimal — production would use a real queue.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    enqueue(task: () => Promise<void>): void {
      tail = tail.then(() => task().catch(() => undefined));
    },
    async drain(): Promise<void> {
      await tail;
    },
  };
}

export type SerialQueue = ReturnType<typeof createSerialQueue>;
