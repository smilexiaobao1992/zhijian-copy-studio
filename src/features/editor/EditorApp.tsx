import { useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { parseDocument } from '../../core/document';
import { renderXiaohongshu } from '../../core/render-xhs';
import { getTemplate } from '../../core/templates';
import { getTheme } from '../../core/themes';
import { copyPlainText } from './clipboard';
import { PreviewPane } from './PreviewPane';
import { defaultDraft, loadDraft, saveDraft } from './storage';
import { ToolDrawer, type DrawerId } from './ToolDrawer';
import styles from './EditorApp.module.css';

interface EditorState {
  source: string;
  themeId: string;
  activeDrawer: DrawerId | null;
  mobileView: 'edit' | 'preview';
}

type EditorAction =
  | { type: 'source'; source: string }
  | { type: 'theme'; themeId: string }
  | { type: 'drawer'; drawer: DrawerId | null }
  | { type: 'mobile-view'; view: 'edit' | 'preview' }
  | { type: 'template'; source: string };

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'source':
      return { ...state, source: action.source };
    case 'theme':
      return { ...state, themeId: action.themeId, activeDrawer: null };
    case 'drawer':
      return { ...state, activeDrawer: action.drawer };
    case 'mobile-view':
      return { ...state, mobileView: action.view };
    case 'template':
      return { ...state, source: action.source, activeDrawer: null };
  }
}

function initialState(): EditorState {
  const draft = typeof window === 'undefined' ? defaultDraft : loadDraft();
  return {
    source: draft.source,
    themeId: draft.themeId,
    activeDrawer: null,
    mobileView: 'edit',
  };
}

const railItems: readonly { id: DrawerId; marker: string; label: string }[] = [
  { id: 'themes', marker: '题', label: '主题' },
  { id: 'templates', marker: '模', label: '模板' },
  { id: 'guide', marker: '?', label: '说明' },
];

export function EditorApp() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error'>('saved');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyTimerRef = useRef<number | null>(null);
  const deferredSource = useDeferredValue(state.source);
  const theme = useMemo(() => getTheme(state.themeId), [state.themeId]);
  const result = useMemo(
    () => renderXiaohongshu(parseDocument(deferredSource), theme),
    [deferredSource, theme],
  );

  useEffect(() => {
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      try {
        saveDraft({ schemaVersion: 1, source: state.source, themeId: state.themeId });
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 420);

    return () => window.clearTimeout(timer);
  }, [state.source, state.themeId]);

  useEffect(() => () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
  }, []);

  const documentName = result.plainText.split('\n')[0]?.replace(/^\S+\s*/, '').trim() || '未命名草稿';

  async function handleCopy() {
    try {
      await copyPlainText(result.plainText);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopyState('idle'), 1800);
  }

  function selectTemplate(templateId: string) {
    const accepted = window.confirm('应用模板会替换当前草稿，是否继续？');
    if (!accepted) return;
    dispatch({ type: 'template', source: getTemplate(templateId).source });
  }

  function toggleDrawer(drawer: DrawerId) {
    dispatch({ type: 'drawer', drawer: state.activeDrawer === drawer ? null : drawer });
  }

  const saveLabel = saveState === 'saving'
    ? '正在保存'
    : saveState === 'error'
      ? '本地保存失败'
      : '已保存到本机';

  return (
    <div className={styles.app}>
      <header className={styles.appHeader}>
        <a className={styles.brand} href="/" aria-label="纸间排版首页">
          <span className={styles.brandSeal} aria-hidden="true">纸</span>
          <span><strong>纸间排版</strong><small>Social Copy Studio</small></span>
        </a>

        <div className={styles.documentTitle} title={documentName}>{documentName}</div>

        <div className={styles.channelSwitch} aria-label="输出渠道">
          <button type="button" data-active="true">小红书</button>
          <button type="button" disabled title="公众号富文本将在下一阶段开放">公众号 <span>随后</span></button>
        </div>

        <div className={styles.mobileSwitch} aria-label="移动端工作区切换">
          <button
            type="button"
            data-active={state.mobileView === 'edit'}
            onClick={() => dispatch({ type: 'mobile-view', view: 'edit' })}
          >编辑</button>
          <button
            type="button"
            data-active={state.mobileView === 'preview'}
            onClick={() => dispatch({ type: 'mobile-view', view: 'preview' })}
          >预览</button>
        </div>

        <div className={styles.saveStatus} data-state={saveState} aria-live="polite">
          <span aria-hidden="true" />{saveLabel}
        </div>
      </header>

      <main className={styles.workspace} id="main-content" data-mobile-view={state.mobileView}>
        <nav className={styles.toolRail} aria-label="编辑工具">
          <div className={styles.railPrimary}>
            <button className={styles.railButton} data-active="true" type="button" aria-current="page">
              <span aria-hidden="true">写</span><small>编辑</small>
            </button>
            {railItems.map((item) => (
              <button
                className={styles.railButton}
                data-active={state.activeDrawer === item.id}
                aria-expanded={state.activeDrawer === item.id}
                aria-controls="tool-drawer"
                type="button"
                key={item.id}
                onClick={() => toggleDrawer(item.id)}
              >
                <span aria-hidden="true">{item.marker}</span><small>{item.label}</small>
              </button>
            ))}
          </div>
          <a className={styles.railLink} href="/" aria-label="返回产品首页">←<small>首页</small></a>
        </nav>

        {state.activeDrawer ? (
          <ToolDrawer
            activeDrawer={state.activeDrawer}
            selectedThemeId={theme.id}
            onClose={() => dispatch({ type: 'drawer', drawer: null })}
            onSelectTheme={(themeId) => dispatch({ type: 'theme', themeId })}
            onSelectTemplate={selectTemplate}
          />
        ) : null}

        <section className={styles.editorPane} aria-labelledby="editor-heading">
          <header className={styles.paneHeader}>
            <div>
              <span className={styles.eyebrow}>原始文案</span>
              <h1 id="editor-heading">Markdown 编辑器</h1>
            </div>
            <button className={styles.themeShortcut} type="button" onClick={() => toggleDrawer('themes')}>
              <span className={styles.themeDot} style={{ backgroundColor: theme.swatch }} aria-hidden="true" />
              主题 · {theme.name}
            </button>
          </header>

          <label className={styles.visuallyHidden} htmlFor="source-editor">输入文案</label>
          <textarea
            className={styles.editor}
            id="source-editor"
            value={state.source}
            spellCheck="false"
            onChange={(event) => dispatch({ type: 'source', source: event.target.value })}
          />

          <footer className={styles.editorFooter}>
            <span>{result.stats.characters} 字</span>
            <span>{result.stats.headings} 个标题</span>
            <span>{result.stats.topics} 个话题</span>
            <span className={styles.editorHint}>支持标题、列表、引用、重点和代码</span>
          </footer>
        </section>

        <PreviewPane result={result} theme={theme} copyState={copyState} onCopy={handleCopy} />
      </main>
    </div>
  );
}
