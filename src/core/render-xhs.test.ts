import { describe, expect, it } from 'vitest';
import { parseDocument } from './document';
import { renderXiaohongshu } from './render-xhs';
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
});
