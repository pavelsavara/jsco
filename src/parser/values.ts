// adapted from https://github.com/yskszk63/stream-wasm-parser by yusuke suzuki under MIT License

import * as leb from '@thi.ng/leb128';
import { ExternalKind } from '../model/core';
import { SyncSource, Source } from '../utils/streaming';
import { ComponentExternalKind } from '../model/exports';

const textDecoder = new TextDecoder();

export async function readU32Async(source: Source): Promise<number> {
    return await readIntegerAsync(
        source,
        0x00,
        0xFFFF_FFFF,
        leb.decodeULEB128,
    );
}

export function readU32(source: SyncSource): number {
    return readInteger(
        source,
        0x00,
        0xFFFF_FFFF,
        leb.decodeULEB128,
    );
}

export async function readNameAsync(source: SyncSource): Promise<string> {
    const length = await readU32(source);
    const content = await source.readExact(length);
    return textDecoder.decode(content) as any;
}

export function readName(source: SyncSource): string {
    const length = readU32(source);
    const content = source.readExact(length);
    return textDecoder.decode(content) as any;
}

export function readExternalKind(src: SyncSource): ExternalKind {
    throw new Error('not yet implemented');
}

export function readComponentExternalKind(src: SyncSource): ComponentExternalKind {
    const k1 = readU32(src);
    let k2;
    const kind: ComponentExternalKind = (() => {
        switch (k1) {
            case 0x00:
                k2 = readU32(src);
                switch (k2) {
                    case 0x11: return ComponentExternalKind.Module;
                    default:
                        throw new Error(`unknown export 2 type. ${k2}`);
                }
            case 0x01: return ComponentExternalKind.Func;
            case 0x02: return ComponentExternalKind.Value;
            case 0x03: return ComponentExternalKind.Type;
            case 0x04: return ComponentExternalKind.Component;
            case 0x05: return ComponentExternalKind.Instance;
            default:
                throw new Error(`unknown export type. ${k1}`);
        }
    })();
    return kind;
}

async function readIntegerAsync<R extends number>(
    source: Source,
    min: number,
    max: number,
    decoder: decoderType,
): Promise<R> {
    const src = await readRawIntegerAsync(source);
    const [r, consumed] = decoder(src);
    if (consumed !== src.length) {
        throw new Error(`invalid data. ${consumed} !== ${src.length}`);
    }
    if (r < min || r > max) {
        throw new Error(`overflow. ${bits}, ${r}`);
    }
    return Number(r) as R;
}
function readInteger<R extends number>(
    source: SyncSource,
    min: number,
    max: number,
    decoder: decoderType,
): R {
    const src = readRawInteger(source);
    const [r, consumed] = decoder(src);
    if (consumed !== src.length) {
        throw new Error(`invalid data. ${consumed} !== ${src.length}`);
    }
    if (r < min || r > max) {
        throw new Error(`overflow. ${bits}, ${r}`);
    }
    return Number(r) as R;
}

const bits = 32;
const maxLen = Math.ceil(bits / 7) | 0;

async function readRawIntegerAsync(
    source: Source,
): Promise<Uint8Array> {
    const buf = [];
    for (let i = 0; i < maxLen; i++) {
        const b = await source.read();
        buf.push(b);
        if ((b & 0x80) === 0) {
            break;
        }
    }
    return Uint8Array.from(buf);
}

function readRawInteger(
    source: SyncSource,
): Uint8Array {
    const buf = [];
    for (let i = 0; i < maxLen; i++) {
        const b = source.read();
        buf.push(b);
        if ((b & 0x80) === 0) {
            break;
        }
    }
    return Uint8Array.from(buf);
}

type decoderType = (src: Uint8Array, idx?: number) => [bigint, number]