import { expect, test } from '@playwright/test';

test('keeps conflicts blocked after further edits and navigation', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'two-tab concurrency');
  const key = 'social-copy-studio:workspace:v2';
  await page.goto('/studio/');
  await page.getByText('已保存到本机', { exact: true }).waitFor();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), key)).not.toBeNull();
  const other = await context.newPage();
  await other.goto('/studio/');
  await Promise.all([
    page.getByLabel('输入文案').fill('# 标签 A'),
    other.getByLabel('输入文案').fill('# 标签 B'),
  ]);
  await expect.poll(async () => Number(await page.getByText('其他标签页有更新', { exact: true }).isVisible())
    + Number(await other.getByText('其他标签页有更新', { exact: true }).isVisible())).toBe(1);
  const saved = await page.evaluate((key) => localStorage.getItem(key), key);
  const conflicted = await page.getByText('其他标签页有更新', { exact: true }).isVisible() ? page : other;
  await conflicted.getByLabel('输入文案').fill('# 冲突后继续写');
  await conflicted.waitForTimeout(600);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(saved);
  await conflicted.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(saved);
  await expect(conflicted.getByLabel('输入文案')).toHaveValue('# 冲突后继续写');
  await expect(conflicted.getByText('其他标签页有更新', { exact: true })).toBeVisible();
  await other.close();
});

test('saves the final paste before immediate reload', async ({ page }) => {
  await page.goto('/studio/');
  await page.getByLabel('输入文案').fill('# 已存稿');
  await expect.poll(() => page.evaluate(() => {
    const value = localStorage.getItem('social-copy-studio:workspace:v2');
    return value ? JSON.parse(value).notes[0].source : '';
  })).toBe('# 已存稿');
  await page.getByLabel('输入文案').fill('# 最后刚粘贴的文章');
  await page.reload();
  await expect(page.getByLabel('输入文案')).toHaveValue('# 最后刚粘贴的文章');
});

test('round-trips its own large Chinese notebook backup', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'backup boundary');
  await page.goto('/studio/');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('social-copy-studio:workspace:v2'))).not.toBeNull();
  await page.evaluate(() => {
    const key = 'social-copy-studio:workspace:v2';
    const workspace = JSON.parse(localStorage.getItem(key)!);
    workspace.notes = Array.from({ length: 180 }, (_, index) => ({
      ...workspace.notes[0], id: `large-note-${index}`, source: '中'.repeat(10_000),
    }));
    workspace.activeNoteId = workspace.notes[0].id;
    workspace.revision += 1;
    const value = JSON.stringify(workspace);
    localStorage.setItem(key, value);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));
  });
  await page.reload();
  await page.getByRole('button', { name: '笔记', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const download = await downloadPromise;
  await page.locator('input[accept="application/json,.json"]').setInputFiles((await download.path())!);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '用备份中的 180 条笔记替换当前内容？' })).toBeVisible();
  await dialog.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByText('已导入 180 条笔记', { exact: true })).toBeVisible();
});

test('rejects newer remote content received during import confirmation', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'import concurrency');
  await page.goto('/studio/');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('social-copy-studio:workspace:v2'))).not.toBeNull();
  const backup = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('social-copy-studio:workspace:v2')!);
    workspace.notes[0].source = '# 旧备份';
    return JSON.stringify({ app: 'zhijian-copy-studio', backupVersion: 1, exportedAt: new Date().toISOString(), workspace });
  });
  await page.getByRole('button', { name: '笔记', exact: true }).click();
  await page.locator('input[accept="application/json,.json"]').evaluate((input, value) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([value], 'backup.json', { type: 'application/json' }));
    (input as HTMLInputElement).files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, backup);
  await expect(page.getByRole('dialog')).toBeVisible();
  const other = await context.newPage();
  await other.goto('/studio/');
  await other.getByLabel('输入文案').fill('# 弹窗期间新增的内容');
  await expect(page.getByLabel('输入文案')).toHaveValue('# 弹窗期间新增的内容');
  await page.getByRole('dialog').getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByText('其他标签页已经保存了更新，请先刷新或导出当前内容', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('social-copy-studio:workspace:v2')!).notes[0].source)).toBe('# 弹窗期间新增的内容');
  await other.close();
});

test('keeps homepage content visible without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(baseURL!);
    const blocks = page.locator('[data-reveal]');
    expect(await blocks.count()).toBeGreaterThan(0);
    for (const block of await blocks.all()) {
      await expect(block).toHaveCSS('opacity', '1');
      await expect(block).toBeVisible();
    }
  } finally { await context.close(); }
});

test('uses a consistent production domain in discovery metadata', async ({ page, request }) => {
  const runtime = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } };
  const site = new URL(runtime.process?.env?.SITE_URL?.trim() || 'https://zhijian.yaoyiqian.com');
  await page.goto('/');
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(canonical).toBe(site.href);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical!);
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain(`<loc>${new URL('/studio/', site).href}</loc>`);
  const robots = await request.get('/robots.txt');
  expect(await robots.text()).toContain(`Sitemap: ${new URL('/sitemap.xml', site).href}`);
});

test('reveals every homepage block and respects reduced motion', async ({ page }, testInfo) => {
  await page.goto('/');
  for (const block of await page.locator('[data-reveal]').all()) {
    await block.scrollIntoViewIfNeeded();
    await expect(block).toHaveCSS('opacity', '1');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  for (const block of await page.locator('[data-reveal]').all()) {
    await expect(block).toHaveCSS('opacity', '1');
    await expect(block).toHaveCSS('transform', 'none');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('homepage-reduced-motion.png'), fullPage: true });
});

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

  const paperTheme = page.getByRole('tab', { name: /03 纸间/ });
  const wechatTheme = page.getByRole('tab', { name: /05 经典手记/ });
  await wechatTheme.click();
  await expect(wechatTheme).toHaveAttribute('aria-selected', 'true');
  await expect(paperTheme).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByText('WECHAT · RICH TEXT', { exact: true })).toBeVisible();
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

test('creates, switches and restores independent local notes', async ({ page }) => {
  await page.goto('/studio/');
  const editor = page.getByLabel('输入文案');
  await editor.fill('# 第一篇\n\n只属于第一篇的内容。');

  await page.getByRole('button', { name: '笔记', exact: true }).click();
  await expect(page.getByRole('heading', { name: /笔记库/ })).toBeVisible();
  await page.getByRole('button', { name: /新建笔记/ }).click();
  await expect(editor).toHaveValue('');
  await editor.fill('# 第二篇\n\n只属于第二篇的内容。');

  await page.getByRole('button', { name: '笔记', exact: true }).click();
  await page.getByRole('button', { name: /第一篇/ }).click();
  await expect(editor).toHaveValue(/只属于第一篇的内容/);
  await page.locator('article[data-active="true"]').getByRole('button', { name: '删除' }).click();
  const confirmDialog = page.getByRole('dialog');
  await expect(confirmDialog.getByRole('heading', { name: '删除“第一篇”？' })).toBeVisible();
  await confirmDialog.getByRole('button', { name: '取消' }).click();
  await expect(confirmDialog).toBeHidden();
  await page.getByRole('button', { name: '关闭笔记库' }).click();

  await expect.poll(() => page.evaluate(() => {
    const value = localStorage.getItem('social-copy-studio:workspace:v2');
    return value ? JSON.parse(value).notes.length : 0;
  })).toBe(2);
  await page.reload();
  await expect(editor).toHaveValue(/只属于第一篇的内容/);
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

test('blocks copying a Xiaohongshu post above 1000 characters', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only publishing limit detail');
  await page.goto('/studio/');
  await page.getByLabel('输入文案').fill('字'.repeat(1001));

  await expect(page.getByText('1001 / 1000 字')).toBeVisible();
  await expect(page.getByText(/精简 1 字后再复制全部/)).toBeVisible();
  await expect(page.getByRole('button', { name: '超出 1 字' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '标题超限' })).toBeDisabled();
});

test('rejects an oversized backup before importing it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only file boundary detail');
  await page.goto('/studio/');
  await page.getByRole('button', { name: '笔记', exact: true }).click();
  await page.locator('input[type="file"]').evaluate((input) => {
    const file = new File([new Uint8Array(20_000_001)], 'too-large.json', { type: 'application/json' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    (input as HTMLInputElement).files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await expect(page.getByText('备份文件不能超过 20 MB')).toBeVisible();
});

test('prevents two tabs from silently overwriting the same workspace revision', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only cross-tab detail');
  await page.goto('/studio/');
  await expect.poll(() => page.evaluate(
    () => localStorage.getItem('social-copy-studio:workspace:v2') !== null,
  )).toBe(true);

  const secondPage = await context.newPage();
  await secondPage.goto('/studio/');
  await Promise.all([
    page.getByLabel('输入文案').fill('# 标签页 A\n\nA 的内容'),
    secondPage.getByLabel('输入文案').fill('# 标签页 B\n\nB 的内容'),
  ]);

  await expect.poll(async () => Number(await page.getByText('其他标签页有更新').isVisible())
    + Number(await secondPage.getByText('其他标签页有更新').isVisible())).toBe(1);
  const persistedSource = await page.evaluate(() => {
    const value = localStorage.getItem('social-copy-studio:workspace:v2');
    return value ? JSON.parse(value).notes[0].source : '';
  });
  expect(['# 标签页 A\n\nA 的内容', '# 标签页 B\n\nB 的内容']).toContain(persistedSource);
  await secondPage.close();
});

test('preserves a corrupt workspace instead of auto-saving over it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only recovery detail');
  await page.addInitScript(() => {
    localStorage.setItem('social-copy-studio:workspace:v2', '{broken');
  });
  await page.goto('/studio/');

  await expect(page.getByText('本地数据异常，请导入备份')).toBeVisible();
  await page.getByLabel('输入文案').fill('# 临时输入');
  await page.waitForTimeout(600);
  await expect.poll(() => page.evaluate(
    () => localStorage.getItem('social-copy-studio:workspace:v2'),
  )).toBe('{broken');
});

test('switches to the editorial WeChat renderer', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only channel detail');
  await page.goto('/studio/');

  await page.getByRole('button', { name: '公众号', exact: true }).click();
  await expect(page.getByRole('heading', { name: '微信公众号富文本' })).toBeVisible();
  await expect(page.getByLabel('排版后的公众号文章')).not.toContainText('把 AI 文案整理成小红书笔记');
  await expect(page.getByRole('button', { name: '复制标题' })).toBeVisible();
  await expect(page.getByRole('button', { name: '复制公众号富文本' })).toBeVisible();
  const copyHint = page.getByText('复制内容会携带内联样式，粘贴后请检查公众号编辑器的最终效果。');
  await expect(copyHint).toBeVisible();
  expect((await copyHint.boundingBox())?.width).toBeGreaterThan(120);
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

test('pastes a local image and copies it inside WeChat rich text', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only clipboard image detail');
  await page.goto('/studio/');
  await page.getByRole('button', { name: '公众号', exact: true }).click();
  const editor = page.getByLabel('输入文案');
  await editor.fill('## 正文');
  await editor.evaluate((element) => {
    const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], '粘贴图片.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }));
  });

  await expect(editor).toHaveValue(/!\[粘贴图片\]\(zhijian-image:\/\/[a-z0-9-]+\)/u);
  await expect(page.getByText('已插入 1 张图片，可随正文一起复制')).toBeVisible();
  await expect(page.getByLabel('排版后的公众号文章').locator('img[alt="粘贴图片"]')).toBeVisible();

  await page.evaluate(() => {
    const capture = window as typeof window & { __copiedRichText?: string };
    Object.defineProperty(navigator.clipboard, 'write', {
      configurable: true,
      value: async (items: ClipboardItem[]) => {
        const item = items.find((candidate) => candidate.types.includes('text/html'));
        capture.__copiedRichText = item ? await (await item.getType('text/html')).text() : '';
      },
    });
  });
  await page.getByRole('button', { name: '复制公众号富文本' }).click();
  await expect.poll(() => page.evaluate(
    () => (window as typeof window & { __copiedRichText?: string }).__copiedRichText ?? '',
  )).not.toBe('');
  const capturedHtml = await page.evaluate(
    () => (window as typeof window & { __copiedRichText?: string }).__copiedRichText ?? '',
  );
  expect(capturedHtml).toContain('<img');
  expect(capturedHtml).toContain('data:image/png;base64,');
});

test('keeps an async image insertion with the note where it started', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only async note boundary');
  await page.goto('/studio/');
  await page.getByRole('button', { name: '公众号', exact: true }).click();
  const editor = page.getByLabel('输入文案');
  await editor.fill('# 原笔记');
  await page.evaluate(() => {
    const originalRead = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function delayedRead(blob) {
      window.setTimeout(() => originalRead.call(this, blob), 180);
    };
  });
  await editor.evaluate((element) => {
    const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], '延迟图片.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }));
  });

  await page.getByRole('button', { name: '笔记', exact: true }).click();
  await page.getByRole('button', { name: /新建笔记/ }).click();
  await editor.fill('# 新笔记');
  await page.waitForTimeout(350);
  await expect(editor).toHaveValue('# 新笔记');

  await page.getByRole('button', { name: '笔记', exact: true }).click();
  await page.getByRole('button', { name: /原笔记/ }).click();
  await expect(editor).toHaveValue(/# 原笔记[\s\S]+!\[延迟图片\]\(zhijian-image:\/\/[a-z0-9-]+\)/u);
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
