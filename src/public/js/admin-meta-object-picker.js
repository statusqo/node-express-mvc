/**
 * Admin meta object picker component.
 * Finds all [data-meta-object-picker] roots, reads config from data-* attributes,
 * and wires: open modal → fetch meta objects → render list → add selected (with dynamic attribute form) / remove / cancel.
 * Form builder must match server input types (metaObject.schema and product form).
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

  /**
   * Build attribute form DOM for one meta object (matches server-rendered types).
   * @param {string} metaObjectId
   * @param {Array<{ key: string, type: string, value: string }>} definitionPairs
   * @param {Object} values - current values keyed by attribute key
   */
  function buildAttributeForm(metaObjectId, definitionPairs, values) {
    var container = document.createElement("div");
    container.className = "admin-meta-object-picker-values";
    container.setAttribute("data-meta-object-id", metaObjectId);
    values = values || {};
    (definitionPairs || []).forEach(function (pair) {
      var key = pair.key;
      var type = pair.type || "string";
      var placeholder = pair.value || "";
      var inputVal = values[key] != null ? values[key] : placeholder;
      var id = "metaObjectValues-" + metaObjectId + "-" + key;
      var nameBase = "metaObjectValues[" + metaObjectId + "][" + key + "]";

      var formGroup = document.createElement("div");
      formGroup.className = "admin-form-group";

      var labelEl = document.createElement("label");
      labelEl.htmlFor = id;
      labelEl.textContent = key;
      formGroup.appendChild(labelEl);

      if (type === "text") {
        var ta = document.createElement("textarea");
        ta.id = id;
        ta.name = nameBase;
        ta.rows = 3;
        ta.placeholder = placeholder;
        ta.textContent = inputVal;
        formGroup.appendChild(ta);
      } else if (type === "boolean") {
        var wrap = document.createElement("label");
        wrap.className = "admin-checkbox";
        wrap.style.display = "inline-flex";
        wrap.style.margin = "0";
        var hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.name = nameBase;
        hidden.value = "false";
        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = id;
        cb.name = nameBase;
        cb.value = "true";
        if (inputVal === "true" || inputVal === "on" || inputVal === "1") cb.checked = true;
        wrap.appendChild(hidden);
        wrap.appendChild(cb);
        wrap.appendChild(document.createTextNode(" Yes"));
        formGroup.appendChild(wrap);
      } else {
        var input = document.createElement("input");
        input.id = id;
        input.name = nameBase;
        input.placeholder = placeholder;
        if (type === "number") {
          input.type = "number";
          input.step = "any";
        } else if (type === "date") {
          input.type = "date";
        } else if (type === "url") {
          input.type = "url";
        } else if (type === "email") {
          input.type = "email";
        } else {
          input.type = "text";
        }
        input.value = inputVal;
        formGroup.appendChild(input);
      }
      container.appendChild(formGroup);
    });
    return container;
  }

  function initRoot(root) {
    var inputName = getAttr(root, "data-input-name");
    var apiUrl = getAttr(root, "data-api-url");
    if (!inputName || !apiUrl) return;

    var attachedContainer = root.querySelector(".admin-meta-object-picker-attached");
    var openBtn = root.querySelector("[data-action='open-meta-object-picker']");
    var modal = root.querySelector(".admin-meta-object-picker-modal");
    var listEl = root.querySelector(".admin-meta-object-picker-list");
    var addSelectedBtn = root.querySelector("[data-action='add-selected-meta-objects']");
    var closeButtons = root.querySelectorAll("[data-action='close-meta-object-picker']");

    if (!attachedContainer || !openBtn || !modal || !listEl) return;

    function showModal() {
      modal.hidden = false;
      if (listEl.children.length === 0) loadAndRenderList();
    }

    function hideModal() {
      modal.hidden = true;
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

    function loadAndRenderList() {
      listEl.innerHTML = "";
      fetch(apiUrl, { headers: { Accept: "application/json" } })
        .then(function (res) {
          if (!res.ok) throw new Error("Failed to load meta objects");
          return res.json();
        })
        .then(function (data) {
          var list = data.metaObjects || [];
          list.forEach(function (mo) {
            var card = document.createElement("label");
            card.className = "admin-meta-object-picker-list-item";
            card.setAttribute("data-meta-object-id", mo.id);
            card.setAttribute("data-name", mo.name || "");
            card.setAttribute("data-type", mo.type || "");
            card.setAttribute("data-definition-pairs", JSON.stringify(mo.definitionPairs || []));
            var checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.name = "meta-object-picker-select";
            checkbox.value = mo.id;
            card.appendChild(checkbox);
            var titleSpan = document.createElement("span");
            titleSpan.className = "admin-meta-object-picker-list-title";
            titleSpan.textContent = mo.name + (mo.type ? " (" + mo.type + ")" : "");
            card.appendChild(titleSpan);
            listEl.appendChild(card);
          });
        })
        .catch(function () {
          listEl.innerHTML = "<p class=\"admin-meta-object-picker-error\">Could not load meta objects.</p>";
        });
    }

    function addSelected() {
      var currentIds = getCurrentIds();
      var checked = listEl.querySelectorAll("input[name='meta-object-picker-select']:checked");
      for (var i = 0; i < checked.length; i++) {
        var cb = checked[i];
        var id = cb.value;
        if (currentIds.indexOf(String(id)) !== -1) continue;
        var card = cb.closest(".admin-meta-object-picker-list-item");
        if (!card) continue;
        var name = card.getAttribute("data-name") || "";
        var type = card.getAttribute("data-type") || "";
        var definitionPairsJson = card.getAttribute("data-definition-pairs");
        var definitionPairs = [];
        try {
          definitionPairs = definitionPairsJson ? JSON.parse(definitionPairsJson) : [];
        } catch (e) {}
        if (!Array.isArray(definitionPairs)) definitionPairs = [];

        var item = document.createElement("div");
        item.className = "admin-meta-object-picker-item";
        item.setAttribute("data-meta-object-id", id);

        var header = document.createElement("div");
        header.className = "admin-meta-object-picker-item-header";
        var title = document.createElement("h3");
        title.className = "admin-meta-object-picker-title";
        title.textContent = name + (type ? " (" + type + ")" : "");
        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "admin-meta-object-picker-remove";
        removeBtn.setAttribute("data-action", "remove-meta-object");
        removeBtn.setAttribute("aria-label", "Remove");
        removeBtn.textContent = "Remove";
        header.appendChild(title);
        header.appendChild(removeBtn);
        item.appendChild(header);

        var hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.name = inputName;
        hidden.value = id;
        item.appendChild(hidden);

        var valuesEl = buildAttributeForm(id, definitionPairs, {});
        item.appendChild(valuesEl);
        if (definitionPairs.length === 0) {
          var noDefP = document.createElement("p");
          noDefP.className = "admin-form-hint admin-meta-object-picker-no-definition";
          noDefP.textContent = "No definition. Add fields in Meta Objects admin.";
          item.appendChild(noDefP);
        }

        attachedContainer.appendChild(item);
        currentIds.push(String(id));
      }
      listEl.querySelectorAll("input[name='meta-object-picker-select']:checked").forEach(function (c) {
        c.checked = false;
      });
      hideModal();
    }

    function removeMetaObject(itemEl) {
      var id = itemEl.getAttribute("data-meta-object-id");
      if (!id) return;
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
    if (addSelectedBtn) addSelectedBtn.addEventListener("click", addSelected);
    closeButtons.forEach(function (btn) {
      btn.addEventListener("click", hideModal);
    });

    attachedContainer.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action='remove-meta-object']");
      if (!btn) return;
      var item = btn.closest(".admin-meta-object-picker-item");
      if (item) removeMetaObject(item);
    });
  }

  function init() {
    var roots = document.querySelectorAll("[data-meta-object-picker]");
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
