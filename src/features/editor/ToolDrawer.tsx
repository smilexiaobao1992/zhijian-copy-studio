import { contentTemplates } from '../../core/templates';
import { xhsThemes } from '../../core/themes';
import { wechatThemes } from '../../core/wechat-themes';
import styles from './EditorApp.module.css';

export type DrawerId = 'themes' | 'templates' | 'guide';

interface ToolDrawerProps {
  activeDrawer: DrawerId;
  channel: 'xiaohongshu' | 'wechat';
  selectedThemeId: string;
  onClose: () => void;
  onSelectTheme: (themeId: string) => void;
  onSelectTemplate: (templateId: string) => void;
}

export function ToolDrawer({
  activeDrawer,
  channel,
  selectedThemeId,
  onClose,
  onSelectTheme,
  onSelectTemplate,
}: ToolDrawerProps) {
  const themes = channel === 'xiaohongshu' ? xhsThemes : wechatThemes;
  const channelName = channel === 'xiaohongshu' ? '小红书纯文本' : '微信公众号富文本';

  return (
    <aside className={styles.drawer} id="tool-drawer" aria-label="排版工具面板">
      <div className={styles.drawerHeader}>
        <div>
          <span className={styles.eyebrow}>工具</span>
          <h2>
            {activeDrawer === 'themes' ? '选择主题' : null}
            {activeDrawer === 'templates' ? '内容模板' : null}
            {activeDrawer === 'guide' ? '输入说明' : null}
          </h2>
        </div>
        <button className={styles.iconButton} type="button" onClick={onClose} aria-label="关闭工具面板">
          ×
        </button>
      </div>

      {activeDrawer === 'themes' ? (
        <div className={styles.drawerList}>
          {themes.map((theme) => (
            <button
              className={styles.themeOption}
              data-selected={theme.id === selectedThemeId}
              type="button"
              key={theme.id}
              onClick={() => onSelectTheme(theme.id)}
            >
              <span className={styles.themeSwatch} style={{ backgroundColor: theme.swatch }} aria-hidden="true" />
              <span>
                <strong>{theme.name}</strong>
                <small>{theme.description}</small>
              </span>
              <span className={styles.optionState}>{theme.id === selectedThemeId ? '使用中' : '预览'}</span>
            </button>
          ))}
        </div>
      ) : null}

      {activeDrawer === 'templates' ? (
        <div className={styles.drawerList}>
          <p className={styles.drawerNote}>应用模板会替换当前草稿，主题不会改变。</p>
          {contentTemplates.map((template) => (
            <button
              className={styles.templateOption}
              type="button"
              key={template.id}
              onClick={() => onSelectTemplate(template.id)}
            >
              <strong>{template.name}</strong>
              <span>{template.description}</span>
            </button>
          ))}
        </div>
      ) : null}

      {activeDrawer === 'guide' ? (
        <div className={styles.guide}>
          <p>输入普通文案或 Markdown，右侧会立即生成{channelName}。</p>
          <dl>
            <div><dt># 标题</dt><dd>生成主题化小标题</dd></div>
            <div><dt>- 列表</dt><dd>生成符号列表</dd></div>
            <div><dt>1. 步骤</dt><dd>生成数字序号</dd></div>
            <div><dt>&gt; 提示</dt><dd>生成醒目引用</dd></div>
            <div><dt>**重点**</dt><dd>生成纯文本强调</dd></div>
          </dl>
          <p className={styles.drawerNote}>
            {channel === 'xiaohongshu'
              ? '标题、强调和列表会转换成适合小红书发布的纯文本格式。'
              : '公众号输出只使用安全的内联样式，复制后粘贴到公众号编辑器即可继续调整。'}
          </p>
        </div>
      ) : null}
    </aside>
  );
}
