declare module 'wasi:io/error@0.2.11' {
  
  export class Error implements Disposable {
    /**
     * This type does not have a public constructor.
     */
    private constructor();
    toDebugString(): string;
    [Symbol.dispose](): void;
  }
}
