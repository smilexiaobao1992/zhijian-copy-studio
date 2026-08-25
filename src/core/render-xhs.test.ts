import { describe, expect, it } from 'vitest';
import { parseDocument } from './document';
import { XHS_CHARACTER_LIMIT, renderXiaohongshu } from './render-xhs';
import { getTheme, xhsThemes } from './themes';

describe('renderXiaohongshu', () => {
  it('renders headings, lists, quotes, emphasis and topics as plain text', () => {
    const document = parseDocument(`# 安装方法

这是 **非常重要** 的一步。

1. 下载
2. 安装

> 发布前检查

#工具`);
    const result = renderXiaohongshu(document, getTheme('signal-tech'));

    expect(result.plainText).toContain('▌ 安装方法');
    expect(result.plainText).toContain('这是【非常重要】的一步。');
    expect(result.plainText).toContain('❶ 下载');
    expect(result.plainText).toContain('⌁ 提示｜发布前检查');
    expect(result.stats.topics).toBe(1);
    expect(result.sections.title).toBe('安装方法');
    expect(result.sections.body).toContain('这是【非常重要】的一步。');
    expect(result.sections.topics).toBe('#工具');
  });

  it('separates a plain first-line title, body and trailing topics for publishing', () => {
    const document = parseDocument('普通标题\n正文第一段。\n正文第二段。\n#历史 #职场');
    const result = renderXiaohongshu(document, getTheme('clear-note'));

    expect(result.sections).toEqual({
      title: '普通标题',
      body: '正文第一段。\n正文第二段。',
      topics: '#历史 #职场',
    });
  });

  it('reports dense visual-heading copy as organizable', () => {
    const document = parseDocument('标题  ▪️ 小标题  ' + '很长的正文。'.repeat(40));
    const result = renderXiaohongshu(document, getTheme('clear-note'));

    expect(result.analysis.canOrganize).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toContain('dense-copy');
    expect(result.warnings.map((warning) => warning.code)).toContain('unstructured-copy');
  });

  it('reports the exact amount above the 1000-character publishing limit', () => {
    const result = renderXiaohongshu(
      parseDocument('字'.repeat(XHS_CHARACTER_LIMIT + 1)),
      getTheme('clear-note'),
    );

    expect(result.stats.characters).toBe(XHS_CHARACTER_LIMIT + 1);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: 'long-copy',
      severity: 'warning',
      message: expect.stringContaining('精简 1 字'),
    }));
  });

  it('extracts a labelled topic tail from the end of a body paragraph', () => {
    const document = parseDocument('# 标题\n\n正文内容。  🏷️ 标签：#历史 #职场');
    const result = renderXiaohongshu(document, getTheme('clear-note'));

    expect(result.sections.body).toBe('正文内容。');
    expect(result.sections.topics).toBe('#历史 #职场');
  });

  it('only treats a greater-than sign followed by whitespace as a quote', () => {
    const source = '> 正式引用\n\n>100 元\n\n>> 连续符号\n\nA > B\n\n## 后续标题';
    const document = parseDocument(source);
    const result = renderXiaohongshu(document, getTheme('clear-note'));
    const heading = document.ast.children.at(-1);

    expect(result.plainText).toContain('摘录｜正式引用');
    expect(result.plainText).toContain('>100 元');
    expect(result.plainText).toContain('>> 连续符号');
    expect(result.plainText).toContain('A > B');
    expect(result.plainText).not.toContain('摘录｜摘录｜');
    expect(heading?.type).toBe('heading');
    expect(heading?.position?.start.offset).toBe(source.indexOf('## 后续标题'));
  });

  it('keeps copied titles semantic and independent from theme decoration', () => {
    const document = parseDocument('## **标题**\n\n正文。');

    expect(renderXiaohongshu(document, getTheme('clear-note')).sections.title).toBe('标题');
    expect(renderXiaohongshu(document, getTheme('signal-tech')).sections.title).toBe('标题');
  });

  it('does not infer a title from a list-only draft', () => {
    const result = renderXiaohongshu(parseDocument('- 第一项\n- 第二项'), getTheme('clear-note'));

    expect(result.sections.title).toBe('');
    expect(result.sections.body).toContain('• 第一项');
  });

  it('uses a different output fingerprint for every bundled theme', () => {
    const document = parseDocument('## 标题\n\n1. 第一步\n2. 第二步');
    const outputs = xhsThemes.map((theme) => renderXiaohongshu(document, theme).plainText);

    expect(new Set(outputs).size).toBe(xhsThemes.length);
  });

  it('drops raw HTML styling, preserves its text and reports the limitation', () => {
    const document = parseDocument('<span style="color:red">红色</span>');
    const result = renderXiaohongshu(document, getTheme('clear-note'));

    expect(result.plainText).toBe('红色');
    expect(result.warnings.map((warning) => warning.code)).toContain('raw-html');
  });

  it('preserves intentional blank lines without producing three in a row', () => {
    const document = parseDocument('第一段\n\n\n\n第二段');
    const result = renderXiaohongshu(document, getTheme('clear-note'));

    expect(result.plainText).toBe('第一段\n\n第二段');
    expect(result.plainText).not.toContain('\n\n\n');
  });

  it('renders task lists, tables, links, images and code blocks as readable text', () => {
    const document = parseDocument(`- [x] 已完成
- [ ] 待处理

[项目主页](https://example.com)和![封面](cover.png)

| 名称 | 状态 |
| --- | --- |
| 纸间 | 开源 |

\`\`\`sh
npm run build
\`\`\``);
    const result = renderXiaohongshu(document, getTheme('clear-note'));

    expect(result.plainText).toContain('☑ 已完成');
    expect(result.plainText).toContain('☐ 待处理');
    expect(result.plainText).toContain('项目主页（https://example.com）和［图片：封面］');
    expect(result.plainText).toContain('名称｜状态\n纸间｜开源');
    expect(result.plainText).toContain('命令｜\nnpm run build');
  });

  it('resolves reference links and images and renders footnote definitions', () => {
    const document = parseDocument(`参考[项目主页][site]、[帮助中心][]和[直接入口]。

![封面图][cover]

正文带脚注[^note]。

[site]: https://example.com/project
[帮助中心]: https://example.com/help
[直接入口]: https://example.com/start
[cover]: https://example.com/cover.jpg
[^note]: 这是脚注正文。`);
    const result = renderXiaohongshu(document, getTheme('clear-note'));

    expect(result.plainText).toContain('项目主页（https://example.com/project）');
    expect(result.plainText).toContain('帮助中心（https://example.com/help）');
    expect(result.plainText).toContain('直接入口（https://example.com/start）');
    expect(result.plainText).toContain('［图片：封面图］');
    expect(result.plainText).toContain('正文带脚注［note］。');
    expect(result.plainText).toContain('［note］ 这是脚注正文。');
    expect(result.plainText).not.toContain('[site]:');
  });

  it('keeps leading footnote definitions out of article title and stats', () => {
    const document = parseDocument('[^note]: 前置脚注。\n\n# 主标题\n\n正文[^note]。');
    const result = renderXiaohongshu(document, getTheme('clear-note'));

    expect(result.sections.title).toBe('主标题');
    expect(result.plainText.indexOf('01｜主标题')).toBeLessThan(result.plainText.indexOf('［note］ 前置脚注。'));
    expect(result.stats.headings).toBe(1);
    expect(result.stats.paragraphs).toBe(1);
  });

  it('outputs only referenced footnotes in first-reference order', () => {
    const document = parseDocument(`正文[^second][^first]。

[^first]: 第一条。
[^unused]: 内部备注。
[^second]: 第二条。`);
    const result = renderXiaohongshu(document, getTheme('clear-note'));

    expect(result.plainText).not.toContain('内部备注');
    expect(result.plainText.indexOf('［second］ 第二条。')).toBeLessThan(result.plainText.indexOf('［first］ 第一条。'));
  });
});
