// Titles are editor blocks, not Markdown-looking strings in code or paragraphs.
export function inlineText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(item => typeof item?.text === 'string' ? item.text : inlineText(item?.content)).join('');
}
export function memoOutline(blocks) {
  const flat = [], roots = [], stack = [], seen = new Set();
  function walk(items, parents = []) {
    for (const block of items || []) {
      const level = Number(block.props?.level);
      if (block.type === 'heading' && level >= 1 && level <= 4 && !seen.has(block.id)) {
        seen.add(block.id);
        const item = { id: block.id, level, title: inlineText(block.content).trim() || '제목 없음', parents, children: [] };
        while (stack.length && stack.at(-1).level >= level) stack.pop();
        (stack.at(-1)?.children || roots).push(item); stack.push(item); flat.push(item);
      }
      if (block.children?.length) walk(block.children, [...parents, block.id]);
    }
  }
  walk(blocks); return { roots, flat };
}

// Lowercasing can expand Unicode characters; preserve source UTF-16 offsets.
export function foldedText(text) {
  const value = text.toLocaleLowerCase();
  if (value.length === text.length) return { value, starts: null, ends: null };
  const starts = [], ends = []; let offset = 0;
  for (const character of text) {
    const folded = character.toLocaleLowerCase();
    for (let index = 0; index < folded.length; index++) { starts.push(offset); ends.push(offset + character.length); }
    offset += character.length;
  }
  return { value, starts, ends };
}
export function textMatches(text, query, limit = 500) {
  const needle = query.toLocaleLowerCase(), folded = foldedText(text), matches = [];
  if (!needle) return matches;
  let position = 0, at;
  while (matches.length < limit && (at = folded.value.indexOf(needle, position)) >= 0) {
    matches.push({ start: folded.starts?.[at] ?? at, end: folded.ends?.[at + needle.length - 1] ?? at + needle.length }); position = at + needle.length;
  }
  return matches;
}
export function memoSearchRanges(editorRoot, query, { limit = 500, maxCharacters = 2_000_000 } = {}) {
  const ranges = []; let scanned = 0, truncated = false;
  if (!editorRoot || !query.trim()) return { ranges, truncated };
  const document = editorRoot.ownerDocument, NodeFilter = document.defaultView.NodeFilter;
  for (const region of editorRoot.querySelectorAll('.bn-inline-content')) {
    const nodes = [], walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT, { acceptNode(node) {
      return node.parentElement.closest('button,[aria-hidden="true"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    } });
    let text = '';
    while (walker.nextNode()) { const node = walker.currentNode; nodes.push({ node, start: text.length, end: text.length + node.textContent.length }); text += node.textContent; }
    scanned += text.length;
    if (scanned > maxCharacters) { truncated = true; break; }
    // One extra match detects truncation without building an unbounded Highlight.
    let firstIndex = 0, lastIndex = 0;
    for (const match of textMatches(text, query, limit - ranges.length + 1)) {
      if (ranges.length >= limit) { truncated = true; break; }
      while (firstIndex < nodes.length && nodes[firstIndex].end <= match.start) firstIndex++;
      while (lastIndex < nodes.length && nodes[lastIndex].end < match.end) lastIndex++;
      const first = nodes[firstIndex], last = nodes[lastIndex];
      if (!first || !last) continue;
      const range = document.createRange(); range.setStart(first.node, match.start - first.start); range.setEnd(last.node, match.end - last.start); ranges.push(range);
    }
    if (truncated) break;
  }
  return { ranges, truncated };
}
export function blockElement(editorRoot, id) {
  if (!editorRoot || !id) return undefined;
  const escape = editorRoot.ownerDocument.defaultView.CSS?.escape;
  if (escape) return editorRoot.querySelector(`[data-id="${escape(String(id))}"]`);
  return [...editorRoot?.querySelectorAll('[data-id]') || []].find(element => element.getAttribute('data-id') === id);
}
