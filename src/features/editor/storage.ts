import { z } from 'zod';
import { defaultTemplate } from '../../core/templates';
import { defaultThemeId } from '../../core/themes';
import { defaultWechatThemeId } from '../../core/wechat-themes';
import {
  defaultWechatStyleConfig,
  wechatStyleConfigSchema,
  type WechatStyleConfig,
} from '../../core/wechat-style';

export const LEGACY_DRAFT_STORAGE_KEY = 'social-copy-studio:draft:v1';
export const WORKSPACE_STORAGE_KEY = 'social-copy-studio:workspace:v2';
export const MAX_BACKUP_SIZE_BYTES = 20_000_000;
export const BACKUP_SIZE_ERROR = '备份文件不能超过 20 MB';
const MAX_NOTES = 500;
const MAX_DATE_TIMESTAMP = 8_640_000_000_000_000;

export type ChannelId = 'xiaohongshu' | 'wechat';

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const draftSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.string(),
  themeId: z.string(),
  wechatThemeId: z.string().default(defaultWechatThemeId),
  wechatStyle: wechatStyleConfigSchema.default(defaultWechatStyleConfig),
  channel: z.enum(['xiaohongshu', 'wechat']).default('xiaohongshu'),
});

export interface DraftSnapshot {
  schemaVersion: 1;
  source: string;
  themeId: string;
  wechatThemeId: string;
  wechatStyle: WechatStyleConfig;
  channel: ChannelId;
}

const noteSnapshotSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(80).nullable(),
  source: z.string(),
  themeId: z.string(),
  wechatThemeId: z.string(),
  wechatStyle: wechatStyleConfigSchema,
  channel: z.enum(['xiaohongshu', 'wechat']),
  createdAt: z.number().int().min(0).max(MAX_DATE_TIMESTAMP),
  updatedAt: z.number().int().min(0).max(MAX_DATE_TIMESTAMP),
});

const workspaceSnapshotSchema = z.object({
  schemaVersion: z.literal(2),
  revision: z.number().int().nonnegative().default(0),
  activeNoteId: z.string().min(1),
  notes: z.array(noteSnapshotSchema).min(1).max(MAX_NOTES),
}).superRefine((workspace, context) => {
  if (!workspace.notes.some((note) => note.id === workspace.activeNoteId)) {
    context.addIssue({ code: 'custom', path: ['activeNoteId'], message: '当前笔记不存在' });
  }
  if (new Set(workspace.notes.map((note) => note.id)).size !== workspace.notes.length) {
    context.addIssue({ code: 'custom', path: ['notes'], message: '笔记 ID 不能重复' });
  }
});

const workspaceBackupSchema = z.object({
  app: z.literal('zhijian-copy-studio'),
  backupVersion: z.literal(1),
  exportedAt: z.string(),
  workspace: workspaceSnapshotSchema,
});

export interface NoteSnapshot {
  id: string;
  title: string | null;
  source: string;
  themeId: string;
  wechatThemeId: string;
  wechatStyle: WechatStyleConfig;
  channel: ChannelId;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceSnapshot {
  schemaVersion: 2;
  revision: number;
  activeNoteId: string;
  notes: NoteSnapshot[];
}

export class WorkspaceLoadError extends Error {
  constructor() {
    super('本机笔记数据异常，请导入备份恢复');
    this.name = 'WorkspaceLoadError';
  }
}

export class WorkspaceConflictError extends Error {
  constructor() {
    super('其他标签页已经保存了更新，请先刷新或导出当前内容');
    this.name = 'WorkspaceConflictError';
  }
}

export const defaultDraft: DraftSnapshot = {
  schemaVersion: 1,
  source: defaultTemplate.source,
  themeId: defaultThemeId,
  wechatThemeId: defaultWechatThemeId,
  wechatStyle: defaultWechatStyleConfig,
  channel: 'xiaohongshu',
};

function createNoteId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `note-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function noteFromDraft(draft: DraftSnapshot, now: number, id: string): NoteSnapshot {
  return {
    id,
    title: null,
    source: draft.source,
    themeId: draft.themeId,
    wechatThemeId: draft.wechatThemeId,
    wechatStyle: { ...draft.wechatStyle },
    channel: draft.channel,
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultWorkspace(now = Date.now(), id = createNoteId()): WorkspaceSnapshot {
  return { schemaVersion: 2, revision: 0, activeNoteId: id, notes: [noteFromDraft(defaultDraft, now, id)] };
}

export function createBlankNote(
  reference: Pick<NoteSnapshot, 'themeId' | 'wechatThemeId' | 'wechatStyle' | 'channel'>,
  now = Date.now(),
  id = createNoteId(),
): NoteSnapshot {
  return {
    id,
    title: null,
    source: '',
    themeId: reference.themeId,
    wechatThemeId: reference.wechatThemeId,
    wechatStyle: { ...reference.wechatStyle },
    channel: reference.channel,
    createdAt: now,
    updatedAt: now,
  };
}

export function loadWorkspace(storage: StorageAdapter = window.localStorage): WorkspaceSnapshot {
  try {
    const storedWorkspace = storage.getItem(WORKSPACE_STORAGE_KEY);
    if (storedWorkspace !== null) {
      return parseStoredWorkspace(storedWorkspace);
    }

    const storedDraft = storage.getItem(LEGACY_DRAFT_STORAGE_KEY);
    if (storedDraft !== null) {
      const result = draftSnapshotSchema.safeParse(JSON.parse(storedDraft));
      if (result.success) {
        const now = Date.now();
        const id = createNoteId();
        return { schemaVersion: 2, revision: 0, activeNoteId: id, notes: [noteFromDraft(result.data, now, id)] };
      }
      throw new WorkspaceLoadError();
    }
  } catch (error) {
    if (error instanceof WorkspaceLoadError) throw error;
    throw new WorkspaceLoadError();
  }
  return createDefaultWorkspace();
}

export function parseStoredWorkspace(value: string): WorkspaceSnapshot {
  try {
    return workspaceSnapshotSchema.parse(JSON.parse(value));
  } catch {
    throw new WorkspaceLoadError();
  }
}

function isSameWorkspace(left: WorkspaceSnapshot, right: WorkspaceSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function saveWorkspace(
  workspace: WorkspaceSnapshot,
  baseline: WorkspaceSnapshot,
  storage: StorageAdapter = window.localStorage,
): void {
  const result = workspaceSnapshotSchema.parse(workspace);
  const storedValue = storage.getItem(WORKSPACE_STORAGE_KEY);
  if (storedValue !== null) {
    const storedWorkspace = parseStoredWorkspace(storedValue);
    if (isSameWorkspace(storedWorkspace, result)) return;
    // Local edit counts are not a shared version: a stale tab can make more edits.
    if (!isSameWorkspace(storedWorkspace, baseline)) throw new WorkspaceConflictError();
  }
  storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(result));
}

export function replaceWorkspace(
  workspace: WorkspaceSnapshot,
  baseline: WorkspaceSnapshot,
  storage: StorageAdapter = window.localStorage,
): WorkspaceSnapshot {
  const storedValue = storage.getItem(WORKSPACE_STORAGE_KEY);
  if (storedValue !== null) {
    try {
      const storedWorkspace = parseStoredWorkspace(storedValue);
      if (!isSameWorkspace(storedWorkspace, baseline)) throw new WorkspaceConflictError();
    } catch (error) {
      // A confirmed backup import may replace an unreadable snapshot, but never a newer valid one.
      if (error instanceof WorkspaceConflictError) throw error;
    }
  }
  const replacement = workspaceSnapshotSchema.parse({
    ...workspace,
    revision: Math.max(workspace.revision, baseline.revision) + 1,
  });
  storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(replacement));
  return replacement;
}

export function getActiveNote(workspace: WorkspaceSnapshot): NoteSnapshot {
  const note = workspace.notes.find((item) => item.id === workspace.activeNoteId) ?? workspace.notes[0];
  if (!note) throw new Error('工作区至少需要一条笔记');
  return note;
}

export function getNoteDisplayTitle(note: NoteSnapshot): string {
  if (note.title) return note.title;
  const firstLine = note.source.split(/\r?\n/u).find((line) => line.trim());
  if (!firstLine) return '未命名草稿';
  const title = firstLine
    .trim()
    .replace(/^#{1,6}\s+/u, '')
    .replace(/^>\s+/u, '')
    .replace(/^(?:[-+*]|\d+[.)])\s+/u, '')
    .replace(/[*_~`]/gu, '')
    .trim();
  return title.slice(0, 36) || '未命名草稿';
}

export function updateActiveNote(
  workspace: WorkspaceSnapshot,
  patch: Partial<Omit<NoteSnapshot, 'id' | 'createdAt' | 'updatedAt'>>,
  now = Date.now(),
): WorkspaceSnapshot {
  return {
    ...workspace,
    revision: workspace.revision + 1,
    notes: workspace.notes.map((note) => note.id === workspace.activeNoteId
      ? { ...note, ...patch, updatedAt: now }
      : note),
  };
}

export function addNote(
  workspace: WorkspaceSnapshot,
  now = Date.now(),
  id = createNoteId(),
): WorkspaceSnapshot {
  if (workspace.notes.length >= MAX_NOTES) return workspace;
  const note = createBlankNote(getActiveNote(workspace), now, id);
  return { ...workspace, revision: workspace.revision + 1, activeNoteId: note.id, notes: [...workspace.notes, note] };
}

export function duplicateNote(
  workspace: WorkspaceSnapshot,
  noteId: string,
  now = Date.now(),
  id = createNoteId(),
): WorkspaceSnapshot {
  if (workspace.notes.length >= MAX_NOTES) return workspace;
  const sourceNote = workspace.notes.find((note) => note.id === noteId);
  if (!sourceNote) return workspace;
  const note: NoteSnapshot = {
    ...sourceNote,
    id,
    title: `${getNoteDisplayTitle(sourceNote)} 副本`.slice(0, 80),
    wechatStyle: { ...sourceNote.wechatStyle },
    createdAt: now,
    updatedAt: now,
  };
  return { ...workspace, revision: workspace.revision + 1, activeNoteId: note.id, notes: [...workspace.notes, note] };
}

export function renameNote(
  workspace: WorkspaceSnapshot,
  noteId: string,
  title: string,
  now = Date.now(),
): WorkspaceSnapshot {
  const normalizedTitle = title.trim().slice(0, 80);
  return {
    ...workspace,
    revision: workspace.revision + 1,
    notes: workspace.notes.map((note) => note.id === noteId
      ? { ...note, title: normalizedTitle || null, updatedAt: now }
      : note),
  };
}

export function deleteNote(
  workspace: WorkspaceSnapshot,
  noteId: string,
  now = Date.now(),
  replacementId = createNoteId(),
): WorkspaceSnapshot {
  const targetIndex = workspace.notes.findIndex((note) => note.id === noteId);
  if (targetIndex < 0) return workspace;
  if (workspace.notes.length === 1) {
    const replacement = createBlankNote(getActiveNote(workspace), now, replacementId);
    return {
      schemaVersion: 2,
      revision: workspace.revision + 1,
      activeNoteId: replacement.id,
      notes: [replacement],
    };
  }
  const notes = workspace.notes.filter((note) => note.id !== noteId);
  const activeNoteId = workspace.activeNoteId === noteId
    ? notes[Math.min(targetIndex, notes.length - 1)]?.id ?? notes[0]?.id ?? workspace.activeNoteId
    : workspace.activeNoteId;
  return { ...workspace, revision: workspace.revision + 1, activeNoteId, notes };
}

export function serializeWorkspaceBackup(
  workspace: WorkspaceSnapshot,
  exportedAt = new Date().toISOString(),
): string {
  const validated = workspaceSnapshotSchema.parse(workspace);
  const value = JSON.stringify({
    app: 'zhijian-copy-studio',
    backupVersion: 1,
    exportedAt,
    workspace: validated,
  }, null, 2);
  assertBackupSize(value);
  return value;
}

function assertBackupSize(value: string): void {
  if (new TextEncoder().encode(value).byteLength > MAX_BACKUP_SIZE_BYTES) {
    throw new Error(BACKUP_SIZE_ERROR);
  }
}

export function parseWorkspaceBackup(value: string): WorkspaceSnapshot {
  assertBackupSize(value);
  try {
    return workspaceBackupSchema.parse(JSON.parse(value)).workspace;
  } catch {
    throw new Error('这不是有效的纸间排版备份文件');
  }
}
