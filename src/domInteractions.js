const selectByAttr = (attr, val) =>
  document.querySelector(`[${attr}="${val}"]`);

export const mapListToDOMElements = (values, attr) => {
  const out = {};
  for (const v of values) out[v] = selectByAttr(attr, v);
  return out;
};

export const createDOMElem = (tag, className = "", text = null, src = null) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== null) el.textContent = String(text);
  if (src && "src" in el) el.src = src;
  return el;
};
