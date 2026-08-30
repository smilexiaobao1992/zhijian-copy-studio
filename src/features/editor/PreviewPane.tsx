import type { WechatRenderResult } from '../../core/render-wechat';
import { XHS_CHARACTER_LIMIT, type XhsRenderResult } from '../../core/render-xhs';
import type { WechatTheme } from '../../core/wechat-theme-schema';
import type { XhsTheme } from '../../core/theme-schema';
import styles from './EditorApp.module.css';

export type CopyTarget = 'title' | 'body' | 'topics' | 'all';

type PreviewPaneProps = {
  copyState: 'idle' | 'copied' | 'error';
  copyTarget: CopyTarget;
  onCopy: (target: CopyTarget) => void;
  animate: boolean;
} & (
  | { channel: 'xiaohongshu'; result: XhsRenderResult; theme: XhsTheme }
  | {
    channel: 'wechat';
    result: WechatRenderResult;
    theme: WechatTheme;
    styleName: string;
    styleColor: string;
  }
);

export function PreviewPane(props: PreviewPaneProps) {
  const { channel, result, theme, copyState, copyTarget, onCopy, animate } = props;
  const isWechat = channel === 'wechat';
  const isXhsOverLimit = !isWechat && result.stats.characters > XHS_CHARACTER_LIMIT;
  const copyLabel = copyState === 'copied'
    ? isWechat
      ? copyTarget === 'all' ? '已复制公众号富文本' : '复制公众号富文本'
      : copyTarget === 'all' ? '已复制全部' : '复制全部'
    : copyState === 'error'
      ? '复制失败，请重试'
      : isWechat
        ? '复制公众号富文本'
        : isXhsOverLimit
          ? `超出 ${result.stats.characters - XHS_CHARACTER_LIMIT} 字`
          : '复制全部';
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
          <span
            className={styles.themeDot}
            style={{ backgroundColor: isWechat ? props.styleColor : theme.swatch }}
            aria-hidden="true"
          />
          {isWechat ? props.styleName : theme.name}
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
        <div className={styles.copyActions} data-channel={channel}>
          {isWechat ? (
            <div className={styles.copyParts} aria-label="公众号分区复制">
              <button
                type="button"
                data-state={copyState === 'copied' && copyTarget === 'title' ? 'copied' : 'idle'}
                onClick={() => onCopy('title')}
                disabled={!props.result.title}
              >
                {copyState === 'copied' && copyTarget === 'title' ? '已复制标题' : '复制标题'}
              </button>
            </div>
          ) : (
            <div className={styles.copyParts} aria-label="分区复制">
              {([
                ['title', '标题', props.result.sections.title],
                ['body', '正文', props.result.sections.body],
                ['topics', '话题', props.result.sections.topics],
              ] as const).map(([target, label, value]) => {
                const isSectionOverLimit = Array.from(value).length > XHS_CHARACTER_LIMIT;
                return (
                  <button
                    type="button"
                    data-state={copyState === 'copied' && copyTarget === target ? 'copied' : 'idle'}
                    key={target}
                    onClick={() => onCopy(target)}
                    disabled={!value || isSectionOverLimit}
                    title={isSectionOverLimit ? `${label}超过 1000 字，请先精简` : undefined}
                  >
                    {copyState === 'copied' && copyTarget === target
                      ? `已复制${label}`
                      : isSectionOverLimit ? `${label}超限` : `复制${label}`}
                  </button>
                );
              })}
            </div>
          )}
          <button
            className={styles.copyButton}
            data-state={copyState === 'copied' && copyTarget !== 'all' ? 'idle' : copyState}
            type="button"
            onClick={() => onCopy('all')}
            disabled={!result.plainText || isXhsOverLimit}
            title={isXhsOverLimit ? '请将小红书发布文本精简到 1000 字以内' : undefined}
          >
            {copyLabel}
          </button>
        </div>
      </footer>
    </section>
  );
}
