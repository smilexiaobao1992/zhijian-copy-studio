import type { WechatRenderResult } from '../../core/render-wechat';
import type { XhsRenderResult } from '../../core/render-xhs';
import type { WechatTheme } from '../../core/wechat-theme-schema';
import type { XhsTheme } from '../../core/theme-schema';
import styles from './EditorApp.module.css';

type PreviewPaneProps = {
  copyState: 'idle' | 'copied' | 'error';
  onCopy: () => void;
  animate: boolean;
} & (
  | { channel: 'xiaohongshu'; result: XhsRenderResult; theme: XhsTheme }
  | { channel: 'wechat'; result: WechatRenderResult; theme: WechatTheme }
);

export function PreviewPane(props: PreviewPaneProps) {
  const { channel, result, theme, copyState, onCopy, animate } = props;
  const isWechat = channel === 'wechat';
  const copyLabel = copyState === 'copied'
    ? isWechat ? '已复制公众号富文本' : '已复制到剪贴板'
    : copyState === 'error'
      ? '复制失败，请重试'
      : isWechat ? '复制公众号富文本' : '复制小红书正文';
  const previewTitle = isWechat ? '微信公众号富文本' : '小红书纯文本';
  const previewLabel = isWechat ? '排版后的公众号文章' : '排版后的正文';
  const readyMessage = isWechat
    ? '复制内容会携带内联样式，粘贴后请检查公众号编辑器的最终效果。'
    : '当前预览就是复制后的正文。';

  return (
    <section className={styles.previewPane} aria-labelledby="preview-heading">
      <header className={styles.paneHeader}>
        <div>
          <span className={styles.eyebrow}>输出预览</span>
          <h2 id="preview-heading">{previewTitle}</h2>
        </div>
        <div className={styles.previewMeta}>
          <span className={styles.themeDot} style={{ backgroundColor: theme.swatch }} aria-hidden="true" />
          {theme.name}
        </div>
      </header>

      <div className={styles.previewStage}>
        <div className={styles.widthLabel}>
          <span>{isWechat ? '公众号阅读宽度' : '阅读宽度'}</span>
          <span>375px</span>
        </div>
        <article
          className={`${styles.readingSheet} ${isWechat ? styles.wechatReadingSheet : ''}`}
          aria-label={previewLabel}
          data-animate={animate}
          key={channel}
        >
          {result.plainText ? (
            isWechat ? (
              <div
                className={styles.wechatContent}
                // renderWechat escapes user text and owns the complete tag/style allowlist.
                dangerouslySetInnerHTML={{ __html: props.result.html }}
              />
            ) : (
              <p>{result.plainText}</p>
            )
          ) : (
            <p className={styles.emptyPreview}>
              {isWechat ? '写一点内容后，这里会显示公众号排版。' : '写一点内容后，这里会显示排版结果。'}
            </p>
          )}
        </article>
      </div>

      <footer className={styles.previewFooter}>
        <div className={styles.previewStatus} aria-live="polite">
          {result.warnings[0]?.message ?? readyMessage}
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
