export function memoize<K, V>(cache: Map<unknown, unknown>, key: K, factory: () => V): V {
    const res = cache.get(key);
    if (res !== undefined) {
        return res as V;
    }
    const value = factory();
    cache.set(key, value!);
    return value!;
}
