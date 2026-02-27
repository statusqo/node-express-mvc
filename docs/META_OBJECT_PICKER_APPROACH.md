# Meta Object Picker – Implementation Approach (Review Before Coding)

This document describes how to change the Product edit page so that **Meta Objects** are selected via a **picker modal** (like the Media picker), instead of listing all meta objects on the page. The goal is: show only **attached** meta objects; admin clicks "Select meta objects" → modal lists all → admin selects → added meta objects appear with their **attribute fields** below the title; admin fills values and saves.

---

## 1. Current vs desired behavior

### Current (Product edit – Meta Objects section)

- **Display:** All meta objects in the system are listed.
- **Selection:** Each row has a checkbox and the meta object title. When checked, that row’s attribute fields (from definition) are shown.
- **Problem:** Page can be long and noisy when there are many meta objects; only a few are attached to the product.

### Desired

- **Display:** Only the meta objects **attached to this product** are shown.
- **Each attached item:** Meta object **title** (and optionally type), a **Remove** control, and the **attribute form** (inputs for each key in the definition) so the admin can fill values.
- **Selection:** One **"Select meta objects"** button. Clicking it opens a **modal** that lists **all** meta objects (e.g. name, type). Admin selects one or more (e.g. checkboxes), then **"Add selected"**. Modal closes; the newly selected meta objects appear in the section, each with its title and an empty attribute form (or existing values if re-adding).
- **Persistence:** Form still submits `metaObjectIds[]` and `metaObjectValues[metaObjectId][key]`. Backend (sync product meta objects and values) stays unchanged.

---

## 2. Alignment with existing patterns

- Follow **Component Standard** (`docs/COMPONENT_STANDARD.md`): one mixin, one JS file, one namespaced CSS block; config via data attributes; no inline component logic in views; script loaded once in admin layout.
- Mirror the **Media Picker** pattern:
  - Section shows only **attached** items (media = thumbnails + Remove; meta objects = title + attribute form + Remove).
  - Button opens a **modal** that fetches or receives the full list; user selects; "Add selected" adds them to the attached list and closes the modal.

---

## 3. Main technical consideration: attribute form when adding from modal

- For **media**, an added item is simple: id, thumbnail, filename, Remove. No extra form.
- For **meta objects**, an added item must show the **attribute form** (inputs per definition key: text, textarea, number, boolean, date, url, email, etc.). That form is today **server-rendered** from `definitionPairs` (parsed from `MetaObject.definition`).

To support “add from modal” without a full page reload, we have two options:

- **Option A – Client builds the form:** The modal (or the data behind it) has access to each meta object’s **definition** (e.g. `definitionPairs`: `[{ key, type, value }]`). When the user clicks "Add selected", the client **dynamically** creates the DOM for each added meta object: a block with title, Remove, and one input per definition pair (correct `name`, `id`, and type: text, textarea, number, checkbox, date, url, email). **Pros:** Single round-trip (API returns meta objects with definitionPairs); no extra endpoint. **Cons:** JS must replicate the same input types and naming as the server (must stay in sync with `metaObject.schema` and current form markup).

- **Option B – Server returns HTML fragments:** When the user adds a meta object, the client calls something like `GET /admin/api/meta-objects/:id/form-fragment?productId=...` and gets a small HTML fragment (title + inputs) that it injects into the attached list. **Pros:** Single source of truth for markup. **Cons:** Extra request per added meta object (or batched); more server surface.

**Recommendation:** **Option A** – API returns meta objects with `definitionPairs`; client builds the attribute form when adding. Keeps one API (`GET /admin/api/meta-objects`), and the attribute types are fixed and small (string, text, number, boolean, date, url, email). We can document that the JS form-builder must match the server’s input types and names.

---

## 4. Component design (high level)

### 4.1 API

- **Endpoint:** `GET /admin/api/meta-objects` (admin router, same auth as rest of admin).
- **Response (JSON):**  
  `{ metaObjects: [ { id, name, type, slug, definitionPairs: [ { key, type, value } ] } ] }`  
  So the modal can list meta objects and the client can build the attribute form from `definitionPairs`. Use the existing `parseDefinitionPairs(metaObject.definition)` (or equivalent) on the server to fill `definitionPairs`.

### 4.2 Fragment and mixin

- **File:** `src/views/fragments/admin/meta-object-picker-section.pug`
- **Mixin:** `metaObjectPickerSection(options)`
- **Options (conceptually):**
  - `inputName` – e.g. `'metaObjectIds[]'`
  - `attachedMetaObjects` – array of attached meta objects, each: `{ id, name, type, definitionPairs, values }` (values = current `metaObjectValues[id]`)
  - `apiUrl` – e.g. `(adminPrefix + '/api/meta-objects')`
  - `label` – e.g. `'Meta Objects'`
  - `hint` – optional text
- **Root element:** e.g. `div.admin-meta-object-picker-section` with `data-meta-object-picker`, `data-input-name`, `data-api-url`.
- **Inside root:**
  1. Label and optional hint.
  2. **Attached list** (e.g. `.admin-meta-object-picker-attached`): for each item in `attachedMetaObjects`, server renders one block: meta object **title** (and optionally type), **Remove** button, hidden input `name=metaObjectIds[] value=id`, and the **attribute form** (same as today: one form-group per definition pair with the correct input type and `name="metaObjectValues[id][key]"`).
  3. Button **"Select meta objects"** (opens modal).
  4. **Modal:** overlay, title "Select meta objects", empty list/grid container, "Add selected", "Cancel". No inline script.

Initial load: the server passes only **attached** meta objects (with their definitionPairs and current values), so the opening state is correct. The full list is loaded in the modal via the API.

### 4.3 JavaScript

- **File:** `src/public/js/admin-meta-object-picker.js`
- **Init:** `querySelectorAll('[data-meta-object-picker]')`, read config from root.
- **Behavior:**
  - **Open modal:** Show modal; if list empty, fetch `apiUrl`, render list of meta objects (e.g. name, type, checkbox). Do not render attribute forms in the modal – only selection.
  - **Add selected:** For each selected meta object, get its `id`, `name`, `type`, `definitionPairs` from the API data. Append to the attached list:
    - One hidden input `name=metaObjectIds[] value=id`.
    - One block: title, Remove button, and **dynamically generated** attribute form: for each `definitionPair` create the right input (text, textarea, number, checkbox with hidden false, date, url, email) with `name="metaObjectValues[id][key]"`, `id` if needed, placeholder/default from `value`. Match the existing server-rendered input types and names exactly so validation and backend keep working.
  - **Remove:** Remove that meta object’s block and its hidden input (and all `metaObjectValues[id][*]` inputs). Re-render or just remove the DOM node.
  - **Cancel:** Close modal.
- **Scope:** All logic scoped to the component root. No product-specific hardcoding; config from data attributes.

### 4.4 CSS

- In `src/public/css/admin.css`, add a block under a comment like `/* --- Meta object picker component --- */`.
- Use classes with prefix `.admin-meta-object-picker-*` (section, attached list, attached item, title, modal, grid/list, actions). Reuse modal/overlay patterns from media picker where it makes sense so the two pickers feel consistent.

### 4.5 Layout and product form

- In `src/views/layouts/admin.pug`, add `script(src="/public/js/admin-meta-object-picker.js")` (if not already loading component scripts in a single block).
- In **Product form:** Include the new fragment and **replace** the current Meta Objects block (the one that iterates over all `metaObjects` with checkboxes and toggled attribute blocks) with a single call:  
  `+metaObjectPickerSection({ inputName: 'metaObjectIds[]', attachedMetaObjects: ..., apiUrl: ..., label: 'Meta Objects', hint: '...' })`.  
  `attachedMetaObjects` must be the list of **attached** meta objects only, each with `id`, `name`, `type`, `definitionPairs`, and `values` (from `product.metaObjectValues[id]`). The controller already has meta object definitions and product’s attached meta objects; it should pass only the attached ones in the shape the mixin expects.

### 4.6 Backend and form submit

- **No change** to product create/update: they already read `req.body.metaObjectIds` and `req.body.metaObjectValues` and call the same sync/validation logic. The form still posts `metaObjectIds[]` and `metaObjectValues[id][key]`; only the way those inputs are rendered (attached list + modal picker + client-generated fields when adding) changes.

---

## 5. Order of work (suggested)

1. **API:** Add `GET /admin/api/meta-objects` returning `{ metaObjects }` with `definitionPairs` per item (using existing meta object repo and `parseDefinitionPairs`).
2. **Fragment:** Create `meta-object-picker-section.pug` with mixin; root with `data-meta-object-picker` and data attributes; attached list with server-rendered blocks (title, Remove, hidden input, attribute form per attached item); "Select meta objects" button; modal structure (overlay, title, list container, Add selected, Cancel).
3. **JS:** Create `admin-meta-object-picker.js`: init, open modal, fetch API, render selection list; Add selected → build attribute form from `definitionPairs` and append to attached list; Remove; Cancel. Ensure generated input names and types match current product form so backend and validation remain valid.
4. **CSS:** Add namespaced meta object picker styles in `admin.css`.
5. **Layout:** Load `admin-meta-object-picker.js` in admin layout.
6. **Product form:** Replace current Meta Objects block with `+metaObjectPickerSection({ ... })`; pass `attachedMetaObjects` (and optionally `apiUrl`, `label`, `hint`) from controller. Ensure product controller passes only attached meta objects with definitionPairs and values.

---

## 6. Summary

- **UX:** Product edit shows only attached meta objects (title + attribute form + Remove). "Select meta objects" opens a modal to add more; no more “all meta objects on the page”.
- **Tech:** New admin API for meta objects list with `definitionPairs`; new component (fragment + JS + CSS) following the same pattern as the media picker; client builds attribute form when adding from modal so backend and submit format stay unchanged.
- **Risk:** Keep the client-generated attribute form in sync with server (input types and names). Document in code that the JS form-builder must match `metaObject.schema` and the current server-rendered field types.

Once this approach is agreed, implementation can follow the order above and reuse the same component standard and modal patterns as the media picker.
