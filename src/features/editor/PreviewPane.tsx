import type { XhsRenderResult } from '../../core/render-xhs';
import type { XhsTheme } from '../../core/theme-schema';
import styles from './EditorApp.module.css';

interface PreviewPaneProps {
  result: XhsRenderResult;
  theme: XhsTheme;
  copyState: 'idle' | 'copied' | 'error';
  onCopy: () => void;
}

export function PreviewPane({ result, theme, copyState, onCopy }: PreviewPaneProps) {
  const copyLabel = copyState === 'copied'
    ? '已复制到剪贴板'
    : copyState === 'error'
      ? '复制失败，请重试'
      : '复制小红书正文';

  return (
    <section className={styles.previewPane} aria-labelledby="preview-heading">
      <header className={styles.paneHeader}>
        <div>
          <span className={styles.eyebrow}>输出预览</span>
          <h2 id="preview-heading">小红书纯文本</h2>
        </div>
        <div className={styles.previewMeta}>
          <span className={styles.themeDot} style={{ backgroundColor: theme.swatch }} aria-hidden="true" />
          {theme.name}
        </div>
      </header>

      <div className={styles.previewStage}>
        <div className={styles.widthLabel}>
          <span>阅读宽度</span>
          <span>375px</span>
        </div>
        <article className={styles.readingSheet} aria-label="排版后的正文">
          {result.plainText ? (
            <p>{result.plainText}</p>
          ) : (
            <p className={styles.emptyPreview}>写一点内容后，这里会显示排版结果。</p>
          )}
        </article>
      </div>

      <footer className={styles.previewFooter}>
        <div className={styles.previewStatus} aria-live="polite">
          {result.warnings[0]?.message ?? '当前预览就是复制后的正文。'}
        </div>
        <button
          className={styles.copyButton}
          data-state={copyState}
          type="button"
          onClick={onCopy}
          disabled={!result.plainText}
        >
          {copyLabel}
        </button>
      </footer>
    </section>
  );
}
