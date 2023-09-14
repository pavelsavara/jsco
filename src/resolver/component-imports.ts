import { memoizePrepare } from './context';
import { ResolverContext, ImplComponentImport } from './types';

export function prepareComponentImport(rctx: ResolverContext, componentImportIndex: number): Promise<ImplComponentImport> {
    const section = rctx.indexes.componentImports[componentImportIndex];
    return memoizePrepare<ImplComponentImport>(rctx, section, async () => {
        return async (ctx) => {
            return {
                TODO: section.tag
            } as any;
        };
    });
}

