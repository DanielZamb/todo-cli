const original = Intl.Segmenter.prototype.segment;
Intl.Segmenter.prototype.segment = function (value) {
  if (value === "Fault preparation field")
    throw new Error("seat1 injected preparation defect");
  return original.call(this, value);
};
process.stderr.write("seat1 fault preload enabled\n");
