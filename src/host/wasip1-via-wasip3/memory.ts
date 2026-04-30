// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import { CiovecLayout } from './types/wasi-snapshot-preview1';

/**
 * Get a fresh DataView from a WebAssembly.Memory, handling memory.grow() detachment.
 */
export function getView(memory: WebAssembly.Memory): DataView {
    return new DataView(memory.buffer);
}

/**
 * Read a ciovec/iovec array from linear memory.
 * Each entry is { buf: u32, buf_len: u32 } at 8-byte stride (CiovecLayout._size).
 * Returns array of (ptr, len) pairs.
 */
export function readIovecs(view: DataView, iovsPtr: number, iovsCount: number): { ptr: number; len: number }[] {
    const result: { ptr: number; len: number }[] = [];
    for (let i = 0; i < iovsCount; i++) {
        const base = iovsPtr + i * CiovecLayout._size;
        const ptr = view.getUint32(base + CiovecLayout.buf.offset, true);
        const len = view.getUint32(base + CiovecLayout.buf_len.offset, true);
        result.push({ ptr, len });
    }
    return result;
}

/**
 * Gather bytes from an iovec array in linear memory into a single Uint8Array.
 */
export function gatherBytes(memory: WebAssembly.Memory, iovsPtr: number, iovsCount: number): { data: Uint8Array; totalLen: number } {
    const view = getView(memory);
    const iovecs = readIovecs(view, iovsPtr, iovsCount);
    let totalLen = 0;
    for (const iov of iovecs) {
        totalLen += iov.len;
    }
    const data = new Uint8Array(totalLen);
    let offset = 0;
    for (const iov of iovecs) {
        data.set(new Uint8Array(memory.buffer, iov.ptr, iov.len), offset);
        offset += iov.len;
    }
    return { data, totalLen };
}

/**
 * Scatter bytes into an iovec array in linear memory.
 * Returns the number of bytes actually written.
 */
export function scatterBytes(memory: WebAssembly.Memory, iovsPtr: number, iovsCount: number, data: Uint8Array): number {
    const view = getView(memory);
    const iovecs = readIovecs(view, iovsPtr, iovsCount);
    let written = 0;
    let srcOffset = 0;
    for (const iov of iovecs) {
        if (srcOffset >= data.length) break;
        const toWrite = Math.min(iov.len, data.length - srcOffset);
        new Uint8Array(memory.buffer, iov.ptr, toWrite).set(data.subarray(srcOffset, srcOffset + toWrite));
        written += toWrite;
        srcOffset += toWrite;
    }
    return written;
}

/**
 * Read a UTF-8 string from linear memory.
 */
export function readString(memory: WebAssembly.Memory, ptr: number, len: number): string {
    return new TextDecoder().decode(new Uint8Array(memory.buffer, ptr, len));
}
