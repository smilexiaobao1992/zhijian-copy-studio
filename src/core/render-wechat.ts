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
import type { WechatTheme } from './wechat-theme-schema';

export interface WechatRenderWarning {
  code: 'empty' | 'raw-html' | 'image-placeholder' | 'unsafe-link';
  severity: 'info' | 'warning';
  message: string;
}

export interface WechatRenderStats {
  characters: number;
  headings: number;
  paragraphs: number;
  topics: number;
}

export interface WechatRenderResult {
  channel: 'wechat';
  html: string;
  plainText: string;
  warnings: readonly WechatRenderWarning[];
  stats: WechatRenderStats;
}

interface RenderContext {
  headingIndex: number;
  headings: number;
  paragraphs: number;
  sawRawHtml: boolean;
  sawImage: boolean;
  blockedLinks: number;
}

const bodyFont = "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
const displayFont = "'Songti SC', 'STSong', 'SimSun', serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function safeLinkUrl(value: string): string | null {
  const candidate = value.trim();
  if (/^#[a-z0-9_-]+$/iu.test(candidate)) return candidate;

  try {
    const url = new URL(candidate);
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? candidate : null;
  } catch {
    return null;
  }
}

function renderPhrasing(
  children: readonly PhrasingContent[],
  theme: WechatTheme,
  context: RenderContext,
): string {
  return children.map((node) => renderInline(node, theme, context)).join('');
}

function renderInline(
  node: PhrasingContent,
  theme: WechatTheme,
  context: RenderContext,
): string {
  const { palette } = theme;

  switch (node.type) {
    case 'text':
      return escapeHtml(node.value);
    case 'strong':
      return `<strong style="color:${palette.accent};font-weight:700;">${renderPhrasing(node.children, theme, context)}</strong>`;
    case 'emphasis':
      return `<span style="font-style:normal;border-bottom:1px solid ${palette.line};padding-bottom:1px;">${renderPhrasing(node.children, theme, context)}</span>`;
    case 'delete':
      return `<span style="color:${palette.muted};text-decoration:line-through;">${renderPhrasing(node.children, theme, context)}</span>`;
    case 'inlineCode':
      return `<code style="margin:0 2px;padding:2px 5px;border-radius:3px;background-color:${palette.soft};color:${palette.accent};font-family:Menlo,Consolas,monospace;font-size:0.88em;">${escapeHtml(node.value)}</code>`;
    case 'break':
      return '<br />';
    case 'link':
      return renderLink(node, theme, context);
    case 'image': {
      context.sawImage = true;
      const label = node.alt ? `图｜${node.alt}` : '图｜图片位置';
      return `<span style="display:block;margin:22px 0;padding:14px 16px;background-color:${palette.soft};color:${palette.muted};font-size:13px;text-align:center;letter-spacing:0.08em;">${escapeHtml(label)}</span>`;
    }
    case 'footnoteReference':
      return `<sup style="color:${palette.accent};font-size:0.72em;">［${escapeHtml(node.identifier)}］</sup>`;
    default:
      return '';
  }
}

function renderLink(node: Link, theme: WechatTheme, context: RenderContext): string {
  const label = renderPhrasing(node.children, theme, context) || escapeHtml(node.url);
  const url = safeLinkUrl(node.url);
  if (!url) {
    context.blockedLinks += 1;
    return label;
  }

  return `<a href="${escapeHtml(url)}" style="color:${theme.palette.accent};text-decoration:underline;text-decoration-color:${theme.palette.line};text-underline-offset:3px;">${label}</a>`;
}

function paragraphStyle(theme: WechatTheme): string {
  return `margin:0 0 18px;color:${theme.palette.ink};font-family:${bodyFont};font-size:16px;line-height:1.9;letter-spacing:0.01em;text-align:left;word-break:break-word;`;
}

function renderParagraph(
  node: Paragraph,
  theme: WechatTheme,
  context: RenderContext,
): string {
  context.paragraphs += 1;
  return `<p style="${paragraphStyle(theme)}">${renderPhrasing(node.children, theme, context)}</p>`;
}

function renderHeading(
  node: Extract<RootContent, { type: 'heading' }>,
  theme: WechatTheme,
  context: RenderContext,
): string {
  context.headingIndex += 1;
  context.headings += 1;
  const index = String(context.headingIndex).padStart(2, '0');
  const title = renderPhrasing(node.children, theme, context);
  const fontSize = node.depth === 1 ? 28 : node.depth === 2 ? 23 : 19;
  const margin = node.depth === 1 ? '6px 0 34px' : '34px 0 24px';
  const label = node.depth === 1 ? 'FEATURE' : theme.rules.headingLabel;

  return `<section style="margin:${margin};">
    <p style="margin:0 0 8px;color:${theme.palette.accent};font-family:${bodyFont};font-size:10px;font-weight:700;letter-spacing:0.18em;line-height:1.4;">${escapeHtml(label)} / ${index}</p>
    <h${node.depth} style="margin:0;color:${theme.palette.ink};font-family:${displayFont};font-size:${fontSize}px;font-weight:700;line-height:1.36;letter-spacing:-0.02em;">${title}</h${node.depth}>
    <span style="display:inline-block;width:30px;height:3px;margin-top:14px;background-color:${theme.palette.accent};vertical-align:top;"></span>
  </section>`;
}

function renderListItem(
  item: ListItem,
  theme: WechatTheme,
  context: RenderContext,
  marker: string,
): string {
  const [first, ...rest] = item.children;
  let primary = '';
  let nestedChildren = rest;

  if (first?.type === 'paragraph') {
    context.paragraphs += 1;
    primary = renderPhrasing(first.children, theme, context);
  } else {
    nestedChildren = item.children;
  }

  const nested = nestedChildren.map((child) => renderBlock(child, theme, context)).filter(Boolean).join('');
  return `<section style="margin:0 0 12px;padding:0;">
    <p style="${paragraphStyle(theme)}margin-bottom:0;"><span style="display:inline-block;width:34px;color:${theme.palette.accent};font-family:${bodyFont};font-size:13px;font-weight:700;vertical-align:top;">${escapeHtml(marker)}</span><span>${primary}</span></p>
    ${nested ? `<section style="margin:8px 0 0 34px;">${nested}</section>` : ''}
  </section>`;
}

function renderList(node: List, theme: WechatTheme, context: RenderContext): string {
  const start = node.start ?? 1;
  const items = node.children.map((item, index) => {
    const marker = item.checked === true
      ? '✓'
      : item.checked === false
        ? '○'
        : node.ordered
          ? String(start + index).padStart(2, '0')
          : '•';
    return renderListItem(item, theme, context, marker);
  }).join('');

  return `<section style="margin:20px 0 24px;">${items}</section>`;
}

function renderQuote(node: Blockquote, theme: WechatTheme, context: RenderContext): string {
  const content = node.children.map((child) => renderBlock(child, theme, context)).filter(Boolean).join('');
  return `<section style="margin:28px 0;padding:18px 18px 4px;background-color:${theme.palette.soft};border-top:1px solid ${theme.palette.line};border-bottom:1px solid ${theme.palette.line};">
    <p style="margin:0 0 10px;color:${theme.palette.accent};font-family:${bodyFont};font-size:10px;font-weight:700;letter-spacing:0.16em;">${escapeHtml(theme.rules.quoteLabel)}</p>
    <section style="color:${theme.palette.ink};font-family:${displayFont};font-size:17px;line-height:1.8;">${content}</section>
  </section>`;
}

function renderTable(node: Table, theme: WechatTheme, context: RenderContext): string {
  const rows = node.children.map((row, rowIndex) => {
    const cells = row.children.map((cell) => {
      const content = renderPhrasing(cell.children, theme, context);
      return `<td style="padding:10px 8px;border-bottom:1px solid ${theme.palette.line};color:${theme.palette.ink};font-family:${bodyFont};font-size:13px;line-height:1.6;${rowIndex === 0 ? `background-color:${theme.palette.soft};font-weight:700;` : ''}">${content}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `<section style="margin:24px 0;overflow-x:auto;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;">${rows}</table></section>`;
}

function renderBlock(node: RootContent, theme: WechatTheme, context: RenderContext): string {
  switch (node.type) {
    case 'paragraph':
      return renderParagraph(node, theme, context);
    case 'heading':
      return renderHeading(node, theme, context);
    case 'list':
      return renderList(node, theme, context);
    case 'blockquote':
      return renderQuote(node, theme, context);
    case 'thematicBreak':
      return `<p style="margin:34px 0;color:${theme.palette.accent};font-family:${displayFont};font-size:18px;letter-spacing:0.45em;text-align:center;">${escapeHtml(theme.rules.divider)}</p>`;
    case 'code': {
      const language = node.lang ? `CODE / ${node.lang.toUpperCase()}` : 'CODE';
      return `<section style="margin:24px 0;">
        <p style="margin:0 0 8px;color:${theme.palette.accent};font-family:${bodyFont};font-size:10px;font-weight:700;letter-spacing:0.14em;">${escapeHtml(language)}</p>
        <pre style="margin:0;padding:16px 18px;border-radius:4px;background-color:${theme.palette.codeBackground};color:${theme.palette.codeText};font-family:Menlo,Consolas,monospace;font-size:13px;line-height:1.75;white-space:pre-wrap;word-break:break-all;"><code>${escapeHtml(node.value.trim())}</code></pre>
      </section>`;
    }
    case 'table':
      return renderTable(node, theme, context);
    case 'html':
      context.sawRawHtml = true;
      return '';
    default:
      return '';
  }
}

function plainPhrasing(children: readonly PhrasingContent[]): string {
  return children.map((node) => {
    switch (node.type) {
      case 'text':
      case 'inlineCode':
        return node.value;
      case 'strong':
      case 'emphasis':
      case 'delete':
        return plainPhrasing(node.children);
      case 'break':
        return '\n';
      case 'link': {
        const label = plainPhrasing(node.children).trim();
        return label && label !== node.url ? `${label}（${node.url}）` : node.url;
      }
      case 'image':
        return node.alt ? `［图片：${node.alt}］` : '［图片］';
      case 'footnoteReference':
        return `［${node.identifier}］`;
      default:
        return '';
    }
  }).join('');
}

function plainBlock(node: RootContent): string {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return plainPhrasing(node.children).trim();
    case 'list': {
      const start = node.start ?? 1;
      return node.children.map((item, index) => {
        const marker = item.checked === true
          ? '✓'
          : item.checked === false
            ? '○'
            : node.ordered
              ? `${start + index}.`
              : '•';
        const body = item.children.map((child) => plainBlock(child)).filter(Boolean).join('\n  ');
        return `${marker} ${body}`;
      }).join('\n');
    }
    case 'blockquote':
      return node.children.map((child) => plainBlock(child)).filter(Boolean).join('\n').split('\n').map((line) => `> ${line}`).join('\n');
    case 'thematicBreak':
      return '· · ·';
    case 'code':
      return node.value.trim();
    case 'table':
      return node.children.map((row) => row.children.map((cell) => plainPhrasing(cell.children).trim()).join('｜')).join('\n');
    case 'html':
      return '';
    default:
      return '';
  }
}

function containsRawHtml(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const candidate = node as { type?: unknown; children?: unknown };
  if (candidate.type === 'html') return true;
  return Array.isArray(candidate.children) && candidate.children.some(containsRawHtml);
}

export function renderWechat(document: ContentDocument, theme: WechatTheme): WechatRenderResult {
  const context: RenderContext = {
    headingIndex: 0,
    headings: 0,
    paragraphs: 0,
    sawRawHtml: containsRawHtml(document.ast),
    sawImage: false,
    blockedLinks: 0,
  };
  const blocks = document.ast.children.map((node) => renderBlock(node, theme, context)).filter(Boolean);
  const plainText = document.ast.children
    .map(plainBlock)
    .filter(Boolean)
    .join('\n\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  const html = plainText
    ? `<section data-zhijian-theme="${escapeHtml(theme.id)}" style="box-sizing:border-box;margin:0;padding:28px 22px 34px;background-color:${theme.palette.paper};color:${theme.palette.ink};font-family:${bodyFont};font-size:16px;line-height:1.9;word-break:break-word;">${blocks.join('')}</section>`
    : '';
  const warnings: WechatRenderWarning[] = [];

  if (!plainText) {
    warnings.push({ code: 'empty', severity: 'info', message: '写一点内容后，这里会显示公众号排版。' });
  }
  if (context.sawRawHtml) {
    warnings.push({ code: 'raw-html', severity: 'warning', message: '原始 HTML 已移除，只输出安全的主题结构。' });
  }
  if (context.sawImage) {
    warnings.push({ code: 'image-placeholder', severity: 'info', message: '图片暂以位置说明保留，粘贴后请在公众号编辑器中插入原图。' });
  }
  if (context.blockedLinks > 0) {
    warnings.push({ code: 'unsafe-link', severity: 'warning', message: '无法识别的链接协议已移除。' });
  }

  return {
    channel: 'wechat',
    html,
    plainText,
    warnings,
    stats: {
      characters: Array.from(plainText).length,
      headings: context.headings,
      paragraphs: context.paragraphs,
      topics: plainText.match(/(?:^|\s)#[^\s#]+/gu)?.length ?? 0,
    },
  };
}
