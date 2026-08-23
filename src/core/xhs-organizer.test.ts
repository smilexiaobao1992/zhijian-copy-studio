import { describe, expect, it } from 'vitest';
import { analyzeXhsSource, organizeXhsSource } from './xhs-organizer';

describe('xhs organizer', () => {
  it('detects dense unstructured copy and converts visual markers into Markdown', () => {
    const source = '离职这件事有多难  先说结论。  ▪️ 夹在两位老板之间  这是第一段。  💡 冷知识  这是第二段。  🏷️ 标签：#职场 #历史';
    const analysis = analyzeXhsSource(source);
    const result = organizeXhsSource(source);

    expect(analysis.canOrganize).toBe(true);
    expect(result.source).toContain('# 离职这件事有多难');
    expect(result.source).toContain('## 夹在两位老板之间');
    expect(result.source).toContain('## 冷知识');
    expect(result.source).toContain('#职场 #历史');
    expect(result.summary).toContain('3 个标题');
  });

  it('keeps already structured Markdown unchanged', () => {
    const source = '# 标题\n\n## 小标题\n\n一段正文。';
    const result = organizeXhsSource(source);

    expect(result.changed).toBe(false);
    expect(result.source).toBe(source);
  });

  it('does not suggest organizing a short title-only draft', () => {
    expect(analyzeXhsSource('# 一个标题').canOrganize).toBe(false);
  });

  it('splits a long paragraph at sentence boundaries', () => {
    const paragraph = '这是一句很长的测试内容。'.repeat(18);
    const result = organizeXhsSource(`一个标题  ${paragraph}`);

    expect(result.source.split('\n\n').length).toBeGreaterThan(2);
    expect(result.source).not.toContain('。\n\n。');
  });

  it('does not rewrite drafts containing Markdown structures that depend on line continuity', () => {
    const longParagraph = '这是需要保留的长段落。'.repeat(24);
    const sources = [
      `标题\n\n- 一级列表\n  - 二级列表\n\n${longParagraph}`,
      `标题\n\n> 引用内容\n\n${longParagraph}`,
      `标题\n\n| 项目 | 数值 |\n| --- | --- |\n| A | 1 |\n\n${longParagraph}`,
      `标题\n\n\`\`\`ts\nconst value = 1;\n\`\`\`\n\n${longParagraph}`,
    ];

    for (const source of sources) {
      const analysis = analyzeXhsSource(source);
      const result = organizeXhsSource(source);
      expect(analysis.hasProtectedStructure).toBe(true);
      expect(analysis.canOrganize).toBe(false);
      expect(result.changed).toBe(false);
      expect(result.source).toBe(source);
    }
  });
});
