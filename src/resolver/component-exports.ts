import { BindingContext } from '../binding/types';
import { ComponentExternalKind } from '../model/exports';
import { ComponentExternName } from '../model/imports';
import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { ResolverContext, JsInterfaceCollection, ImplComponentExport, ImplComponentInstance } from './types';

export function prepareComponentExports(rctx: ResolverContext): ImplComponentExport[] {
    function createComponentExport(componentInstanceFactory: ImplComponentInstance, resolvedName: string, ctx: BindingContext): JsInterfaceCollection {
        const ifc = componentInstanceFactory(ctx);
        const namedInterface: JsInterfaceCollection = {};
        namedInterface[resolvedName] = ifc;
        return namedInterface;
    }

    const factories: ImplComponentExport[] = [];
    for (const section of rctx.componentExports) {
        jsco_assert(section.tag === ModelTag.ComponentExport, () => `expected ComponentExport, got ${section.tag}`);
        let factory: ImplComponentExport;

        const name: ComponentExternName = section.name;
        let resolvedName: string;
        switch (name.tag) {
            case ModelTag.ComponentExternNameInterface:
                resolvedName = name.name;
                break;
            case ModelTag.ComponentExternNameKebab:
            default:
                throw new Error(`${name.tag} not implemented`);
        }

        switch (section.kind) {
            case ComponentExternalKind.Instance: {
                const componentInstanceFactory: ImplComponentInstance = rctx.prepareComponentInstance(section.index);
                factory = (ctx) => createComponentExport(componentInstanceFactory, resolvedName, ctx);
                factories.push(factory);
                break;
            }
            default:
                throw new Error(`${section.kind} not implemented`);
        }
    }
    return factories;
}
