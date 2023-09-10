// adapted from https://github.com/yskszk63/stream-wasm-parser by yusuke suzuki under MIT License

import * as leb from "@thi.ng/leb128";
import { SyncSource, Source } from "../utils/streaming";

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