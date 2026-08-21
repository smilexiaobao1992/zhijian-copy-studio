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

test('formats Markdown and switches themes', async ({ page }) => {
  await page.goto('/studio/');
  const editor = page.getByLabel('输入文案');
  await expect(editor).toBeVisible();

  await editor.fill('## 安装方法\n\n1. 下载\n2. 登录');
  await expect(page.getByLabel('排版后的正文')).toContainText('安装方法');

  await page.getByRole('button', { name: '主题 · 清简' }).click();
  await page.getByRole('button', { name: /信号/ }).click();
  await expect(page.getByLabel('排版后的正文')).toContainText('▌ 安装方法');
});

test('mobile view can switch from editor to preview', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile-only behavior');
  await page.goto('/studio/');
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(page.getByRole('heading', { name: '小红书纯文本' })).toBeVisible();
  await expect(page.getByRole('button', { name: '复制小红书正文' })).toBeVisible();
});

test('compact window keeps editor and preview side by side', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only compact layout');
  await page.setViewportSize({ width: 600, height: 760 });
  await page.goto('/studio/');

  await expect(page.getByRole('heading', { name: 'Markdown 编辑器' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '小红书纯文本' })).toBeVisible();
  await expect(page.getByLabel('移动端工作区切换')).toBeHidden();
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )).toBe(0);
});
