// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

// Regression guard for resource flattening completeness.
//
// `wasi:http/types` and `wasi:sockets/types` expose resources whose flat
// `[constructor]/[static]/[method]/[resource-drop]` import tables are built
// programmatically (`buildHttpTypesFlat`, `flattenResource`). Missing entries
// surface only at runtime as cryptic resolver errors. This suite pins the
// WIT-defined method set per resource and asserts every entry is present
// and callable.

import { createHttpTypes } from '../../../src/host/wasip3/http';
import { createSocketsTypes } from '../../../src/host/wasip3/sockets';

type FlatTable = Record<string, unknown>;

function expectEntry(table: FlatTable, key: string): void {
    if (typeof table[key] !== 'function') {
        throw new Error(`missing flat entry: ${key} (got ${typeof table[key]})`);
    }
}

describe('resource flatten — completeness', () => {
    describe('wasi:http/types', () => {
        const types = createHttpTypes() as unknown as FlatTable;

        const expected: Record<string, string[]> = {
            fields: [
                '[constructor]fields',
                '[static]fields.from-list',
                '[resource-drop]fields',
                '[method]fields.get',
                '[method]fields.has',
                '[method]fields.set',
                '[method]fields.delete',
                '[method]fields.get-and-delete',
                '[method]fields.append',
                '[method]fields.copy-all',
                '[method]fields.clone',
            ],
            request: [
                '[static]request.new',
                '[static]request.consume-body',
                '[resource-drop]request',
                '[method]request.get-method',
                '[method]request.set-method',
                '[method]request.get-path-with-query',
                '[method]request.set-path-with-query',
                '[method]request.get-scheme',
                '[method]request.set-scheme',
                '[method]request.get-authority',
                '[method]request.set-authority',
                '[method]request.get-options',
                '[method]request.get-headers',
            ],
            'request-options': [
                '[constructor]request-options',
                '[resource-drop]request-options',
                '[method]request-options.get-connect-timeout',
                '[method]request-options.set-connect-timeout',
                '[method]request-options.get-first-byte-timeout',
                '[method]request-options.set-first-byte-timeout',
                '[method]request-options.get-between-bytes-timeout',
                '[method]request-options.set-between-bytes-timeout',
                '[method]request-options.clone',
            ],
            response: [
                '[static]response.new',
                '[static]response.consume-body',
                '[resource-drop]response',
                '[method]response.get-status-code',
                '[method]response.set-status-code',
                '[method]response.get-headers',
            ],
        };

        for (const [resource, keys] of Object.entries(expected)) {
            describe(resource, () => {
                for (const key of keys) {
                    test(key, () => { expectEntry(types, key); });
                }
            });
        }
    });

    describe('wasi:sockets/types', () => {
        const types = createSocketsTypes() as unknown as FlatTable;

        // `flattenResource` mirrors every prototype method, so this also
        // doubles as a sanity check that the helper iterates all expected
        // WIT methods on `tcp-socket` / `udp-socket`.
        const tcpMethods = [
            '[static]tcp-socket.create',
            '[resource-drop]tcp-socket',
            '[method]tcp-socket.bind',
            '[method]tcp-socket.connect',
            '[method]tcp-socket.listen',
            '[method]tcp-socket.send',
            '[method]tcp-socket.receive',
            '[method]tcp-socket.get-local-address',
            '[method]tcp-socket.get-remote-address',
            '[method]tcp-socket.get-is-listening',
            '[method]tcp-socket.get-address-family',
            '[method]tcp-socket.set-listen-backlog-size',
            '[method]tcp-socket.get-keep-alive-enabled',
            '[method]tcp-socket.set-keep-alive-enabled',
            '[method]tcp-socket.get-keep-alive-idle-time',
            '[method]tcp-socket.set-keep-alive-idle-time',
            '[method]tcp-socket.get-keep-alive-interval',
            '[method]tcp-socket.set-keep-alive-interval',
            '[method]tcp-socket.get-keep-alive-count',
            '[method]tcp-socket.set-keep-alive-count',
            '[method]tcp-socket.get-hop-limit',
            '[method]tcp-socket.set-hop-limit',
            '[method]tcp-socket.get-receive-buffer-size',
            '[method]tcp-socket.set-receive-buffer-size',
            '[method]tcp-socket.get-send-buffer-size',
            '[method]tcp-socket.set-send-buffer-size',
        ];

        const udpMethods = [
            '[static]udp-socket.create',
            '[resource-drop]udp-socket',
            '[method]udp-socket.bind',
            '[method]udp-socket.connect',
            '[method]udp-socket.disconnect',
            '[method]udp-socket.send',
            '[method]udp-socket.receive',
            '[method]udp-socket.get-local-address',
            '[method]udp-socket.get-remote-address',
            '[method]udp-socket.get-address-family',
            '[method]udp-socket.get-unicast-hop-limit',
            '[method]udp-socket.set-unicast-hop-limit',
            '[method]udp-socket.get-receive-buffer-size',
            '[method]udp-socket.set-receive-buffer-size',
            '[method]udp-socket.get-send-buffer-size',
            '[method]udp-socket.set-send-buffer-size',
        ];

        describe('tcp-socket', () => {
            for (const key of tcpMethods) {
                test(key, () => { expectEntry(types, key); });
            }
        });

        describe('udp-socket', () => {
            for (const key of udpMethods) {
                test(key, () => { expectEntry(types, key); });
            }
        });
    });
});
