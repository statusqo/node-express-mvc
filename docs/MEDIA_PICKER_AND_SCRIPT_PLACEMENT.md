# Media Picker API (reusable) and JS/CSS placement

## 1. Reusable Media API for the picker (Option A, Variant 2)

### Goal

- One API that any admin “media picker” can call: product edit, collection edit, or future models (e.g. blog post, category) that attach media.
- The picker fetches the media list when it opens; the product (or other) form stays light and does not embed the full library.

### Endpoint design

**`GET /admin/api/media`** (or `/api/admin/media` if you prefer to group admin API under one prefix)

**Purpose:** Return the list of media available for selection, plus what the client needs to render thumbnails/links.

**Response shape (suggestion):**

```json
{
  "media": [
    {
      "id": "uuid",
      "path": "2025/02/abc.jpg",
      "filename": "photo.jpg",
      "mimeType": "image/jpeg",
      "size": 12345,
      "alt": "Optional alt text"
    }
  ],
  "uploadsBaseUrl": "/uploads"
}
```

- **media**: Array of media records (same fields the picker needs: id, path, filename, mimeType, size, alt). No need for model-specific data here; “which entity this is attached to” is handled by the form that opened the picker (product id, collection id, etc.).
- **uploadsBaseUrl**: Base URL (or path) for building `img` src (e.g. `uploadsBaseUrl + "/" + item.path`). Same origin as the app so the API can return a relative path.

**Optional query params (for reuse and future use):**

- **`mimeType`** or **`type`**: Filter to images only (e.g. `?type=image`) when the picker is for “image only” (e.g. hero image). Default: return all.
- **`limit`** / **`offset`** or **`page`**: If the library grows large, support pagination so the picker doesn’t load hundreds of items at once. Start simple (return all); add later if needed.
- **`q`** or **`search`**: Optional search by filename or alt; useful when the library is large.

No need for **`for=product`** or **`for=collection`** in the API: the same list is “the media library.” Which entity is attaching media is determined by the page that opened the picker (and by the form’s hidden fields or context when submitting).

### Who uses it

- **Product edit** – “Select media” opens the modal; modal’s JS fetches `GET /admin/api/media`, renders the grid, and on “Add” updates the product form’s attached list and `mediaIds[]`.
- **Collection edit** – Same: “Select media” → same API → same picker behavior; form submits `mediaIds[]` for the collection.
- **Future models** – Any admin form that has “attach media” uses the same endpoint and the same picker pattern (same or shared JS).

### Auth and placement

- Route lives under **admin** (e.g. mounted with the admin router so it’s under `/admin` and protected by the same `requireAuth` / admin checks as the rest of the admin).
- Returns JSON; no HTML. Reusable from any admin page that includes the picker script.

---

## 2. JavaScript: inline in Pug vs in `public/js`

### Inline in the Pug file (e.g. `script.` block)

**How:** You write JavaScript directly in the template, e.g.:

```pug
script.
  document.addEventListener('DOMContentLoaded', function() {
    var btn = document.getElementById('open-picker');
    btn.addEventListener('click', function() { ... });
  });
```

**Benefits:**

- No extra HTTP request; the script is part of the rendered HTML.
- Can use server-rendered values easily (e.g. `var productId = '#{product.id}';` or a Pug interpolated JSON object).
- Everything for that page is in one file (template + behavior).

**Drawbacks:**

- **No caching:** Every page load sends that script again; the browser can’t cache a shared .js file.
- **Harder to test:** You can’t run or unit-test the script in isolation; it’s tied to the template.
- **Duplication:** If product edit and collection edit both use a “media picker,” you’d repeat the same script in two Pug files or use a Pug mixin that still inlines the same code in both pages.
- **Tooling:** No separate bundling, linting, or minification for that script; no TypeScript/ES modules in a clean way.
- **Size:** The script is repeated for every page that includes it (if you copy-paste or include a partial that contains the script).
- **Separation of concerns:** Markup and logic are mixed; harder to change one without touching the other.

### In `public/js` (separate file, e.g. `admin-media-picker.js`)

**How:** The Pug layout or the product form includes a script tag:  
`script(src="/public/js/admin-media-picker.js")`.  
The script uses `data-*` attributes or a single JSON `script#media-picker-config` (e.g. `uploadsBaseUrl`, `apiUrl`, optional `existingIds`) so it doesn’t need big blobs of server data in the script itself.

**Benefits:**

- **Caching:** The browser caches the .js file; product edit, collection edit, and any future form that use the same picker share one file.
- **Reuse:** One script serves product, collection, and any future “attach media” form; you only pass config (API URL, uploads base URL, maybe existing IDs and input name).
- **Testable:** You can load the script in a test page or a small harness and test “fetch media, render grid, add to list, update hidden inputs.”
- **Tooling:** Lint, format, minify, or bundle with the rest of your admin JS.
- **Separation:** Markup stays in Pug; behavior lives in .js; easier to hand off or refactor.
- **Single place to fix:** Bug or enhancement in the picker logic is done once in one file.

**Drawbacks:**

- One extra request (or two if you have a separate CSS file) unless you bundle or inline during build.
- Passing server data into the script requires a small contract: e.g. a `script#media-picker-config` with JSON, or `data-*` on a container. Minimal and clear.

### Recommendation for the media picker

- **Put the picker logic in `public/js`** (e.g. `admin-media-picker.js`): open modal, fetch `GET /admin/api/media`, render grid, “Add” / “Remove,” update hidden `mediaIds[]`.
- **Keep Pug minimal:** A container for the “attached” list, a “Select media” button, a modal placeholder, and a small inline **config** block if needed, e.g.:

  ```pug
  script#media-picker-config(type="application/json")
    | {"apiUrl":"/admin/api/media","uploadsBaseUrl":"#{uploadsBaseUrl}","inputName":"mediaIds[]"}
  ```

  So: **only configuration is in the template**; behavior lives in the external script. That keeps the .pug file light and the API reusable across the app.

---

## 3. CSS: inline in Pug vs in `public/css`

### Inline in Pug (e.g. `style.` or inline `style=""`)

**Benefits:** No extra request; styles are right next to the component.

**Drawbacks:** Not cached; duplicated if the same styles are used on multiple pages (e.g. product and collection edit); harder to maintain and reuse; no single “admin picker” stylesheet.

### In `public/css` (e.g. `admin.css` or `admin-media-picker.css`)

**Benefits:** Cached; one place for picker/modal styles; reusable across product, collection, and future forms; can be minified and kept separate from markup.

**Drawbacks:** Extra request (or combined into one admin bundle).

### Recommendation

- Put picker/modal styles in **`public/css`** (e.g. in `admin.css` under a `.admin-media-picker` / `.admin-media-picker-modal` namespace). Keep Pug free of style blocks for this feature so the template stays structure-only and the same CSS is reused everywhere the picker is used.

---

## 4. Summary

| Concern | Inline in Pug | In `public/js` or `public/css` |
|--------|----------------|----------------------------------|
| **Caching** | No | Yes |
| **Reuse across pages** | Duplicate or mixin | One file, many pages |
| **Testing** | Hard | Easier (load script, mock config) |
| **Separation** | Markup + logic/style together | Markup vs behavior vs style |
| **Tooling** | Limited | Lint, bundle, minify |
| **Server data** | Easy (interpolation) | Via small config (e.g. JSON script or data attrs) |

For the media picker (Option A, Variant 2):

- **API:** `GET /admin/api/media` returning `{ media, uploadsBaseUrl }`, designed to be reused by any admin form that attaches media (product, collection, future models).
- **JS:** In **`public/js`** (e.g. `admin-media-picker.js`); Pug only provides structure and a small config (API URL, uploads base URL, input name).
- **CSS:** In **`public/css`** (e.g. `admin.css`), not inline in Pug.

No code changes in this doc; it’s design and placement guidance only.
