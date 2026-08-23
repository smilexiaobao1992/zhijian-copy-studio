import type { Definition, FootnoteDefinition, Root } from 'mdast';

export type MarkdownDefinition = Pick<Definition, 'url' | 'title'>;
export type MarkdownFootnote = Pick<FootnoteDefinition, 'identifier' | 'children'>;

export interface MarkdownReferenceIndex {
  definitions: ReadonlyMap<string, MarkdownDefinition>;
  footnotes: readonly MarkdownFootnote[];
}

export function normalizeReferenceIdentifier(identifier: string): string {
  return identifier.trim().replace(/\s+/gu, ' ').toLowerCase();
}

export function collectMarkdownReferences(root: Root): MarkdownReferenceIndex {
  const definitions = new Map<string, MarkdownDefinition>();
  const footnoteDefinitions = new Map<string, MarkdownFootnote>();

  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const candidate = node as {
      type?: unknown;
      identifier?: unknown;
      url?: unknown;
      title?: unknown;
      children?: unknown;
    };

    if (
      candidate.type === 'definition'
      && typeof candidate.identifier === 'string'
      && typeof candidate.url === 'string'
    ) {
      const identifier = normalizeReferenceIdentifier(candidate.identifier);
      if (!definitions.has(identifier)) {
        definitions.set(identifier, {
          url: candidate.url,
          title: typeof candidate.title === 'string' ? candidate.title : null,
        });
      }
    }

    if (
      candidate.type === 'footnoteDefinition'
      && typeof candidate.identifier === 'string'
      && Array.isArray(candidate.children)
    ) {
      const identifier = normalizeReferenceIdentifier(candidate.identifier);
      if (!footnoteDefinitions.has(identifier)) {
        footnoteDefinitions.set(identifier, candidate as MarkdownFootnote);
      }
    }

    if (Array.isArray(candidate.children)) candidate.children.forEach(visit);
  }

  visit(root);

  const referencedFootnotes: string[] = [];
  const seenFootnotes = new Set<string>();

  function collectFootnoteReferences(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const candidate = node as { type?: unknown; identifier?: unknown; children?: unknown };
    if (candidate.type === 'footnoteDefinition') return;
    if (candidate.type === 'footnoteReference' && typeof candidate.identifier === 'string') {
      const identifier = normalizeReferenceIdentifier(candidate.identifier);
      if (!seenFootnotes.has(identifier)) {
        seenFootnotes.add(identifier);
        referencedFootnotes.push(identifier);
      }
    }
    if (Array.isArray(candidate.children)) candidate.children.forEach(collectFootnoteReferences);
  }

  collectFootnoteReferences(root);
  for (let index = 0; index < referencedFootnotes.length; index += 1) {
    const footnote = footnoteDefinitions.get(referencedFootnotes[index]!);
    footnote?.children.forEach(collectFootnoteReferences);
  }

  return {
    definitions,
    footnotes: referencedFootnotes
      .map((identifier) => footnoteDefinitions.get(identifier))
      .filter((footnote): footnote is MarkdownFootnote => Boolean(footnote)),
  };
}
