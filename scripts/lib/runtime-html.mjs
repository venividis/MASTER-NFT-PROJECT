import { parse, parseFragment, serialize } from "parse5";
export { parse, serialize };
export function elements(root, predicate) {
  const result = [];
  function walk(node) {
    if (predicate(node)) result.push(node);
    for (const child of node.childNodes || []) walk(child);
  }
  walk(root);
  return result;
}
export const attr = (node, name) =>
  node.attrs?.find((a) => a.name === name)?.value;
export function setAttr(node, name, value) {
  node.attrs ??= [];
  const a = node.attrs.find((a) => a.name === name);
  if (a) a.value = value;
  else node.attrs.push({ name, value });
}
export function fragment(markup) {
  return parseFragment(markup).childNodes;
}
export function append(node, markup) {
  for (const child of fragment(markup)) {
    child.parentNode = node;
    node.childNodes.push(child);
  }
}
export function replace(node, markup) {
  const parent = node.parentNode,
    index = parent.childNodes.indexOf(node),
    children = fragment(markup);
  for (const child of children) child.parentNode = parent;
  parent.childNodes.splice(index, 1, ...children);
}
export function inlineScript(code, id = "") {
  if (/<\/script/i.test(code))
    throw Error("Unsafe HTML script delimiter in " + id);
  return "<script" + (id ? ' id="' + id + '"' : "") + ">" + code + "</script>";
}
export const textContent = (node) =>
  (node.childNodes || [])
    .filter((child) => child.nodeName === "#text")
    .map((child) => child.value)
    .join("");
