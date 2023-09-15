const memoizeCache = new Map();

export function memoize<K, V>(key: K, factory: () => V): V {
    let res = memoizeCache.get(key);
    if (res !== undefined) {
        return res;
    }
    res = factory();
    memoizeCache.set(key, res!);
    return res!;
}
