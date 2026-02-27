# Reusable Media Picker Component – Design

## Goal

One media-picker component that Product edit, Collection edit, and any future “attach media” form can use. The component is **reusable across pages and models** with no duplication of markup, script, or styles.

---

## Approach: Pug mixin in a fragment + one JS file + shared CSS

### 1. Component = one Pug fragment (mixin) + one script + existing admin CSS

- **Pug:** One fragment file that defines a **mixin**. The mixin outputs the entire “Media” section: attached list, “Select media” button, modal markup, and config for the script. Any page that needs the picker **includes** the fragment and **calls the mixin** with its own data (input name, attached media, URLs).
- **JS:** One file in `public/js` (e.g. `admin-media-picker.js`) that finds the component on the page (e.g. a root with `data-media-picker`) and wires behavior: open modal, fetch API, render grid, add/remove, sync hidden inputs. No product/collection-specific logic.
- **CSS:** Picker/modal styles live in `public/css/admin.css` (or a dedicated block) under a stable class namespace (e.g. `.admin-media-picker`, `.admin-media-picker-modal`). No inline styles in the mixin beyond what’s already there; new styles go in the stylesheet.

So: **one mixin, one script, one place for CSS**; Product and Collection (and future forms) only include and call the mixin with different data.

---

## 2. Fragment file and mixin contract

**File:** `src/views/fragments/admin/media-picker-section.pug`

**Content:** A single mixin that renders the full “media attach” block. No root markup in the file except the mixin definition (same idea as a mixin-only file used by nav).

**Mixin signature (suggestion):**

```pug
mixin mediaPickerSection(options)
```

**`options`** (one object to keep the signature stable when we add more later):

| Property | Required | Description |
|----------|----------|-------------|
| `inputName` | Yes | Form field name for the selected IDs, e.g. `"mediaIds[]"`. Same for product and collection; backend already uses this. |
| `attachedMedia` | Yes | Array of media items currently attached. Each item: `{ id, path, filename, mimeType, alt }`. Order = display order. Empty array on create. |
| `uploadsBaseUrl` | Yes | Base URL (or path) for thumbnail `img` src, e.g. `"/uploads"` or full URL. |
| `apiUrl` | Yes | URL for `GET` to fetch the media list, e.g. `(adminPrefix || '') + '/api/media'`. |
| `label` | No | Section label, default `"Media"`. |
| `hint` | No | Short hint text above the button, e.g. “Attach images or files to this product.” |

**What the mixin renders:**

1. **Root wrapper**  
   One element (e.g. `div.admin-media-picker-section`) with `data-media-picker` and `data-input-name=options.inputName`, `data-api-url=options.apiUrl`, `data-uploads-base-url=options.uploadsBaseUrl`. The script uses these to initialize and to build thumbnail URLs.

2. **Attached list**  
   For each item in `attachedMedia`: a small card (thumbnail if image, icon otherwise, filename, **Remove** button). Each card has `data-media-id=item.id`. The list container has a class like `admin-media-picker-attached` so the script can find it and refresh it when the user adds/removes.

3. **Hidden inputs**  
   For each ID in `attachedMedia`, an `<input type="hidden" name=options.inputName value=item.id>`. The script will add/remove these when the user adds or removes from the list. On first load the server renders them from `attachedMedia`.

4. **“Select media” button**  
   A button (e.g. `button.admin-btn.js-open-media-picker` or `button[data-action="open-media-picker"]`). No product/collection-specific text; generic “Select media” or “Add media”.

5. **Modal**  
   Markup for the modal: overlay, inner box, title “Select media”, a **grid container** (empty; script fills it from API), “Add selected” and “Cancel” (or “Close”). The modal has a class like `admin-media-picker-modal` and is inside the same root wrapper so the script can find it.

6. **Config script (optional)**  
   If the script prefers a single JSON config instead of many data attributes, the mixin can output `<script type="application/json" data-media-picker-config>` with `{ inputName, apiUrl, uploadsBaseUrl }`. The script then reads this once. Alternatively the script reads from the root wrapper’s data attributes; either way the mixin provides the config.

**No model-specific markup:** No “product” or “collection” in the mixin; it only knows “list of attached items” and “input name.” The parent (product or collection form) passes `attachedMedia` and the same `inputName` it uses for the form submit.

---

## 3. How Product and Collection use it

**Product form** (e.g. in `admin/products/form.pug`):

- At the top (with other includes if any):  
  `include ../../fragments/admin/media-picker-section`
- Where the current “Media” block is, replace it with a single call, e.g.:

  ```pug
  +mediaPickerSection({
    inputName: 'mediaIds[]',
    attachedMedia: (product && product.media) ? product.media.map(function(m) { return { id: m.id, path: m.path, filename: m.filename, mimeType: m.mimeType, alt: m.alt }; }) : [],
    uploadsBaseUrl: uploadsBaseUrl || '/uploads',
    apiUrl: (adminPrefix || '') + '/api/media',
    label: 'Media',
    hint: 'Attach images or files to this product.'
  })
  ```

- Product’s form still posts to the same action; body still has `mediaIds[]`; backend unchanged.

**Collection form** (e.g. in `admin/collections/form.pug`):

- Same include.
- Same mixin call with collection-specific data:

  ```pug
  +mediaPickerSection({
    inputName: 'mediaIds[]',
    attachedMedia: (collection && collection.media) ? collection.media.map(...) : [],
    uploadsBaseUrl: uploadsBaseUrl || '/uploads',
    apiUrl: (adminPrefix || '') + '/api/media',
    label: 'Media',
    hint: 'Attach images or files to this collection.'
  })
  ```

So the **component is the mixin**; Product and Collection only pass different `attachedMedia` (and optional label/hint). Same JS and CSS for both.

---

## 4. Script and CSS loading

- **Script:** The admin layout (or the layout used by product/collection edit) should include the picker script once, e.g.  
  `script(src="/public/js/admin-media-picker.js")`  
  So any page that uses the mixin gets the behavior without per-page script tags. The script initializes only if it finds a `[data-media-picker]` (or similar) on the page.

- **CSS:** All picker/modal styles live in `public/css/admin.css` under classes used by the mixin (e.g. `.admin-media-picker-section`, `.admin-media-picker-attached`, `.admin-media-picker-modal`). No need to “load CSS per component”; the admin layout already loads `admin.css`.

---

## 5. Script behavior (contract, no implementation detail)

- Find all `[data-media-picker]` (or the single root) on the page.
- Read config from the root’s data attributes (or the JSON config script).
- “Select media” button: on click, open the modal and, if not already loaded, fetch `apiUrl` (GET), then render the library grid in the modal (thumbnail, filename, checkbox or “Add” per item). Use `uploadsBaseUrl` from config (or from API response) for `img` src.
- “Add selected”: get selected items from the modal, append their IDs to the attached list, append hidden inputs with `name=inputName`, re-render the attached list (thumbnails + Remove), close the modal (or keep it open).
- “Remove” on an attached item: remove that ID from the list, remove the corresponding hidden input, re-render the attached list.
- Modal “Cancel” / “Close”: close modal without changing the attached list.

The script never needs to know whether the page is product or collection; it only cares about the root element’s config and the DOM structure the mixin produces.

---

## 6. Summary

| Piece | Purpose | Reuse |
|-------|---------|--------|
| **Fragment `media-picker-section.pug`** | Defines mixin `mediaPickerSection(options)` that outputs the full Media section (attached list, button, modal, config). | Product and Collection (and any future form) include the fragment and call the mixin with their own `options`. |
| **`public/js/admin-media-picker.js`** | Finds `[data-media-picker]`, reads config, handles open/fetch/grid/add/remove and hidden inputs. | Loaded once by admin layout; works on any page that renders the mixin. |
| **`public/css/admin.css`** | Classes for `.admin-media-picker-section`, attached list, modal. | Shared by all pages that use the mixin. |
| **GET /admin/api/media** | Returns `{ media, uploadsBaseUrl }` for the modal grid. | Same endpoint for product, collection, and future models. |

**Why a mixin instead of only a modal partial?**

- The **attached list** and **hidden inputs** are part of the form and must live next to the rest of the form (e.g. under “Media”). If the component were “only the modal,” every product/collection form would have to repeat the same structure for the attached list, button, and config. The mixin gives one place for that structure and keeps the contract (data attributes, class names) consistent so the script can rely on it. So the **component = whole section (attached + button + modal + config)** implemented as one mixin, one script, one set of styles—reusable across pages and models without changing code when you add another model.

No code has been changed; this is the suggested approach only.
