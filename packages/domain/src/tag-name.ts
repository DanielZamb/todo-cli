// The one Tag-name rule (CONTEXT.md: Tag). Every writer stores what it
// returns, so it reaches History. The name filter compares keys on both sides.

/** One name's stored form: ECMAScript trim, then locale-independent lowercase. */
export const tagKey = (name: string) => name.trim().toLowerCase();

/** Each comma-separated part in input order, as a key; empty parts dropped. */
export const tagNameParts = (inputs: readonly string[]) =>
  inputs
    .flatMap((input) => input.split(","))
    .map(tagKey)
    .filter(Boolean);

/** The names a write stores: unique keys in code-unit order. */
export const tagNames = (inputs: readonly string[]) =>
  [...new Set(tagNameParts(inputs))].sort();

/** Whether a stored Tag name answers a name filter. */
export const tagNameMatches = (stored: string, query: string) =>
  tagKey(stored) === tagKey(query);
