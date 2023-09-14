import { cacheFactory } from './context';
import { ResolverContext, ImplComponentImport } from './types';

export function prepareComponentImport(rctx: ResolverContext, componentImportIndex: number): Promise<ImplComponentImport> {
    const section = rctx.indexes.componentImports[componentImportIndex];
    return cacheFactory<ImplComponentImport>(rctx, section, async () => {
        console.log('prepareComponentImport', section);

        return async (ctx) => {
            return {} as any;
        };
    });
}

