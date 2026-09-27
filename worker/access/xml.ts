/** Small XML token scanner for OOXML. It preserves character offsets for targeted edits. */
export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  start: number;
  openEnd: number;
  closeStart: number;
  end: number;
  children: XmlNode[];
  parent?: XmlNode;
}
export function decodeXml(value: string): string {
  return value.replace(/&#(x[\da-f]+|\d+);|&([a-z]+);/gi, (_, number: string, named: string) => number
    ? String.fromCodePoint(number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : parseInt(number, 10))
    : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[named] ?? `&${named};`);
}
export function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: '#root', attrs: {}, start: 0, openEnd: 0, closeStart: xml.length, end: xml.length, children: [] };
  const stack = [root];
  let i = 0;
  while ((i = xml.indexOf('<', i)) >= 0) {
    const start = i;
    let quote = '';
    i++;
    while (i < xml.length) {
      const c = xml[i++];
      if (quote) { if (c === quote) quote = ''; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    const raw = xml.slice(start, i);
    if (/^<\//.test(raw)) {
      const name = /^<\/\s*([^\s>]+)/.exec(raw)?.[1];
      let at = -1;
      for (let j = stack.length - 1; j > 0; j--) if (stack[j].name === name) { at = j; break; }
      if (at > 0) { stack[at].closeStart = start; stack[at].end = i; stack.length = at; }
      continue;
    }
    if (/^<[!?]/.test(raw)) continue;
    const name = /^<\s*([^\s/>]+)/.exec(raw)?.[1];
    if (!name) continue;
    const attrs: Record<string, string> = {};
    const body = raw.slice(1 + raw.indexOf(name) + name.length, -1);
    const attrPattern = /([^\s=/>]+)\s*=\s*(["'])(.*?)\2/gs;
    for (const match of body.matchAll(attrPattern)) attrs[match[1]] = decodeXml(match[3]);
    const parent = stack[stack.length - 1];
    const node: XmlNode = { name, attrs, start, openEnd: i, closeStart: i, end: i, children: [], parent };
    parent.children.push(node);
    if (!/\/\s*>$/.test(raw)) stack.push(node);
  }
  return root;
}
export function descendants(node: XmlNode, name: string): XmlNode[] {
  const result: XmlNode[] = [];
  for (const child of node.children) { if (child.name === name) result.push(child); result.push(...descendants(child, name)); }
  return result;
}
export function first(node: XmlNode, name: string): XmlNode | undefined { return descendants(node, name)[0]; }
export function content(xml: string, node: XmlNode, textTags: string[]): string {
  return textTags.flatMap(tag => descendants(node, tag)).sort((a,b) => a.start - b.start)
    .map(n => decodeXml(xml.slice(n.openEnd, n.closeStart))).join('');
}
export interface Edit { start: number; end: number; value: string }
export function patch(xml: string, edits: Edit[]): string {
  for (const edit of [...edits].sort((a,b) => b.start - a.start)) xml = xml.slice(0, edit.start) + edit.value + xml.slice(edit.end);
  return xml;
}
export function setAttr(xml: string, node: XmlNode, name: string, value: string): Edit {
  const raw = xml.slice(node.start, node.openEnd);
  const pattern = new RegExp(`(\\s${name.replace(':', '\\:')}\\s*=\\s*)(["'])(.*?)\\2`, 's');
  const match = pattern.exec(raw);
  if (match) return { start: node.start + match.index, end: node.start + match.index + match[0].length, value: ` ${name}="${escapeXml(value)}"` };
  const at = node.openEnd - (/\/\s*>$/.test(raw) ? 2 : 1);
  return { start: at, end: at, value: ` ${name}="${escapeXml(value)}"` };
}
export function setText(xml: string, node: XmlNode, value: string): Edit {
  return { start: node.openEnd, end: node.closeStart, value: escapeXml(value) };
}
