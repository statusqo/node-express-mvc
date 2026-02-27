# Media Picker Implementation Plan (Review Before Coding)

This plan implements the media picker as a **component** following **`docs/COMPONENT_STANDARD.md`**. Variant 2: picker fetches media from an API when opened; product/collection forms stay light. No styling polish in this pass—focus is on working, robust behavior.

---

## Order of work

### Step 1: API for media list (reusable)

- **Add route:** `GET /admin/api/media` (under admin router, so it’s protected by existing admin auth).
- **Add controller** (or reuse/extend): A small handler that returns JSON: `{ media: [...], uploadsBaseUrl: "..." }`. Media = array of `{ id, path, filename, mimeType, size, alt }` from `mediaService.findAllForAdmin()` (or equivalent). `uploadsBaseUrl` from config (same value we use in product/collection forms).
- **Response:** 200, `Content-Type: application/json`. No HTML.
- **Reuse:** Same endpoint for product edit, collection edit, and any future “attach media” form. No `for=product` in the API.

**Files:** New or existing admin API router/controller; register route in `src/routes/admin/index.js` (e.g. under `/api` or a dedicated admin API section if you have one). If there is no admin API yet, add a minimal one (e.g. `router.get("/api/media", ...)` on the admin router).

---

### Step 2: Pug fragment and mixin (component markup)

- **Create:** `src/views/fragments/admin/media-picker-section.pug`.
- **Content:** One mixin: `mixin mediaPickerSection(options)`.
- **Options (from design):** `inputName` (required), `attachedMedia` (required, array of `{ id, path, filename, mimeType, alt }`), `uploadsBaseUrl` (required), `apiUrl` (required), `label` (optional, default "Media"), `hint` (optional).
- **Root element:** e.g. `div.admin-media-picker-section` with `data-media-picker` and `data-input-name`, `data-api-url`, `data-uploads-base-url` (so the script never needs a separate config script).
- **Inside root:** (1) Label and optional hint, (2) Container for attached list (class e.g. `admin-media-picker-attached`) with server-rendered items from `attachedMedia` (thumbnail or icon, filename, Remove button; each item has `data-media-id`), (3) Hidden inputs for each ID (`name=options.inputName`, `value=item.id`), (4) Button “Select media” (class e.g. `admin-media-picker-open` or `data-action="open-media-picker"`), (5) Modal: overlay + box + title “Select media” + empty grid container (class e.g. `admin-media-picker-grid`) + “Add selected” and “Cancel”.
- **No inline script.** No inline styles except where strictly necessary for layout (e.g. display). Follow Component Standard.

---

### Step 3: JavaScript (component behavior)

- **Create:** `src/public/js/admin-media-picker.js`.
- **Init:** On DOMContentLoaded, `querySelectorAll('[data-media-picker]')`. For each root, read `data-input-name`, `data-api-url`, `data-uploads-base-url` from the root. If any missing, skip that instance.
- **Behavior:**  
  - Open button click: show modal, if grid empty then fetch `apiUrl` (GET), parse JSON, render grid (thumbnail, filename, checkbox or “Add” per item; use `uploadsBaseUrl` for `img` src).  
  - “Add selected”: get selected IDs, append to attached list (append hidden inputs with `name=inputName`, re-render attached list DOM), then close modal.  
  - “Remove” on attached item: remove that ID from list, remove corresponding hidden input, re-render attached list.  
  - Modal “Cancel”: hide modal.  
- **Scope:** All DOM queries relative to the root. No global state. Defensive: no errors if elements are missing.
- **No** product/collection or model-specific logic.

---

### Step 4: CSS (component styles)

- **File:** `src/public/css/admin.css`.
- **Add** a block with comment `/* --- Media picker component --- */` and classes under prefix `.admin-media-picker-*`: section, attached list, attached item, button, modal overlay, modal box, grid, modal buttons. Enough for layout and visibility (e.g. modal overlay, grid layout, list layout). No polish; functionality only.

---

### Step 5: Load script in admin layout

- **File:** `src/views/layouts/admin.pug`.
- In `block scripts` (or equivalent), add: `script(src="/public/js/admin-media-picker.js")`. So any admin page that uses the mixin gets the script without per-page script tags.

---

### Step 6: Product form – use component

- **File:** `src/views/admin/products/form.pug`.
- At top (with other includes): `include ../../fragments/admin/media-picker-section`.
- **Replace** the current “Media” block (the big grid of all media with checkboxes) with a single call:  
  `+mediaPickerSection({ inputName: 'mediaIds[]', attachedMedia: ..., uploadsBaseUrl: ..., apiUrl: ..., label: 'Media', hint: '...' })`.  
  Pass `attachedMedia` from `product.media` (or equivalent) in the shape the mixin expects (id, path, filename, mimeType, alt). Ensure `uploadsBaseUrl` and `apiUrl` are in scope (e.g. from controller as now).
- **Do not** remove or change the rest of the form (title, slug, meta objects, etc.). Only the Media section is replaced.

---

### Step 7: Collection form – use component

- **File:** `src/views/admin/collections/form.pug`.
- Same: include fragment, replace the current Media block with `+mediaPickerSection({ ... })` with collection’s `attachedMedia`, same `inputName`, `apiUrl`, `uploadsBaseUrl`. Same hint/label pattern as product or adjusted for “collection.”

---

### Step 8: Controllers – optional cleanup

- **Product:** Edit form currently passes `media` (full library) from `getFormData()`. After the Media section is replaced by the mixin, the form no longer needs the full `media` list for that section. You can leave `media` in the response for now (no harm) or remove it from the payload for product form only to keep the response minimal. Same for collection form. Prefer minimal: stop passing `media` to product and collection forms if nothing else on those pages uses it.
- **Backend create/update:** No change. They already accept `mediaIds[]` and call `syncProductMedia` / `syncCollectionMedia`. Form still submits `mediaIds[]`; the component only changes how that list is built in the UI.

---

## Summary checklist (for you to review)

- [ ] **Step 1** – GET /admin/api/media returns JSON `{ media, uploadsBaseUrl }`; route under admin, same auth.
- [ ] **Step 2** – Fragment `media-picker-section.pug` with mixin `mediaPickerSection(options)`; root with `data-media-picker` and data attributes; attached list, hidden inputs, button, modal structure.
- [ ] **Step 3** – `admin-media-picker.js`: init by `[data-media-picker]`, read config, open modal, fetch API, render grid, add/remove, sync hidden inputs.
- [ ] **Step 4** – admin.css: namespaced classes for media picker; minimal styling for function.
- [ ] **Step 5** – admin layout: load `admin-media-picker.js` once.
- [ ] **Step 6** – Product form: include fragment, replace Media block with mixin call.
- [ ] **Step 7** – Collection form: include fragment, replace Media block with mixin call.
- [ ] **Step 8** – Optional: stop passing full `media` to product/collection form views.

---

## Component Standard

All of the above follows **`docs/COMPONENT_STANDARD.md`**: one mixin in one fragment, one JS file, one CSS namespace, config via data attributes, script loaded in layout, no inline component logic in views. Future components (e.g. date picker, tag selector) should follow the same standard so the codebase stays consistent.

Once you approve this plan, implementation can proceed in this order. No code has been changed yet.
