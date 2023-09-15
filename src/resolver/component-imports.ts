import { ComponentImport } from '../model/imports';
import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { prepareComponentSection } from './component-section';
import { ResolverContext, NamedImplFactory, ImplFactory, BindingContext } from './types';

export async function prepareComponentImport(rctx: ResolverContext, importSectionOrIndex: number | ComponentImport): Promise<NamedImplFactory> {
    const section = typeof importSectionOrIndex === 'number' ? rctx.indexes.componentImports[importSectionOrIndex] : importSectionOrIndex;
    jsco_assert(section.tag === ModelTag.ComponentImport, () => `expected ComponentImport, got ${section.tag}`);

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

    switch (section.ty.tag) {
        case ModelTag.ComponentTypeRefComponent: {
            const factory = await prepareComponentSection(rctx, section.ty.value);
            return { name, factory };
        }
        case ModelTag.ComponentTypeRefModule:
        default:
            throw new Error(`${section.ty.tag} not implemented`);
    }
}

export async function prepareComponentImports(rctx: ResolverContext, imports: ComponentImport[]): Promise<ImplFactory> {
    const factories: NamedImplFactory[] = [];
    for (const section of imports) {
        const factory = await prepareComponentImport(rctx, section);
        factories.push(factory);
    }

    return async function instantiate(ctx, args): Promise<any> {
        const imports = {} as any;
        for (const { name, factory } of factories) {
            const ifc = await factory(ctx, args);
            imports[name] = {
                ...ifc.imports,
            };
        }
        return imports;
    };
}