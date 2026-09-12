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
import {
  collectMarkdownReferences,
  normalizeReferenceIdentifier,
  type MarkdownDefinition,
  type MarkdownFootnote,
} from './markdown-references';
import type { XhsTheme } from './theme-schema';
import { analyzeXhsSource, type XhsStructureAnalysis } from './xhs-organizer';

export interface RenderWarning {
  code: 'empty' | 'long-copy' | 'long-title' | 'many-topics' | 'raw-html' | 'dense-copy' | 'unstructured-copy';
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
  sections: {
    title: string;
    body: string;
    topics: string;
  };
  analysis: XhsStructureAnalysis;
  warnings: readonly RenderWarning[];
  stats: RenderStats;
}

export const XHS_CHARACTER_LIMIT = 1_000;

interface RenderContext {
  headingIndex: number;
  headings: number;
  paragraphs: number;
  sawRawHtml: boolean;
  definitions: ReadonlyMap<string, MarkdownDefinition>;
}

const circledNumbers = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
const filledNumbers = ['❶', '❷', '❸', '❹', '❺', '❻', '❼', '❽', '❾', '❿'];
const keycapNumbers = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function stripMarkedText(value: string): string {
  return value.replace(/==([^=\n]+)==/gu, '$1');
}

function renderPhrasing(
  children: readonly PhrasingContent[],
  theme: XhsTheme,
  context: RenderContext,
): string {
  return children.map((node) => renderInline(node, theme, context)).join('');
}

function renderInline(node: PhrasingContent, theme: XhsTheme, context: RenderContext): string {
  switch (node.type) {
    case 'text':
      return stripMarkedText(node.value);
    case 'strong':
      return `${theme.rules.strongOpen}${renderPhrasing(node.children, theme, context)}${theme.rules.strongClose}`;
    case 'emphasis':
      return `${theme.rules.emphasisOpen}${renderPhrasing(node.children, theme, context)}${theme.rules.emphasisClose}`;
    case 'delete':
      return renderPhrasing(node.children, theme, context);
    case 'inlineCode':
      return `${theme.rules.codePrefix}${node.value}`;
    case 'break':
      return '\n';
    case 'link':
      return renderLink(node, theme, context);
    case 'linkReference': {
      const label = renderPhrasing(node.children, theme, context).trim();
      const definition = context.definitions.get(normalizeReferenceIdentifier(node.identifier));
      return definition ? renderLinkedLabel(label, definition.url) : label;
    }
    case 'image':
      return node.alt ? `［图片：${node.alt}］` : '［图片］';
    case 'imageReference':
      return node.alt ? `［图片：${node.alt}］` : '［图片］';
    case 'footnoteReference':
      return `［${node.identifier}］`;
    default:
      return '';
  }
}

function renderLinkedLabel(label: string, url: string): string {
  if (!label || label === url) return url;
  return `${label}（${url}）`;
}

function renderLink(node: Link, theme: XhsTheme, context: RenderContext): string {
  return renderLinkedLabel(renderPhrasing(node.children, theme, context).trim(), node.url);
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

function renderParagraph(node: Paragraph, theme: XhsTheme, context: RenderContext): string {
  return renderPhrasing(node.children, theme, context)
    .replace(/[^\S\r\n]+([「【﹝〈〔（])/gu, '$1')
    .replace(/([」】﹞〉〕）])[^\S\r\n]+/gu, '$1')
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

function renderTable(node: Table, theme: XhsTheme, context: RenderContext): string {
  return node.children
    .map((row) => row.children.map((cell) => renderPhrasing(cell.children, theme, context).trim()).join('｜'))
    .join('\n');
}

function renderBlock(node: RootContent, theme: XhsTheme, context: RenderContext): string {
  switch (node.type) {
    case 'paragraph':
      context.paragraphs += 1;
      return renderParagraph(node, theme, context);
    case 'heading': {
      context.headingIndex += 1;
      context.headings += 1;
      const title = renderPhrasing(node.children, theme, context).trim();
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
      return renderTable(node, theme, context);
    case 'footnoteDefinition':
    case 'definition':
      return '';
    case 'html':
      context.sawRawHtml = true;
      return '';
    default:
      return '';
  }
}

function renderFootnote(
  footnote: MarkdownFootnote,
  theme: XhsTheme,
  context: RenderContext,
): string {
  const content = footnote.children.map((child) => renderBlock(child, theme, context)).filter(Boolean).join('\n');
  return content ? `［${footnote.identifier}］ ${content}` : '';
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

function publishingText(children: readonly PhrasingContent[]): string {
  return children.map((node) => {
    switch (node.type) {
      case 'text':
        return stripMarkedText(node.value);
      case 'inlineCode':
        return node.value;
      case 'strong':
      case 'emphasis':
      case 'delete':
        return publishingText(node.children);
      case 'break':
        return '\n';
      case 'link':
        return publishingText(node.children).trim() || node.url;
      case 'linkReference':
        return publishingText(node.children).trim();
      case 'image':
      case 'imageReference':
        return node.alt ?? '';
      case 'footnoteReference':
        return `［${node.identifier}］`;
      default:
        return '';
    }
  }).join('');
}

function extractTopics(value: string): { body: string; topics: string } {
  const markerMatch = value.match(/(?:^|\n|\s)🏷️\s*(?:标签|话题)?\s*[：:]?\s*((?:#[^\s#]+\s*)+)$/u);
  const hashtagLineMatch = value.match(/(?:^|\n)\s*((?:#[^\s#]+\s*)+)$/u);
  const match = markerMatch ?? hashtagLineMatch;
  if (!match || match.index === undefined) return { body: value.trim(), topics: '' };

  const topics = match[1]?.match(/#[^\s#]+/gu)?.join(' ') ?? '';
  return {
    body: value.slice(0, match.index).trim(),
    topics,
  };
}

export function renderXiaohongshu(
  document: ContentDocument,
  theme: XhsTheme,
): XhsRenderResult {
  const references = collectMarkdownReferences(document.ast);
  const context: RenderContext = {
    headingIndex: 0,
    headings: 0,
    paragraphs: 0,
    sawRawHtml: containsRawHtml(document.ast),
    definitions: references.definitions,
  };
  const footnoteContext: RenderContext = {
    headingIndex: 0,
    headings: 0,
    paragraphs: 0,
    sawRawHtml: false,
    definitions: references.definitions,
  };

  const renderedBlocks = document.ast.children
    .filter((node) => node.type !== 'definition' && node.type !== 'footnoteDefinition')
    .map((node) => ({ node, text: renderBlock(node, theme, context) }))
    .filter((block) => Boolean(block.text));
  const footnoteBlocks = references.footnotes
    .map((footnote) => renderFootnote(footnote, theme, footnoteContext))
    .filter(Boolean);
  const plainText = [...renderedBlocks.map((block) => block.text), ...footnoteBlocks]
    .join('\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const lines = plainText.split('\n').filter(Boolean);
  const firstLine = lines[0] ?? '';
  const characters = Array.from(plainText).length;
  const topics = plainText.match(/(?:^|\s)#[^\s#]+/gu)?.length ?? 0;
  const analysis = analyzeXhsSource(document.source);
  const warnings: RenderWarning[] = [];

  const firstBlock = renderedBlocks[0];
  let title = '';
  let bodyBlocks = renderedBlocks.map((block) => block.text);
  if (firstBlock?.node.type === 'heading') {
    title = publishingText(firstBlock.node.children).trim();
    bodyBlocks = bodyBlocks.slice(1);
  } else if (firstBlock?.node.type === 'paragraph') {
    const [firstTitleLine = '', ...remainingSourceLines] = publishingText(firstBlock.node.children).split('\n');
    const renderedLines = firstBlock.text.split('\n');
    title = firstTitleLine.trim();
    bodyBlocks = [
      renderedLines.slice(remainingSourceLines.length > 0 ? 1 : renderedLines.length).join('\n').trim(),
      ...bodyBlocks.slice(1),
    ].filter(Boolean);
  }
  bodyBlocks.push(...footnoteBlocks);
  const separated = extractTopics(bodyBlocks.join('\n\n'));

  if (!plainText) {
    warnings.push({ code: 'empty', severity: 'info', message: '写一点内容后，这里会显示排版结果。' });
  }
  if (characters > XHS_CHARACTER_LIMIT) {
    warnings.push({
      code: 'long-copy',
      severity: 'warning',
      message: `已超过小红书 1000 字限制，请精简 ${characters - XHS_CHARACTER_LIMIT} 字后再复制全部。`,
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
  if (analysis.denseBlocks > 0) {
    warnings.push({
      code: 'dense-copy',
      severity: 'info',
      message: `检测到 ${analysis.denseBlocks} 个长段落，可以用“整理结构”自动拆分。`,
    });
  }
  if (analysis.visualHeadings > 0 && analysis.markdownHeadings === 0) {
    warnings.push({
      code: 'unstructured-copy',
      severity: 'info',
      message: '文案里已有小标题符号，但还没有转换成主题结构。',
    });
  }

  return {
    channel: 'xiaohongshu',
    plainText,
    sections: {
      title,
      body: separated.body,
      topics: separated.topics,
    },
    analysis,
    warnings: uniqueWarnings(warnings),
    stats: {
      characters,
      headings: context.headings,
      paragraphs: context.paragraphs,
      topics,
    },
  };
}
