// Copyright (c) 2023 Pavel Savara. Licensed under the MIT License.

import { ModelTag, WITSection } from '../model/tags';
import type { WITModel } from '../parser';
import type { ComponentSection } from '../parser/types';
import type {
    ComponentValType, ComponentType, ComponentTypeFunc, ComponentTypeInstance,
    ComponentTypeComponent, ComponentTypeResource, ComponentTypeDefined,
    ComponentTypeDefinedRecord, ComponentTypeDefinedVariant, ComponentTypeDefinedList,
    ComponentTypeDefinedTuple, ComponentTypeDefinedFlags, ComponentTypeDefinedEnum,
    ComponentTypeDefinedOption, ComponentTypeDefinedResult, ComponentTypeDefinedOwn,
    ComponentTypeDefinedBorrow, ComponentTypeDefinedPrimitive, ComponentFuncResult,
    NamedValue, InstanceTypeDeclaration, ComponentTypeDeclaration,
    CoreType, CoreTypeFunc, CoreTypeModule, ModuleTypeDeclaration,
} from '../model/types';
import type { ComponentImport, ComponentExternName, ComponentTypeRef, TypeBounds } from '../model/imports';
import type { ComponentExport } from '../model/exports';
import { ComponentExternalKind } from '../model/exports';
import type {
    ComponentAliasInstanceExport, ComponentAliasCoreInstanceExport, ComponentAliasOuter,
} from '../model/aliases';
import { ComponentOuterAliasKind } from '../model/aliases';
import type {
    CanonicalFunctionLift, CanonicalFunctionLower,
    CanonicalFunctionResourceNew, CanonicalFunctionResourceDrop, CanonicalFunctionResourceRep,
    CanonicalOption,
} from '../model/canonicals';
import type {
    CoreInstanceInstantiate, CoreInstanceFromExports,
    ComponentInstanceInstantiate, ComponentInstanceFromExports,
    InstantiationArg, ComponentInstantiationArg,
} from '../model/instances';
import type { ComponentStartFunction } from '../model/start';
import type { Export } from '../model/core';
import { ExternalKind } from '../model/core';
import { primitiveValTypeName } from './debug-names';

/// Index counters for WAT comments like (;N;)
type WatCounters = {
    coreModule: number;
    coreInstance: number;
    coreFunc: number;
    coreMemory: number;
    coreTable: number;
    coreGlobal: number;
    type: number;
    func: number;
    instance: number;
    component: number;
}

function newCounters(): WatCounters {
    return {
        coreModule: 0, coreInstance: 0, coreFunc: 0,
        coreMemory: 0, coreTable: 0, coreGlobal: 0,
        type: 0, func: 0, instance: 0, component: 0,
    };
}

export function printWAT(model: WITModel): string {
    const lines: string[] = [];
    const counters = newCounters();
    lines.push('(component');
    for (const section of model) {
        printSection(lines, section, counters, 1);
    }
    lines.push(')');
    return lines.join('\n');
}

function indent(depth: number): string {
    return '  '.repeat(depth);
}

function printSection(lines: string[], section: WITSection, c: WatCounters, depth: number): void {
    const ind = indent(depth);
    switch (section.tag) {
        case ModelTag.CoreModule: {
            const idx = c.coreModule++;
            const data = (section as any).data as Uint8Array | undefined;
            const sizeNote = data ? ` ;; ${data.byteLength} bytes` : '';
            lines.push(`${ind}(core module (;${idx};)${sizeNote} ...)`);
            break;
        }
        case ModelTag.ComponentSection: {
            const cs = section as ComponentSection;
            const idx = c.component++;
            lines.push(`${ind}(component (;${idx};)`);
            const nestedCounters = newCounters();
            for (const sub of cs.sections) {
                printSection(lines, sub, nestedCounters, depth + 1);
            }
            lines.push(`${ind})`);
            break;
        }
        case ModelTag.ComponentImport: {
            const imp = section as ComponentImport;
            lines.push(`${ind}(import ${printExternName(imp.name)} ${printTypeRef(imp.ty, c)})`);
            break;
        }
        case ModelTag.ComponentExport: {
            const exp = section as ComponentExport;
            const kindStr = printExternalKind(exp.kind);
            const tyStr = exp.ty ? ` (type ${printTypeRef(exp.ty, c)})` : '';
            lines.push(`${ind}(export ${printExternName(exp.name)} (${kindStr} (;${exp.index};))${tyStr})`);
            break;
        }
        case ModelTag.ComponentAliasInstanceExport: {
            const alias = section as ComponentAliasInstanceExport;
            const kindStr = printExternalKind(alias.kind);
            const idx = kindCounter(c, alias.kind);
            lines.push(`${ind}(alias export ${alias.instance_index} "${alias.name}" (${kindStr} (;${idx};)))`);
            break;
        }
        case ModelTag.ComponentAliasCoreInstanceExport: {
            const alias = section as ComponentAliasCoreInstanceExport;
            const kindStr = printCoreExternalKind(alias.kind);
            const idx = coreKindCounter(c, alias.kind);
            lines.push(`${ind}(core alias export ${alias.instance_index} "${alias.name}" (${kindStr} (;${idx};)))`);
            break;
        }
        case ModelTag.ComponentAliasOuter: {
            const alias = section as ComponentAliasOuter;
            const kindStr = printOuterAliasKind(alias.kind);
            lines.push(`${ind}(alias outer ${alias.count} ${alias.index} (${kindStr}))`);
            break;
        }
        case ModelTag.CanonicalFunctionLift: {
            const lift = section as CanonicalFunctionLift;
            const idx = c.func++;
            const opts = printCanonOpts(lift.options);
            lines.push(`${ind}(func (;${idx};) (canon lift (core func ${lift.core_func_index}) (type ${lift.type_index})${opts}))`);
            break;
        }
        case ModelTag.CanonicalFunctionLower: {
            const lower = section as CanonicalFunctionLower;
            const idx = c.coreFunc++;
            const opts = printCanonOpts(lower.options);
            lines.push(`${ind}(core func (;${idx};) (canon lower (func ${lower.func_index})${opts}))`);
            break;
        }
        case ModelTag.CanonicalFunctionResourceNew: {
            const rn = section as CanonicalFunctionResourceNew;
            const idx = c.coreFunc++;
            lines.push(`${ind}(core func (;${idx};) (canon resource.new ${rn.resource}))`);
            break;
        }
        case ModelTag.CanonicalFunctionResourceDrop: {
            const rd = section as CanonicalFunctionResourceDrop;
            const idx = c.coreFunc++;
            lines.push(`${ind}(core func (;${idx};) (canon resource.drop ${rd.resource}))`);
            break;
        }
        case ModelTag.CanonicalFunctionResourceRep: {
            const rr = section as CanonicalFunctionResourceRep;
            const idx = c.coreFunc++;
            lines.push(`${ind}(core func (;${idx};) (canon resource.rep ${rr.resource}))`);
            break;
        }
        case ModelTag.CoreInstanceInstantiate: {
            const ci = section as CoreInstanceInstantiate;
            const idx = c.coreInstance++;
            const argsStr = ci.args.map((a: InstantiationArg) =>
                `\n${indent(depth + 1)}(with "${a.name}" (instance ${a.index}))`
            ).join('');
            lines.push(`${ind}(core instance (;${idx};) (instantiate ${ci.module_index}${argsStr}))`);
            break;
        }
        case ModelTag.CoreInstanceFromExports: {
            const ci = section as CoreInstanceFromExports;
            const idx = c.coreInstance++;
            const exps = ci.exports.map((e: Export) =>
                `\n${indent(depth + 1)}(export "${e.name}" (${printCoreExternalKind(e.kind)} ${e.index}))`
            ).join('');
            lines.push(`${ind}(core instance (;${idx};)${exps})`);
            break;
        }
        case ModelTag.ComponentInstanceInstantiate: {
            const ci = section as ComponentInstanceInstantiate;
            const idx = c.instance++;
            const argsStr = ci.args.map((a: ComponentInstantiationArg) =>
                `\n${indent(depth + 1)}(with "${a.name}" (${printExternalKind(a.kind)} ${a.index}))`
            ).join('');
            lines.push(`${ind}(instance (;${idx};) (instantiate ${ci.component_index}${argsStr}))`);
            break;
        }
        case ModelTag.ComponentInstanceFromExports: {
            const ci = section as ComponentInstanceFromExports;
            const idx = c.instance++;
            const exps = ci.exports.map((e: ComponentExport) =>
                `\n${indent(depth + 1)}(export ${printExternName(e.name)} (${printExternalKind(e.kind)} ${e.index}))`
            ).join('');
            lines.push(`${ind}(instance (;${idx};)${exps})`);
            break;
        }
        case ModelTag.ComponentStartFunction: {
            const sf = section as ComponentStartFunction;
            const argsStr = sf.arguments.length > 0 ? ` (args ${sf.arguments.join(' ')})` : '';
            lines.push(`${ind}(start ${sf.func_index}${argsStr} (result ${sf.results}))`);
            break;
        }
        // Type definitions (section ID 7)
        case ModelTag.ComponentTypeFunc:
        case ModelTag.ComponentTypeInstance:
        case ModelTag.ComponentTypeComponent:
        case ModelTag.ComponentTypeResource:
        case ModelTag.ComponentTypeDefinedPrimitive:
        case ModelTag.ComponentTypeDefinedRecord:
        case ModelTag.ComponentTypeDefinedVariant:
        case ModelTag.ComponentTypeDefinedList:
        case ModelTag.ComponentTypeDefinedTuple:
        case ModelTag.ComponentTypeDefinedFlags:
        case ModelTag.ComponentTypeDefinedEnum:
        case ModelTag.ComponentTypeDefinedOption:
        case ModelTag.ComponentTypeDefinedResult:
        case ModelTag.ComponentTypeDefinedOwn:
        case ModelTag.ComponentTypeDefinedBorrow: {
            const idx = c.type++;
            const typeStr = printComponentType(section as ComponentType, c, depth);
            lines.push(`${ind}(type (;${idx};) ${typeStr})`);
            break;
        }
        case ModelTag.CustomSection: {
            const cs = section as { name: string; data?: Uint8Array };
            const sizeNote = cs.data ? ` ;; ${cs.data.byteLength} bytes` : '';
            lines.push(`${ind}(@custom "${cs.name}"${sizeNote})`);
            break;
        }
        case ModelTag.SkippedSection: {
            const ss = section as { type: number; data?: Uint8Array };
            const sizeNote = ss.data ? ` ;; ${ss.data.byteLength} bytes` : '';
            lines.push(`${ind};; skipped section type=${ss.type}${sizeNote}`);
            break;
        }
    }
}

function printComponentType(t: ComponentType, c: WatCounters, depth: number): string {
    switch (t.tag) {
        case ModelTag.ComponentTypeFunc:
            return printFuncType(t as ComponentTypeFunc);
        case ModelTag.ComponentTypeInstance:
            return printInstanceType(t as ComponentTypeInstance, c, depth);
        case ModelTag.ComponentTypeComponent:
            return printComponentTypeComponent(t as ComponentTypeComponent, c, depth);
        case ModelTag.ComponentTypeResource: {
            const res = t as ComponentTypeResource;
            const dtorStr = res.dtor !== undefined ? ` (dtor (func ${res.dtor}))` : '';
            return `(resource (rep i32)${dtorStr})`;
        }
        case ModelTag.ComponentSection: {
            // Nested component section referenced as a type
            return '(component ;; nested)';
        }
        case ModelTag.ComponentAliasInstanceExport: {
            // Type alias — referenced as a type
            const alias = t as ComponentAliasInstanceExport;
            return `(alias export ${alias.instance_index} "${alias.name}")`;
        }
        default:
            return printDefinedType(t as ComponentTypeDefined);
    }
}

function printFuncType(ft: ComponentTypeFunc): string {
    const params = ft.params.map((p: NamedValue) =>
        `(param "${p.name}" ${printValType(p.type)})`
    ).join(' ');
    const results = printFuncResults(ft.results);
    return `(func ${params} ${results})`;
}

function printFuncResults(r: ComponentFuncResult): string {
    switch (r.tag) {
        case ModelTag.ComponentFuncResultUnnamed:
            return `(result ${printValType(r.type)})`;
        case ModelTag.ComponentFuncResultNamed: {
            const vals = r.values.map((v: NamedValue) =>
                `(result "${v.name}" ${printValType(v.type)})`
            ).join(' ');
            return vals;
        }
    }
}

function printInstanceType(it: ComponentTypeInstance, c: WatCounters, depth: number): string {
    if (it.declarations.length === 0) return '(instance)';
    const inner = it.declarations.map(d => printInstanceDecl(d, c, depth + 1)).join('\n');
    return `(instance\n${inner}\n${indent(depth)})`;
}

function printInstanceDecl(d: InstanceTypeDeclaration, c: WatCounters, depth: number): string {
    const ind = indent(depth);
    switch (d.tag) {
        case ModelTag.InstanceTypeDeclarationCoreType:
            return `${ind}(core type ${printCoreType(d.value)})`;
        case ModelTag.InstanceTypeDeclarationType: {
            const idx = c.type++;
            return `${ind}(type (;${idx};) ${printComponentType(d.value, c, depth)})`;
        }
        case ModelTag.InstanceTypeDeclarationAlias:
            return `${ind}(alias ;; instance type alias)`;
        case ModelTag.InstanceTypeDeclarationExport:
            return `${ind}(export ${printExternName(d.name)} ${printTypeRef(d.ty, c)})`;
    }
}

function printComponentTypeComponent(ct: ComponentTypeComponent, c: WatCounters, depth: number): string {
    if (ct.declarations.length === 0) return '(component)';
    const inner = ct.declarations.map(d => printComponentDecl(d, c, depth + 1)).join('\n');
    return `(component\n${inner}\n${indent(depth)})`;
}

function printComponentDecl(d: ComponentTypeDeclaration, c: WatCounters, depth: number): string {
    const ind = indent(depth);
    switch (d.tag) {
        case ModelTag.ComponentTypeDeclarationCoreType:
            return `${ind}(core type ${printCoreType(d.value)})`;
        case ModelTag.ComponentTypeDeclarationType: {
            const idx = c.type++;
            return `${ind}(type (;${idx};) ${printComponentType(d.value, c, depth)})`;
        }
        case ModelTag.ComponentTypeDeclarationAlias:
            return `${ind}(alias ;; component type alias)`;
        case ModelTag.ComponentTypeDeclarationExport:
            return `${ind}(export ${printExternName(d.name)} ${printTypeRef(d.ty, c)})`;
        default: {
            // ComponentTypeDeclarationImport reuses ComponentImport's tag
            const tag = d.tag as number;
            if (tag === ModelTag.ComponentTypeDeclarationImport || tag === ModelTag.ComponentImport) {
                const imp = d as unknown as ComponentImport;
                return `${ind}(import ${printExternName(imp.name)} ${printTypeRef(imp.ty, c)})`;
            }
            return `${ind};; unknown component decl tag=${d.tag}`;
        }
    }
}

function printCoreType(ct: CoreType): string {
    switch (ct.tag) {
        case ModelTag.CoreTypeFunc: {
            const ft = ct as CoreTypeFunc;
            const params = ft.params_results.slice(0, ft.len_params).map((p: any) => printCoreValType(p)).join(' ');
            const results = ft.params_results.slice(ft.len_params).map((r: any) => printCoreValType(r)).join(' ');
            return `(func (param ${params}) (result ${results}))`;
        }
        case ModelTag.CoreTypeModule: {
            const mt = ct as CoreTypeModule;
            const decls = mt.declarations.map(d => printModuleDecl(d)).join(' ');
            return `(module ${decls})`;
        }
        default:
            return `;; unknown core type tag=${(ct as any).tag}`;
    }
}

function printModuleDecl(d: ModuleTypeDeclaration): string {
    switch (d.tag) {
        case ModelTag.ModuleTypeDeclarationType:
            return '(type ...)';
        case ModelTag.ModuleTypeDeclarationExport:
            return `(export "${d.name}" ${printCoreTypeRef(d.ty)})`;
        case ModelTag.ModuleTypeDeclarationOuterAlias:
            return `(alias outer ${d.count} ${d.index})`;
        case ModelTag.ModuleTypeDeclarationImport:
            return `(import "${d.module}" "${d.name}" ${printCoreTypeRef(d.ty)})`;
        default:
            return `;; unknown module decl tag=${(d as any).tag}`;
    }
}

function printDefinedType(t: ComponentTypeDefined): string {
    switch (t.tag) {
        case ModelTag.ComponentTypeDefinedPrimitive:
            return primitiveValTypeName((t as ComponentTypeDefinedPrimitive).value).toLowerCase();
        case ModelTag.ComponentTypeDefinedRecord: {
            const rec = t as ComponentTypeDefinedRecord;
            const fields = rec.members.map(m => `(field "${m.name}" ${printValType(m.type)})`).join(' ');
            return `(record ${fields})`;
        }
        case ModelTag.ComponentTypeDefinedVariant: {
            const v = t as ComponentTypeDefinedVariant;
            const cases = v.variants.map(vc => {
                const tyStr = vc.ty ? ` ${printValType(vc.ty)}` : '';
                const refine = vc.refines !== undefined ? ` (refines ${vc.refines})` : '';
                return `(case "${vc.name}"${tyStr}${refine})`;
            }).join(' ');
            return `(variant ${cases})`;
        }
        case ModelTag.ComponentTypeDefinedList:
            return `(list ${printValType((t as ComponentTypeDefinedList).value)})`;
        case ModelTag.ComponentTypeDefinedTuple: {
            const tup = t as ComponentTypeDefinedTuple;
            const members = tup.members.map(m => printValType(m)).join(' ');
            return `(tuple ${members})`;
        }
        case ModelTag.ComponentTypeDefinedFlags: {
            const flags = t as ComponentTypeDefinedFlags;
            const members = flags.members.map(m => `"${m}"`).join(' ');
            return `(flags ${members})`;
        }
        case ModelTag.ComponentTypeDefinedEnum: {
            const en = t as ComponentTypeDefinedEnum;
            const members = en.members.map(m => `"${m}"`).join(' ');
            return `(enum ${members})`;
        }
        case ModelTag.ComponentTypeDefinedOption:
            return `(option ${printValType((t as ComponentTypeDefinedOption).value)})`;
        case ModelTag.ComponentTypeDefinedResult: {
            const res = t as ComponentTypeDefinedResult;
            const okStr = res.ok ? ` (ok ${printValType(res.ok)})` : '';
            const errStr = res.err ? ` (error ${printValType(res.err)})` : '';
            return `(result${okStr}${errStr})`;
        }
        case ModelTag.ComponentTypeDefinedOwn:
            return `(own ${(t as ComponentTypeDefinedOwn).value})`;
        case ModelTag.ComponentTypeDefinedBorrow:
            return `(borrow ${(t as ComponentTypeDefinedBorrow).value})`;
        default:
            return `;; unknown defined type tag=${(t as any).tag}`;
    }
}

function printValType(v: ComponentValType): string {
    switch (v.tag) {
        case ModelTag.ComponentValTypePrimitive:
            return primitiveValTypeName(v.value).toLowerCase();
        case ModelTag.ComponentValTypeType:
            return `${v.value}`;
        case ModelTag.ComponentValTypeResolved:
            return '(resolved)';
        default:
            return `;; unknown val type tag=${(v as any).tag}`;
    }
}

function printExternName(n: ComponentExternName): string {
    switch (n.tag) {
        case ModelTag.ComponentExternNameKebab:
            return `"${n.name}"`;
        case ModelTag.ComponentExternNameInterface:
            return `(interface "${n.name}")`;
        default:
            return `;; unknown extern name tag=${(n as any).tag}`;
    }
}

function printTypeRef(tr: ComponentTypeRef, _c: WatCounters): string {
    switch (tr.tag) {
        case ModelTag.ComponentTypeRefModule:
            return `(type ${tr.value}) ;; module`;
        case ModelTag.ComponentTypeRefFunc:
            return `(type ${tr.value}) ;; func`;
        case ModelTag.ComponentTypeRefValue:
            return `(value ${printValType(tr.value)})`;
        case ModelTag.ComponentTypeRefType:
            return `(type ${printTypeBounds(tr.value)})`;
        case ModelTag.ComponentTypeRefInstance:
            return `(type ${tr.value}) ;; instance`;
        case ModelTag.ComponentTypeRefComponent:
            return `(type ${tr.value}) ;; component`;
        default:
            return `;; unknown type ref tag=${(tr as any).tag}`;
    }
}

function printTypeBounds(tb: TypeBounds): string {
    switch (tb.tag) {
        case ModelTag.TypeBoundsEq:
            return `(eq ${tb.value})`;
        case ModelTag.TypeBoundsSubResource:
            return '(sub resource)';
        default:
            return `;; unknown type bounds tag=${(tb as any).tag}`;
    }
}

function printExternalKind(kind: ComponentExternalKind): string {
    switch (kind) {
        case ComponentExternalKind.Module: return 'core module';
        case ComponentExternalKind.Func: return 'func';
        case ComponentExternalKind.Value: return 'value';
        case ComponentExternalKind.Type: return 'type';
        case ComponentExternalKind.Instance: return 'instance';
        case ComponentExternalKind.Component: return 'component';
        default: return `unknown-kind-${kind}`;
    }
}

function printCoreExternalKind(kind: ExternalKind): string {
    switch (kind) {
        case ExternalKind.Func: return 'func';
        case ExternalKind.Table: return 'table';
        case ExternalKind.Memory: return 'memory';
        case ExternalKind.Global: return 'global';
        case ExternalKind.Tag: return 'tag';
        default: return `unknown-core-kind-${kind}`;
    }
}

function printOuterAliasKind(kind: ComponentOuterAliasKind): string {
    switch (kind) {
        case ComponentOuterAliasKind.CoreModule: return 'core module';
        case ComponentOuterAliasKind.CoreType: return 'core type';
        case ComponentOuterAliasKind.Type: return 'type';
        case ComponentOuterAliasKind.Component: return 'component';
        default: return `unknown-alias-kind-${kind}`;
    }
}

function printCoreTypeRef(tr: any): string {
    switch (tr.tag) {
        case ModelTag.TypeRefFunc:
            return `(func ${tr.value})`;
        case ModelTag.TypeRefTable:
            return '(table ...)';
        case ModelTag.TypeRefMemory:
            return '(memory ...)';
        case ModelTag.TypeRefGlobal:
            return '(global ...)';
        case ModelTag.TypeRefTag:
            return `(tag ${tr.value})`;
        default:
            return '(unknown)';
    }
}

function printCoreValType(v: any): string {
    if (typeof v === 'number') {
        switch (v) {
            case 0x7F: return 'i32';
            case 0x7E: return 'i64';
            case 0x7D: return 'f32';
            case 0x7C: return 'f64';
            default: return `0x${v.toString(16)}`;
        }
    }
    if (v && typeof v === 'object' && 'tag' in v) {
        switch (v.tag) {
            case ModelTag.ValTypeI32: return 'i32';
            case ModelTag.ValTypeI64: return 'i64';
            case ModelTag.ValTypeF32: return 'f32';
            case ModelTag.ValTypeF64: return 'f64';
            case ModelTag.ValTypeV128: return 'v128';
            case ModelTag.ValTypeRef: return 'ref';
            default: return `valtype(${v.tag})`;
        }
    }
    return String(v);
}

function printCanonOpts(options: CanonicalOption[]): string {
    if (options.length === 0) return '';
    const parts: string[] = [];
    for (const opt of options) {
        switch (opt.tag) {
            case ModelTag.CanonicalOptionUTF8: parts.push('string-encoding=utf8'); break;
            case ModelTag.CanonicalOptionUTF16: parts.push('string-encoding=utf16'); break;
            case ModelTag.CanonicalOptionCompactUTF16: parts.push('string-encoding=compact-utf16'); break;
            case ModelTag.CanonicalOptionMemory: parts.push(`(memory ${opt.value})`); break;
            case ModelTag.CanonicalOptionRealloc: parts.push(`(realloc ${opt.value})`); break;
            case ModelTag.CanonicalOptionPostReturn: parts.push(`(post-return ${opt.value})`); break;
        }
    }
    return ' ' + parts.join(' ');
}

function kindCounter(c: WatCounters, kind: ComponentExternalKind): number {
    switch (kind) {
        case ComponentExternalKind.Module: return c.coreModule++;
        case ComponentExternalKind.Func: return c.func++;
        case ComponentExternalKind.Value: return 0; // value sort not tracked
        case ComponentExternalKind.Type: return c.type++;
        case ComponentExternalKind.Instance: return c.instance++;
        case ComponentExternalKind.Component: return c.component++;
        default: return 0;
    }
}

function coreKindCounter(c: WatCounters, kind: ExternalKind): number {
    switch (kind) {
        case ExternalKind.Func: return c.coreFunc++;
        case ExternalKind.Table: return c.coreTable++;
        case ExternalKind.Memory: return c.coreMemory++;
        case ExternalKind.Global: return c.coreGlobal++;
        case ExternalKind.Tag: return 0;
        default: return 0;
    }
}
