import { BindingContext } from '../binding/types';
import { ComponentExport, ComponentExternalKind } from '../model/exports';
import { ComponentExternName } from '../model/imports';
import { ModelTag } from '../model/tags';
import { ResolverContext, JsInterface, JsInterfaceCollection } from './types';

export function prepareComponentExports(rctx: ResolverContext) {
    function createComponentExport(index: number, section: ComponentExport, ctx: BindingContext): JsInterfaceCollection {
        let ifc: JsInterface = undefined as any;
        switch (section.kind) {
            case ComponentExternalKind.Instance:
                ifc = rctx.componentInstanceFactories[section.index](ctx);
                break;
            default:
                throw new Error(`${section.kind} not implemented`);
        }
        const name: ComponentExternName = section.name;
        const namedInterface: JsInterfaceCollection = {};
        switch (name.tag) {
            case ModelTag.ComponentExternNameInterface:
                namedInterface[name.name] = ifc;
                break;
            case ModelTag.ComponentExternNameKebab:
            default:
                throw new Error(`${name.tag} not implemented`);
        }
        return namedInterface;
    }

    for (const [index, section] of rctx.componentExports.entries()) {
        switch (section.kind) {
            case ComponentExternalKind.Instance:
                rctx.componentExportFactories[index] = (ctx) => createComponentExport(index, section, ctx);
                rctx.prepareComponentInstance(section.index);
                break;
            default:
                throw new Error(`${section.kind} not implemented`);
        }
    }
}
