import { useMemo, useRef, useState } from 'react';
import { MAX_BACKUP_SIZE_BYTES, getNoteDisplayTitle, type NoteSnapshot } from './storage';
import styles from './EditorApp.module.css';

interface NoteDrawerProps {
  notes: NoteSnapshot[];
  activeNoteId: string;
  onClose: () => void;
  onCreate: () => void;
  onSelect: (noteId: string) => void;
  onRename: (noteId: string, title: string) => void;
  onDuplicate: (noteId: string) => void;
  onDelete: (noteId: string) => void;
  onExport: () => void;
  onImport: (value: string) => Promise<{ success: boolean; message: string }>;
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function getExcerpt(source: string): string {
  return source
    .replace(/[#>*_~`\[\]()]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 42) || '还没有内容';
}

export function NoteDrawer({
  notes,
  activeNoteId,
  onClose,
  onCreate,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
  onExport,
  onImport,
}: NoteDrawerProps) {
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [backupMessage, setBackupMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visibleNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
    return [...notes]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .filter((note) => !normalizedQuery
        || `${getNoteDisplayTitle(note)} ${note.source}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery));
  }, [notes, query]);

  function startRename(note: NoteSnapshot) {
    setEditingId(note.id);
    setEditingTitle(note.title ?? getNoteDisplayTitle(note));
  }

  function finishRename() {
    if (!editingId) return;
    onRename(editingId, editingTitle);
    setEditingId(null);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BACKUP_SIZE_BYTES) {
      setBackupMessage('备份文件不能超过 5 MB');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    try {
      const result = await onImport(await file.text());
      setBackupMessage(result.message);
    } catch {
      setBackupMessage('读取备份文件失败');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <aside className={`${styles.drawer} ${styles.noteDrawer}`} id="tool-drawer" aria-label="笔记库">
      <div className={styles.drawerHeader}>
        <div>
          <span className={styles.eyebrow}>本机存储</span>
          <h2>笔记库 <small>{notes.length}</small></h2>
        </div>
        <button className={styles.iconButton} type="button" onClick={onClose} aria-label="关闭笔记库">×</button>
      </div>

      <button className={styles.createNoteButton} type="button" onClick={onCreate}>
        <span aria-hidden="true">＋</span>
        <span><strong>新建笔记</strong><small>沿用当前渠道与排版样式</small></span>
      </button>

      <label className={styles.noteSearch}>
        <span className={styles.visuallyHidden}>搜索笔记</span>
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          placeholder="搜索标题或正文"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div className={styles.noteList} aria-live="polite">
        {visibleNotes.length ? visibleNotes.map((note) => {
          const isActive = note.id === activeNoteId;
          const isEditing = note.id === editingId;
          return (
            <article className={styles.noteCard} data-active={isActive} key={note.id}>
              {isEditing ? (
                <form
                  className={styles.renameForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    finishRename();
                  }}
                >
                  <input
                    autoFocus
                    value={editingTitle}
                    maxLength={80}
                    aria-label="笔记名称"
                    onChange={(event) => setEditingTitle(event.target.value)}
                    onBlur={finishRename}
                  />
                  <button type="submit">保存</button>
                </form>
              ) : (
                <button className={styles.noteSelect} type="button" onClick={() => onSelect(note.id)}>
                  <span className={styles.noteHeading}>
                    <strong>{getNoteDisplayTitle(note)}</strong>
                    {isActive ? <i>当前</i> : null}
                  </span>
                  <span className={styles.noteExcerpt}>{getExcerpt(note.source)}</span>
                  <span className={styles.noteMeta}>
                    <span>{note.channel === 'xiaohongshu' ? '小红书' : '公众号'}</span>
                    <time dateTime={new Date(note.updatedAt).toISOString()}>{dateFormatter.format(note.updatedAt)}</time>
                  </span>
                </button>
              )}
              {!isEditing ? (
                <div className={styles.noteActions} aria-label={`${getNoteDisplayTitle(note)}操作`}>
                  <button type="button" onClick={() => startRename(note)}>改名</button>
                  <button type="button" onClick={() => onDuplicate(note.id)}>复制</button>
                  <button type="button" onClick={() => onDelete(note.id)}>删除</button>
                </div>
              ) : null}
            </article>
          );
        }) : (
          <div className={styles.noteEmpty}>没有找到相符的笔记</div>
        )}
      </div>

      <section className={styles.backupPanel} aria-labelledby="backup-heading">
        <div>
          <strong id="backup-heading">本地备份</strong>
          <p>跨浏览器或清理缓存前，先导出 JSON 文件。</p>
        </div>
        <div className={styles.backupActions}>
          <button type="button" onClick={() => {
            onExport();
            setBackupMessage('备份已导出');
          }}>导出</button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>导入</button>
          <input
            ref={fileInputRef}
            className={styles.visuallyHidden}
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importFile(event.target.files?.[0])}
          />
        </div>
        {backupMessage ? <p className={styles.backupMessage} role="status">{backupMessage}</p> : null}
      </section>
    </aside>
  );
}
