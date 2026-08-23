export interface XhsStructureAnalysis {
  characters: number;
  blankLines: number;
  markdownHeadings: number;
  visualHeadings: number;
  denseBlocks: number;
  topics: number;
  hasProtectedStructure: boolean;
  canOrganize: boolean;
  message: string;
}

export interface XhsOrganizeResult {
  source: string;
  changed: boolean;
  summary: string;
  headings: number;
  paragraphs: number;
}

const visualHeadingPattern = /(?:^|\s)(?:▪️?|💡|📌)\s*\S/gu;
const topicPattern = /(?:^|\s)#[^\s#]+/gu;
const protectedMarkdownPattern = /^(?:[ \t]{0,3}(?:>\s|[-*+]\s+|\d+[.)]\s+|```|~~~|<\/?[a-z])|(?: {4}|\t)\S|[ \t]*\|?.*\|.*|[ \t]*\|?[ :]*-{3,})/imu;

function splitLongParagraph(value: string, limit = 150): string[] {
  if (Array.from(value).length <= limit) return [value];

  const sentences = value.match(/[^。！？!?]+[。！？!?]?/gu)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [value];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current ? `${current}${sentence}` : sentence;
    if (current && Array.from(candidate).length > limit) {
      chunks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function explodeSource(source: string): string[] {
  return source
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]{2,}(?=(?:▪️?|💡|📌|📖|🏷️))/gu, '\n')
    .split('\n')
    .flatMap((line) => line.split(/[ \t]{2,}/gu))
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function stripTopicLabel(value: string): string {
  return value
    .replace(/^🏷️\s*/u, '')
    .replace(/^(?:标签|话题)\s*[：:]\s*/u, '')
    .trim();
}

export function analyzeXhsSource(source: string): XhsStructureAnalysis {
  const normalized = source.replace(/\r\n?/gu, '\n').trim();
  const blocks = normalized ? normalized.split(/\n\s*\n/gu).map((block) => block.trim()).filter(Boolean) : [];
  const blankLines = normalized.match(/\n\s*\n/gu)?.length ?? 0;
  const markdownHeadings = normalized.match(/^#{1,6}\s+\S/gmu)?.length ?? 0;
  const visualHeadings = normalized.match(visualHeadingPattern)?.length ?? 0;
  const topics = normalized.match(topicPattern)?.length ?? 0;
  const hasProtectedStructure = protectedMarkdownPattern.test(normalized);
  const denseBlocks = blocks.filter((block) => Array.from(block).length > 180).length;
  const lacksParagraphBreaks = blankLines === 0 && Array.from(normalized).length > 120;
  const canOrganize = Boolean(normalized) && !hasProtectedStructure && (
    denseBlocks > 0
    || lacksParagraphBreaks
    || (visualHeadings > 0 && markdownHeadings === 0)
  );

  let message = '结构清楚，可以直接选择主题。';
  if (!normalized) message = '写入文案后，可以检查段落结构。';
  else if (hasProtectedStructure) message = '检测到列表、引用、表格或代码，已保留原有结构。';
  else if (denseBlocks > 0) message = `检测到 ${denseBlocks} 个长段落，建议先整理结构。`;
  else if (visualHeadings > 0 && markdownHeadings === 0) message = '检测到小标题符号，可以转换成主题结构。';
  else if (lacksParagraphBreaks) message = '正文没有留白，建议拆分段落。';

  return {
    characters: Array.from(normalized).length,
    blankLines,
    markdownHeadings,
    visualHeadings,
    denseBlocks,
    topics,
    hasProtectedStructure,
    canOrganize,
    message,
  };
}

export function organizeXhsSource(source: string): XhsOrganizeResult {
  const analysis = analyzeXhsSource(source);
  if (!analysis.canOrganize) {
    return {
      source,
      changed: false,
      summary: analysis.message,
      headings: analysis.markdownHeadings,
      paragraphs: source.split(/\n\s*\n/gu).filter((block) => block.trim()).length,
    };
  }

  const segments = explodeSource(source);
  const organized: string[] = [];
  let headings = 0;
  let paragraphs = 0;

  segments.forEach((segment, index) => {
    if (/^#{1,6}\s+\S/u.test(segment)) {
      organized.push(segment);
      headings += 1;
      return;
    }

    if (/^🏷️/u.test(segment) || /^(?:标签|话题)\s*[：:]/u.test(segment)) {
      const topics = stripTopicLabel(segment).match(/#[^\s#]+/gu)?.join(' ') ?? stripTopicLabel(segment);
      if (topics) organized.push(topics);
      return;
    }

    const visualHeading = segment.match(/^(?:▪️?|💡|📌)\s*(.+)$/u);
    if (visualHeading) {
      organized.push(`## ${visualHeading[1]!.trim()}`);
      headings += 1;
      return;
    }

    if (index === 0 && !/^(?:[-*+]\s|\d+[.)]\s|>\s)/u.test(segment)) {
      organized.push(`# ${segment}`);
      headings += 1;
      return;
    }

    const chunks = splitLongParagraph(segment);
    organized.push(...chunks);
    paragraphs += chunks.length;
  });

  const nextSource = organized.join('\n\n').replace(/\n{3,}/gu, '\n\n').trim();
  return {
    source: nextSource,
    changed: nextSource !== source.trim(),
    summary: `已整理为 ${headings} 个标题、${paragraphs} 个正文段落`,
    headings,
    paragraphs,
  };
}
