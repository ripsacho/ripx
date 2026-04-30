# Icons Usage Guide

This document describes where each icon file is used in the RipX application.

## 📁 Available Icon Files

### Favicons (Browser Tab Icons)

- `favicon.svg` - SVG favicon (modern browsers)
- `favicon.ico` - ICO format (legacy browser support)
- `favicon-256.png` - 256x256 PNG (high-res displays)
- `favicon-128.png` - 128x128 PNG (standard displays)
- `favicon-64.png` - 64x64 PNG (medium displays)
- `favicon-48.png` - 48x48 PNG (small displays)
- `favicon-32.png` - 32x32 PNG (standard favicon)
- `favicon-32.svg` - 32x32 SVG (alternative)
- `favicon-16.png` - 16x16 PNG (small favicon)

### Application Icons

- `logo.svg` - Main RipX logo (SVG format)
- `icon.svg` - App icon (SVG format, used in collapsed sidebar)
- `RipsX.png` - Main logo (PNG format, used in expanded sidebar)
- `RipsX-Old.png` - Legacy logo (backup/archive)

## 📍 Usage Locations

### 1. Browser Favicon (`index.html`)

**File:** `frontend/index.html`

All favicon sizes are referenced in the HTML head for maximum browser compatibility:

- SVG favicon (primary)
- PNG sizes: 256, 128, 64, 48, 32, 16
- ICO format (fallback)
- Apple Touch Icons (for iOS devices)

### 2. Sidebar Logo (Expanded State)

**File:** `frontend/src/components/Layout/Sidebar.jsx`
**Path:** `/RipsX.png`
**Fallback:** `/logo.svg` → Text "RipX"

When sidebar is expanded, shows:

- Primary: `RipsX.png`
- Fallback 1: `logo.svg`
- Fallback 2: Text "RipX"

### 3. Sidebar Icon (Collapsed State)

**File:** `frontend/src/components/Layout/Sidebar.jsx`
**Path:** `/icon.svg`
**Fallback:** Text "R"

When sidebar is collapsed, shows:

- Primary: `icon.svg`
- Fallback: Text "R"

## 🔧 How to Update Icons

1. **Replace the file** in `/frontend/public/` with the same filename
2. **Clear browser cache** to see changes (Ctrl+Shift+R or Cmd+Shift+R)
3. **Restart dev server** if needed

## ✅ Current Status

All icon formats are properly configured and referenced in the application.
