# Component Standard for This Codebase

**Purpose:** Any reusable UI piece (picker, modal, selector, etc.) must follow this pattern. Use it for every new component so the codebase stays consistent and maintainable. **Agents and developers must follow this standard; do not introduce a different pattern for new components.**

---

## 1. What is a component?

A **component** is a reusable UI block used in more than one place (e.g. Product edit and Collection edit) or intended for reuse (e.g. a date picker, a tag selector). If it’s used once and will never be reused, a local block in a single view is fine. If it’s or will be reused, implement it as a component under this standard.

---

## 2. One component = three pieces (same every time)

| Piece | Location | Role |
|-------|----------|------|
| **Markup** | One Pug fragment with **one mixin** | Structure and config (data attributes) |
| **Behavior** | One JS file in `public/js/` | Init, events, DOM updates |
| **Styles** | One namespaced block in existing CSS file | Look and layout |

No inline scripts in the view for component logic. No one-off patterns (e.g. “this component uses an include without a mixin”). Same pattern for admin and web; only paths differ (fragments/admin vs fragments/web, admin.css vs main.css).

---

## 3. File and naming rules

### 3.1 Pug fragment

- **Path:** `src/views/fragments/<area>/<component-name>.pug`  
  `<area>` = `admin` or `web`.  
  `<component-name>` = kebab-case, e.g. `media-picker-section`, `date-picker`, `tag-selector`.
- **Content:** A single mixin. Mixin name = camelCase, e.g. `mediaPickerSection`, `datePicker`, `tagSelector`. Optionally the same as the component name in camelCase.
- **No root markup** in the file except the mixin definition (the file only defines the mixin; the parent calls it).

### 3.2 JavaScript

- **Path:** `src/public/js/<area>-<component-name>.js`  
  Examples: `admin-media-picker.js`, `admin-date-picker.js`, `web-tag-selector.js`.
- **Role:** Find the component on the page, read config from the root element, attach behavior. No product/collection/model-specific logic; behavior is generic and driven by config.

### 3.3 CSS

- **Location:** In the existing area stylesheet: `src/public/css/admin.css` (admin) or `src/public/css/main.css` (web). Do **not** create a new CSS file per component unless the project later adopts a different build/CSS strategy.
- **Scoping:** All classes for the component use a single prefix:  
  `.admin-<component-name>-*` or `.web-<component-name>-*`  
  Examples: `.admin-media-picker-section`, `.admin-media-picker-modal`, `.admin-media-picker-attached`.  
  Add a short comment in the CSS: `/* --- Media picker component --- */`.

---

## 4. Pug contract (mixin + root element)

- **Signature:** One argument only: `options` (object). No positional parameters.  
  Example: `mixin mediaPickerSection(options)`
- **Options:** Document required vs optional. Parent passes everything the component needs (labels, URLs, initial data). No reading from global `res.locals` inside the mixin except when the standard explicitly allows it; prefer explicit options.
- **Root element:** The mixin’s first output is a **single root element** (e.g. `div`) that:
  - Has a **data attribute** the script uses to find the component: `data-<component-name>` (e.g. `data-media-picker`). Use kebab-case.
  - Carries **all config** the script needs via other `data-*` attributes (e.g. `data-api-url`, `data-input-name`). The script reads from this element only; no separate `<script type="application/json">` unless the config is large or nested and data attributes are impractical.
- **No inline script** in the fragment for component behavior. Inline only if you must output a tiny JSON blob for a complex config; prefer data attributes.
- **No inline styles** in the mixin beyond what’s strictly necessary (e.g. one-off display). Layout and appearance go in the stylesheet.

---

## 5. JavaScript contract

- **Init:** On load (e.g. DOMContentLoaded), query the document for the component root: `document.querySelectorAll('[data-<component-name>]')` (e.g. `[data-media-picker]`). If none found, exit (no errors, no side effects).
- **Config:** Read from the root element’s `data-*` attributes (or one JSON script sibling if we documented that for this component). No hardcoded URLs or model names.
- **Scope:** All event handlers and DOM updates are scoped to that root (e.g. `root.querySelector(...)`). No global state; multiple instances on the same page work independently.
- **No dependencies on parent page structure** beyond the root and the structure the mixin outputs (e.g. a button with a known class, a container with a known class). The script does not assume it’s on “product” or “collection” page.

---

## 6. Loading script and CSS

- **Script:** The **layout** that renders pages using the component includes the script once (e.g. in `admin.pug`: `script(src="/public/js/admin-media-picker.js")`). So any admin page that calls the mixin gets the behavior without per-page script tags. Scripts are loaded in a consistent order (e.g. after layout scripts).
- **CSS:** Already loaded via the layout’s link to `admin.css` or `main.css`. Component styles live in that file under the component’s class prefix.

---

## 7. How a parent view uses a component

1. **Include** the fragment once (at top of file or before first use):  
   `include ../../fragments/admin/media-picker-section`
2. **Call** the mixin with one **options object**:  
   `+mediaPickerSection({ inputName: 'mediaIds[]', attachedMedia: product.media || [], ... })`
3. The parent is responsible for passing correct data (e.g. from controller). No magic globals inside the mixin.

---

## 8. Checklist for adding a new component

- [ ] Fragment: `src/views/fragments/<area>/<component-name>.pug` with one mixin (camelCase), single `options` argument, one root element with `data-<component-name>` and config in `data-*`.
- [ ] Script: `src/public/js/<area>-<component-name>.js`; init by `[data-<component-name>]`; read config from root; no model-specific logic.
- [ ] CSS: In `admin.css` or `main.css`, under one prefix `.admin-<component-name>-*` (or web), with a short comment.
- [ ] Layout: If the component is used on multiple pages, layout includes the script once.
- [ ] Docs: Optionally add a short note in this file or in a COMPONENTS.md index (component name, file paths, options shape, where it’s used).

---

## 9. What not to do

- **Do not** put component logic in inline `<script>` in the view; use the component’s JS file.
- **Do not** implement one component with a mixin and another with “include + locals” only; always use the mixin pattern for reusable components.
- **Do not** scatter component CSS across the file or use bare class names that might clash; always use the component prefix.
- **Do not** hardcode URLs, model names, or “product”/“collection” inside the component JS or mixin; pass them via options / data attributes.

This standard is the default for all new components. Follow it so that every component is discoverable, consistent, and maintainable.
