# Public Assets Directory

This directory contains static assets that are served directly without processing.

## Required Files:

1. **logo.png** (or **logo.svg**) - Main RipX logo
   - Used in: Sidebar header when expanded
   - Recommended size: 200x60px or larger
   - Format: PNG with transparency or SVG

2. **icon.png** (or **icon.svg**) - App icon
   - Used in: Sidebar header when collapsed and browser favicon
   - Recommended size: 64x64px
   - Format: PNG with transparency or SVG

3. **favicon.ico** (optional) - Browser favicon
   - Recommended size: 32x32px or 16x16px

## How it works:

Files in this directory are served at the root path:

- `public/logo.png` → accessible at `/logo.png`
- `public/icon.png` → accessible at `/icon.png`
- `public/favicon.ico` → accessible at `/favicon.ico`

The Sidebar component will automatically fall back to text if images are not found.

## Assets vs Public Folder

### `/frontend/public/` - Static Assets (Recommended)

- **Use for:** Images referenced by URL (e.g., `<img src="/logo.png" />`)
- **Access:** Files are served at root path (`/logo.png`)
- **Best for:** Logos, icons, favicons, images used in HTML/CSS

### `/frontend/src/assets/images/` - Imported Assets

- **Use for:** Images imported directly in React components
- **Access:** Import in code: `import logo from '../assets/images/logo.png'`
- **Best for:** Component-specific images that need bundling

**Recommendation:** Use `/public/` for logos, icons, and favicons. Use `/assets/images/` only if you need to import images directly in components.
