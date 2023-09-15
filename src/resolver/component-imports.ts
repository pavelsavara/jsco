import { memoizePrepare } from './context';
import { ResolverContext, ImplFactory } from './types';

export function prepareComponentImport(rctx: ResolverContext, componentImportIndex: number): Promise<ImplFactory> {
    const section = rctx.indexes.componentImports[componentImportIndex];
    return memoizePrepare<ImplFactory>(rctx, section, async () => {
        return async (ctx, imports) => {
            return {
                TODO: section.tag
            } as any;
        };
    });
}

