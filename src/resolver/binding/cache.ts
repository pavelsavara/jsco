export function memoize<K, V>(cache: Map<unknown, unknown>, key: K, factory: () => V): V {
    let res = cache.get(key);
    if (res !== undefined) {
        return res;
    }
    res = factory();
    cache.set(key, res!);
    return res!;
}
