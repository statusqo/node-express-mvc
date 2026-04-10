/**
 * Admin media picker component.
 * Finds all [data-media-picker] roots, reads config from data-* attributes,
 * and wires: open modal → fetch media → render grid → add selected / remove / cancel.
 *
 * Featured media: each attached item has a radio button (styled as a star).
 * Selecting it marks that item as the featured image. The radio name matches
 * data-featured-input-name so it submits directly with the form.
 */
(function () {
  "use strict";

  function getAttr(el, name) {
    if (!el || !el.getAttribute) return null;
    return el.getAttribute(name);
  }

  function escapeSelectorAttr(val) {
    return String(val)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\]/g, "\\]");
  }

  function buildFeaturedBtn(id, featuredInputName) {
    var label = document.createElement("label");
    label.className = "admin-media-picker-featured-btn";
    label.title = "Set as featured image";

    var radio = document.createElement("input");
    radio.type = "radio";
    radio.className = "admin-media-picker-featured-radio";
    radio.name = featuredInputName;
    radio.value = id;

    var icon = document.createElement("span");
    icon.className = "admin-media-picker-featured-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "★";

    label.appendChild(radio);
    label.appendChild(icon);
    return label;
  }

  function initRoot(root) {
    var inputName = getAttr(root, "data-input-name");
    var apiUrl = getAttr(root, "data-api-url");
    var uploadsBaseUrl = getAttr(root, "data-uploads-base-url") || "";
    var featuredInputName = getAttr(root, "data-featured-input-name") || "featuredMediaId";
    if (!inputName || !apiUrl) return;

    var attachedContainer = root.querySelector(".admin-media-picker-attached");
    var openBtn = root.querySelector("[data-action='open-media-picker']");
    var modal = root.querySelector(".admin-media-picker-modal");
    var grid = root.querySelector(".admin-media-picker-grid");
    var addSelectedBtn = root.querySelector("[data-action='add-selected']");
    var closeButtons = root.querySelectorAll("[data-action='close-media-picker']");

    if (!attachedContainer || !openBtn || !modal || !grid) return;

    function showModal() {
      if (window.AdminDialogModal) {
        window.AdminDialogModal.open(modal);
      }
      if (grid.children.length === 0) loadAndRenderGrid();
    }

    function hideModal() {
      if (window.AdminDialogModal) {
        window.AdminDialogModal.close(modal);
      } else {
        modal.setAttribute("aria-hidden", "true");
        modal.classList.remove("da-admin-dialog--open", "da-admin-dialog--closing");
      }
    }

    function getCurrentIds() {
      var inputs = root.querySelectorAll('input[name="' + escapeSelectorAttr(inputName) + '"]');
      var ids = [];
      for (var i = 0; i < inputs.length; i++) {
        var v = inputs[i].value;
        if (v) ids.push(String(v));
      }
      return ids;
    }

    function loadAndRenderGrid() {
      grid.innerHTML = "";
      fetch(apiUrl, { headers: { Accept: "application/json" } })
        .then(function (res) {
          if (!res.ok) throw new Error("Failed to load media");
          return res.json();
        })
        .then(function (data) {
          var list = data.media || [];
          var base = data.uploadsBaseUrl || uploadsBaseUrl || "";
          list.forEach(function (m) {
            var path = (m.path || "").replace(/\\/g, "/");
            var src = base + (path ? "/" + path : "");
            var isImage = (m.mimeType || "").indexOf("image/") === 0;
            var card = document.createElement("label");
            card.className = "admin-media-picker-grid-item";
            card.setAttribute("data-media-id", m.id);
            card.setAttribute("data-path", path);
            card.setAttribute("data-filename", m.filename || "");
            card.setAttribute("data-mime-type", m.mimeType || "");
            card.setAttribute("data-alt", m.alt || "");
            var checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.name = "media-picker-select";
            checkbox.value = m.id;
            card.appendChild(checkbox);
            if (isImage) {
              var img = document.createElement("img");
              img.src = src;
              img.alt = m.alt || m.filename || "";
              img.className = "admin-media-picker-grid-thumb";
              card.appendChild(img);
            } else {
              var place = document.createElement("span");
              place.className = "admin-media-picker-grid-placeholder";
              place.textContent = "File";
              card.appendChild(place);
            }
            var nameSpan = document.createElement("span");
            nameSpan.className = "admin-media-picker-grid-filename";
            nameSpan.textContent = m.filename || m.path || m.id;
            card.appendChild(nameSpan);
            grid.appendChild(card);
          });
        })
        .catch(function () {
          grid.innerHTML = "<p class=\"admin-media-picker-error\">Could not load media list.</p>";
        });
    }

    function addSelected() {
      var currentIds = getCurrentIds();
      var checked = grid.querySelectorAll("input[name='media-picker-select']:checked");
      var base = uploadsBaseUrl || "";
      for (var i = 0; i < checked.length; i++) {
        var cb = checked[i];
        var id = cb.value;
        if (currentIds.indexOf(String(id)) !== -1) continue;
        var card = cb.closest(".admin-media-picker-grid-item");
        if (!card) continue;
        var path = card.getAttribute("data-path") || "";
        var filename = card.getAttribute("data-filename") || "";
        var mimeType = card.getAttribute("data-mime-type") || "";
        var alt = card.getAttribute("data-alt") || "";
        var src = base + (path ? "/" + path : "");

        var item = document.createElement("div");
        item.className = "admin-media-picker-attached-item";
        item.setAttribute("data-media-id", id);

        // Thumb wrap with featured star overlay
        var thumbWrap = document.createElement("div");
        thumbWrap.className = "admin-media-picker-thumb-wrap";

        if ((mimeType || "").indexOf("image/") === 0) {
          var img = document.createElement("img");
          img.className = "admin-media-picker-thumb";
          img.src = src;
          img.alt = alt || filename;
          img.width = 80;
          img.height = 60;
          thumbWrap.appendChild(img);
        } else {
          var place = document.createElement("span");
          place.className = "admin-media-picker-placeholder";
          place.textContent = "File";
          thumbWrap.appendChild(place);
        }

        thumbWrap.appendChild(buildFeaturedBtn(id, featuredInputName));
        item.appendChild(thumbWrap);

        var nameSpan = document.createElement("span");
        nameSpan.className = "admin-media-picker-filename";
        nameSpan.textContent = filename || path || id;
        nameSpan.title = filename || path;
        item.appendChild(nameSpan);

        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "admin-media-picker-remove";
        removeBtn.setAttribute("data-action", "remove-attached");
        removeBtn.setAttribute("aria-label", "Remove");
        removeBtn.textContent = "Remove";
        item.appendChild(removeBtn);

        var hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.name = inputName;
        hidden.value = id;

        attachedContainer.appendChild(item);
        attachedContainer.appendChild(hidden);
        currentIds.push(String(id));
      }
      grid.querySelectorAll("input[name='media-picker-select']:checked").forEach(function (c) {
        c.checked = false;
      });
      hideModal();
    }

    function removeAttached(itemEl) {
      var id = itemEl.getAttribute("data-media-id");
      if (!id) return;
      // Remove hidden mediaIds input
      var inputs = root.querySelectorAll('input[name="' + escapeSelectorAttr(inputName) + '"]');
      for (var i = 0; i < inputs.length; i++) {
        if (inputs[i].value === id) {
          inputs[i].remove();
          break;
        }
      }
      itemEl.remove();
    }

    openBtn.addEventListener("click", showModal);
    addSelectedBtn.addEventListener("click", addSelected);
    closeButtons.forEach(function (btn) {
      btn.addEventListener("click", hideModal);
    });

    attachedContainer.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action='remove-attached']");
      if (!btn) return;
      var item = btn.closest(".admin-media-picker-attached-item");
      if (item) removeAttached(item);
    });
  }

  function init() {
    var roots = document.querySelectorAll("[data-media-picker]");
    for (var i = 0; i < roots.length; i++) {
      initRoot(roots[i]);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
