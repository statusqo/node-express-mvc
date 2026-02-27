# Product Edit: Media Selection Flow (Suggestion)

## What you want

- On the **Product Edit** page, under the "Media" section: do **not** show the entire media library.
- Show a **button** (e.g. "Select media" / "Add media") that opens a **picker**.
- When the admin **selects** media in the picker, that **selected media** appears on the product edit page as the list of media attached to the product.
- The product page should clearly show only the media that is **attached to this product**, plus a way to add more (via the button) or remove items.

---

## How it works today

### Backend (unchanged in concept)

- **Product ↔ Media** is many-to-many via **ProductMedia** (productId, mediaId, sortOrder).
- **product.repo**: `findByIdWithFormData` includes `media` (attached media with sortOrder). `syncProductMedia(productId, mediaIds)` updates the join table from an ordered list of IDs.
- **product.service**: `getFormData()` returns `media` = **all** media from the library (`mediaRepo.findAllForAdmin()`).
- **products.controller**: 
  - **newForm / editForm**: Pass `media` (full library) and for edit `product.mediaIds` (ordered IDs of attached media) and `product` (which includes `media` as the attached Media models).
  - **create / update**: Read `req.body.mediaIds` (array), normalize, pass to service; repo runs `syncProductMedia`.

### Frontend (current)

- **admin/products/form.pug** (Media section):
  - Renders the **full** `media` list (every item in the library) as a grid of cards with checkboxes.
  - Each card shows thumbnail (if image), filename; checkbox is checked if that media id is in `product.mediaIds`.
  - On submit, `mediaIds[]` is sent for each checked box.
- So the product edit page always shows the **entire** media library; the admin picks by checking boxes.

---

## Suggested implementation (no code yet)

### 1. Change what the Product Edit page shows under "Media"

- **Do not** render the full media library grid on the page by default.
- **Do** show:
  - A heading/label "Media".
  - The **list of media currently attached to this product** (from `product.media`), in order, each with:
    - Thumbnail (or icon for non-images), filename, optional alt.
    - A **Remove** control (button or link) to drop that item from the selection (client-side only until save).
  - A **button**: "Select media" (or "Add media") that opens the **picker**.
- **Hidden inputs**: Keep the form submitting `mediaIds[]` in the same order as the "attached" list (so backend stays the same). Use a single list in JS and on submit build `mediaIds[]` from it (e.g. multiple `<input type="hidden" name="mediaIds[]" value="...">` or one field that you parse server-side if you prefer).

So the visible UI is: **attached media list** + **"Select media"** button. The full library is only visible inside the picker.

### 2. Picker: two options

**Option A – Modal picker (recommended)**

- Clicking "Select media" opens a **modal** (or slide-over panel).
- **Content of the modal**: The full media library (grid of items, same kind of cards as now: thumbnail, filename). Each item is clickable to "select" it (e.g. highlight, or "Add" button). Optionally "Select multiple" then "Add selected" to add all highlighted to the product’s list.
- **Data for the modal**:
  - **Variant 1**: Pass the full `media` list from the server into the product form as before, but **do not render it in the main form**. Instead, put it in a `<script type="application/json" id="media-library">...</script>` (or a Pug block that outputs JSON). The modal’s JavaScript reads this and builds the grid inside the modal. No extra HTTP request; same payload as today, different use.
  - **Variant 2**: When the user opens the modal, **fetch** the media list (e.g. `GET /admin/api/media` or a route that returns JSON). Then render the grid in the modal. Requires a small admin API that returns media list (and possibly `uploadsBaseUrl` or base path for thumbnails).
- When the user adds one or more items from the picker:
  - **Client-side**: Append those media IDs to the "attached" list, re-render the "attached media" block, and update the hidden `mediaIds[]` inputs (or the single field you use). Optionally close the modal or keep it open to add more.
- "Remove" on an attached item removes it from the list and updates the hidden inputs.
- **Backend**: Unchanged. Form still posts `mediaIds[]`; `syncProductMedia` runs as now.

**Option B – Separate picker page**

- "Select media" is a **link** to e.g. `/admin/media/picker?for=product&id=<productId>`.
- Picker page shows the full media library; user selects items and submits (e.g. "Attach to product"). Backend **adds** the selected media to the product (e.g. append to existing ProductMedia) and **redirects** back to the product edit page (e.g. `returnTo` or fixed `/admin/products/:id/edit`).
- Product edit page then shows the updated attached list on next load.
- Pros: No modal, no client-side list management. Cons: Full page navigation, need a picker view + route and a way to "merge" selection with existing (e.g. append-only or full replace with redirect).

### 3. What to pass from the controller

- **Edit form**:
  - **Attached media**: You already have `product.media` (with sortOrder from ProductMedia). Pass it (or a plain list with id, path, filename, mimeType, sortOrder) so the view can render **only** the attached items with thumbnails and remove buttons. E.g. `attachedMedia` = sorted `product.media` with upload URL or base path for `img` src.
  - **Full library for picker** (if using Option A Variant 1): Keep passing `media` from `getFormData()` and embed it in the page (e.g. JSON in a script tag) for the modal to use. No new endpoint.
  - If you use Option A Variant 2 (fetch in modal): You can **stop** passing the full `media` in the product form and add a small JSON endpoint (e.g. `GET /admin/api/media`) that returns `{ media: [...], uploadsBaseUrl: "..." }` for the modal to fetch.
- **Create form**: Same idea; "attached" list starts empty; "Select media" opens the picker; hidden `mediaIds[]` is updated when user adds/removes.

### 4. Order and remove

- **Order**: Keep the current convention: order of `mediaIds[]` = display order. When the user adds from the picker, append to the end (or insert at cursor). Optional: drag-and-drop to reorder the "attached" list and then regenerate `mediaIds[]` in that order before submit.
- **Remove**: Purely client-side until submit: remove from the list and from the hidden `mediaIds[]`; no need for a separate "unattach" API if you submit the whole list on save.

### 5. Backend summary

- **No change** to `syncProductMedia`, create/update flow, or `req.body.mediaIds`.
- **Optional**: Add `GET /admin/api/media` (or similar) if you want the modal to load the library via fetch instead of embedding it in the page.
- **Data**: Ensure the edit form has everything needed to render the **attached** list (product.media with URLs for thumbnails). You already have `product.media` and `uploadsBaseUrl`; the view just needs to use them for the "attached" block instead of for the full grid.

---

## Recommended path

1. **Product form (Media section)**  
   - Show only: label "Media", **attached media list** (from `product.media` / `attachedMedia`), **"Select media"** button, and hidden `mediaIds[]` (or equivalent) filled from that list.
   - Add a small script that: maintains the list of attached IDs in order, renders the attached block (thumbnails + remove), and updates hidden inputs on add/remove.

2. **Picker = modal (Option A)**  
   - "Select media" opens a modal.
   - Either embed the full `media` list in the page as JSON (Variant 1) or fetch it from `GET /admin/api/media` (Variant 2). Render the library grid in the modal; on "Add" (or "Add selected"), append chosen IDs to the attached list and update hidden inputs, then close or keep modal open.

3. **No backend change** to product create/update or `syncProductMedia`; only how the form gathers and displays the selection.

This matches the flow you described: a button to select media, and only the selected media shown on the product edit page.
