// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { BindingContext } from '../types';
import { WasmPointer } from './types';

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
 * Validate UTF-16 encoding of a Uint16Array from linear memory.
 * CM spec requires well-formed UTF-16: no unpaired surrogates.
 */
export function validateUtf16(codeUnits: Uint16Array): void {
    for (let i = 0; i < codeUnits.length; i++) {
        const cu = codeUnits[i];
        if (cu >= 0xD800 && cu <= 0xDBFF) {
            // High surrogate — must be followed by low surrogate
            if (i + 1 >= codeUnits.length) {
                throw new Error(`invalid UTF-16: unpaired high surrogate 0x${cu.toString(16)} at index ${i}`);
            }
            const next = codeUnits[i + 1];
            if (next < 0xDC00 || next > 0xDFFF) {
                throw new Error(`invalid UTF-16: high surrogate 0x${cu.toString(16)} at index ${i} not followed by low surrogate`);
            }
            i++; // skip the low surrogate
        } else if (cu >= 0xDC00 && cu <= 0xDFFF) {
            // Lone low surrogate
            throw new Error(`invalid UTF-16: unpaired low surrogate 0x${cu.toString(16)} at index ${i}`);
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
