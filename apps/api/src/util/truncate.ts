export interface CappedBuffer {
  append(chunk: Buffer): void;
  value(): string;
  truncated(): boolean;
}

export function createCappedBuffer(maxBytes: number): CappedBuffer {
  let bytes = 0;
  let truncated = false;
  const parts: Buffer[] = [];
  return {
    append(chunk) {
      if (truncated) return;
      const remaining = maxBytes - bytes;
      if (chunk.length <= remaining) {
        parts.push(chunk);
        bytes += chunk.length;
        return;
      }
      if (remaining > 0) parts.push(chunk.subarray(0, remaining));
      bytes = maxBytes;
      truncated = true;
    },
    value() {
      const joined = Buffer.concat(parts).toString("utf8");
      return truncated
        ? joined +
            `\n…[truncated at ${maxBytes} bytes — increase MAX_STDIO_BYTES to capture more]`
        : joined;
    },
    truncated() {
      return truncated;
    },
  };
}
