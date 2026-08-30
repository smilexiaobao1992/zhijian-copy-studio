import { contentTemplates } from '../../core/templates';
import { xhsThemes } from '../../core/themes';
import { wechatThemes } from '../../core/wechat-themes';
import {
  wechatAccentColors,
  wechatStylePresets,
  type WechatStyleConfig,
} from '../../core/wechat-style';
import styles from './EditorApp.module.css';

export type DrawerId = 'themes' | 'templates' | 'guide';

interface ToolDrawerProps {
  activeDrawer: DrawerId;
  channel: 'xiaohongshu' | 'wechat';
  selectedThemeId: string;
  wechatStyle: WechatStyleConfig;
  onClose: () => void;
  onSelectTheme: (themeId: string) => void;
  onSelectTemplate: (templateId: string) => void;
  onApplyWechatStyle: (style: WechatStyleConfig) => void;
  onUpdateWechatStyle: <Key extends keyof WechatStyleConfig>(
    property: Key,
    value: WechatStyleConfig[Key],
  ) => void;
}

export function ToolDrawer({
  activeDrawer,
  channel,
  selectedThemeId,
  wechatStyle,
  onClose,
  onSelectTheme,
  onSelectTemplate,
  onApplyWechatStyle,
  onUpdateWechatStyle,
}: ToolDrawerProps) {
  const themes = channel === 'xiaohongshu' ? xhsThemes : wechatThemes;
  const channelName = channel === 'xiaohongshu' ? '小红书纯文本' : '微信公众号富文本';

  return (
    <aside className={styles.drawer} id="tool-drawer" aria-label="排版工具面板">
      <div className={styles.drawerHeader}>
        <div>
          <span className={styles.eyebrow}>工具</span>
          <h2>
            {activeDrawer === 'themes' ? channel === 'wechat' ? '公众号样式工坊' : '选择主题' : null}
            {activeDrawer === 'templates' ? '内容模板' : null}
            {activeDrawer === 'guide' ? '输入说明' : null}
          </h2>
        </div>
        <button className={styles.iconButton} type="button" onClick={onClose} aria-label="关闭工具面板">
          ×
        </button>
      </div>

      {activeDrawer === 'themes' ? (
        channel === 'wechat' ? (
          <WechatStyleWorkshop
            config={wechatStyle}
            onApplyPreset={onApplyWechatStyle}
            onUpdate={onUpdateWechatStyle}
          />
        ) : (
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
        )
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
            {channel === 'wechat' ? <div><dt>==划线==</dt><dd>生成朱砂重点线</dd></div> : null}
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

interface WechatStyleWorkshopProps {
  config: WechatStyleConfig;
  onApplyPreset: (style: WechatStyleConfig) => void;
  onUpdate: <Key extends keyof WechatStyleConfig>(property: Key, value: WechatStyleConfig[Key]) => void;
}

function WechatStyleWorkshop({ config, onApplyPreset, onUpdate }: WechatStyleWorkshopProps) {
  const selectedPreset = wechatStylePresets.find((preset) => (
    Object.entries(preset.config).every(([key, value]) => (
      config[key as keyof WechatStyleConfig] === value
    ))
  ))?.id;

  return (
    <div className={styles.styleWorkshop}>
      <p className={styles.workshopIntro}>从一套完整气质开始，再微调到适合这篇文章的样子。</p>

      <fieldset className={styles.controlGroup}>
        <legend>版式气质</legend>
        <div className={styles.presetGrid}>
          {wechatStylePresets.map((preset) => (
            <button
              className={styles.presetOption}
              data-selected={selectedPreset === preset.id}
              type="button"
              key={preset.id}
              onClick={() => onApplyPreset({ ...preset.config })}
            >
              <span className={styles.presetSample} data-preset={preset.id} aria-hidden="true">
                <i /><i /><i />
              </span>
              <strong>{preset.name}</strong>
              <small>{preset.description}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.controlGroup}>
        <legend>正文字体</legend>
        <div className={styles.segmentedControls}>
          {([
            ['sans', '无衬线'],
            ['serif', '衬线'],
            ['mono', '等宽'],
          ] as const).map(([value, label]) => (
            <button
              type="button"
              data-selected={config.fontFamily === value}
              key={value}
              onClick={() => onUpdate('fontFamily', value)}
            >{label}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.controlGroup}>
        <legend>字号与行距</legend>
        <div className={styles.compoundControls}>
          <label>
            <span>字号</span>
            <select
              aria-label="公众号正文字号"
              value={config.bodySize}
              onChange={(event) => onUpdate('bodySize', Number(event.target.value) as WechatStyleConfig['bodySize'])}
            >
              {[15, 16, 17, 18].map((size) => <option value={size} key={size}>{size}px</option>)}
            </select>
          </label>
          <label>
            <span>行距</span>
            <select
              aria-label="公众号正文行距"
              value={config.lineHeight}
              onChange={(event) => onUpdate('lineHeight', Number(event.target.value) as WechatStyleConfig['lineHeight'])}
            >
              <option value={1.75}>紧凑 1.75</option>
              <option value={1.9}>标准 1.90</option>
              <option value={2.05}>舒展 2.05</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className={styles.controlGroup}>
        <legend>主题色</legend>
        <div className={styles.colorGrid}>
          {wechatAccentColors.map((color) => (
            <button
              type="button"
              data-selected={config.accentColor === color.value}
              aria-label={color.name}
              title={color.name}
              key={color.value}
              onClick={() => onUpdate('accentColor', color.value)}
            >
              <span style={{ backgroundColor: color.value }} aria-hidden="true" />
            </button>
          ))}
          <label className={styles.customColor} title="自定义主题色">
            <input
              type="color"
              aria-label="自定义主题色"
              value={config.accentColor}
              onChange={(event) => onUpdate('accentColor', event.target.value)}
            />
            <span>+</span>
          </label>
        </div>
      </fieldset>

      <fieldset className={styles.controlGroup}>
        <legend>标题样式</legend>
        <div className={styles.headingStyleGrid}>
          {([
            ['editorial', '章节'],
            ['side', '侧标'],
            ['underline', '细线'],
            ['minimal', '留白'],
          ] as const).map(([value, label]) => (
            <button
              type="button"
              data-selected={config.headingStyle === value}
              key={value}
              onClick={() => onUpdate('headingStyle', value)}
            >
              <span data-style={value} aria-hidden="true"><i /><i /></span>
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.controlGroup}>
        <legend>代码主题</legend>
        <div className={styles.segmentedControls}>
          <button
            type="button"
            data-selected={config.codeTheme === 'ink'}
            onClick={() => onUpdate('codeTheme', 'ink')}
          >深色墨块</button>
          <button
            type="button"
            data-selected={config.codeTheme === 'paper'}
            onClick={() => onUpdate('codeTheme', 'paper')}
          >浅色纸面</button>
        </div>
      </fieldset>
    </div>
  );
}
