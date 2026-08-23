import type { Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

export interface ContentDocument {
  schemaVersion: 1;
  source: string;
  ast: Root;
}

const parser = unified().use(remarkParse).use(remarkGfm);

function choosePlaceholder(source: string): string | null {
  for (let codePoint = 0xe000; codePoint <= 0xf8ff; codePoint += 1) {
    const candidate = String.fromCharCode(codePoint);
    if (!source.includes(candidate)) return candidate;
  }
  return null;
}

function normalizeChineseCopyMarkdown(source: string): { markdown: string; placeholder: string | null } {
  // CommonMark treats every line-leading `>` as a quote marker, even in values
  // such as `>100`. In this editor, quotes intentionally use the documented
  // `> 引用` form. A one-code-unit placeholder keeps mdast source offsets exact.
  const placeholder = choosePlaceholder(source);
  if (!placeholder) return { markdown: source, placeholder: null };
  return {
    markdown: source.replace(/^([ \t]{0,3})>(?=\S)/gmu, `$1${placeholder}`),
    placeholder,
  };
}

function restoreGreaterThanText(node: unknown, placeholder: string): void {
  if (!node || typeof node !== 'object') return;
  const candidate = node as { value?: unknown; children?: unknown };
  if (typeof candidate.value === 'string') {
    candidate.value = candidate.value.replaceAll(placeholder, '>');
  }
  if (Array.isArray(candidate.children)) {
    candidate.children.forEach((child) => restoreGreaterThanText(child, placeholder));
  }
}

export function parseDocument(source: string): ContentDocument {
  const normalized = normalizeChineseCopyMarkdown(source);
  const ast = parser.parse(normalized.markdown);
  if (normalized.placeholder) restoreGreaterThanText(ast, normalized.placeholder);

  return {
    schemaVersion: 1,
    source,
    ast,
  };
}
