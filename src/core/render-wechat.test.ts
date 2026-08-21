import { describe, expect, it } from 'vitest';
import { parseDocument } from './document';
import { renderWechat } from './render-wechat';
import { wechatThemeSchema } from './wechat-theme-schema';
import { getWechatTheme } from './wechat-themes';

describe('renderWechat', () => {
  it('renders editorial headings, emphasis, quotes, lists, tables and code as inline-styled HTML', () => {
    const document = parseDocument(`# 一份值得读完的文章

这是 **真正重要** 的内容。

> 写作先照顾读者，再照顾形式。

1. 梳理观点
2. 删除重复

| 阶段 | 结果 |
| --- | --- |
| 初稿 | 可编辑 |

\`\`\`sh
npm run build
\`\`\``);
    const result = renderWechat(document, getWechatTheme('editorial-notes'));

    expect(result.html).toContain('data-zhijian-theme="editorial-notes"');
    expect(result.html).toContain("font-family:-apple-system, BlinkMacSystemFont, 'PingFang SC'");
    expect(result.html).toContain('FEATURE / 01');
    expect(result.html).toContain('编者按');
    expect(result.html).toContain('真正重要');
    expect(result.html).toContain('<table');
    expect(result.html).toContain('CODE / SH');
    expect(result.plainText).toContain('1. 梳理观点');
    expect(result.stats.headings).toBe(1);
  });

  it('escapes user text, removes raw HTML and blocks unsafe link protocols', () => {
    const document = parseDocument('<script>alert("bad")</script>\n\n[打开](javascript:alert(1))\n\n普通 < 文本');
    const result = renderWechat(document, getWechatTheme('editorial-notes'));

    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('javascript:');
    expect(result.html).toContain('普通 &lt; 文本');
    expect(result.warnings.map((warning) => warning.code)).toContain('raw-html');
    expect(result.warnings.map((warning) => warning.code)).toContain('unsafe-link');
  });

  it('keeps images local-first by rendering a styled insertion placeholder', () => {
    const document = parseDocument('![产品细节](https://example.com/product.jpg)');
    const result = renderWechat(document, getWechatTheme('editorial-notes'));

    expect(result.html).toContain('图｜产品细节');
    expect(result.html).not.toContain('<img');
    expect(result.warnings.map((warning) => warning.code)).toContain('image-placeholder');
  });

  it('rejects theme colors that could inject arbitrary inline CSS', () => {
    const theme = getWechatTheme('editorial-notes');

    expect(() => wechatThemeSchema.parse({
      ...theme,
      palette: { ...theme.palette, accent: 'red;position:fixed' },
    })).toThrow();
  });
});
