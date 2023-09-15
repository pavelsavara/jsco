import { ComponentExport, ComponentExternalKind } from '../model/exports';
import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { prepareComponentFunction } from './component-functions';
import { prepareComponentInstance } from './component-instance';
import { ResolverContext, NamedImplFactory, ImplFactory } from './types';

export async function prepareComponentExport(rctx: ResolverContext, exportSectionOrIndex: number | ComponentExport): Promise<NamedImplFactory> {
    const section = typeof exportSectionOrIndex === 'number' ? rctx.indexes.componentExports[exportSectionOrIndex] : exportSectionOrIndex;
    jsco_assert(section.tag === ModelTag.ComponentExport, () => `expected ComponentExport, got ${section.tag}`);

    let name: string;
    // TODO what is the difference ?
    switch (section.name.tag) {
        case ModelTag.ComponentExternNameInterface:
            name = section.name.name;
            break;
        case ModelTag.ComponentExternNameKebab:
            name = section.name.name;
            break;
        default:
            throw new Error(`${(section as any).name.tag} not implemented`);
    }

    switch (section.kind) {
        case ComponentExternalKind.Type: {
            const typeSection = rctx.indexes.componentTypes[section.index];
            const factory = async () => {
                return {
                    TODO: typeSection.tag
                };
            };
            return {
                name,
                factory
            };
        }
        case ComponentExternalKind.Func: {
            const factory = await prepareComponentFunction(rctx, section.index);
            return {
                name,
                factory
            };
        }
        case ComponentExternalKind.Instance: {
            const factory = await prepareComponentInstance(rctx, section.index);
            return {
                name: name,
                factory
            };
        }
        case ComponentExternalKind.Component:
        case ComponentExternalKind.Module:
        case ComponentExternalKind.Value:
        default:
            throw new Error(`${section.kind} not implemented`);
    }
}

export async function prepareComponentExports(rctx: ResolverContext, exports: ComponentExport[]): Promise<ImplFactory> {
    const factories: NamedImplFactory[] = [];
    for (const section of exports) {
        const factory = await prepareComponentExport(rctx, section);
        factories.push(factory);
    }

    return async function instantiate(ctx, imports): Promise<any> {
        const exports = {} as any;
        for (const { name, factory } of factories) {
            const ifc = await factory(ctx, imports ?? {});
            exports[name] = {
                ...ifc.exports,
                __imports: ifc.__imports,
                __importNames: ifc.__importNames,
            };
        }
        return exports;
    };
}