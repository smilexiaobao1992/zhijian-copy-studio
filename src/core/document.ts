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

export function parseDocument(source: string): ContentDocument {
  return {
    schemaVersion: 1,
    source,
    ast: parser.parse(source),
  };
}
