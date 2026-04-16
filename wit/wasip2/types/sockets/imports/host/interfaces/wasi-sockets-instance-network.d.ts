/** @module Interface wasi:sockets/instance-network@0.2.11 **/
/**
 * Get a handle to the default network.
 */
export function instanceNetwork(): Network;
export type Network = import('./wasi-sockets-network.js').Network;
