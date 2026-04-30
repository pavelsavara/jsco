// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

// --- Stream/Future status codes per canonical ABI ---
export const STREAM_STATUS_COMPLETED = 0;
export const STREAM_STATUS_DROPPED = 1;
export const STREAM_STATUS_CANCELLED = 2;
export const STREAM_BLOCKED = 0xFFFFFFFF;

/** Backpressure threshold: stream.write returns BLOCKED when this many bytes are buffered. */
export const STREAM_BACKPRESSURE = 65536; // 64 KB

/** Backpressure threshold for non-byte (typed) streams: pump pauses when chunks pile up. */
export const STREAM_BACKPRESSURE_CHUNKS = 1024;

// Event codes for waitable-set events: (event_code, payload1, payload2)
export const EVENT_SUBTASK = 1;
export const EVENT_STREAM_READ = 2;
export const EVENT_STREAM_WRITE = 3;
export const EVENT_FUTURE_READ = 4;
export const EVENT_FUTURE_WRITE = 5;
