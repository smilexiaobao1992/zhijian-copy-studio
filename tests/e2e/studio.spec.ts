import { expect, test } from '@playwright/test';

test('landing page shows the live formatting sample in the first viewport', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', {
    name: '把一份文案，排成读者愿意停下来的样子。',
  })).toBeVisible();
  const demo = page.getByLabel('排版转换示例');
  await expect(demo).toBeVisible();
  await expect(demo.getByText('适合复制发布')).toBeVisible();

  const [box, viewport] = await Promise.all([demo.boundingBox(), page.viewportSize()]);
  expect(box?.y).toBeLessThan(viewport?.height ?? 0);
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )).toBe(0);
});

test('formats Markdown and switches themes', async ({ page }, testInfo) => {
  await page.goto('/studio/');
  const editor = page.getByLabel('输入文案');
  await expect(editor).toBeVisible();

  await editor.fill('## 安装方法\n\n1. 下载\n2. 登录');
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: '预览', exact: true }).click();
  }
  await expect(page.getByLabel('排版后的正文')).toContainText('安装方法');

  await page.getByRole('button', {
    name: testInfo.project.name === 'mobile' ? '主题' : '主题 · 清简',
    exact: true,
  }).click();
  await page.getByRole('button', { name: /信号/ }).click();
  await expect(page.getByLabel('排版后的正文')).toContainText('▌ 安装方法');
});

test('organizes dense Xiaohongshu copy and copies publishing sections separately', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/studio/');
  const editor = page.getByLabel('输入文案');
  const original = '辞职到底有多难  开头先说结论。  ▪️ 夹在两位老板之间  这是正文。  🏷️ 标签：#职场 #历史';

  await editor.fill(original);
  await expect(page.getByText(/建议先整理结构|转换成主题结构|正文没有留白/)).toBeVisible();
  await page.getByRole('button', { name: '整理结构' }).click();
  await expect(editor).toHaveValue(/# 辞职到底有多难[\s\S]+## 夹在两位老板之间/);
  await expect(page.getByRole('button', { name: '结构已清楚' })).toBeDisabled();

  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: '预览', exact: true }).click();
  }
  await page.getByRole('button', { name: '复制标题' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('辞职到底有多难');
  await expect(page.getByRole('button', { name: '已复制标题' })).toBeVisible();

  if (testInfo.project.name === 'mobile') {
    await page.getByLabel('移动端工作区切换').getByRole('button', { name: '编辑', exact: true }).click();
  }
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(editor).toHaveValue(original);
});

test('switches to the editorial WeChat renderer', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only channel detail');
  await page.goto('/studio/');

  await page.getByRole('button', { name: '公众号', exact: true }).click();
  await expect(page.getByRole('heading', { name: '微信公众号富文本' })).toBeVisible();
  await expect(page.getByLabel('排版后的公众号文章')).toContainText('FEATURE / 01');
  await expect(page.getByRole('button', { name: '复制公众号富文本' })).toBeVisible();
  await page.getByRole('button', { name: '样式 · 经典手记' }).click();
  await expect(page.getByRole('heading', { name: '公众号样式工坊' })).toBeVisible();

  await page.getByRole('button', { name: /雅致长文/ }).click();
  await expect(page.getByText('雅致长文', { exact: true }).last()).toBeVisible();
  await expect(page.locator('[data-zhijian-heading="underline"]')).toBeVisible();
  await expect.poll(() => page.locator('[data-zhijian-heading="underline"] > p').last().evaluate(
    (element) => getComputedStyle(element).fontSize,
  )).toBe('17px');

  await page.getByRole('button', { name: '经典蓝' }).click();
  await expect.poll(() => page.locator('[data-zhijian-heading="underline"] > section > p').first().evaluate(
    (element) => getComputedStyle(element).color,
  )).toBe('rgb(24, 86, 135)');
});

test('mobile view can switch from editor to preview', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-only behavior');
  await page.goto('/studio/');
  await page.getByRole('button', { name: '公众号', exact: true }).click();
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(page.getByRole('heading', { name: '微信公众号富文本' })).toBeVisible();
  await expect(page.getByRole('button', { name: '复制公众号富文本' })).toBeVisible();

  await page.getByRole('button', { name: '主题', exact: true }).click();
  await expect(page.getByRole('heading', { name: '公众号样式工坊' })).toBeVisible();
  await page.getByRole('button', { name: '浅色纸面' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: '浅色纸面' })).toBeVisible();
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )).toBe(0);
});

test('compact window switches between editor and preview without horizontal overflow', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only compact layout');
  await page.setViewportSize({ width: 600, height: 760 });
  await page.goto('/studio/');

  await expect(page.getByRole('heading', { name: 'Markdown 编辑器' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '小红书纯文本' })).toBeHidden();
  await expect(page.getByLabel('移动端工作区切换')).toBeVisible();
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(page.getByRole('heading', { name: '小红书纯文本' })).toBeVisible();
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )).toBe(0);
});
