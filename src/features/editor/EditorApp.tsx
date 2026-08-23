import { useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { parseDocument } from '../../core/document';
import { renderWechat } from '../../core/render-wechat';
import { renderXiaohongshu } from '../../core/render-xhs';
import { organizeXhsSource } from '../../core/xhs-organizer';
import { getTemplate } from '../../core/templates';
import { getTheme } from '../../core/themes';
import { getWechatTheme } from '../../core/wechat-themes';
import {
  getWechatStyleName,
  type WechatStyleConfig,
} from '../../core/wechat-style';
import { copyPlainText, copyRichText } from './clipboard';
import { PreviewPane, type CopyTarget } from './PreviewPane';
import { defaultDraft, loadDraft, saveDraft } from './storage';
import { ToolDrawer, type DrawerId } from './ToolDrawer';
import styles from './EditorApp.module.css';

type ChannelId = 'xiaohongshu' | 'wechat';

interface EditorState {
  source: string;
  themeId: string;
  wechatThemeId: string;
  wechatStyle: WechatStyleConfig;
  channel: ChannelId;
  activeDrawer: DrawerId | null;
  mobileView: 'edit' | 'preview';
}

type EditorAction =
  | { type: 'source'; source: string }
  | { type: 'theme'; themeId: string }
  | { type: 'wechat-theme'; themeId: string }
  | { type: 'wechat-style'; style: WechatStyleConfig }
  | { type: 'wechat-style-property'; property: keyof WechatStyleConfig; value: WechatStyleConfig[keyof WechatStyleConfig] }
  | { type: 'channel'; channel: ChannelId }
  | { type: 'drawer'; drawer: DrawerId | null }
  | { type: 'mobile-view'; view: 'edit' | 'preview' }
  | { type: 'template'; source: string };

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'source':
      return { ...state, source: action.source };
    case 'theme':
      return { ...state, themeId: action.themeId, activeDrawer: null };
    case 'wechat-theme':
      return { ...state, wechatThemeId: action.themeId, activeDrawer: null };
    case 'wechat-style':
      return { ...state, wechatStyle: action.style };
    case 'wechat-style-property':
      return { ...state, wechatStyle: { ...state.wechatStyle, [action.property]: action.value } };
    case 'channel':
      return { ...state, channel: action.channel, activeDrawer: null };
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
    wechatThemeId: draft.wechatThemeId,
    wechatStyle: draft.wechatStyle,
    channel: draft.channel,
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
  const [copyTarget, setCopyTarget] = useState<CopyTarget>('all');
  const [organizeUndo, setOrganizeUndo] = useState<{ source: string; summary: string } | null>(null);
  const [previewMotion, setPreviewMotion] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const deferredSource = useDeferredValue(state.source);
  const xhsTheme = useMemo(() => getTheme(state.themeId), [state.themeId]);
  const wechatTheme = useMemo(() => getWechatTheme(state.wechatThemeId), [state.wechatThemeId]);
  const wechatStyleName = useMemo(() => getWechatStyleName(state.wechatStyle), [state.wechatStyle]);
  const document = useMemo(() => parseDocument(deferredSource), [deferredSource]);
  const xhsResult = useMemo(
    () => state.channel === 'xiaohongshu' ? renderXiaohongshu(document, xhsTheme) : null,
    [document, state.channel, xhsTheme],
  );
  const wechatResult = useMemo(
    () => state.channel === 'wechat' ? renderWechat(document, wechatTheme, state.wechatStyle) : null,
    [document, state.channel, state.wechatStyle, wechatTheme],
  );
  const result = xhsResult ?? wechatResult!;
  const activeTheme = state.channel === 'xiaohongshu' ? xhsTheme : wechatTheme;
  const activeSwatch = state.channel === 'wechat' ? state.wechatStyle.accentColor : activeTheme.swatch;

  useEffect(() => {
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      try {
        saveDraft({
          schemaVersion: 1,
          source: state.source,
          themeId: state.themeId,
          wechatThemeId: state.wechatThemeId,
          wechatStyle: state.wechatStyle,
          channel: state.channel,
        });
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 420);

    return () => window.clearTimeout(timer);
  }, [state.channel, state.source, state.themeId, state.wechatStyle, state.wechatThemeId]);

  useEffect(() => () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
  }, []);

  const documentName = xhsResult?.sections.title
    || result.plainText.split('\n')[0]?.replace(/^\S+\s*/u, '').trim()
    || '未命名草稿';

  async function handleCopy(target: CopyTarget = 'all') {
    try {
      if (wechatResult) {
        await copyRichText(wechatResult.html, wechatResult.plainText);
      } else if (xhsResult) {
        const text = target === 'title'
          ? xhsResult.sections.title
          : target === 'body'
            ? xhsResult.sections.body
            : target === 'topics'
              ? xhsResult.sections.topics
              : xhsResult.plainText;
        await copyPlainText(text);
      }
      setCopyTarget(target);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopyState('idle'), 1800);
  }

  function selectChannel(channel: ChannelId) {
    if (channel === state.channel) return;
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    setCopyState('idle');
    setCopyTarget('all');
    setPreviewMotion(true);
    dispatch({ type: 'channel', channel });
  }

  function selectTemplate(templateId: string) {
    const accepted = window.confirm('应用模板会替换当前草稿，是否继续？');
    if (!accepted) return;
    setOrganizeUndo(null);
    dispatch({ type: 'template', source: getTemplate(templateId).source });
  }

  function organizeSource() {
    const organized = organizeXhsSource(state.source);
    if (!organized.changed) return;
    setOrganizeUndo({ source: state.source, summary: organized.summary });
    setPreviewMotion(true);
    dispatch({ type: 'source', source: organized.source });
  }

  function undoOrganize() {
    if (!organizeUndo) return;
    dispatch({ type: 'source', source: organizeUndo.source });
    setOrganizeUndo(null);
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
          <span className={styles.brandName}><strong>纸间排版</strong><small>Social Copy Studio</small></span>
        </a>

        <div className={styles.documentTitle} title={documentName}>{documentName}</div>

        <div className={styles.channelSwitch} aria-label="输出渠道">
          <button
            type="button"
            data-active={state.channel === 'xiaohongshu'}
            onClick={() => selectChannel('xiaohongshu')}
          >小红书</button>
          <button
            type="button"
            data-active={state.channel === 'wechat'}
            onClick={() => selectChannel('wechat')}
          >公众号</button>
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
            channel={state.channel}
            selectedThemeId={activeTheme.id}
            wechatStyle={state.wechatStyle}
            onClose={() => dispatch({ type: 'drawer', drawer: null })}
            onSelectTheme={(themeId) => dispatch({
              type: state.channel === 'xiaohongshu' ? 'theme' : 'wechat-theme',
              themeId,
            })}
            onSelectTemplate={selectTemplate}
            onApplyWechatStyle={(style) => dispatch({ type: 'wechat-style', style })}
            onUpdateWechatStyle={(property, value) => dispatch({
              type: 'wechat-style-property',
              property,
              value,
            })}
          />
        ) : null}

        <section className={styles.editorPane} aria-labelledby="editor-heading">
          <header className={styles.paneHeader}>
            <div>
              <span className={styles.eyebrow}>原始文案</span>
              <h1 id="editor-heading">Markdown 编辑器</h1>
            </div>
            <div className={styles.editorHeaderActions}>
              {xhsResult ? (
                <button
                  className={styles.organizeButton}
                  data-ready={!xhsResult.analysis.canOrganize}
                  type="button"
                  onClick={organizeSource}
                  disabled={!xhsResult.analysis.canOrganize}
                >
                  {xhsResult.analysis.canOrganize ? '整理结构' : '结构已清楚'}
                </button>
              ) : null}
              <button className={styles.themeShortcut} type="button" onClick={() => toggleDrawer('themes')}>
                <span className={styles.themeDot} style={{ backgroundColor: activeSwatch }} aria-hidden="true" />
                {state.channel === 'wechat' ? `样式 · ${wechatStyleName}` : `主题 · ${activeTheme.name}`}
              </button>
            </div>
          </header>

          <label className={styles.visuallyHidden} htmlFor="source-editor">输入文案</label>
          <textarea
            className={styles.editor}
            id="source-editor"
            value={state.source}
            spellCheck="false"
            onChange={(event) => {
              setOrganizeUndo(null);
              dispatch({ type: 'source', source: event.target.value });
            }}
          />

          <footer className={styles.editorFooter}>
            <span>{result.stats.characters} 字</span>
            <span>{result.stats.headings} 个标题</span>
            <span>{result.stats.topics} 个话题</span>
            {xhsResult ? (
              <span className={styles.structureStatus} data-ready={!xhsResult.analysis.canOrganize}>
                {organizeUndo ? organizeUndo.summary : xhsResult.analysis.message}
                {organizeUndo ? (
                  <button type="button" onClick={undoOrganize}>撤销</button>
                ) : null}
              </span>
            ) : (
              <span className={styles.editorHint}>支持标题、列表、引用、重点和代码</span>
            )}
          </footer>
        </section>

        {wechatResult ? (
          <PreviewPane
            channel="wechat"
            result={wechatResult}
            theme={wechatTheme}
            styleName={wechatStyleName}
            styleColor={state.wechatStyle.accentColor}
            copyState={copyState}
            copyTarget={copyTarget}
            onCopy={handleCopy}
            animate={previewMotion}
          />
        ) : xhsResult ? (
          <PreviewPane
            channel="xiaohongshu"
            result={xhsResult}
            theme={xhsTheme}
            copyState={copyState}
            copyTarget={copyTarget}
            onCopy={handleCopy}
            animate={previewMotion}
          />
        ) : null}
      </main>
    </div>
  );
}
