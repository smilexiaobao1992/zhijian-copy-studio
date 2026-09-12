import { useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { parseDocument } from '../../core/document';
import { renderWechat } from '../../core/render-wechat';
import { XHS_CHARACTER_LIMIT, renderXiaohongshu } from '../../core/render-xhs';
import { organizeXhsSource } from '../../core/xhs-organizer';
import { getTemplate } from '../../core/templates';
import { getTheme } from '../../core/themes';
import { getWechatTheme } from '../../core/wechat-themes';
import { getWechatStyleName } from '../../core/wechat-style';
import { copyPlainText, copyRichText } from './clipboard';
import { ConfirmDialog, type ConfirmationRequest } from './ConfirmDialog';
import {
  collectLocalImageUris,
  loadLocalImageSources,
  storeLocalImage,
  WECHAT_IMAGE_ACCEPT,
} from './image-store';
import { NoteDrawer } from './NoteDrawer';
import { PreviewPane, type CopyTarget } from './PreviewPane';
import {
  addNote,
  createDefaultWorkspace,
  deleteNote,
  duplicateNote,
  getActiveNote,
  getNoteDisplayTitle,
  loadWorkspace,
  parseWorkspaceBackup,
  parseStoredWorkspace,
  renameNote,
  replaceWorkspace,
  saveWorkspace,
  serializeWorkspaceBackup,
  updateActiveNote,
  WORKSPACE_STORAGE_KEY,
  WorkspaceConflictError,
  type ChannelId,
  type NoteSnapshot,
  type WorkspaceSnapshot,
} from './storage';
import { ToolDrawer, type DrawerId as ToolDrawerId } from './ToolDrawer';
import styles from './EditorApp.module.css';

type DrawerId = 'notes' | ToolDrawerId;

interface EditorState {
  workspace: WorkspaceSnapshot;
  persistenceBlocked: boolean;
  activeDrawer: DrawerId | null;
  mobileView: 'edit' | 'preview';
}

type EditorAction =
  | { type: 'note-patch'; patch: Partial<Omit<NoteSnapshot, 'id' | 'createdAt' | 'updatedAt'>>; closeDrawer?: boolean }
  | { type: 'note-source'; noteId: string; source: string }
  | { type: 'workspace'; workspace: WorkspaceSnapshot; closeDrawer?: boolean; unblockPersistence?: boolean }
  | { type: 'external-workspace'; workspace: WorkspaceSnapshot }
  | { type: 'select-note'; noteId: string }
  | { type: 'drawer'; drawer: DrawerId | null }
  | { type: 'mobile-view'; view: 'edit' | 'preview' };

function reducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'note-patch':
      return {
        ...state,
        workspace: updateActiveNote(state.workspace, action.patch),
        activeDrawer: action.closeDrawer ? null : state.activeDrawer,
      };
    case 'note-source': {
      if (!state.workspace.notes.some((note) => note.id === action.noteId)) return state;
      return {
        ...state,
        workspace: {
          ...state.workspace,
          revision: state.workspace.revision + 1,
          notes: state.workspace.notes.map((note) => note.id === action.noteId
            ? { ...note, source: action.source, updatedAt: Date.now() }
            : note),
        },
      };
    }
    case 'workspace':
      return {
        ...state,
        workspace: action.workspace,
        persistenceBlocked: action.unblockPersistence ? false : state.persistenceBlocked,
        activeDrawer: action.closeDrawer ? null : state.activeDrawer,
      };
    case 'external-workspace':
      return { ...state, workspace: action.workspace };
    case 'select-note':
      return {
        ...state,
        workspace: {
          ...state.workspace,
          revision: state.workspace.revision + 1,
          activeNoteId: action.noteId,
        },
      };
    case 'drawer':
      return { ...state, activeDrawer: action.drawer };
    case 'mobile-view':
      return { ...state, mobileView: action.view };
  }
}

function initialState(): EditorState {
  const fallback = createDefaultWorkspace(0, 'default-note');
  if (typeof window === 'undefined') {
    return { workspace: fallback, persistenceBlocked: false, activeDrawer: null, mobileView: 'edit' };
  }
  try {
    return { workspace: loadWorkspace(), persistenceBlocked: false, activeDrawer: null, mobileView: 'edit' };
  } catch {
    return { workspace: fallback, persistenceBlocked: true, activeDrawer: null, mobileView: 'edit' };
  }
}

const railItems: readonly { id: DrawerId; marker: string; label: string }[] = [
  { id: 'notes', marker: '稿', label: '笔记' },
  { id: 'themes', marker: '题', label: '主题' },
  { id: 'templates', marker: '模', label: '模板' },
  { id: 'guide', marker: '?', label: '说明' },
];

function insertMarkdownBlock(source: string, start: number, end: number, block: string) {
  const before = source.slice(0, start);
  const after = source.slice(end);
  const leading = before.length === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trailing = after.length === 0 || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const inserted = `${leading}${block}${trailing}`;
  return {
    source: `${before}${inserted}${after}`,
    cursor: before.length + inserted.length,
  };
}

export function EditorApp() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [saveState, setSaveState] = useState<'saving' | 'saved' | 'error' | 'conflict' | 'recovery'>(
    state.persistenceBlocked ? 'recovery' : 'saved',
  );
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [copyTarget, setCopyTarget] = useState<CopyTarget>('all');
  const [organizeUndo, setOrganizeUndo] = useState<{ source: string; summary: string } | null>(null);
  const [previewMotion, setPreviewMotion] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [imageSources, setImageSources] = useState<ReadonlyMap<string, string>>(new Map());
  const [imageNotice, setImageNotice] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const confirmationResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const persistedWorkspaceRef = useRef(state.workspace);
  const workspaceRef = useRef(state.workspace);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const activeNote = getActiveNote(state.workspace);
  workspaceRef.current = state.workspace;
  const deferredSource = useDeferredValue(activeNote.source);
  const xhsTheme = useMemo(() => getTheme(activeNote.themeId), [activeNote.themeId]);
  const wechatTheme = useMemo(() => getWechatTheme(activeNote.wechatThemeId), [activeNote.wechatThemeId]);
  const wechatStyleName = useMemo(() => getWechatStyleName(activeNote.wechatStyle), [activeNote.wechatStyle]);
  const document = useMemo(() => parseDocument(deferredSource), [deferredSource]);
  const localImageKey = useMemo(
    () => collectLocalImageUris(activeNote.source).join('|'),
    [activeNote.source],
  );
  const xhsResult = useMemo(
    () => activeNote.channel === 'xiaohongshu' ? renderXiaohongshu(document, xhsTheme) : null,
    [activeNote.channel, document, xhsTheme],
  );
  const wechatResult = useMemo(
    () => activeNote.channel === 'wechat'
      ? renderWechat(document, wechatTheme, activeNote.wechatStyle, { imageSources })
      : null,
    [activeNote.channel, activeNote.wechatStyle, document, imageSources, wechatTheme],
  );
  const result = xhsResult ?? wechatResult!;
  const activeTheme = activeNote.channel === 'xiaohongshu' ? xhsTheme : wechatTheme;
  const activeSwatch = activeNote.channel === 'wechat' ? activeNote.wechatStyle.accentColor : activeTheme.swatch;

  useEffect(() => {
    if (state.persistenceBlocked) {
      setSaveState('recovery');
      return;
    }
    setSaveState('saving');
    function persist(): boolean {
      try {
        const workspace = workspaceRef.current;
        saveWorkspace(workspace, persistedWorkspaceRef.current);
        persistedWorkspaceRef.current = workspace;
        setSaveState('saved');
        return true;
      } catch (error) {
        setSaveState(error instanceof WorkspaceConflictError ? 'conflict' : 'error');
        return false;
      }
    }
    const timer = window.setTimeout(persist, 420);
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!persist()) {
        // Only warn when the last edit cannot be saved; never force a conflicting write.
        event.preventDefault();
      }
    }
    function onVisibilityChange() {
      if (globalThis.document.visibilityState === 'hidden') persist();
    }
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('pagehide', persist);
    globalThis.document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('pagehide', persist);
      globalThis.document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [state.persistenceBlocked, state.workspace]);

  useEffect(() => {
    let cancelled = false;
    if (activeNote.channel !== 'wechat' || !localImageKey) {
      setImageSources(new Map());
      return () => { cancelled = true; };
    }

    loadLocalImageSources(localImageKey)
      .then((sources) => {
        if (!cancelled) setImageSources(sources);
      })
      .catch(() => {
        if (!cancelled) setImageNotice('本地图片读取失败，请重新插入');
      });

    return () => { cancelled = true; };
  }, [activeNote.channel, activeNote.id, localImageKey]);

  useEffect(() => {
    setImageNotice(null);
  }, [activeNote.channel, activeNote.id]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== WORKSPACE_STORAGE_KEY || event.newValue === null || state.persistenceBlocked) return;
      try {
        const externalWorkspace = parseStoredWorkspace(event.newValue);
        if (JSON.stringify(externalWorkspace) === JSON.stringify(state.workspace)) {
          persistedWorkspaceRef.current = externalWorkspace;
          return;
        }
        const hasLocalChanges = state.workspace.revision !== persistedWorkspaceRef.current.revision;
        if (hasLocalChanges || externalWorkspace.revision <= state.workspace.revision) {
          setSaveState('conflict');
          return;
        }
        persistedWorkspaceRef.current = externalWorkspace;
        setSaveState('saved');
        dispatch({ type: 'external-workspace', workspace: externalWorkspace });
      } catch {
        setSaveState('recovery');
      }
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [state.persistenceBlocked, state.workspace]);

  useEffect(() => () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
  }, []);

  const documentName = getNoteDisplayTitle(activeNote);

  async function handleCopy(target: CopyTarget = 'all') {
    try {
      if (wechatResult) {
        if (target === 'title') {
          await copyPlainText(wechatResult.title);
        } else {
          const currentDocument = parseDocument(activeNote.source);
          const currentImageSources = await loadLocalImageSources(activeNote.source);
          const currentResult = renderWechat(
            currentDocument,
            wechatTheme,
            activeNote.wechatStyle,
            { imageSources: currentImageSources },
          );
          await copyRichText(currentResult.html, currentResult.plainText);
        }
      } else if (xhsResult) {
        const text = target === 'title'
          ? xhsResult.sections.title
          : target === 'body'
            ? xhsResult.sections.body
            : target === 'topics'
              ? xhsResult.sections.topics
              : xhsResult.plainText;
        if (Array.from(text).length > XHS_CHARACTER_LIMIT) return;
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

  async function insertImageFiles(files: readonly File[], start: number, end: number) {
    if (files.length === 0) return;
    const targetNoteId = activeNote.id;
    const sourceAtStart = activeNote.source;
    setImageNotice('正在把图片保存到本机…');
    try {
      const assets = await Promise.all(files.map((file) => storeLocalImage(file)));
      const markdown = assets.map((asset) => `![${asset.alt}](${asset.uri})`).join('\n\n');
      const latestNote = workspaceRef.current.notes.find((note) => note.id === targetNoteId);
      if (!latestNote) return;
      const sourceChanged = latestNote.source !== sourceAtStart;
      const insertion = insertMarkdownBlock(
        latestNote.source,
        sourceChanged ? latestNote.source.length : start,
        sourceChanged ? latestNote.source.length : end,
        markdown,
      );
      dispatch({ type: 'note-source', noteId: targetNoteId, source: insertion.source });

      if (workspaceRef.current.activeNoteId === targetNoteId) {
        setImageSources((current) => {
          const next = new Map(current);
          assets.forEach((asset) => next.set(asset.uri, asset.dataUrl));
          return next;
        });
        setOrganizeUndo(null);
        setImageNotice(`已插入 ${assets.length} 张图片，可随正文一起复制`);
        window.requestAnimationFrame(() => {
          editorRef.current?.focus();
          editorRef.current?.setSelectionRange(insertion.cursor, insertion.cursor);
        });
      }
    } catch (error) {
      if (workspaceRef.current.activeNoteId === targetNoteId) {
        setImageNotice(error instanceof Error ? error.message : '图片插入失败');
      }
    }
  }

  function pasteImages(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (activeNote.channel !== 'wechat') return;
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (files.length === 0) return;
    event.preventDefault();
    void insertImageFiles(files, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
  }

  function selectChannel(channel: ChannelId) {
    if (channel === activeNote.channel) return;
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    setCopyState('idle');
    setCopyTarget('all');
    setPreviewMotion(true);
    dispatch({ type: 'note-patch', patch: { channel }, closeDrawer: true });
  }

  function requestConfirmation(request: ConfirmationRequest): Promise<boolean> {
    confirmationResolverRef.current?.(false);
    setConfirmation(request);
    return new Promise((resolve) => {
      confirmationResolverRef.current = resolve;
    });
  }

  function settleConfirmation(accepted: boolean) {
    const resolve = confirmationResolverRef.current;
    confirmationResolverRef.current = null;
    setConfirmation(null);
    resolve?.(accepted);
  }

  async function selectTemplate(templateId: string) {
    const template = getTemplate(templateId);
    const accepted = await requestConfirmation({
      kicker: '应用内容模板',
      marker: '替',
      title: `用“${template.name}”替换当前内容？`,
      description: '当前笔记的正文会被模板内容替换，已选择的渠道与排版主题保持不变。',
      confirmLabel: '应用模板',
      tone: 'default',
    });
    if (!accepted) return;
    setOrganizeUndo(null);
    dispatch({ type: 'note-patch', patch: { source: template.source }, closeDrawer: true });
  }

  function organizeSource() {
    const organized = organizeXhsSource(activeNote.source);
    if (!organized.changed) return;
    setOrganizeUndo({ source: activeNote.source, summary: organized.summary });
    setPreviewMotion(true);
    dispatch({ type: 'note-patch', patch: { source: organized.source } });
  }

  function undoOrganize() {
    if (!organizeUndo) return;
    dispatch({ type: 'note-patch', patch: { source: organizeUndo.source } });
    setOrganizeUndo(null);
  }

  function toggleDrawer(drawer: DrawerId) {
    dispatch({ type: 'drawer', drawer: state.activeDrawer === drawer ? null : drawer });
  }

  function focusActiveEditor() {
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }

  function createNote() {
    setOrganizeUndo(null);
    dispatch({ type: 'workspace', workspace: addNote(state.workspace), closeDrawer: true });
    dispatch({ type: 'mobile-view', view: 'edit' });
    focusActiveEditor();
  }

  function selectNote(noteId: string) {
    if (noteId === state.workspace.activeNoteId) return;
    setOrganizeUndo(null);
    setCopyState('idle');
    dispatch({ type: 'select-note', noteId });
    setPreviewMotion(true);
  }

  async function removeNote(noteId: string) {
    const note = state.workspace.notes.find((item) => item.id === noteId);
    if (!note) return;
    const accepted = await requestConfirmation({
      kicker: '删除本机笔记',
      marker: '删',
      title: `删除“${getNoteDisplayTitle(note)}”？`,
      description: '这条笔记会从当前浏览器中永久移除，此操作无法撤销。',
      confirmLabel: '确认删除',
      tone: 'danger',
    });
    if (!accepted) return;
    setOrganizeUndo(null);
    dispatch({ type: 'workspace', workspace: deleteNote(state.workspace, noteId) });
  }

  function exportBackup() {
    const blob = new Blob([serializeWorkspaceBackup(state.workspace)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `纸间排版-笔记备份-${date}.json`;
    link.hidden = true;
    globalThis.document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  async function importBackup(value: string): Promise<{ success: boolean; message: string }> {
    try {
      const workspace = parseWorkspaceBackup(value);
      // Keep the confirmation tied to the snapshot the user saw, not a later remote update.
      const baseline = workspaceRef.current;
      if (!state.persistenceBlocked) {
        saveWorkspace(baseline, persistedWorkspaceRef.current);
        persistedWorkspaceRef.current = baseline;
      }
      const accepted = await requestConfirmation({
        kicker: '导入本地备份',
        marker: '入',
        title: `用备份中的 ${workspace.notes.length} 条笔记替换当前内容？`,
        description: `当前浏览器里的 ${state.workspace.notes.length} 条笔记会被整套替换，建议确认已经导出过现有备份。`,
        confirmLabel: '确认导入',
        tone: 'default',
      });
      if (!accepted) return { success: false, message: '已取消导入' };
      const replacement = replaceWorkspace(workspace, baseline);
      persistedWorkspaceRef.current = replacement;
      setOrganizeUndo(null);
      dispatch({ type: 'workspace', workspace: replacement, unblockPersistence: true });
      return { success: true, message: `已导入 ${replacement.notes.length} 条笔记` };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : '导入失败' };
    }
  }

  const saveLabel = saveState === 'saving'
    ? '正在保存'
    : saveState === 'conflict'
      ? '其他标签页有更新'
      : saveState === 'recovery'
        ? '本地数据异常，请导入备份'
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
            data-active={activeNote.channel === 'xiaohongshu'}
            onClick={() => selectChannel('xiaohongshu')}
          >小红书</button>
          <button
            type="button"
            data-active={activeNote.channel === 'wechat'}
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

        {state.activeDrawer === 'notes' ? (
          <NoteDrawer
            notes={state.workspace.notes}
            activeNoteId={state.workspace.activeNoteId}
            onClose={() => dispatch({ type: 'drawer', drawer: null })}
            onCreate={createNote}
            onSelect={selectNote}
            onRename={(noteId, title) => dispatch({
              type: 'workspace',
              workspace: renameNote(state.workspace, noteId, title),
            })}
            onDuplicate={(noteId) => dispatch({
              type: 'workspace',
              workspace: duplicateNote(state.workspace, noteId),
            })}
            onDelete={removeNote}
            onExport={exportBackup}
            onImport={importBackup}
          />
        ) : state.activeDrawer ? (
          <ToolDrawer
            activeDrawer={state.activeDrawer}
            channel={activeNote.channel}
            selectedThemeId={activeTheme.id}
            wechatStyle={activeNote.wechatStyle}
            onClose={() => dispatch({ type: 'drawer', drawer: null })}
            onSelectTheme={(themeId) => dispatch({ type: 'note-patch',
              patch: activeNote.channel === 'xiaohongshu'
                ? { themeId }
                : { wechatThemeId: themeId },
              closeDrawer: true,
            })}
            onSelectTemplate={selectTemplate}
            onApplyWechatStyle={(style) => dispatch({ type: 'note-patch', patch: { wechatStyle: style } })}
            onUpdateWechatStyle={(property, value) => dispatch({
              type: 'note-patch',
              patch: { wechatStyle: { ...activeNote.wechatStyle, [property]: value } },
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
              {wechatResult ? (
                <>
                  <input
                    ref={imageInputRef}
                    data-testid="wechat-image-input"
                    type="file"
                    accept={WECHAT_IMAGE_ACCEPT}
                    multiple
                    hidden
                    onChange={(event) => {
                      const files = Array.from(event.currentTarget.files ?? []);
                      event.currentTarget.value = '';
                      const editor = editorRef.current;
                      void insertImageFiles(
                        files,
                        editor?.selectionStart ?? activeNote.source.length,
                        editor?.selectionEnd ?? activeNote.source.length,
                      );
                    }}
                  />
                  <button
                    className={styles.imageButton}
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                  >插入图片</button>
                </>
              ) : null}
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
                {activeNote.channel === 'wechat' ? `样式 · ${wechatStyleName}` : `主题 · ${activeTheme.name}`}
              </button>
            </div>
          </header>

          <label className={styles.visuallyHidden} htmlFor="source-editor">输入文案</label>
          <textarea
            ref={editorRef}
            className={styles.editor}
            id="source-editor"
            value={activeNote.source}
            spellCheck="false"
            onChange={(event) => {
              setOrganizeUndo(null);
              dispatch({ type: 'note-patch', patch: { source: event.target.value } });
            }}
            onPaste={pasteImages}
          />

          <footer className={styles.editorFooter}>
            <span
              className={styles.characterCount}
              data-over-limit={Boolean(xhsResult && result.stats.characters > XHS_CHARACTER_LIMIT)}
            >
              {xhsResult ? `${result.stats.characters} / ${XHS_CHARACTER_LIMIT} 字` : `${result.stats.characters} 字`}
            </span>
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
              <span className={styles.editorHint} aria-live="polite">
                {imageNotice ?? '支持标题、列表、引用、重点、代码和本地图片'}
              </span>
            )}
          </footer>
        </section>

        {wechatResult ? (
          <PreviewPane
            channel="wechat"
            result={wechatResult}
            theme={wechatTheme}
            styleName={wechatStyleName}
            styleColor={activeNote.wechatStyle.accentColor}
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
      <ConfirmDialog
        request={confirmation}
        onCancel={() => settleConfirmation(false)}
        onConfirm={() => settleConfirmation(true)}
      />
    </div>
  );
}
