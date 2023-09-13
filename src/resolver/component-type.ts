import { BindingContext } from '../binding/types';
import { ModelTag } from '../model/tags';
import { jsco_assert } from '../utils/assert';
import { ResolverContext, ImplComponentTypeFactory } from './types';

export function prepareComponentType(rctx: ResolverContext, componentIndex: number): ImplComponentTypeFactory {
    function createComponentType(index: number, ctx: BindingContext): any {
        //console.log('createComponentType', index, section);
        return undefined;
    }

    const section = rctx.componentType[componentIndex];
    //console.log('prepareComponentType', section);
    jsco_assert(section.tag === ModelTag.ComponentTypeComponent, () => `expected ComponentTypeComponent, got ${section.tag}`);

    for (const d of section.declarations) {
        switch (d.tag) {
            case ModelTag.ComponentTypeDeclarationType:
            case ModelTag.ComponentTypeDeclarationExport:
            case ModelTag.ComponentImport:
                break;
            default:
                throw new Error(`${d.tag} not implemented`);
        }
    }

    const factory: ImplComponentTypeFactory = cacheFactory(rctx, componentIndex, () => (ctx) => createComponentType(componentIndex, ctx));
    return factory;
}

function cacheFactory(rctx: ResolverContext, cacheIndex: number, ff: () => ImplComponentTypeFactory): ImplComponentTypeFactory {
    const cache = rctx.componentTypeFactories;
    if (cache[cacheIndex] !== undefined) {
        return cache[cacheIndex];
    }
    const factory = ff();
    cache[cacheIndex] = factory;
    return factory;
}