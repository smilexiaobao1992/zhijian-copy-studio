# Social Copy Studio design system

## 1. Visual theme and atmosphere

The product is a quiet editorial workbench: warm paper, dark ink, and one vermilion action color. It should feel closer to a careful writing desk than a SaaS dashboard. The interface stays restrained so the creator's copy remains the strongest visual element.

## 2. Color palette and roles

| Token | Value | Role |
| --- | --- | --- |
| `--color-canvas` | `oklch(0.958 0.012 82)` | Warm outer canvas |
| `--color-rail` | `oklch(0.925 0.016 78)` | Tool rail and secondary surface |
| `--color-paper` | `oklch(0.991 0.005 85)` | Editor and reading paper |
| `--color-ink` | `oklch(0.245 0.018 58)` | Primary text |
| `--color-muted` | `oklch(0.49 0.018 65)` | Secondary text |
| `--color-line` | `oklch(0.855 0.018 76)` | Dividers and field boundaries |
| `--color-accent` | `oklch(0.61 0.172 29)` | Primary actions and active state |
| `--color-success` | `oklch(0.52 0.105 145)` | Saved and copied states |

## 3. Typography rules

- Display: `Songti SC`, `STSong`, serif. Used for the product name and editorial headings because its printed texture matches the paper metaphor.
- Body: `PingFang SC`, `Hiragino Sans GB`, `Microsoft YaHei`, sans-serif. Used for controls and long Chinese UI copy.
- Source: `SFMono-Regular`, `Cascadia Code`, `Menlo`, monospace. Used only inside the Markdown editor.
- Display sizes use `-0.022em` tracking, section headings use `-0.012em`, counters use tabular numerals.

## 4. Component styling

- Buttons use the fixed `--radius-2` radius, a 40px minimum hit target, a visible focus ring, and `scale(0.96)` while pressed.
- Inputs are flush paper surfaces with a single hairline divider. They do not use floating cards or inset shadows.
- Tool navigation uses text plus a one-character marker, never unlabeled icons.
- Status states keep a fixed 13px type size to prevent toolbar jitter.

## 5. Layout principles

- Desktop grid: 68px tool rail, flexible editor, 420px preview.
- The preview is a 375px reading canvas without fake phone chrome.
- Spacing uses a four-point scale from 4px to 40px.
- The editor has a comfortable line length and generous vertical rhythm.

## 6. Depth and elevation

Depth comes from background lightness steps. Only the reading sheet uses a restrained layered shadow. Tool groups remain cardless.

## 7. Do and do not

- Do keep the primary route focused on writing, previewing, changing theme, and copying.
- Do separate product UI tokens from exported content themes.
- Do show output limitations as plain language beside the preview.
- Do give every marketing section one content-specific geometric diagram instead of decorative filler.
- Do preserve keyboard navigation and visible focus.
- Do not draw browser or phone chrome.
- Do not use gradients, glass effects, or decorative blobs.
- Do not show more than one primary action in a panel.
- Do not hide platform output behind a modal.

## 8. Responsive behavior

- Above 1100px: full three-column workspace.
- Between 801px and 1100px: narrower preview and compact labels.
- Between 481px and 800px: compact side-by-side editor and preview.
- At 480px and below: one content pane, edit/preview switch in the header, fixed bottom tool rail, safe-area padding.
- All touch targets remain at least 40px.

## 9. Agent prompt guide

- Build a workspace header on `--color-paper`, 56px high, body font 13px, weight 500, `--color-line` bottom divider, and `--radius-2` buttons.
- Build an editor textarea on `--color-paper`, 16px monospace, 1.9 line-height, no border, no box shadow, and 28px internal padding.
- Build a reading preview on `--color-canvas`, with a centered 375px `--color-paper` sheet, 16px body type, 1.85 line-height, and a restrained two-layer shadow.
- Build a primary copy button using `--color-accent`, white text, 44px height, `--radius-2`, and a 120ms transform transition.
