import { describe, expect, it } from 'vitest';
import { defaultWechatStyleConfig } from '../../core/wechat-style';
import {
  LEGACY_DRAFT_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
  addNote,
  createDefaultWorkspace,
  deleteNote,
  duplicateNote,
  getActiveNote,
  getNoteDisplayTitle,
  loadWorkspace,
  parseWorkspaceBackup,
  renameNote,
  replaceWorkspace,
  saveWorkspace,
  serializeWorkspaceBackup,
  updateActiveNote,
  WorkspaceConflictError,
  WorkspaceLoadError,
  type StorageAdapter,
} from './storage';

class MemoryStorage implements StorageAdapter {
  values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('multi-note workspace storage', () => {
  it('creates one usable default note', () => {
    const workspace = createDefaultWorkspace(100, 'first');
    const note = getActiveNote(workspace);

    expect(workspace.activeNoteId).toBe('first');
    expect(note.source.length).toBeGreaterThan(0);
    expect(note.createdAt).toBe(100);
    expect(getNoteDisplayTitle(note)).not.toBe('未命名草稿');
  });

  it('migrates the legacy draft without deleting it', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_DRAFT_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      source: '# 旧草稿\n\n原文还在。',
      themeId: 'signal',
      wechatThemeId: 'editorial',
      wechatStyle: defaultWechatStyleConfig,
      channel: 'wechat',
    }));

    const workspace = loadWorkspace(storage);
    const note = getActiveNote(workspace);

    expect(note.source).toContain('旧草稿');
    expect(note.themeId).toBe('signal');
    expect(note.channel).toBe('wechat');
    expect(storage.getItem(LEGACY_DRAFT_STORAGE_KEY)).not.toBeNull();
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).toBeNull();
  });

  it('preserves long legacy drafts instead of replacing previously valid content', () => {
    const storage = new MemoryStorage();
    const longSource = '长'.repeat(500_001);
    storage.setItem(LEGACY_DRAFT_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      source: longSource,
      themeId: 'signal',
    }));

    expect(getActiveNote(loadWorkspace(storage)).source).toBe(longSource);
  });

  it('stops on an invalid V2 snapshot without falling back or overwriting it', () => {
    const storage = new MemoryStorage();
    const brokenWorkspace = '{"schemaVersion":2,"notes":[]}';
    storage.setItem(WORKSPACE_STORAGE_KEY, brokenWorkspace);
    storage.setItem(LEGACY_DRAFT_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      source: '# 不应静默回退到这里',
      themeId: 'signal',
    }));

    expect(() => loadWorkspace(storage)).toThrow(WorkspaceLoadError);
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).toBe(brokenWorkspace);
  });

  it('keeps each note content and channel independent', () => {
    const firstWorkspace = createDefaultWorkspace(100, 'first');
    const firstEdited = updateActiveNote(firstWorkspace, { source: '# 第一篇', channel: 'wechat' }, 110);
    const withSecond = addNote(firstEdited, 120, 'second');
    const secondEdited = updateActiveNote(withSecond, { source: '# 第二篇', channel: 'xiaohongshu' }, 130);
    const switchedBack = { ...secondEdited, activeNoteId: 'first' };

    expect(getActiveNote(secondEdited).source).toBe('# 第二篇');
    expect(getActiveNote(secondEdited).channel).toBe('xiaohongshu');
    expect(getActiveNote(switchedBack).source).toBe('# 第一篇');
    expect(getActiveNote(switchedBack).channel).toBe('wechat');
  });

  it('renames, duplicates and replaces the final deleted note safely', () => {
    const initial = updateActiveNote(createDefaultWorkspace(100, 'first'), { source: '# 原稿' }, 110);
    const renamed = renameNote(initial, 'first', '自定义名称', 120);
    const duplicated = duplicateNote(renamed, 'first', 130, 'copy');

    expect(getNoteDisplayTitle(getActiveNote(renamed))).toBe('自定义名称');
    expect(getActiveNote(duplicated).title).toBe('自定义名称 副本');
    expect(getActiveNote(duplicated).source).toBe('# 原稿');

    const oneLeft = deleteNote(duplicated, 'first', 140, 'unused');
    const replaced = deleteNote(oneLeft, 'copy', 150, 'fresh');
    expect(replaced.notes).toHaveLength(1);
    expect(replaced.activeNoteId).toBe('fresh');
    expect(getActiveNote(replaced).source).toBe('');
  });

  it('persists V2 and round-trips a validated JSON backup', () => {
    const storage = new MemoryStorage();
    const workspace = addNote(createDefaultWorkspace(100, 'first'), 110, 'second');
    saveWorkspace(workspace, storage);

    expect(loadWorkspace(storage)).toEqual(workspace);
    const backup = serializeWorkspaceBackup(workspace, '2026-08-25T00:00:00.000Z');
    expect(parseWorkspaceBackup(backup)).toEqual(workspace);
  });

  it('rejects a stale whole-workspace save from another tab', () => {
    const storage = new MemoryStorage();
    const base = createDefaultWorkspace(100, 'first');
    saveWorkspace(base, storage);
    const tabA = loadWorkspace(storage);
    const tabB = loadWorkspace(storage);

    saveWorkspace(updateActiveNote(tabA, { source: '# 标签页 A' }, 110), storage);
    expect(() => saveWorkspace(
      updateActiveNote(tabB, { source: '# 标签页 B' }, 120),
      storage,
    )).toThrow(WorkspaceConflictError);
    expect(getActiveNote(loadWorkspace(storage)).source).toBe('# 标签页 A');
  });

  it('allows a confirmed backup to replace corrupt data but not a newer valid revision', () => {
    const storage = new MemoryStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, '{broken');
    const imported = createDefaultWorkspace(100, 'imported');
    const replacement = replaceWorkspace(imported, 0, storage);
    expect(loadWorkspace(storage)).toEqual(replacement);

    const newer = updateActiveNote(replacement, { source: '# 新版本' }, 110);
    saveWorkspace(newer, storage);
    expect(() => replaceWorkspace(imported, replacement.revision, storage)).toThrow(WorkspaceConflictError);
  });

  it('rejects unrelated or structurally invalid backup files', () => {
    expect(() => parseWorkspaceBackup('{"hello":"world"}')).toThrow('有效的纸间排版备份');

    const workspace = createDefaultWorkspace(100, 'first');
    const invalid = JSON.parse(serializeWorkspaceBackup(workspace)) as {
      workspace: { activeNoteId: string };
    };
    invalid.workspace.activeNoteId = 'missing';
    expect(() => parseWorkspaceBackup(JSON.stringify(invalid))).toThrow('有效的纸间排版备份');

    const invalidDate = JSON.parse(serializeWorkspaceBackup(workspace)) as {
      workspace: { notes: Array<{ updatedAt: number }> };
    };
    invalidDate.workspace.notes[0]!.updatedAt = 8_640_000_000_000_001;
    expect(() => parseWorkspaceBackup(JSON.stringify(invalidDate))).toThrow('有效的纸间排版备份');
  });
});
