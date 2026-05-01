# RS_Tool-ATS — Design System

> **Source of truth** extracted from the codebase (`globals.css`, `styles.css`, `modals.css`, `Button.module.css`, and `layout.tsx`).
> All CSS custom properties use the `--rs-` namespace prefix.

---

## Table of Contents

1. [Typography](#1-typography)
2. [Color System](#2-color-system)
3. [Spacing & Layout](#3-spacing--layout)
4. [Components](#4-components)
5. [Animations & Transitions](#5-animations--transitions)
6. [Utility Classes](#6-utility-classes)
7. [Global Base Styles](#7-global-base-styles)

---

## 1. Typography

### Font Families

| Role | Font | CSS Variable | Fallback Stack |
|------|------|-------------|----------------|
| **Sans-serif (body/default)** | Source Sans 3 | `--font-sans` | `system-ui`, `arial`, `sans-serif` |
| **Serif (headings)** | Merriweather | `--font-serif` | `georgia`, `serif` |

Both fonts are loaded via **Next.js Google Fonts** (`next/font/google`) with `display: "swap"` and `preload: true` for optimal performance.

### Font Loading (layout.tsx)

```tsx
const sourceSans = Source_Sans_3({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
  fallback: ['system-ui', 'arial'],
});

const merriweather = Merriweather({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  display: "swap",
  preload: true,
  fallback: ['georgia', 'serif'],
});
```

### Global Defaults

- **Body text**: `font-family: var(--font-sans), sans-serif` · `line-height: 1.5`
- **Headings (h1–h6)**: `font-family: var(--font-serif), serif` · `font-weight: 700`
- **Universal override**: `* { font-family: "Source Sans 3", sans-serif; }` (set in `styles.css`)

### Typography Presets

#### Merriweather Heading Presets

| Class | Size | Weight | Line-Height | Letter-Spacing |
|-------|------|--------|-------------|----------------|
| `.text-merriweather-h1` | 3.75rem (60px) | 700 | 1.1 | -0.025em |
| `.text-merriweather-h2` | 2rem (32px) | 600 | 1.2 | — |
| `.text-merriweather-h3` | 1.5rem (24px) | 600 | 1.3 | — |
| `.text-merriweather-body` | 1rem (16px) | 400 | 1.6 | — |
| `.text-merriweather-value-h1` | 2.5rem (40px) | 700 | 1.1 | — |
| `.text-merriweather-careers` | *(inherits)* | 700 | *(inherits)* | — |

#### Hero Preset

| Class | Size | Weight | Line-Height | Font |
|-------|------|--------|-------------|------|
| `.text-preset-hero` | 3.5rem (56px) | 700 | 1.1 | Source Sans 3 |

#### Source Sans 3 Utility Presets

| Class | Weight | Line-Height | Size | Color |
|-------|--------|-------------|------|-------|
| `.text-source-sans` | *(inherits)* | *(inherits)* | *(inherits)* | *(inherits)* |
| `.text-rs-value-source-sans` | 700 | 1.1 | *(inherits)* | *(inherits)* |
| `.text-rs-service-source` | 500 | 1.2 | 1rem | *(inherits)* |
| `.text-rs-service-source-sans` | 500 | 1.2 | 1rem | `--rs-primary-900` |
| `.text-rs-service-source-sans-sm` | 500 | 1.2 | 14px | `--rs-primary-600` |
| `.text-rs-case-source-sans` | 300 | 1.2 | *(inherits)* | `--rs-neutral-200` |

#### Modal / Prose Typography (modals.css)

| Element | Property | Value |
|---------|----------|-------|
| `.prose h4` | font-size / weight / line-height | 1.125rem / 600 / 1.75rem |
| `.prose p` | line-height / margin-bottom | 1.625 / 1rem |
| `.prose ul` | margin-bottom | 1.5rem |
| `.prose li` | line-height | 1.625 |

---

## 2. Color System

All colors use the `--rs-` prefix and are defined as **HSLA** values for maximum flexibility.

### Primary Blues

The main brand color family. Hue ≈ **209°**.

| Token | Value | Description |
|-------|-------|-------------|
| `--rs-primary-50` | `hsla(207, 77%, 95%, 1)` | Very light blue |
| `--rs-primary-100` | `hsla(209, 84%, 88%, 1)` | Light blue |
| `--rs-primary-200` | `hsla(209, 89%, 78%, 1)` | Lighter blue |
| `--rs-primary-300` | `hsla(209, 96%, 65%, 1)` | Light blue |
| `--rs-primary-400` | `hsla(209, 100%, 55%, 1)` | Medium blue |
| `--rs-primary-500` | `hsla(209, 100%, 45%, 1)` | **Primary brand blue** |
| `--rs-primary-600` | `hsla(209, 80%, 35%, 1)` | Darker blue |
| `--rs-primary-700` | `hsla(209, 100%, 28%, 1)` | Dark blue |
| `--rs-primary-800` | `hsla(209, 100%, 23%, 1)` | Very dark blue |
| `--rs-primary-900` | `hsla(209, 90%, 18%, 1)` | Darkest blue |
| `--rs-primary-950` | `hsla(209, 70%, 12%, 1)` | Deepest blue |

### Accent Yellows / Oranges

Secondary brand color family. Hue ≈ **42°**.

| Token | Value | Description |
|-------|-------|-------------|
| `--rs-accent-50` | `hsla(42, 77%, 95%, 1)` | Very light yellow |
| `--rs-accent-100` | `hsla(42, 100%, 88%, 1)` | Light yellow |
| `--rs-accent-200` | `hsla(42, 95%, 76%, 1)` | Light yellow |
| `--rs-accent-300` | `hsla(42, 95%, 62%, 1)` | Medium yellow |
| `--rs-accent-400` | `hsla(42, 95%, 52%, 1)` | Orange-yellow |
| `--rs-accent-500` | `hsla(42, 94%, 45%, 1)` | **Primary orange** |
| `--rs-accent-600` | `hsla(42, 94%, 43%, 1)` | Dark orange |
| `--rs-accent-700` | `hsla(42, 94%, 38%, 1)` | Darker orange |
| `--rs-accent-800` | `hsla(42, 86%, 30%, 1)` | Very dark orange |
| `--rs-accent-900` | `hsla(43, 76%, 18%, 1)` | Deepest orange |
| `--rs-accent-950` | `hsla(42, 60%, 10%, 1)` | Near-black orange |

### Neutral Colors (Blue-tinted)

Cool-toned neutrals with a subtle blue hue ≈ **209°**.

| Token | Value | Description |
|-------|-------|-------------|
| `--rs-neutral-50` | `hsla(208, 87%, 97%, 1)` | Almost white |
| `--rs-neutral-100` | `hsla(209, 69%, 90%, 1)` | Very light |
| `--rs-neutral-200` | `hsla(209, 60%, 80%, 1)` | Light |
| `--rs-neutral-300` | `hsla(209, 50%, 70%, 1)` | Medium light |
| `--rs-neutral-400` | `hsla(209, 40%, 60%, 1)` | Medium |
| `--rs-neutral-500` | `hsla(209, 35%, 50%, 1)` | Mid-tone |
| `--rs-neutral-600` | `hsla(209, 40%, 35%, 1)` | Dark |
| `--rs-neutral-700` | `hsla(209, 50%, 25%, 1)` | Very dark |
| `--rs-neutral-800` | `hsla(208, 60%, 18%, 1)` | Almost black |
| `--rs-neutral-900` | `hsla(209, 67%, 13%, 1)` | Near-black |
| `--rs-neutral-950` | `hsla(208, 74%, 9%, 1)` | Deepest |

### Neutral Grey Colors (True grey)

Desaturated grey scale with a cool undertone. Hue ≈ **215–220°**, low saturation.

| Token | Value | Description |
|-------|-------|-------------|
| `--rs-neutral-grey-50` | `hsla(220, 20%, 97%, 1)` | Lightest grey |
| `--rs-neutral-grey-100` | `hsla(213, 18%, 90%, 1)` | — |
| `--rs-neutral-grey-200` | `hsla(217, 18%, 80%, 1)` | — |
| `--rs-neutral-grey-300` | `hsla(216, 17%, 70%, 1)` | — |
| `--rs-neutral-grey-400` | `hsla(215, 17%, 60%, 1)` | — |
| `--rs-neutral-grey-500` | `hsla(216, 17%, 50%, 1)` | Mid grey |
| `--rs-neutral-grey-600` | `hsla(217, 18%, 40%, 1)` | — |
| `--rs-neutral-grey-700` | `hsla(217, 20%, 30%, 1)` | — |
| `--rs-neutral-grey-800` | `hsla(215, 22%, 20%, 1)` | — |
| `--rs-neutral-grey-900` | `hsla(218, 24%, 13%, 1)` | — |
| `--rs-neutral-grey-950` | `hsla(217, 32%, 8%, 1)` | Darkest grey |

### Semantic Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--rs-success` | `#10b981` | Success states |
| `--rs-warning` | `#f59e0b` | Warning states |
| `--rs-error` | `#ef4444` | Error states |
| `--rs-info` | `#3b82f6` | Informational |

### Dark Mode (ShadCN/Radix-style tokens)

The codebase also uses HSL tokens (without `hsl()` wrapper) for light/dark mode via `prefers-color-scheme`:

**Light Mode:**
| Token | Value |
|-------|-------|
| `--background` | `0 0% 100%` |
| `--foreground` | `222.2 84% 4.9%` |
| `--primary` | `221.2 83.2% 53.3%` |
| `--primary-foreground` | `210 40% 98%` |
| `--secondary` | `210 40% 96.1%` |
| `--muted` | `210 40% 96.1%` |
| `--accent` | `210 40% 96.1%` |
| `--destructive` | `0 84.2% 60.2%` |
| `--border` | `214.3 31.8% 91.4%` |
| `--ring` | `221.2 83.2% 53.3%` |
| `--radius` | `0.5rem` |

**Dark Mode** (`prefers-color-scheme: dark`):
| Token | Value |
|-------|-------|
| `--background` | `222.2 84% 4.9%` |
| `--foreground` | `210 40% 98%` |
| `--primary` | `217.2 91.2% 59.8%` |
| `--secondary` | `217.2 32.6% 17.5%` |
| `--destructive` | `0 62.8% 30.6%` |
| `--border` | `217.2 32.6% 17.5%` |
| `--ring` | `224.3 76.3% 48%` |

---

## 3. Spacing & Layout

### Base Values

| Property | Value |
|----------|-------|
| Default border-radius | `0.5rem` (via `--radius`) |
| Card border-radius | `0.75rem` |
| Button border-radius | `12px` (primary/secondary), `8px` (footer), `6px` (social) |
| Card padding | `1.5rem` |
| Alert padding | `1rem` |
| Button padding (primary) | `0 1rem` → `0 2rem` (≥640px) |
| Button height (primary) | `50px` → `57px` (≥640px) |

### Breakpoints (Tailwind + Custom)

| Name | Min-Width | Notes |
|------|-----------|-------|
| `xs` | 400px | Custom (`xs:flex-row`) |
| `sm` | 640px | Tailwind default |
| `md` | 768px | Mobile menu breakpoint |
| `lg` | 1024px | Navbar button sizing |

### Body Background

- **Default**: `bg-(--rs-primary-50)` — the lightest blue tint from the primary palette.
- **Theme color meta**: `#0A2540` — deep navy (used for browser chrome).

---

## 4. Components

### 4.1 Buttons (BEM — `Button.module.css`)

All buttons use **BEM methodology** with base block `.button`.

```
.button                     → Base styles (inline-flex, Source Sans 3, 600 weight)
.button--{variant}          → Visual variant
.button--disabled           → Disabled state (opacity: 0.5, pointer-events: none)
.button--full-width         → width: 100%
.button--max-width          → width: 100%, max-width: 400px
.button__icon               → Icon element
.button__text               → Text element
```

#### Variant Summary

| Variant | Height | Font Size | Border-Radius | Background | Border |
|---------|--------|-----------|---------------|------------|--------|
| `--primary` | 50px → 57px | 18px → 22.5px | 12px | `#007bff` | none |
| `--secondary` | 50px → 57px | 18px → 22.5px | 12px | `--rs-primary-100` | 2px `--rs-primary-600` |
| `--navbar` | 46px | 18px | 12px | `--rs-primary-500` | 1.5px `--rs-primary-600` |
| `--social` | auto | 14px → 12px | 6px | `--rs-neutral-100` | 1px `--rs-neutral-400` |
| `--footer-schedule` | 50px | 1rem → 18px | 8px | `--rs-primary-500` | 1.5px `--rs-primary-600` |

#### Hover/Focus States

- **Primary**: bg → `#0056b3`, focus → `0 0 0 4px rgba(59, 130, 246, 0.3)`
- **Secondary**: bg → `#007bff`, text → white, focus → `0 0 0 2px #007bff`
- **Navbar**: bg → `--rs-primary-700`
- **Social**: bg → `--rs-neutral-200`, `scale(1.05)`, active → `scale(0.95)`
- **Footer-schedule**: bg → `--rs-primary-700`, `scale(1.05)`, active → `--rs-primary-800`, `scale(0.95)`

### 4.2 Cards

```css
.rs-card {
  background-color: white;
  border: 1px solid var(--rs-neutral-200);
  border-radius: 0.75rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  padding: 1.5rem;
}
```

### 4.3 Alerts

| Variant | Background | Border | Text Color |
|---------|------------|--------|------------|
| `.rs-alert-success` | `#ecfdf5` | `--rs-success` | `#065f46` |
| `.rs-alert-warning` | `#fffbeb` | `--rs-warning` | `#92400e` |

### 4.4 Service Cards

```css
.service-card {
  transition: all 0.3s ease;
}
.service-card:hover {
  transform: translateY(-2px);
}
```

### 4.5 Text Gradient

```css
.text-gradient {
  background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### 4.6 Section Backgrounds

| Class | Background |
|-------|------------|
| `.problem-bg` | `linear-gradient(135deg, #fef2f2, #fee2e2)` |
| `.solution-bg` | `linear-gradient(135deg, #eff6ff, #dbeafe)` |
| `.result-bg` | `linear-gradient(135deg, #f0fdf4, #d1fae5)` |
| `.bg-pattern` | Radial gradients with subtle blue dots |
| `.bg-logo-pattern` | Radial gradient at top-left corner |

---

## 5. Animations & Transitions

### Keyframe Animations

| Name | Effect | Duration |
|------|--------|----------|
| `fadeIn` | Opacity 0→1 + translateY(20px→0) | 0.6s ease-out |
| `fadeIn` (modal) | Opacity 0→1 | 0.2s ease-out |
| `slideUp` (modal) | Opacity 0→1 + translateY(20px) + scale(0.98→1) | 0.3s ease-out |
| `flash` | Opacity 1→0.6→1 | 0.3s ease-in-out |

### Animation Classes

| Class | Animation |
|-------|-----------|
| `.fade-in` | `fadeIn 0.6s ease-out` |
| `.animate-fadeIn` | `fadeIn 0.2s ease-out` |
| `.animate-slideUp` | `slideUp 0.3s ease-out` |
| `.flash` | `flash 0.3s ease-in-out` |

### Transition Defaults

| Element | Property | Duration |
|---------|----------|----------|
| Mobile menu | `all` | `0.3s ease-in-out` |
| Buttons | `all` | `0.3s ease` (most) / `0.2s ease` (footer) |
| Service cards | `all` | `0.3s ease` |
| Expandable content | `max-height` | `0.3s ease` |
| Button icons | `transform` | `0.3s ease` |

---

## 6. Utility Classes

### Color Utilities

All color tokens have matching utility classes with the convention:

```
.text-rs-{palette}-{shade}    → color
.bg-rs-{palette}-{shade}      → background-color
.border-rs-{palette}-{shade}  → border-color
```

**Palettes**: `primary`, `accent`, `neutral`, `neutral-grey`
**Shades**: `50`, `100`, `200`, `300`, `400`, `500`, `600`, `700`, `800`, `900`, `950`

#### Shorthand Aliases

| Class | Maps to |
|-------|---------|
| `.bg-rs-primary` | `--rs-primary-50` |
| `.bg-rs-primary-light` | `--rs-primary-100` |
| `.bg-rs-primary-dark` | `--rs-primary-700` |
| `.bg-rs-accent` | `--rs-accent-500` |
| `.bg-rs-neutral` | `--rs-neutral-100` |
| `.text-rs-primary` | `--rs-primary-500` |
| `.text-rs-primary-dark` | `--rs-primary-700` |
| `.text-rs-accent` | `--rs-accent-500` |
| `.text-rs-neutral` | `--rs-neutral-600` / `--rs-neutral-700` |
| `.text-rs-neutral-dark` | `--rs-neutral-800` |

#### Contextual Text Color Helpers

| Class | Color | Notes |
|-------|-------|-------|
| `.text-rs-value-primary-blue` | `--rs-primary-600` | Value proposition sections |
| `.text-rs-value-secondary-blue` | `--rs-primary-500` | — |
| `.text-rs-value-primary-neutral` | `--rs-neutral-600` | — |
| `.text-rs-case-primary-color` | `--rs-neutral-50` | Case study headings |
| `.text-rs-case-secondary-color` | `--rs-neutral-200` | Case study body text |
| `.text-rs-case-link` | `--rs-primary-200` + underline, 19px | Case study links |
| `.text-rs-linked` | `--rs-primary-600`, weight 400 | General links |
| `.text-rs-linked-neutral` | `--rs-neutral-600`, weight 400 | Neutral links |
| `.text-footer-neutral` | `--rs-neutral-600`, Source Sans 3 | Footer text |
| `.text-career-neutral` | `--rs-primary-600`, Source Sans 3, 500 | Career section |

#### Section Backgrounds

| Class | Color |
|-------|-------|
| `.bg-services` | `--rs-neutral-100` |
| `.bg-services-tags` | `--rs-primary-700` |
| `.bg-services-card` | `--rs-primary-800` |
| `.bg-case` | `--rs-neutral-900` |

### Focus & Form Utilities

```css
.focus-ring:focus {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

input:focus, textarea:focus {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}
```

### Expandable Content

```css
.expandable-content      → max-height: 0; overflow: hidden;
.expandable-content.expanded → max-height: 800px;
```

---

## 7. Global Base Styles

### CSS Reset (`globals.css` → `@layer base`)

```css
*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; padding: 0; }
html, body { height: 100%; }

body {
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: var(--font-sans), sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

img, picture, video, canvas, svg {
  display: block;
  max-width: 100%;
}

input, button, textarea, select { font: inherit; }
p, h1-h6 { overflow-wrap: break-word; }
h1-h6 { font-family: var(--font-serif), serif; font-weight: 700; }
a { color: inherit; text-decoration: inherit; }
#root, #__next { isolation: isolate; }
html { scroll-behavior: smooth; }
```

### Copy Protection

Text selection is **disabled globally** with exceptions for form elements:

```css
body, * {
  user-select: none;
  -webkit-touch-callout: none;
}

input, textarea, select, [contenteditable="true"], [role="textbox"] {
  user-select: text !important;
}
```

### Custom Scrollbar (Testimonials)

```css
#testimonial-track::-webkit-scrollbar         → height: 8px
#testimonial-track::-webkit-scrollbar-track    → bg: --rs-neutral-200, radius: 10px
#testimonial-track::-webkit-scrollbar-thumb    → bg: --rs-primary-500, radius: 10px
#testimonial-track::-webkit-scrollbar-thumb:hover → bg: --rs-accent-500
```

---

## File Reference

| File | Purpose |
|------|---------|
| `app/globals.css` | Tailwind import, CSS custom properties, base reset, dark mode tokens |
| `app/styles/styles.css` | Color system, typography presets, utility classes, component styles |
| `app/styles/modals.css` | Modal animations, prose typography overrides |
| `app/layout.tsx` | Font loading (Source Sans 3, Merriweather), global metadata |
| `components/atoms/Button/Button.module.css` | Button component (BEM), all variants |
