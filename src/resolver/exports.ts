import { BindingContext } from '../binding/types';
import { ComponentExternalKind } from '../model/exports';
import { ComponentExternName } from '../model/imports';
import { ModelTag } from '../model/tags';
import { ResolverContext, JsInterfaceCollection, ExportFactory, InstanceFactory } from './types';

export function prepareComponentExports(rctx: ResolverContext): ExportFactory[] {
    function createComponentExport(componentInstanceFactory: InstanceFactory, resolvedName: string, ctx: BindingContext): JsInterfaceCollection {
        const ifc = componentInstanceFactory(ctx);
        const namedInterface: JsInterfaceCollection = {};
        namedInterface[resolvedName] = ifc;
        return namedInterface;
    }

    const factories: ExportFactory[] = [];
    for (const section of rctx.componentExports) {
        let factory: ExportFactory;

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
                const componentInstanceFactory: InstanceFactory = rctx.prepareComponentInstance(section.index);
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
