import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { ResolverContext, ImplComponentTypeComponent } from './types';

export function prepareComponentTypeComponent(rctx: ResolverContext, componentIndex: number): ImplComponentTypeComponent {
    function createComponentType(index: number, ctx: BindingContext): any {
        //console.log('createComponentType', index, section);
        return undefined;
    }

    const section = rctx.componentTypeComponent[componentIndex];
    // console.log('prepareComponentType', section);
    jsco_assert(section.tag === ModelTag.ComponentTypeComponent, () => `expected ComponentTypeComponent, got ${section.tag}`);

    for (const declaration of section.declarations) {
        switch (declaration.tag) {
            case ModelTag.ComponentTypeDeclarationType:
            case ModelTag.ComponentImport:
                break;
            case ModelTag.ComponentTypeDeclarationExport:
                switch (declaration.ty.tag) {
                    case ModelTag.ComponentTypeRefType:
                        // TODO console.log('prepareComponentType declaration', declaration);
                        break;
                    case ModelTag.ComponentTypeRefFunc:
                        //rctx.prepareFunctionType(declaration.ty.value);
                        break;
                    default:
                        throw new Error(`${declaration.ty.tag} not implemented`);
                }
                break;
            default:
                throw new Error(`${declaration.tag} not implemented`);
        }
    }

    const factory: ImplComponentTypeComponent = cacheFactory(rctx, componentIndex, () => (ctx) => createComponentType(componentIndex, ctx));
    return factory;
}

function cacheFactory(rctx: ResolverContext, cacheIndex: number, ff: () => ImplComponentTypeComponent): ImplComponentTypeComponent {
    const cache = rctx.implComponentTypeComponent;
    if (cache[cacheIndex] !== undefined) {
        return cache[cacheIndex];
    }
    const factory = ff();
    cache[cacheIndex] = factory;
    return factory;
}