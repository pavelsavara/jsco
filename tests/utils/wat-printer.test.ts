// Copyright (c) 2023 Pavel Savara. Licensed under the Apache-2.0 license with LLVM exception. See LICENSE for details.

import * as fs from 'fs';
import { parse } from '../../src/parser/index';
import { printWAT } from '../../src/utils/wat-printer';
import { ModelTag } from '../../src/parser/model/tags';
import { ComponentExternalKind } from '../../src/parser/model/exports';
import { ExternalKind } from '../../src/parser/model/core';
import { ComponentOuterAliasKind } from '../../src/parser/model/aliases';
import type { WITModel } from '../../src/parser';

const echoWasm = './integration-tests/echo-reactor-wat/echo.wasm';
const helloP2Wasm = './integration-tests/hello-p2-world-wat/hello.wasm';
const helloP3Wasm = './integration-tests/hello-p3-world-wat/hello-p3.wasm';
const helloCityWasm = './integration-tests/hello-city-wat/hello-city.wasm';
const forwarderImplWasm = './integration-tests/compositions/forwarder-implementer.wasm';
const forwarderImplP3Wasm = './integration-tests/compositions/forwarder-implementer-p3.wasm';
const disposeAsyncP3Wasm = './integration-tests/dispose-async-p3-wat/dispose-async-p3.wasm';
const consumerP2Wasm = './integration-tests/consumer-p2/consumer_p2.wasm';
const consumerP3Wasm = './integration-tests/consumer-p3/consumer_p3.wasm';
const implementerP2Wasm = './integration-tests/implementer-p2/implementer_p2.wasm';
const implementerP3Wasm = './integration-tests/implementer-p3/implementer_p3.wasm';
const helloP2WorldWasm = './integration-tests/hello-p2-world/hello_p2_world.wasm';
const fileIoP1Wasm = './integration-tests/file-io-p1-wat/file-io.wasm';

function tryReadWasm(path: string): Uint8Array | null {
    try {
        return new Uint8Array(fs.readFileSync(path));
    } catch {
        return null;
    }
}

describe('printWAT', () => {
    test('prints echo-reactor component with expected sections', async () => {
        const bytes = fs.readFileSync(echoWasm);
        const model = await parse(new Uint8Array(bytes));
        const wat = printWAT(model);
        expect(wat).toContain('(component');
        expect(wat).toContain(')');
        // Echo reactor has exports, core modules, instances, aliases, etc.
        expect(wat).toContain('(core module');
        expect(wat).toContain('(export');
    });

    test('prints hello-p2-world component with imports, types, instances, aliases', async () => {
        const bytes = fs.readFileSync(helloP2Wasm);
        const model = await parse(new Uint8Array(bytes));
        const wat = printWAT(model);
        expect(wat).toContain('(component');
        expect(wat).toContain('(type');
        expect(wat).toContain('(import');
        expect(wat).toContain('(export');
        // P2 components have core instances and aliases
        expect(wat).toContain('(core instance');
        expect(wat).toContain('(alias');
    });

    test('prints hello-p3-world component with stream types', async () => {
        const bytes = fs.readFileSync(helloP3Wasm);
        const model = await parse(new Uint8Array(bytes));
        const wat = printWAT(model);
        expect(wat).toContain('(component');
        // P3 components use async/stream types
        expect(wat).toContain('(func');
    });

    test('prints hello-city component with record types', async () => {
        const bytes = fs.readFileSync(helloCityWasm);
        const model = await parse(new Uint8Array(bytes));
        const wat = printWAT(model);
        expect(wat).toContain('(component');
        // hello-city uses record types (city-info)
        expect(wat).toContain('(record');
        // Should have func types
        expect(wat).toContain('(func');
    });

    test('printed output is deterministic', async () => {
        const bytes = fs.readFileSync(echoWasm);
        const model = await parse(new Uint8Array(bytes));
        const wat1 = printWAT(model);
        const wat2 = printWAT(model);
        expect(wat1).toBe(wat2);
    });

    test('printing includes type annotations as comments', async () => {
        const bytes = fs.readFileSync(echoWasm);
        const model = await parse(new Uint8Array(bytes));
        const wat = printWAT(model);
        // Type annotations are included as comments for cross-referencing
        const hasIndex = /\(;\d+;\)/.test(wat);
        expect(hasIndex).toBe(true);
    });

    test('prints nested composition component (forwarder-implementer)', async () => {
        const bytes = tryReadWasm(forwarderImplWasm);
        if (!bytes) return; // skip if not built
        const model = await parse(bytes);
        const wat = printWAT(model);
        expect(wat).toContain('(component');
        // Compositions have nested components, instances, and component instantiations
        expect(wat).toContain('(instance');
        // Should have component-level imports
        expect(wat.match(/\(component/g)!.length).toBeGreaterThanOrEqual(2);
    });

    test('prints P3 composition component (forwarder-implementer-p3)', async () => {
        const bytes = tryReadWasm(forwarderImplP3Wasm);
        if (!bytes) return;
        const model = await parse(bytes);
        const wat = printWAT(model);
        expect(wat).toContain('(component');
        expect(wat).toContain('(instance');
    });

    test('prints dispose-async-p3 component with resource types', async () => {
        const bytes = tryReadWasm(disposeAsyncP3Wasm);
        if (!bytes) return;
        const model = await parse(bytes);
        const wat = printWAT(model);
        expect(wat).toContain('(component');
        // Resources produce canon entries
        expect(wat).toContain('canon');
    });

    test('prints Rust consumer-p2 component with variant, option, result types', async () => {
        const bytes = tryReadWasm(consumerP2Wasm);
        if (!bytes) return;
        const model = await parse(bytes);
        const wat = printWAT(model);
        expect(wat).toContain('(component');
        expect(wat).toContain('(type');
        // Rust components use result, option, list, enum, variant, flags types
        expect(wat).toContain('(result');
        expect(wat).toContain('(option');
        expect(wat).toContain('(list');
        expect(wat).toContain('(enum');
    });

    test('prints Rust consumer-p3 component', async () => {
        const bytes = tryReadWasm(consumerP3Wasm);
        if (!bytes) return;
        const model = await parse(bytes);
        const wat = printWAT(model);
        expect(wat).toContain('(component');
    });

    test('prints implementer-p2 component with resource dtor', async () => {
        const bytes = tryReadWasm(implementerP2Wasm);
        if (!bytes) return;
        const model = await parse(bytes);
        const wat = printWAT(model);
        expect(wat).toContain('(component');
        expect(wat).toContain('resource');
    });

    test('prints implementer-p3 component', async () => {
        const bytes = tryReadWasm(implementerP3Wasm);
        if (!bytes) return;
        const model = await parse(bytes);
        const wat = printWAT(model);
        expect(wat).toContain('(component');
    });

    test('prints hello-p2-world Rust component with canon lift/lower', async () => {
        const bytes = tryReadWasm(helloP2WorldWasm);
        if (!bytes) return;
        const model = await parse(bytes);
        const wat = printWAT(model);
        expect(wat).toContain('(component');
        // Rust components use canon lift and canon lower
        expect(wat).toContain('canon lift');
        expect(wat).toContain('canon lower');
    });

    test('rejects file-io P1 core module', async () => {
        const bytes = tryReadWasm(fileIoP1Wasm);
        if (!bytes) return;
        await expect(parse(bytes)).rejects.toThrow('core module');
    });

    test('prints WAT containing type definitions: flags, tuple, variant, own, borrow', async () => {
        // consumer-p2 uses the rich jsco-test WIT that has all type kinds
        const bytes = tryReadWasm(consumerP2Wasm);
        if (!bytes) return;
        const model = await parse(bytes);
        const wat = printWAT(model);
        expect(wat).toContain('(flags');
        expect(wat).toContain('(variant');
        expect(wat).toContain('(tuple');
        expect(wat).toContain('own');
        expect(wat).toContain('borrow');
    });

    test('prints WAT with instance type declarations', async () => {
        const bytes = tryReadWasm(helloP2WorldWasm);
        if (!bytes) return;
        const model = await parse(bytes);
        const wat = printWAT(model);
        // Instance types have inner type/export declarations
        expect(wat).toContain('(instance');
    });

    test('prints canon options (memory, realloc, string-encoding)', async () => {
        const bytes = tryReadWasm(helloP2WorldWasm);
        if (!bytes) return;
        const model = await parse(bytes);
        const wat = printWAT(model);
        expect(wat).toContain('(memory');
        expect(wat).toContain('(realloc');
        expect(wat).toContain('string-encoding=utf8');
    });

    test('prints core instance from exports', async () => {
        const bytes = fs.readFileSync(echoWasm);
        const model = await parse(new Uint8Array(bytes));
        const wat = printWAT(model);
        // Core instances from exports have individual export lines
        expect(wat).toContain('(core instance');
    });
});

// ─── Synthetic model tests for full branch coverage ───

function section(tag: number, props: Record<string, unknown> = {}): any {
    return { tag, index: 0, ...props };
}

describe('printWAT synthetic models', () => {
    test('CustomSection renders @custom directive', () => {
        const model: WITModel = [
            section(ModelTag.CustomSection, { name: 'my-section', data: new Uint8Array(42) }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('@custom "my-section"');
        expect(wat).toContain('42 bytes');
    });

    test('SkippedSection renders comment', () => {
        const model: WITModel = [
            section(ModelTag.SkippedSection, { type: 99, data: new Uint8Array(10) }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('skipped section type=99');
        expect(wat).toContain('10 bytes');
    });

    test('ComponentStartFunction renders start directive', () => {
        const model: WITModel = [
            section(ModelTag.ComponentStartFunction, { func_index: 5, arguments: [1, 2], results: 3 }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(start 5');
        expect(wat).toContain('(args 1 2)');
        expect(wat).toContain('(result 3)');
    });

    test('ComponentStartFunction with no arguments', () => {
        const model: WITModel = [
            section(ModelTag.ComponentStartFunction, { func_index: 0, arguments: [], results: 1 }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(start 0');
        expect(wat).not.toContain('(args');
    });

    test('ComponentImport with interface name', () => {
        const model: WITModel = [
            section(ModelTag.ComponentImport, {
                name: { tag: ModelTag.ComponentExternNameInterface, name: 'wasi:io/streams' },
                ty: { tag: ModelTag.ComponentTypeRefInstance, value: 0 },
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(import (interface "wasi:io/streams")');
        expect(wat).toContain(';; instance');
    });

    test('ComponentImport with kebab name and func type ref', () => {
        const model: WITModel = [
            section(ModelTag.ComponentImport, {
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'my-func' },
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 },
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(import "my-func"');
        expect(wat).toContain(';; func');
    });

    test('ComponentExport with type ascription', () => {
        const model: WITModel = [
            section(ModelTag.ComponentExport, {
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'run' },
                kind: ComponentExternalKind.Func,
                index: 0,
                ty: { tag: ModelTag.ComponentTypeRefFunc, value: 3 },
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(export "run" (func');
        expect(wat).toContain('(type');
    });

    test('ComponentExport kinds: Module, Value, Type, Instance, Component', () => {
        const kinds = [
            { kind: ComponentExternalKind.Module, expected: 'core module' },
            { kind: ComponentExternalKind.Value, expected: 'value' },
            { kind: ComponentExternalKind.Type, expected: 'type' },
            { kind: ComponentExternalKind.Instance, expected: 'instance' },
            { kind: ComponentExternalKind.Component, expected: 'component' },
        ];
        for (const { kind, expected } of kinds) {
            const model: WITModel = [
                section(ModelTag.ComponentExport, {
                    name: { tag: ModelTag.ComponentExternNameKebab, name: 'x' },
                    kind,
                    index: 0,
                }),
            ];
            const wat = printWAT(model);
            expect(wat).toContain(`(${expected}`);
        }
    });

    test('ComponentAliasOuter with all alias kinds', () => {
        const outerKinds = [
            { kind: ComponentOuterAliasKind.CoreModule, expected: 'core module' },
            { kind: ComponentOuterAliasKind.CoreType, expected: 'core type' },
            { kind: ComponentOuterAliasKind.Type, expected: 'type' },
            { kind: ComponentOuterAliasKind.Component, expected: 'component' },
        ];
        for (const { kind, expected } of outerKinds) {
            const model: WITModel = [
                section(ModelTag.ComponentAliasOuter, { kind, count: 1, index: 2 }),
            ];
            const wat = printWAT(model);
            expect(wat).toContain(`(alias outer 1 2 (${expected})`);
        }
    });

    test('CanonicalFunctionResourceNew/Drop/Rep', () => {
        const model: WITModel = [
            section(ModelTag.CanonicalFunctionResourceNew, { resource: 5 }),
            section(ModelTag.CanonicalFunctionResourceDrop, { resource: 5 }),
            section(ModelTag.CanonicalFunctionResourceRep, { resource: 5 }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('canon resource.new 5');
        expect(wat).toContain('canon resource.drop 5');
        expect(wat).toContain('canon resource.rep 5');
    });

    test('ComponentInstanceInstantiate with args', () => {
        const model: WITModel = [
            section(ModelTag.ComponentInstanceInstantiate, {
                component_index: 0,
                args: [{ name: 'host', kind: ComponentExternalKind.Instance, index: 1 }],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(instance');
        expect(wat).toContain('(instantiate 0');
        expect(wat).toContain('(with "host" (instance 1)');
    });

    test('ComponentInstanceFromExports', () => {
        const model: WITModel = [
            section(ModelTag.ComponentInstanceFromExports, {
                exports: [
                    { name: { tag: ModelTag.ComponentExternNameKebab, name: 'run' }, kind: ComponentExternalKind.Func, index: 0 },
                ],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(instance');
        expect(wat).toContain('(export "run" (func 0)');
    });

    test('CoreInstanceFromExports with various kinds', () => {
        const model: WITModel = [
            section(ModelTag.CoreInstanceFromExports, {
                exports: [
                    { name: 'fn', kind: ExternalKind.Func, index: 0 },
                    { name: 'tbl', kind: ExternalKind.Table, index: 0 },
                    { name: 'mem', kind: ExternalKind.Memory, index: 0 },
                    { name: 'glb', kind: ExternalKind.Global, index: 0 },
                    { name: 'tag', kind: ExternalKind.Tag, index: 0 },
                ],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(export "fn" (func');
        expect(wat).toContain('(export "tbl" (table');
        expect(wat).toContain('(export "mem" (memory');
        expect(wat).toContain('(export "glb" (global');
        expect(wat).toContain('(export "tag" (tag');
    });

    test('ComponentAliasCoreInstanceExport with all core kinds', () => {
        for (const kind of [ExternalKind.Func, ExternalKind.Table, ExternalKind.Memory, ExternalKind.Global]) {
            const model: WITModel = [
                section(ModelTag.ComponentAliasCoreInstanceExport, { kind, instance_index: 0, name: 'x' }),
            ];
            const wat = printWAT(model);
            expect(wat).toContain('(core alias export');
        }
    });

    test('ComponentAliasInstanceExport with all component kinds', () => {
        for (const kind of [ComponentExternalKind.Func, ComponentExternalKind.Type, ComponentExternalKind.Instance]) {
            const model: WITModel = [
                section(ModelTag.ComponentAliasInstanceExport, { kind, instance_index: 0, name: 'x' }),
            ];
            const wat = printWAT(model);
            expect(wat).toContain('(alias export');
        }
    });

    // ─── Type definitions ───

    test('ComponentTypeFunc with named results', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeFunc, {
                params: [{ name: 'a', type: { tag: ModelTag.ComponentValTypePrimitive, value: 6 } }],
                results: {
                    tag: ModelTag.ComponentFuncResultNamed,
                    values: [
                        { name: 'r1', type: { tag: ModelTag.ComponentValTypePrimitive, value: 6 } },
                        { name: 'r2', type: { tag: ModelTag.ComponentValTypeType, value: 3 } },
                    ],
                },
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(func');
        expect(wat).toContain('(param "a"');
        expect(wat).toContain('(result "r1"');
        expect(wat).toContain('(result "r2"');
    });

    test('ComponentTypeInstance with declarations', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeInstance, {
                declarations: [
                    { tag: ModelTag.InstanceTypeDeclarationCoreType, value: { tag: ModelTag.CoreTypeFunc, params_results: [0x7F, 0x7F], len_params: 1 } },
                    { tag: ModelTag.InstanceTypeDeclarationAlias },
                    { tag: ModelTag.InstanceTypeDeclarationExport, name: { tag: ModelTag.ComponentExternNameKebab, name: 'foo' }, ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 } },
                ],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(instance');
        expect(wat).toContain('(core type');
        expect(wat).toContain('(alias');
        expect(wat).toContain('(export "foo"');
    });

    test('ComponentTypeInstance with empty declarations', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeInstance, { declarations: [] }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(instance)');
    });

    test('ComponentTypeComponent with import/export declarations', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeComponent, {
                declarations: [
                    { tag: ModelTag.ComponentTypeDeclarationCoreType, value: { tag: ModelTag.CoreTypeFunc, params_results: [0x7F], len_params: 0 } },
                    { tag: ModelTag.ComponentTypeDeclarationAlias },
                    { tag: ModelTag.ComponentTypeDeclarationExport, name: { tag: ModelTag.ComponentExternNameKebab, name: 'bar' }, ty: { tag: ModelTag.ComponentTypeRefFunc, value: 0 } },
                    { tag: ModelTag.ComponentTypeDeclarationImport, name: { tag: ModelTag.ComponentExternNameKebab, name: 'baz' }, ty: { tag: ModelTag.ComponentTypeRefFunc, value: 1 } },
                ],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(component');
        expect(wat).toContain('(core type');
        expect(wat).toContain('(alias');
        expect(wat).toContain('(export "bar"');
        expect(wat).toContain('(import "baz"');
    });

    test('ComponentTypeComponent with empty declarations', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeComponent, { declarations: [] }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(component)');
    });

    test('ComponentTypeResource with and without dtor', () => {
        const model1: WITModel = [
            section(ModelTag.ComponentTypeResource, { dtor: 3 }),
        ];
        const model2: WITModel = [
            section(ModelTag.ComponentTypeResource, { dtor: undefined }),
        ];
        expect(printWAT(model1)).toContain('(dtor (func 3))');
        expect(printWAT(model2)).not.toContain('dtor');
    });

    test('ComponentTypeDefinedPrimitive', () => {
        // PrimitiveValType 6 = string
        const model: WITModel = [
            section(ModelTag.ComponentTypeDefinedPrimitive, { value: 6 }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(type');
    });

    test('ComponentTypeDefinedRecord', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeDefinedRecord, {
                members: [
                    { name: 'x', type: { tag: ModelTag.ComponentValTypePrimitive, value: 1 } },
                    { name: 'y', type: { tag: ModelTag.ComponentValTypePrimitive, value: 1 } },
                ],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(record');
        expect(wat).toContain('(field "x"');
        expect(wat).toContain('(field "y"');
    });

    test('ComponentTypeDefinedVariant with refines', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeDefinedVariant, {
                variants: [
                    { name: 'ok', ty: { tag: ModelTag.ComponentValTypePrimitive, value: 6 }, refines: 0 },
                    { name: 'err', ty: null },
                ],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(variant');
        expect(wat).toContain('(case "ok"');
        expect(wat).toContain('(refines 0)');
        expect(wat).toContain('(case "err"');
    });

    test('ComponentTypeDefinedList', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeDefinedList, {
                value: { tag: ModelTag.ComponentValTypePrimitive, value: 1 },
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(list');
    });

    test('ComponentTypeDefinedTuple', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeDefinedTuple, {
                members: [
                    { tag: ModelTag.ComponentValTypePrimitive, value: 1 },
                    { tag: ModelTag.ComponentValTypePrimitive, value: 2 },
                ],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(tuple');
    });

    test('ComponentTypeDefinedFlags', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeDefinedFlags, {
                members: ['readable', 'writable'],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(flags "readable" "writable"');
    });

    test('ComponentTypeDefinedEnum', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeDefinedEnum, {
                members: ['red', 'green', 'blue'],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(enum "red" "green" "blue"');
    });

    test('ComponentTypeDefinedOption', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeDefinedOption, {
                value: { tag: ModelTag.ComponentValTypePrimitive, value: 6 },
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(option');
    });

    test('ComponentTypeDefinedResult with ok, err, and empty', () => {
        const model1: WITModel = [
            section(ModelTag.ComponentTypeDefinedResult, {
                ok: { tag: ModelTag.ComponentValTypePrimitive, value: 1 },
                err: { tag: ModelTag.ComponentValTypePrimitive, value: 6 },
            }),
        ];
        const model2: WITModel = [
            section(ModelTag.ComponentTypeDefinedResult, {
                ok: null,
                err: null,
            }),
        ];
        expect(printWAT(model1)).toContain('(result (ok');
        expect(printWAT(model1)).toContain('(error');
        expect(printWAT(model2)).toContain('(result)');
    });

    test('ComponentTypeDefinedOwn and Borrow', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeDefinedOwn, { value: 3 }),
            section(ModelTag.ComponentTypeDefinedBorrow, { value: 3 }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(own 3)');
        expect(wat).toContain('(borrow 3)');
    });

    test('ComponentTypeDefinedStream and Future', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeDefinedStream, { value: { tag: ModelTag.ComponentValTypePrimitive, value: 1 } }),
            section(ModelTag.ComponentTypeDefinedStream, { value: null }),
            section(ModelTag.ComponentTypeDefinedFuture, { value: { tag: ModelTag.ComponentValTypePrimitive, value: 6 } }),
            section(ModelTag.ComponentTypeDefinedFuture, { value: null }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(stream');
        expect(wat).toContain('(stream)');
        expect(wat).toContain('(future');
        expect(wat).toContain('(future)');
    });

    test('ComponentTypeDefinedErrorContext', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeDefinedErrorContext),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('error-context');
    });

    test('ComponentValType variants: primitive, type ref, resolved', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeFunc, {
                params: [
                    { name: 'a', type: { tag: ModelTag.ComponentValTypePrimitive, value: 1 } },
                    { name: 'b', type: { tag: ModelTag.ComponentValTypeType, value: 5 } },
                    { name: 'c', type: { tag: ModelTag.ComponentValTypeResolved } },
                ],
                results: { tag: ModelTag.ComponentFuncResultUnnamed, type: { tag: ModelTag.ComponentValTypePrimitive, value: 1 } },
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(param "b" 5');
        expect(wat).toContain('(resolved)');
    });

    // ─── TypeRef variants ───

    test('ComponentTypeRef variants: module, value, type with bounds', () => {
        const model: WITModel = [
            section(ModelTag.ComponentImport, {
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'a' },
                ty: { tag: ModelTag.ComponentTypeRefModule, value: 0 },
            }),
            section(ModelTag.ComponentImport, {
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'b' },
                ty: { tag: ModelTag.ComponentTypeRefValue, value: { tag: ModelTag.ComponentValTypePrimitive, value: 1 } },
            }),
            section(ModelTag.ComponentImport, {
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'c' },
                ty: { tag: ModelTag.ComponentTypeRefType, value: { tag: ModelTag.TypeBoundsEq, value: 3 } },
            }),
            section(ModelTag.ComponentImport, {
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'd' },
                ty: { tag: ModelTag.ComponentTypeRefType, value: { tag: ModelTag.TypeBoundsSubResource } },
            }),
            section(ModelTag.ComponentImport, {
                name: { tag: ModelTag.ComponentExternNameKebab, name: 'e' },
                ty: { tag: ModelTag.ComponentTypeRefComponent, value: 0 },
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain(';; module');
        expect(wat).toContain('(value');
        expect(wat).toContain('(eq 3)');
        expect(wat).toContain('(sub resource)');
        expect(wat).toContain(';; component');
    });

    // ─── CoreType branches ───

    test('CoreTypeModule with declarations', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeInstance, {
                declarations: [
                    {
                        tag: ModelTag.InstanceTypeDeclarationCoreType,
                        value: {
                            tag: ModelTag.CoreTypeModule,
                            declarations: [
                                { tag: ModelTag.ModuleTypeDeclarationType },
                                { tag: ModelTag.ModuleTypeDeclarationExport, name: 'mem', ty: { tag: ModelTag.TypeRefMemory } },
                                { tag: ModelTag.ModuleTypeDeclarationImport, module: 'env', name: 'fn', ty: { tag: ModelTag.TypeRefFunc, value: 0 } },
                                { tag: ModelTag.ModuleTypeDeclarationOuterAlias, count: 1, index: 0 },
                            ],
                        },
                    },
                ],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(module');
        expect(wat).toContain('(export "mem"');
        expect(wat).toContain('(import "env" "fn"');
        expect(wat).toContain('(alias outer');
    });

    test('CoreTypeRef variants: table, global, tag', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeInstance, {
                declarations: [
                    {
                        tag: ModelTag.InstanceTypeDeclarationCoreType,
                        value: {
                            tag: ModelTag.CoreTypeModule,
                            declarations: [
                                { tag: ModelTag.ModuleTypeDeclarationExport, name: 't', ty: { tag: ModelTag.TypeRefTable } },
                                { tag: ModelTag.ModuleTypeDeclarationExport, name: 'g', ty: { tag: ModelTag.TypeRefGlobal } },
                                { tag: ModelTag.ModuleTypeDeclarationExport, name: 'tg', ty: { tag: ModelTag.TypeRefTag, value: 0 } },
                            ],
                        },
                    },
                ],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(table');
        expect(wat).toContain('(global');
        expect(wat).toContain('(tag');
    });

    // ─── Canon options ───

    test('CanonicalFunctionLift with all canon options', () => {
        const model: WITModel = [
            section(ModelTag.CanonicalFunctionLift, {
                core_func_index: 0,
                type_index: 0,
                options: [
                    { tag: ModelTag.CanonicalOptionUTF8 },
                    { tag: ModelTag.CanonicalOptionUTF16 },
                    { tag: ModelTag.CanonicalOptionCompactUTF16 },
                    { tag: ModelTag.CanonicalOptionMemory, value: 0 },
                    { tag: ModelTag.CanonicalOptionRealloc, value: 1 },
                    { tag: ModelTag.CanonicalOptionPostReturn, value: 2 },
                ],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('string-encoding=utf8');
        expect(wat).toContain('string-encoding=utf16');
        expect(wat).toContain('string-encoding=compact-utf16');
        expect(wat).toContain('(memory 0)');
        expect(wat).toContain('(realloc 1)');
        expect(wat).toContain('(post-return 2)');
    });

    test('CanonicalFunctionLower with options', () => {
        const model: WITModel = [
            section(ModelTag.CanonicalFunctionLower, {
                func_index: 3,
                options: [
                    { tag: ModelTag.CanonicalOptionUTF8 },
                    { tag: ModelTag.CanonicalOptionMemory, value: 0 },
                ],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('canon lower (func 3)');
        expect(wat).toContain('string-encoding=utf8');
    });

    // ─── Nested component section ───

    test('ComponentSection nests sections with independent counters', () => {
        const model: WITModel = [
            {
                tag: ModelTag.ComponentSection,
                index: 0,
                sections: [
                    section(ModelTag.CoreModule, { data: new Uint8Array(100) }),
                    section(ModelTag.CustomSection, { name: 'inner' }),
                ],
            } as any,
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(component (;0;)');
        expect(wat).toContain('(core module (;0;)');
        expect(wat).toContain('@custom "inner"');
    });

    // ─── CoreValType branches ───

    test('CoreTypeFunc with various core val types', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeInstance, {
                declarations: [
                    {
                        tag: ModelTag.InstanceTypeDeclarationCoreType,
                        value: {
                            tag: ModelTag.CoreTypeFunc,
                            params_results: [
                                // numeric values
                                0x7F, // i32
                                0x7E, // i64
                                0x7D, // f32
                                0x7C, // f64
                                0x42, // unknown numeric
                                // object values
                                { tag: ModelTag.ValTypeI32 },
                                { tag: ModelTag.ValTypeI64 },
                                { tag: ModelTag.ValTypeF32 },
                                { tag: ModelTag.ValTypeF64 },
                                { tag: ModelTag.ValTypeV128 },
                                { tag: ModelTag.ValTypeRef },
                            ],
                            len_params: 5,
                        },
                    },
                ],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('i32');
        expect(wat).toContain('i64');
        expect(wat).toContain('f32');
        expect(wat).toContain('f64');
        expect(wat).toContain('0x42');
        expect(wat).toContain('v128');
        expect(wat).toContain('ref');
    });

    test('CoreModule with and without data', () => {
        const model1: WITModel = [section(ModelTag.CoreModule, { data: new Uint8Array(50) })];
        const model2: WITModel = [section(ModelTag.CoreModule, { data: undefined })];
        expect(printWAT(model1)).toContain('50 bytes');
        expect(printWAT(model2)).toContain('(core module');
        expect(printWAT(model2)).not.toContain('bytes');
    });

    test('CustomSection without data', () => {
        const model: WITModel = [section(ModelTag.CustomSection, { name: 'bare' })];
        const wat = printWAT(model);
        expect(wat).toContain('@custom "bare"');
        expect(wat).not.toContain('bytes');
    });

    test('SkippedSection without data', () => {
        const model: WITModel = [section(ModelTag.SkippedSection, { type: 42 })];
        const wat = printWAT(model);
        expect(wat).toContain('skipped section type=42');
        expect(wat).not.toContain('bytes');
    });

    test('InstanceTypeDeclarationType registers nested type', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeInstance, {
                declarations: [
                    {
                        tag: ModelTag.InstanceTypeDeclarationType,
                        value: section(ModelTag.ComponentTypeDefinedEnum, { members: ['a', 'b'] }),
                    },
                ],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(type');
        expect(wat).toContain('(enum');
    });

    test('ComponentTypeDeclarationType registers nested type', () => {
        const model: WITModel = [
            section(ModelTag.ComponentTypeComponent, {
                declarations: [
                    {
                        tag: ModelTag.ComponentTypeDeclarationType,
                        value: section(ModelTag.ComponentTypeDefinedFlags, { members: ['x'] }),
                    },
                ],
            }),
        ];
        const wat = printWAT(model);
        expect(wat).toContain('(flags');
    });
});
