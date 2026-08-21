import type {
  Blockquote,
  Link,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  RootContent,
  Table,
} from 'mdast';
import type { ContentDocument } from './document';
import type { XhsTheme } from './theme-schema';

export interface RenderWarning {
  code: 'empty' | 'long-copy' | 'long-title' | 'many-topics' | 'raw-html';
  severity: 'info' | 'warning';
  message: string;
}

export interface RenderStats {
  characters: number;
  headings: number;
  paragraphs: number;
  topics: number;
}

export interface XhsRenderResult {
  channel: 'xiaohongshu';
  plainText: string;
  warnings: readonly RenderWarning[];
  stats: RenderStats;
}

interface RenderContext {
  headingIndex: number;
  headings: number;
  paragraphs: number;
  sawRawHtml: boolean;
}

const circledNumbers = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
const filledNumbers = ['❶', '❷', '❸', '❹', '❺', '❻', '❼', '❽', '❾', '❿'];
const keycapNumbers = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function renderPhrasing(children: readonly PhrasingContent[], theme: XhsTheme): string {
  return children.map((node) => renderInline(node, theme)).join('');
}

function renderInline(node: PhrasingContent, theme: XhsTheme): string {
  switch (node.type) {
    case 'text':
      return node.value;
    case 'strong':
      return `${theme.rules.strongOpen}${renderPhrasing(node.children, theme)}${theme.rules.strongClose}`;
    case 'emphasis':
      return `${theme.rules.emphasisOpen}${renderPhrasing(node.children, theme)}${theme.rules.emphasisClose}`;
    case 'delete':
      return renderPhrasing(node.children, theme);
    case 'inlineCode':
      return `${theme.rules.codePrefix}${node.value}`;
    case 'break':
      return '\n';
    case 'link':
      return renderLink(node, theme);
    case 'image':
      return node.alt ? `［图片：${node.alt}］` : '［图片］';
    case 'footnoteReference':
      return `［${node.identifier}］`;
    default:
      return '';
  }
}

function renderLink(node: Link, theme: XhsTheme): string {
  const label = renderPhrasing(node.children, theme).trim();
  if (!label || label === node.url) return node.url;
  return `${label}（${node.url}）`;
}

function headingPrefix(theme: XhsTheme, index: number): string {
  const { heading } = theme.rules;
  if (heading.style === 'symbol') return `${heading.symbol} `;
  if (heading.style === 'labelled') {
    return `${heading.label}${String(index).padStart(2, '0')}${heading.separator}`;
  }
  return `${String(index).padStart(2, '0')}${heading.separator}`;
}

function orderedMarker(theme: XhsTheme, value: number): string {
  const index = value - 1;
  switch (theme.rules.orderedStyle) {
    case 'circled':
      return circledNumbers[index] ?? `${value}.`;
    case 'filled':
      return filledNumbers[index] ?? `${value}.`;
    case 'keycap':
      return keycapNumbers[index] ?? `${value}.`;
    default:
      return `${value}.`;
  }
}

function renderParagraph(node: Paragraph, theme: XhsTheme): string {
  return renderPhrasing(node.children, theme)
    .replace(/\s+([「【﹝〈〔（])/gu, '$1')
    .replace(/([」】﹞〉〕）])\s+/gu, '$1')
    .trim();
}

function renderListItem(
  item: ListItem,
  theme: XhsTheme,
  context: RenderContext,
  marker: string,
): string {
  const parts = item.children
    .map((child) => renderBlock(child, theme, context))
    .filter(Boolean);
  const taskMarker = item.checked === true ? '☑' : item.checked === false ? '☐' : marker;
  const body = parts.join('\n').replace(/\n/g, '\n  ');
  return `${taskMarker} ${body}`.trimEnd();
}

function renderList(node: List, theme: XhsTheme, context: RenderContext): string {
  const start = node.start ?? 1;
  return node.children
    .map((item, index) => {
      const marker = node.ordered
        ? orderedMarker(theme, start + index)
        : theme.rules.unorderedBullet;
      return renderListItem(item, theme, context, marker);
    })
    .join('\n');
}

function renderQuote(node: Blockquote, theme: XhsTheme, context: RenderContext): string {
  return node.children
    .map((child) => renderBlock(child, theme, context))
    .filter(Boolean)
    .join('\n')
    .split('\n')
    .map((line) => `${theme.rules.quotePrefix}${line}`)
    .join('\n');
}

function renderTable(node: Table, theme: XhsTheme): string {
  return node.children
    .map((row) => row.children.map((cell) => renderPhrasing(cell.children, theme).trim()).join('｜'))
    .join('\n');
}

function renderBlock(node: RootContent, theme: XhsTheme, context: RenderContext): string {
  switch (node.type) {
    case 'paragraph':
      context.paragraphs += 1;
      return renderParagraph(node, theme);
    case 'heading': {
      context.headingIndex += 1;
      context.headings += 1;
      const title = renderPhrasing(node.children, theme).trim();
      return `${headingPrefix(theme, context.headingIndex)}${title}`;
    }
    case 'list':
      return renderList(node, theme, context);
    case 'blockquote':
      return renderQuote(node, theme, context);
    case 'thematicBreak':
      return theme.rules.divider;
    case 'code':
      return `${theme.rules.codePrefix}\n${node.value.trim()}`;
    case 'table':
      return renderTable(node, theme);
    case 'html':
      context.sawRawHtml = true;
      return '';
    default:
      return '';
  }
}

function uniqueWarnings(warnings: readonly RenderWarning[]): RenderWarning[] {
  return warnings.filter(
    (warning, index) => warnings.findIndex((item) => item.code === warning.code) === index,
  );
}

function containsRawHtml(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const candidate = node as { type?: unknown; children?: unknown };
  if (candidate.type === 'html') return true;
  return Array.isArray(candidate.children) && candidate.children.some(containsRawHtml);
}

export function renderXiaohongshu(
  document: ContentDocument,
  theme: XhsTheme,
): XhsRenderResult {
  const context: RenderContext = {
    headingIndex: 0,
    headings: 0,
    paragraphs: 0,
    sawRawHtml: containsRawHtml(document.ast),
  };

  const plainText = document.ast.children
    .map((node) => renderBlock(node, theme, context))
    .filter(Boolean)
    .join('\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const lines = plainText.split('\n').filter(Boolean);
  const firstLine = lines[0] ?? '';
  const characters = Array.from(plainText).length;
  const topics = plainText.match(/(?:^|\s)#[^\s#]+/gu)?.length ?? 0;
  const warnings: RenderWarning[] = [];

  if (!plainText) {
    warnings.push({ code: 'empty', severity: 'info', message: '写一点内容后，这里会显示排版结果。' });
  }
  if (characters > 1000) {
    warnings.push({
      code: 'long-copy',
      severity: 'info',
      message: '正文已经较长，发布前建议再次检查段落密度和平台限制。',
    });
  }
  if (Array.from(firstLine).length > 28) {
    warnings.push({
      code: 'long-title',
      severity: 'info',
      message: '首行偏长，在手机端可能换成多行。',
    });
  }
  if (topics > 10) {
    warnings.push({
      code: 'many-topics',
      severity: 'info',
      message: '话题较多，建议只保留和正文直接相关的内容。',
    });
  }
  if (context.sawRawHtml) {
    warnings.push({
      code: 'raw-html',
      severity: 'warning',
      message: '原始 HTML 不会进入小红书纯文本输出。',
    });
  }

  return {
    channel: 'xiaohongshu',
    plainText,
    warnings: uniqueWarnings(warnings),
    stats: {
      characters,
      headings: context.headings,
      paragraphs: context.paragraphs,
      topics,
    },
  };
}
