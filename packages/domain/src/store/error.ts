export class StoreError extends Error {
  readonly _tag = "StoreError";
  constructor(override readonly cause: unknown) {
    super(String(cause));
  }
}
