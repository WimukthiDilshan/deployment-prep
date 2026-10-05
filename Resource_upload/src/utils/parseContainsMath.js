function parseContainsMath(body) {
  const raw = String(body?.containsMath ?? "")
    .trim()
    .toLowerCase();
  return raw === "true" || raw === "1" || raw === "on" || raw === "yes";
}

function hasContainsMathField(body) {
  const raw = String(body?.containsMath ?? "")
    .trim()
    .toLowerCase();
  return ["true", "false", "1", "0", "on", "off", "yes", "no"].includes(raw);
}

module.exports = {
  parseContainsMath,
  hasContainsMathField,
};
