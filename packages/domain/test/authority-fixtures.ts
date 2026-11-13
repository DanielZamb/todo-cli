export const authorityModes = [
  "clone",
  "spread",
  "assign",
  "prototype",
  "json",
  "subclass",
  "subclass-copy",
  "proxy",
  "field",
];
export const counterfeitAuthority = (value: object, mode: string): unknown => {
  if (mode === "field")
    return Object.assign(value, {
      profile: "personal",
      fields: { task_id: "foreign" },
    });
  if (mode === "subclass" || mode === "subclass-copy") {
    const base = Reflect.get(Object.getPrototypeOf(value), "constructor");
    const derived = Reflect.apply(
      Function("Base", "return class Derived extends Base {}"),
      undefined,
      [base],
    );
    if (mode === "subclass-copy") {
      const copy = Object.create(Reflect.get(derived, "prototype"));
      Object.defineProperty(copy, "profile", { value: "personal" });
      return copy;
    }
    return Reflect.construct(derived, [
      "read",
      "personal",
      "fake",
      {},
      { scope: "read-only" },
    ]);
  }
  if (mode === "proxy") return new Proxy(value, { get: () => "personal" });
  const clone = structuredClone(value);
  if (mode === "spread") return { ...value };
  if (mode === "assign")
    return Object.assign({}, value, {
      profile: "personal",
      fields: { task_id: "foreign" },
    });
  if (mode === "prototype")
    return Object.setPrototypeOf(clone, Object.getPrototypeOf(value));
  if (mode === "json") {
    const decoded: unknown = JSON.parse(JSON.stringify(value));
    return decoded;
  }
  return clone;
};
