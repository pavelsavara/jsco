/**
 * Shared types for the WASI Preview 2 host implementation.
 */

/** WASI datetime record — used by wall-clock and filesystem */
export interface WasiDatetime {
    seconds: bigint;
    nanoseconds: number;
}

/** Thrown by wasi:cli/exit to signal process termination */
export class WasiExit extends Error {
    constructor(public readonly status: number) {
        super(`WASI exit with status ${status}`);
        this.name = 'WasiExit';
    }
}

/** Configuration for createWasiP2Host() */
export interface WasiConfig {
    /** Environment variables as [key, value] pairs */
    env?: [string, string][];
    /** Command-line arguments */
    args?: string[];
    /** Initial working directory */
    cwd?: string;
    /** Stdin content (bytes) */
    stdin?: Uint8Array;
    /** Stdout callback — called on flush. Default: console.log */
    stdout?: (bytes: Uint8Array) => void;
    /** Stderr callback — called on flush. Default: console.error */
    stderr?: (bytes: Uint8Array) => void;
    /** Virtual filesystem — full unix paths to file contents */
    fs?: Map<string, Uint8Array>;
}

/** Opaque handle ID for WASI resources */
export type HandleId = number;

/** Minimal handle table for host-side resource tracking */
export interface HandleTable<T> {
    add(resource: T): HandleId;
    get(id: HandleId): T;
    remove(id: HandleId): T;
    has(id: HandleId): boolean;
}

/** Create a handle table for managing host-side resources */
export function createHandleTable<T>(): HandleTable<T> {
    let nextId = 1;
    const table = new Map<HandleId, T>();

    return {
        add(resource: T): HandleId {
            const id = nextId++;
            table.set(id, resource);
            return id;
        },
        get(id: HandleId): T {
            const resource = table.get(id);
            if (resource === undefined) {
                throw new Error(`Invalid handle: ${id}`);
            }
            return resource;
        },
        remove(id: HandleId): T {
            const resource = table.get(id);
            if (resource === undefined) {
                throw new Error(`Invalid handle: ${id}`);
            }
            table.delete(id);
            return resource;
        },
        has(id: HandleId): boolean {
            return table.has(id);
        },
    };
}
