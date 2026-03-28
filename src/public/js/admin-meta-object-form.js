document.addEventListener("DOMContentLoaded", function () {
  var container   = document.getElementById("definitionPairs");
  var addBtn      = document.getElementById("addDefinitionPair");
  var hiddenInput = document.getElementById("definition");
  var form        = document.getElementById("metaObjectForm");

  var TYPE_OPTIONS = [
    { value: "string",  label: "String"  },
    { value: "text",    label: "Text"    },
    { value: "number",  label: "Number"  },
    { value: "date",    label: "Date"    },
    { value: "url",     label: "URL"     },
    { value: "email",   label: "Email"   },
    { value: "boolean", label: "Boolean" },
  ];

  function createRow(key, type) {
    var row = document.createElement("div");
    row.className = "definition-row";

    var keyInput = document.createElement("input");
    keyInput.className = "definition-key";
    keyInput.type = "text";
    keyInput.placeholder = "Key";
    keyInput.value = key || "";

    var typeSelect = document.createElement("select");
    typeSelect.className = "definition-type";
    TYPE_OPTIONS.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === (type || "string")) o.selected = true;
      typeSelect.appendChild(o);
    });

    var wrap = document.createElement("div");
    wrap.className = "da-delete-wrap";
    wrap.setAttribute("aria-label", "Remove attribute");

    var trigger = document.createElement("button");
    trigger.className = "da-row-btn da-row-btn--delete da-definition-remove-trigger";
    trigger.type = "button";
    trigger.setAttribute("aria-label", "Remove attribute");
    trigger.setAttribute("aria-expanded", "false");
    trigger.textContent = "Remove";

    var confirmGroup = document.createElement("div");
    confirmGroup.className = "da-confirm-group";
    confirmGroup.setAttribute("role", "group");
    confirmGroup.setAttribute("aria-label", "Confirm removal");

    var cancelBtn = document.createElement("button");
    cancelBtn.className = "da-row-btn da-row-btn--cancel da-definition-remove-cancel";
    cancelBtn.type = "button";
    cancelBtn.setAttribute("aria-label", "Cancel");
    cancelBtn.textContent = "No";

    var sep = document.createElement("span");
    sep.className = "da-confirm-sep";
    sep.setAttribute("aria-hidden", "true");

    var confirmBtn = document.createElement("button");
    confirmBtn.className = "da-row-btn da-row-btn--confirm da-definition-remove-confirm";
    confirmBtn.type = "button";
    confirmBtn.setAttribute("aria-label", "Yes, remove");
    confirmBtn.textContent = "Yes, remove";

    confirmGroup.appendChild(cancelBtn);
    confirmGroup.appendChild(sep);
    confirmGroup.appendChild(confirmBtn);
    wrap.appendChild(trigger);
    wrap.appendChild(confirmGroup);

    var actionsCell = document.createElement("div");
    actionsCell.className = "admin-definition-cell-actions";
    actionsCell.appendChild(wrap);

    row.appendChild(keyInput);
    row.appendChild(typeSelect);
    row.appendChild(actionsCell);
    return row;
  }

  function syncHiddenInput() {
    var rows = container.querySelectorAll(".definition-row");
    var pairs = [];
    rows.forEach(function (row) {
      var keyInp = row.querySelector(".definition-key");
      var typeSel = row.querySelector(".definition-type");
      var key  = keyInp  ? (keyInp.value  || "").trim() : "";
      var type = typeSel ? typeSel.value                : "string";
      if (key) pairs.push({ key: key, type: type, value: "" });
    });
    hiddenInput.value = JSON.stringify(pairs);
  }

  function initDefinitionRemoveFlow() {
    container.querySelectorAll(".da-definition-remove-trigger").forEach(function (trigger) {
      trigger.addEventListener("click", function () {
        var row = trigger.closest(".definition-row");
        if (!row) return;
        row.classList.add("definition-row--confirming");
        trigger.setAttribute("aria-expanded", "true");
        var cancel = row.querySelector(".da-definition-remove-cancel");
        if (cancel) setTimeout(function () { cancel.focus(); }, 100);
      });
    });

    container.querySelectorAll(".da-definition-remove-cancel").forEach(function (cancel) {
      cancel.addEventListener("click", function () {
        var row = cancel.closest(".definition-row");
        if (!row) return;
        row.classList.remove("definition-row--confirming");
        var trigger = row.querySelector(".da-definition-remove-trigger");
        if (trigger) {
          trigger.setAttribute("aria-expanded", "false");
          setTimeout(function () { trigger.focus(); }, 100);
        }
      });
    });

    container.querySelectorAll(".da-definition-remove-confirm").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest(".definition-row");
        if (row) { row.remove(); syncHiddenInput(); }
      });
    });
  }

  function addRow(key, type) {
    var row = createRow(key, type);
    var kInp = row.querySelector(".definition-key");
    var tSel = row.querySelector(".definition-type");
    if (kInp) kInp.addEventListener("input", syncHiddenInput);
    if (tSel) tSel.addEventListener("change", syncHiddenInput);
    container.appendChild(row);
    initDefinitionRemoveFlow();
    syncHiddenInput();
  }

  if (addBtn) addBtn.addEventListener("click", function () { addRow("", "string"); });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    container.querySelectorAll(".definition-row--confirming").forEach(function (row) {
      row.classList.remove("definition-row--confirming");
      var trigger = row.querySelector(".da-definition-remove-trigger");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
  });

  container.querySelectorAll(".definition-key").forEach(function (input) {
    input.addEventListener("input", syncHiddenInput);
  });
  container.querySelectorAll(".definition-type").forEach(function (sel) {
    sel.addEventListener("change", syncHiddenInput);
  });

  form.addEventListener("submit", function () { syncHiddenInput(); });

  if (container.querySelectorAll(".definition-row").length === 0) {
    addRow("", "string");
  } else {
    initDefinitionRemoveFlow();
    syncHiddenInput();
  }
});
