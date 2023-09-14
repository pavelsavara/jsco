import { ModelTag } from '../model/tags';
import { memoizePrepare } from './context';
import { ResolverContext, ImplComponentTypeFunction } from './types';

export function prepareComponentTypeFunction(rctx: ResolverContext, componentTypeFunctionIndex: number): Promise<ImplComponentTypeFunction> {
    const section = rctx.indexes.componentTypes[componentTypeFunctionIndex];
    return memoizePrepare<ImplComponentTypeFunction>(rctx, section, async () => {
        switch (section.tag) {
            case ModelTag.ComponentTypeFunc:
                return (ctx) => {
                    return {
                        TODO: 'ComponentTypeFunc'
                    } as any;
                };
            default:
                throw new Error(`${section.tag} not implemented`);
        }
    });
}
