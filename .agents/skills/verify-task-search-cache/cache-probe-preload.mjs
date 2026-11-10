const original = {
  set: Map.prototype.set,
  delete: Map.prototype.delete,
  clear: Map.prototype.clear,
};
const observed = new WeakMap();
let next = 0;
function identify(key, value) {
  if (typeof key !== "string" || !/^\d+:/.test(key) || !value) return;
  if (typeof value.profile === "string" && value.prepared?.words)
    return "retained";
  if (
    typeof value.read?.profile === "string" &&
    typeof value.bytes === "number"
  )
    return "pending";
}
function report(map) {
  const metadata = observed.get(map);
  if (!metadata) return;
  const profiles = {};
  for (const value of map.values()) {
    const profile =
      metadata.kind === "retained" ? value.profile : value.read.profile;
    profiles[profile] = (profiles[profile] ?? 0) + 1;
  }
  process.stderr.write(
    `CACHE_ERASURE_PROBE ${JSON.stringify({ ...metadata, at: Date.now(), entries: map.size, profiles })}\n`,
  );
}
Map.prototype.set = function (key, value) {
  const result = original.set.call(this, key, value);
  const kind = identify(key, value);
  if (kind && !observed.has(this)) observed.set(this, { id: ++next, kind });
  report(this);
  return result;
};
Map.prototype.delete = function (key) {
  const result = original.delete.call(this, key);
  report(this);
  return result;
};
Map.prototype.clear = function () {
  const result = original.clear.call(this);
  report(this);
  return result;
};
