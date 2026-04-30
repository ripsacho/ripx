# UI WCAG Contrast Checklist

This checklist tracks key UI color pairs touched in the Settings, Setup Wizard, and Sidebar polish work.

## Scope

- Settings shell/rail/context UI
- Setup Wizard links and action affordances
- Sidebar badges (light/dark themes)

## WCAG Target

- **AA normal text:** contrast ratio `>= 4.5:1`
- **AA large text / UI components:** contrast ratio `>= 3:1`

## Verified Pairs

| Component                  | Theme | Foreground                  | Background (effective)                  | Ratio   | Status  |
| -------------------------- | ----- | --------------------------- | --------------------------------------- | ------- | ------- |
| Sidebar badge success      | Dark  | `#a7f3d0`                   | `rgba(16, 185, 129, 0.26)` on `#0f172a` | `8.83`  | PASS AA |
| Sidebar badge warning      | Dark  | `#fde68a`                   | `rgba(245, 158, 11, 0.30)` on `#0f172a` | `7.95`  | PASS AA |
| Sidebar badge neutral      | Dark  | `#c4b5fd`                   | `rgba(99, 102, 241, 0.26)` on `#0f172a` | `7.14`  | PASS AA |
| Settings metric hint text  | Dark  | `rgba(226, 232, 240, 0.90)` | `rgba(6, 182, 212, 0.07)` on `#0f172a`  | `13.08` | PASS AA |
| Settings context hint text | Dark  | `rgba(241, 245, 249, 0.97)` | `rgba(15, 23, 42, 0.72)` on `#0f172a`   | `16.30` | PASS AA |
| Settings rail title text   | Dark  | `rgba(226, 232, 240, 0.92)` | `rgba(15, 23, 42, 0.68)` on `#0f172a`   | `14.48` | PASS AA |
| Setup link text            | Light | `#0e7490`                   | `#ffffff`                               | `5.36`  | PASS AA |
| Setup link text            | Dark  | `#67e8f9`                   | `#141414`                               | `12.71` | PASS AA |

## Notes

- The previous light-theme setup link color (`#06b6d4`) failed AA on white (`2.43:1`) and was updated.
- Focus visibility is enforced with `:focus-visible` styles in Settings rail tabs and Setup links/buttons.

## Re-Check Procedure

When changing theme tokens or component color styles:

1. Recalculate contrast for touched pairs.
2. Keep normal text at `>= 4.5:1`.
3. If a pair is below target, adjust foreground first, then background alpha.
4. Re-run a quick keyboard pass for visible focus outlines in both themes.
