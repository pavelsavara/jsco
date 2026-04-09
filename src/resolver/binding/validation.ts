import { BindingContext } from '../types';
import { WasmPointer, WasmSize } from './types';

/**
 * Validate a pointer returned by realloc per canonical ABI spec.
 * - Alignment: ptr must be aligned to the requested alignment
 * - Bounds: ptr + size must not exceed linear memory size
 */
export function validateAllocResult(ctx: BindingContext, ptr: WasmPointer, align: number, size: number): void {
    const p = ptr as number;
    if (p !== 0 || size !== 0) {
        // trap_if(ptr != align_to(ptr, alignment))
        if ((p & (align - 1)) !== 0) {
            throw new Error(`realloc return not aligned: ptr=${p} alignment=${align}`);
        }
        // trap_if(ptr + byte_length > len(memory))
        const memorySize = ctx.memory.getMemory().buffer.byteLength;
        if (p + size > memorySize) {
            throw new Error(`realloc return out of bounds: ptr=${p} size=${size} memory_size=${memorySize}`);
        }
    }
}

/**
 * Validate a pointer being loaded/stored from memory for alignment.
 * Used when loading/storing list elements, record fields, etc.
 */
export function validatePointerAlignment(ptr: number, align: number, context: string): void {
    if (align > 1 && (ptr & (align - 1)) !== 0) {
        throw new Error(`${context} pointer not aligned: ptr=${ptr} alignment=${align}`);
    }
}

/**
 * Validate UTF-8 encoding of a byte sequence from linear memory.
 * Returns true if valid, throws if invalid.
 */
export function validateUtf8(bytes: Uint8Array): void {
    let i = 0;
    while (i < bytes.length) {
        const b0 = bytes[i];
        if (b0 < 0x80) {
            // ASCII
            i++;
        } else if ((b0 & 0xE0) === 0xC0) {
            // 2-byte
            if (b0 < 0xC2) throw new Error(`invalid UTF-8: overlong 2-byte sequence at offset ${i}`);
            if (i + 1 >= bytes.length) throw new Error(`invalid UTF-8: truncated 2-byte sequence at offset ${i}`);
            const b1 = bytes[i + 1];
            if ((b1 & 0xC0) !== 0x80) throw new Error(`invalid UTF-8: bad continuation byte at offset ${i + 1}`);
            i += 2;
        } else if ((b0 & 0xF0) === 0xE0) {
            // 3-byte
            if (i + 2 >= bytes.length) throw new Error(`invalid UTF-8: truncated 3-byte sequence at offset ${i}`);
            const b1 = bytes[i + 1];
            const b2 = bytes[i + 2];
            if ((b1 & 0xC0) !== 0x80) throw new Error(`invalid UTF-8: bad continuation byte at offset ${i + 1}`);
            if ((b2 & 0xC0) !== 0x80) throw new Error(`invalid UTF-8: bad continuation byte at offset ${i + 2}`);
            // Check for overlong
            if (b0 === 0xE0 && b1 < 0xA0) throw new Error(`invalid UTF-8: overlong 3-byte sequence at offset ${i}`);
            // Check for surrogates (U+D800..U+DFFF)
            if (b0 === 0xED && b1 >= 0xA0) throw new Error(`invalid UTF-8: surrogate codepoint at offset ${i}`);
            i += 3;
        } else if ((b0 & 0xF8) === 0xF0) {
            // 4-byte
            if (b0 > 0xF4) throw new Error(`invalid UTF-8: codepoint > U+10FFFF at offset ${i}`);
            if (i + 3 >= bytes.length) throw new Error(`invalid UTF-8: truncated 4-byte sequence at offset ${i}`);
            const b1 = bytes[i + 1];
            const b2 = bytes[i + 2];
            const b3 = bytes[i + 3];
            if ((b1 & 0xC0) !== 0x80) throw new Error(`invalid UTF-8: bad continuation byte at offset ${i + 1}`);
            if ((b2 & 0xC0) !== 0x80) throw new Error(`invalid UTF-8: bad continuation byte at offset ${i + 2}`);
            if ((b3 & 0xC0) !== 0x80) throw new Error(`invalid UTF-8: bad continuation byte at offset ${i + 3}`);
            // Check for overlong
            if (b0 === 0xF0 && b1 < 0x90) throw new Error(`invalid UTF-8: overlong 4-byte sequence at offset ${i}`);
            // Check for > U+10FFFF
            if (b0 === 0xF4 && b1 > 0x8F) throw new Error(`invalid UTF-8: codepoint > U+10FFFF at offset ${i}`);
            i += 4;
        } else {
            throw new Error(`invalid UTF-8: unexpected byte 0x${b0.toString(16)} at offset ${i}`);
        }
    }
}

/**
 * Check if the current context is poisoned (trap occurred previously).
 * Throws immediately if poisoned.
 */
export function checkNotPoisoned(ctx: BindingContext): void {
    if (ctx.poisoned) {
        throw new Error('component instance is poisoned: a trap occurred in a previous export call');
    }
}

/**
 * Check reentrance guard — trap if already inside an export call.
 */
export function checkNotReentrant(ctx: BindingContext): void {
    if (ctx.inExport) {
        throw new Error('cannot reenter component: already executing an export');
    }
}
