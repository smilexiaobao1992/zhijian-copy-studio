import type {
  Blockquote,
  Image,
  ImageReference,
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
import type { WechatTheme } from './wechat-theme-schema';
import {
  defaultWechatStyleConfig,
  wechatStyleConfigSchema,
  type WechatStyleConfig,
} from './wechat-style';

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
  title: string;
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
  definitions: ReadonlyMap<string, MarkdownDefinition>;
  imageSources: ReadonlyMap<string, string>;
  style: ResolvedWechatStyle;
}

export interface WechatRenderAssets {
  imageSources?: ReadonlyMap<string, string>;
}

interface ResolvedWechatStyle {
  bodyFont: string;
  headingFont: string;
  bodySize: number;
  lineHeight: number;
  headingStyle: WechatStyleConfig['headingStyle'];
}

const fontStacks: Record<WechatStyleConfig['fontFamily'], string> = {
  sans: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  serif: "'Songti SC', 'STSong', 'Noto Serif CJK SC', 'SimSun', serif",
  mono: "'SFMono-Regular', 'Cascadia Code', 'Menlo', 'PingFang SC', monospace",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

// Blends a validated #rrggbb color toward white so tinted blocks stay plain hex for WeChat.
function tintColor(hex: string, ratio: number): string {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return `#${channels
    .map((channel) => Math.round(255 - (255 - channel) * ratio).toString(16).padStart(2, '0'))
    .join('')}`;
}

function renderMarkedText(value: string, accentColor: string): string {
  const pattern = /==([^=\n]+)==/gu;
  let output = '';
  let offset = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    output += escapeHtml(value.slice(offset, index));
    output += `<span data-zhijian-mark="underline" style="padding-bottom:3px;border-bottom:3px solid ${accentColor};">${escapeHtml(match[1] ?? '')}</span>`;
    offset = index + match[0].length;
  }

  return output + escapeHtml(value.slice(offset));
}

function stripMarkedText(value: string): string {
  return value.replace(/==([^=\n]+)==/gu, '$1');
}

function isSafeHtmlBreak(value: string): boolean {
  return /^<br\s*\/?\s*>$/iu.test(value.trim());
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
      return renderMarkedText(node.value, palette.accent);
    case 'strong':
      return context.style.headingStyle === 'underline'
        ? `<strong style="color:${palette.ink};font-weight:700;">${renderPhrasing(node.children, theme, context)}</strong>`
        : `<strong style="color:${palette.accent};font-weight:700;">${renderPhrasing(node.children, theme, context)}</strong>`;
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
    case 'linkReference': {
      const label = renderPhrasing(node.children, theme, context) || escapeHtml(node.label ?? node.identifier);
      const definition = context.definitions.get(normalizeReferenceIdentifier(node.identifier));
      return definition ? renderLinkedLabel(label, definition.url, theme, context) : label;
    }
    case 'image':
    case 'imageReference':
      return renderImage(node, theme, context, false);
    case 'footnoteReference':
      return `<sup style="color:${palette.accent};font-size:0.72em;">［${escapeHtml(node.identifier)}］</sup>`;
    case 'html':
      return isSafeHtmlBreak(node.value) ? '<br />' : '';
    default:
      return '';
  }
}

function resolveImageUrl(node: Image | ImageReference, context: RenderContext): string | null {
  if (node.type === 'image') return node.url;
  return context.definitions.get(normalizeReferenceIdentifier(node.identifier))?.url ?? null;
}

function safeImageDataUrl(value: string | undefined): string | null {
  if (!value) return null;
  return /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+=*$/iu.test(value) ? value : null;
}

function renderImage(
  node: Image | ImageReference,
  theme: WechatTheme,
  context: RenderContext,
  block: boolean,
): string {
  const imageUrl = resolveImageUrl(node, context);
  const dataUrl = imageUrl ? safeImageDataUrl(context.imageSources.get(imageUrl)) : null;
  if (!dataUrl) return renderImagePlaceholder(node.alt, theme.palette, context);

  const alt = node.alt?.trim() || '正文图片';
  if (!block) {
    return `<img data-zhijian-image="local" src="${escapeHtml(dataUrl)}" alt="${escapeHtml(alt)}" style="display:inline-block;max-width:100%;height:auto;margin:0 4px;vertical-align:middle;" />`;
  }

  return `<section data-zhijian-image="local" style="margin:24px 0;text-align:center;">
    <img src="${escapeHtml(dataUrl)}" alt="${escapeHtml(alt)}" style="display:block;width:100%;max-width:100%;height:auto;margin:0 auto;border-radius:4px;" />
    ${node.alt ? `<p style="margin:8px 0 0;color:${theme.palette.muted};font-family:${context.style.bodyFont};font-size:12px;line-height:1.6;letter-spacing:0.04em;text-align:center;">${escapeHtml(node.alt)}</p>` : ''}
  </section>`;
}

function renderImagePlaceholder(
  alt: string | null | undefined,
  palette: WechatTheme['palette'],
  context: RenderContext,
): string {
  context.sawImage = true;
  const label = alt ? `图｜${alt}` : '图｜图片位置';
  return `<span style="display:block;margin:22px 0;padding:14px 16px;background-color:${palette.soft};color:${palette.muted};font-size:13px;text-align:center;letter-spacing:0.08em;">${escapeHtml(label)}</span>`;
}

function renderLinkedLabel(
  label: string,
  requestedUrl: string,
  theme: WechatTheme,
  context: RenderContext,
): string {
  const url = safeLinkUrl(requestedUrl);
  if (!url) {
    context.blockedLinks += 1;
    return label;
  }

  return `<a href="${escapeHtml(url)}" style="color:${theme.palette.accent};text-decoration:underline;text-decoration-color:${theme.palette.line};text-underline-offset:3px;">${label}</a>`;
}

function renderLink(node: Link, theme: WechatTheme, context: RenderContext): string {
  const label = renderPhrasing(node.children, theme, context) || escapeHtml(node.url);
  return renderLinkedLabel(label, node.url, theme, context);
}

function paragraphStyle(theme: WechatTheme, context: RenderContext): string {
  return `margin:0 0 ${context.style.lineHeight >= 2 ? 20 : 18}px;color:${theme.palette.ink};font-family:${context.style.bodyFont};font-size:${context.style.bodySize}px;line-height:${context.style.lineHeight};letter-spacing:0.02em;text-align:justify;text-justify:inter-ideograph;word-break:break-word;`;
}

function renderParagraph(
  node: Paragraph,
  theme: WechatTheme,
  context: RenderContext,
): string {
  context.paragraphs += 1;
  const standaloneImage = node.children.length === 1
    && (node.children[0]?.type === 'image' || node.children[0]?.type === 'imageReference')
    ? node.children[0]
    : null;
  if (standaloneImage) return renderImage(standaloneImage, theme, context, true);
  return `<p style="${paragraphStyle(theme, context)}">${renderPhrasing(node.children, theme, context)}</p>`;
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
  const fontSize = node.depth === 1 ? 26 : node.depth === 2 ? 21 : node.depth === 3 ? 18 : 16;
  const margin = node.depth === 1
    ? '0 0 30px'
    : node.depth === 2
      ? '32px 0 20px'
      : node.depth === 3
        ? '28px 0 16px'
        : '22px 0 10px';
  const label = node.depth === 1 ? '本期' : theme.rules.headingLabel;
  const headingAlignment = context.style.headingStyle === 'band' && node.depth <= 2 ? 'text-align:center;' : '';
  const heading = `<h${node.depth} style="${headingAlignment}margin:0;color:${theme.palette.ink};font-family:${context.style.headingFont};font-size:${fontSize}px;font-weight:700;line-height:${node.depth <= 2 ? 1.42 : 1.55};letter-spacing:${node.depth === 1 ? '-0.02em' : '0'};">${title}</h${node.depth}>`;

  if (node.depth >= 4) {
    return `<section style="margin:${margin};">${heading}</section>`;
  }

  if (node.depth === 3) {
    if (context.style.headingStyle === 'minimal') {
      return `<section style="margin:${margin};">${heading}</section>`;
    }
    if (context.style.headingStyle === 'underline') {
      return `<section style="margin:${margin};padding-bottom:8px;border-bottom:1px solid ${theme.palette.line};">${heading}</section>`;
    }
    return `<section style="margin:${margin};padding-left:10px;border-left:2px solid ${theme.palette.accent};">${heading}</section>`;
  }

  switch (context.style.headingStyle) {
    case 'side':
      return `<section style="margin:${margin};padding:2px 0 2px 14px;border-left:4px solid ${theme.palette.accent};">
        ${heading}
        <p style="margin:7px 0 0;color:${theme.palette.muted};font-family:${context.style.bodyFont};font-size:11px;font-weight:700;letter-spacing:0.14em;line-height:1.4;">${escapeHtml(label)} / ${index}</p>
      </section>`;
    case 'band':
      return `<section style="margin:${margin};text-align:center;">
        <p style="margin:0 0 12px;text-align:center;line-height:1.4;"><span style="display:inline-block;padding:5px 14px;background-color:${theme.palette.accent};color:#ffffff;font-family:${context.style.bodyFont};font-size:12px;font-weight:700;letter-spacing:0.14em;">${escapeHtml(label)} / ${index}</span></p>
        ${heading}
      </section>`;
    case 'underline':
      return `<section style="margin:${margin};padding-bottom:12px;border-bottom:1px solid ${theme.palette.line};">
        <p style="margin:0 0 8px;color:${theme.palette.accent};font-family:${context.style.bodyFont};font-size:12px;font-weight:700;letter-spacing:0.14em;line-height:1.4;">${escapeHtml(label)} / ${index}</p>
        ${heading}
      </section>`;
    case 'minimal':
      return `<section style="margin:${margin};">
        <p style="margin:0 0 8px;color:${theme.palette.accent};font-family:${context.style.bodyFont};font-size:11px;font-weight:700;letter-spacing:0.16em;line-height:1.4;">● ${String(context.headingIndex).padStart(2, '0')}</p>
        ${heading}
      </section>`;
    case 'card':
      return `<section style="margin:${margin};padding:14px 16px 16px;border-top:3px solid ${theme.palette.accent};background-color:${tintColor(theme.palette.accent, 0.07)};">
        <p style="margin:0 0 6px;color:${theme.palette.accent};font-family:${context.style.bodyFont};font-size:11px;font-weight:700;letter-spacing:0.14em;line-height:1.4;">${escapeHtml(label)} / ${index}</p>
        ${heading}
      </section>`;
    case 'numeral':
      return `<section style="margin:${margin};padding-bottom:14px;border-bottom:1px solid ${theme.palette.line};">
        <p style="margin:0 0 6px;color:${theme.palette.accent};font-family:${context.style.headingFont};font-size:40px;font-weight:700;line-height:1;letter-spacing:-0.02em;">${index}</p>
        ${heading}
      </section>`;
    case 'editorial':
    default:
      return `<section style="margin:${margin};">
        <p style="margin:0 0 8px;color:${theme.palette.accent};font-family:${context.style.bodyFont};font-size:12px;font-weight:700;letter-spacing:0.14em;line-height:1.4;">${escapeHtml(label)} / ${index}</p>
        ${heading}
        <p data-zhijian-divider="short-rule" style="width:32px;height:3px;margin:14px 0 0;overflow:hidden;background-color:${theme.palette.accent};color:${theme.palette.accent};font-size:1px;line-height:3px;">&nbsp;</p>
      </section>`;
  }
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
    <p style="${paragraphStyle(theme, context)}margin-bottom:0;"><span style="display:inline-block;width:34px;color:${theme.palette.accent};font-family:${context.style.bodyFont};font-size:13px;font-weight:700;vertical-align:top;">${escapeHtml(marker)}</span><span>${primary}</span></p>
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
  if (context.style.headingStyle === 'underline') {
    return `<section style="margin:28px 0;padding:17px 2px 1px;border-top:1px solid ${theme.palette.line};border-bottom:1px solid ${theme.palette.line};">
      <p style="margin:0 0 10px;color:${theme.palette.accent};font-family:${context.style.bodyFont};font-size:10px;font-weight:700;letter-spacing:0.16em;">${escapeHtml(theme.rules.quoteLabel)}</p>
      <section style="color:${theme.palette.ink};font-family:${context.style.headingFont};font-size:${context.style.bodySize + 1}px;line-height:${context.style.lineHeight};">${content}</section>
    </section>`;
  }
  return `<section style="margin:26px 0;padding:16px 18px 2px;border-left:3px solid ${theme.palette.accent};background-color:${theme.palette.soft};">
    <p style="margin:0 0 10px;color:${theme.palette.accent};font-family:${context.style.bodyFont};font-size:10px;font-weight:700;letter-spacing:0.16em;">${escapeHtml(theme.rules.quoteLabel)}</p>
    <section style="color:${theme.palette.ink};font-family:${context.style.headingFont};font-size:${context.style.bodySize + 1}px;line-height:${context.style.lineHeight};">${content}</section>
  </section>`;
}

function renderTable(node: Table, theme: WechatTheme, context: RenderContext): string {
  const rows = node.children.map((row, rowIndex) => {
    const cells = row.children.map((cell) => {
      const content = renderPhrasing(cell.children, theme, context);
      return `<td style="padding:10px 8px;border-bottom:1px solid ${theme.palette.line};color:${theme.palette.ink};font-family:${context.style.bodyFont};font-size:13px;line-height:1.6;${rowIndex === 0 ? `background-color:${theme.palette.soft};font-weight:700;` : ''}">${content}</td>`;
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
      return `<p style="margin:34px 0;color:${theme.palette.accent};font-family:${context.style.headingFont};font-size:18px;letter-spacing:0.45em;text-align:center;">${escapeHtml(theme.rules.divider)}</p>`;
    case 'code': {
      const language = node.lang ? `CODE / ${node.lang.toUpperCase()}` : 'CODE';
      return `<section style="margin:24px 0;">
        <p style="margin:0 0 8px;color:${theme.palette.accent};font-family:${context.style.bodyFont};font-size:10px;font-weight:700;letter-spacing:0.14em;">${escapeHtml(language)}</p>
        <pre style="margin:0;padding:16px 18px;border-radius:4px;background-color:${theme.palette.codeBackground};color:${theme.palette.codeText};font-family:Menlo,Consolas,monospace;font-size:13px;line-height:1.75;white-space:pre-wrap;word-break:break-all;"><code>${escapeHtml(node.value.trim())}</code></pre>
      </section>`;
    }
    case 'table':
      return renderTable(node, theme, context);
    case 'footnoteDefinition':
    case 'definition':
      return '';
    case 'html':
      if (isSafeHtmlBreak(node.value)) return '<br />';
      context.sawRawHtml = true;
      return '';
    default:
      return '';
  }
}

function renderFootnote(
  footnote: MarkdownFootnote,
  theme: WechatTheme,
  context: RenderContext,
): string {
  const content = footnote.children.map((child) => renderBlock(child, theme, context)).filter(Boolean).join('');
  return content ? `<section style="margin:24px 0;padding-top:12px;border-top:1px solid ${theme.palette.line};">
    <p style="margin:0 0 8px;color:${theme.palette.accent};font-family:${context.style.bodyFont};font-size:10px;font-weight:700;letter-spacing:0.14em;">注释 / ${escapeHtml(footnote.identifier)}</p>
    ${content}
  </section>` : '';
}

function plainPhrasing(
  children: readonly PhrasingContent[],
  definitions: ReadonlyMap<string, MarkdownDefinition>,
): string {
  return children.map((node) => {
    switch (node.type) {
      case 'text':
        return stripMarkedText(node.value);
      case 'inlineCode':
        return node.value;
      case 'strong':
      case 'emphasis':
      case 'delete':
        return plainPhrasing(node.children, definitions);
      case 'break':
        return '\n';
      case 'link': {
        const label = plainPhrasing(node.children, definitions).trim();
        const url = safeLinkUrl(node.url);
        return url ? label && label !== url ? `${label}（${url}）` : url : label;
      }
      case 'linkReference': {
        const label = plainPhrasing(node.children, definitions).trim();
        const definition = definitions.get(normalizeReferenceIdentifier(node.identifier));
        const url = definition ? safeLinkUrl(definition.url) : null;
        return url ? label && label !== url ? `${label}（${url}）` : url : label;
      }
      case 'image':
      case 'imageReference':
        return node.alt ? `［图片：${node.alt}］` : '［图片］';
      case 'footnoteReference':
        return `［${node.identifier}］`;
      case 'html':
        return isSafeHtmlBreak(node.value) ? '\n' : '';
      default:
        return '';
    }
  }).join('');
}

function plainBlock(
  node: RootContent,
  definitions: ReadonlyMap<string, MarkdownDefinition>,
): string {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
      return plainPhrasing(node.children, definitions).trim();
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
        const body = item.children.map((child) => plainBlock(child, definitions)).filter(Boolean).join('\n  ');
        return `${marker} ${body}`;
      }).join('\n');
    }
    case 'blockquote':
      return node.children.map((child) => plainBlock(child, definitions)).filter(Boolean).join('\n').split('\n').map((line) => `> ${line}`).join('\n');
    case 'thematicBreak':
      return '· · ·';
    case 'code':
      return node.value.trim();
    case 'table':
      return node.children.map((row) => row.children.map((cell) => plainPhrasing(cell.children, definitions).trim()).join('｜')).join('\n');
    case 'footnoteDefinition':
    case 'definition':
      return '';
    case 'html':
      return '';
    default:
      return '';
  }
}

function plainFootnote(
  footnote: MarkdownFootnote,
  definitions: ReadonlyMap<string, MarkdownDefinition>,
): string {
  const content = footnote.children.map((child) => plainBlock(child, definitions)).filter(Boolean).join('\n');
  return content ? `［${footnote.identifier}］ ${content}` : '';
}

function containsUnsafeRawHtml(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const candidate = node as { type?: unknown; value?: unknown; children?: unknown };
  if (candidate.type === 'html') {
    return typeof candidate.value !== 'string' || !isSafeHtmlBreak(candidate.value);
  }
  return Array.isArray(candidate.children) && candidate.children.some(containsUnsafeRawHtml);
}

export function renderWechat(
  document: ContentDocument,
  theme: WechatTheme,
  requestedStyle: WechatStyleConfig = defaultWechatStyleConfig,
  assets: WechatRenderAssets = {},
): WechatRenderResult {
  const styleConfig = wechatStyleConfigSchema.parse(requestedStyle);
  const references = collectMarkdownReferences(document.ast);
  const { definitions } = references;
  const configuredTheme: WechatTheme = {
    ...theme,
    swatch: styleConfig.accentColor,
    palette: {
      ...theme.palette,
      accent: styleConfig.accentColor,
      codeBackground: styleConfig.codeTheme === 'ink' ? theme.palette.codeBackground : theme.palette.soft,
      codeText: styleConfig.codeTheme === 'ink' ? theme.palette.codeText : theme.palette.ink,
    },
  };
  const context: RenderContext = {
    headingIndex: 0,
    headings: 0,
    paragraphs: 0,
    sawRawHtml: containsUnsafeRawHtml(document.ast),
    sawImage: false,
    blockedLinks: 0,
    definitions,
    imageSources: assets.imageSources ?? new Map(),
    style: {
      bodyFont: fontStacks[styleConfig.fontFamily],
      headingFont: fontStacks[styleConfig.fontFamily],
      bodySize: styleConfig.bodySize,
      lineHeight: styleConfig.lineHeight,
      headingStyle: styleConfig.headingStyle,
    },
  };
  const footnoteContext: RenderContext = {
    ...context,
    headingIndex: 0,
    headings: 0,
    paragraphs: 0,
    sawRawHtml: false,
    sawImage: false,
    blockedLinks: 0,
  };
  const contentNodes = document.ast.children
    .filter((node) => node.type !== 'definition' && node.type !== 'footnoteDefinition');
  const titleNode = contentNodes[0]?.type === 'heading' && contentNodes[0].depth === 1
    ? contentNodes[0]
    : null;
  const title = titleNode ? plainPhrasing(titleNode.children, definitions).trim() : '';
  const articleNodes = titleNode ? contentNodes.slice(1) : contentNodes;
  const blocks = articleNodes.map((node) => renderBlock(node, configuredTheme, context)).filter(Boolean);
  const footnoteBlocks = references.footnotes
    .map((footnote) => renderFootnote(footnote, configuredTheme, footnoteContext))
    .filter(Boolean);
  context.sawImage ||= footnoteContext.sawImage;
  context.blockedLinks += footnoteContext.blockedLinks;
  const plainText = [...articleNodes.map((node) => plainBlock(node, definitions)), ...references.footnotes.map(
    (footnote) => plainFootnote(footnote, definitions),
  )]
    .filter(Boolean)
    .join('\n\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  const html = plainText
    ? `<section data-zhijian-theme="${escapeHtml(theme.id)}" data-zhijian-heading="${escapeHtml(styleConfig.headingStyle)}" style="box-sizing:border-box;margin:0;padding:0;color:${configuredTheme.palette.ink};font-family:${context.style.bodyFont};font-size:${styleConfig.bodySize}px;line-height:${styleConfig.lineHeight};word-break:break-word;">${[...blocks, ...footnoteBlocks].join('')}</section>`
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
    title,
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
