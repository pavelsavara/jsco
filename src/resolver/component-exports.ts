import { BindingContext } from '../binding/types';
import { ComponentExternalKind } from '../model/exports';
import { ComponentExternName } from '../model/imports';
import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { prepareComponentInstance } from './component-instance';
import { ResolverContext, JsInterfaceCollection, ImplComponentExport, ImplComponentInstance, JsInterface } from './types';

export function prepareComponentExports(rctx: ResolverContext): ImplComponentExport[] {
    function createComponentExport(ctx: BindingContext, ifc: JsInterface, resolvedName: string): JsInterfaceCollection {
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
                const componentInstanceFactory = prepareComponentInstance(rctx, section.index);
                factory = (ctx) => {
                    const ifc = componentInstanceFactory(ctx);
                    return createComponentExport(ctx, ifc, resolvedName);
                };
                factories.push(factory);
                break;
            }
            default:
                throw new Error(`${section.kind} not implemented`);
        }
    }
    return factories;
}
