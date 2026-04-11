(function () {
  "use strict";

  var section = document.getElementById("productVariantsSection");
  if (!section) return;

  var currency = section.getAttribute("data-currency") || "EUR";
  var listEl = document.getElementById("productVariantsList");
  var feedback = document.getElementById("productVariantsFeedback");
  var addBtn = document.getElementById("addProductVariantBtn");

  // Track next hidden-input index. Start after the server-rendered existing variants.
  var nextIndex = listEl ? parseInt(listEl.getAttribute("data-initial-count") || "0", 10) : 0;

  function setFeedback(msg, isError) {
    if (!feedback) return;
    feedback.textContent = msg || "";
    feedback.classList.toggle("da-variant-feedback--error", !!isError);
  }

  function makeInput(type, value, attrs) {
    var inp = document.createElement("input");
    inp.type = type;
    inp.className = "da-form-input";
    if (value !== undefined && value !== null) inp.value = String(value);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        inp.setAttribute(k, attrs[k]);
      });
    }
    return inp;
  }

  function makeGroup(labelText, inputEl) {
    var g = document.createElement("div");
    g.className = "da-form-group";
    var lbl = document.createElement("label");
    lbl.className = "da-form-label";
    lbl.textContent = labelText;
    g.appendChild(lbl);
    g.appendChild(inputEl);
    return g;
  }

  // Build the inline edit panel inserted at the top of a row when editing.
  function buildEditPanel(row) {
    var index = row.getAttribute("data-variant-index");

    function getHidden(field) {
      var inp = row.querySelector('input[name="variants[' + index + '][' + field + ']"]');
      return inp ? inp.value : "";
    }

    var curTitle  = getHidden("title");
    var curPrice  = getHidden("priceAmount");
    var curQty    = getHidden("quantity");
    var curSku    = getHidden("sku");
    var curActive = getHidden("active") !== "0";

    var panel = document.createElement("div");
    panel.className = "da-variant-edit-panel";

    var fieldsRow = document.createElement("div");
    fieldsRow.className = "da-form-row da-variant-edit-fields";

    var titleInp = makeInput("text",   curTitle, { autocomplete: "off", placeholder: "Title" });
    var priceInp = makeInput("number", curPrice, { step: "0.01", min: "0", placeholder: "0.00" });
    var qtyInp   = makeInput("number", curQty,   { min: "0" });
    var skuInp   = makeInput("text",   curSku,   { autocomplete: "off", placeholder: "Auto if empty" });

    fieldsRow.appendChild(makeGroup("Title",    titleInp));
    fieldsRow.appendChild(makeGroup("Price",    priceInp));
    fieldsRow.appendChild(makeGroup("Quantity", qtyInp));
    fieldsRow.appendChild(makeGroup("SKU",      skuInp));
    panel.appendChild(fieldsRow);

    // Active checkbox
    var activeGroup = document.createElement("div");
    activeGroup.className = "da-form-group";
    var activeLabel = document.createElement("label");
    activeLabel.className = "da-checkbox";
    var activeChk = document.createElement("input");
    activeChk.type = "checkbox";
    activeChk.checked = curActive;
    activeLabel.appendChild(activeChk);
    activeLabel.appendChild(document.createTextNode(" Active"));
    activeGroup.appendChild(activeLabel);
    panel.appendChild(activeGroup);

    // Action buttons
    var actionsRow = document.createElement("div");
    actionsRow.className = "da-variant-edit-actions";

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "da-btn da-btn--primary da-variant-save";
    saveBtn.textContent = "Save changes";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "da-btn da-btn--secondary da-variant-cancel";
    cancelBtn.textContent = "Cancel";

    actionsRow.appendChild(saveBtn);
    actionsRow.appendChild(cancelBtn);
    panel.appendChild(actionsRow);

    saveBtn.addEventListener("click", function () {
      var title = titleInp.value.trim();
      if (!title) {
        titleInp.focus();
        setFeedback("Title is required.", true);
        return;
      }
      var priceRaw = priceInp.value !== "" ? parseFloat(priceInp.value) : 0;
      if (isNaN(priceRaw) || priceRaw < 0) {
        priceInp.focus();
        setFeedback("Price must be a number ≥ 0.", true);
        return;
      }
      var qty = qtyInp.value !== "" ? parseInt(qtyInp.value, 10) : 0;
      if (isNaN(qty) || qty < 0) qty = 0;
      var sku    = skuInp.value.trim();
      var active = activeChk.checked;

      // Update hidden inputs
      function setHidden(field, val) {
        var inp = row.querySelector('input[name="variants[' + index + '][' + field + ']"]');
        if (inp) inp.value = String(val);
      }
      setHidden("title",       title);
      setHidden("priceAmount", priceRaw);
      setHidden("quantity",    qty);
      setHidden("sku",         sku);
      setHidden("active",      active ? "1" : "0");

      // Update display spans
      var main = row.querySelector(".da-variant-row-main");
      if (main) {
        var titleEl = main.querySelector(".da-variant-title");
        var priceEl = main.querySelector(".da-variant-price");
        var skuEl   = main.querySelector(".da-variant-sku");
        var qtyEl   = main.querySelector(".da-variant-qty");
        var badge   = main.querySelector(".da-variant-badge");

        if (titleEl) titleEl.textContent = title;
        if (priceEl) priceEl.textContent = currency + " " + priceRaw.toFixed(2);
        if (skuEl)   skuEl.textContent   = sku || "auto";
        if (qtyEl)   qtyEl.textContent   = "Qty " + qty;

        if (!active && !badge) {
          var newBadge = document.createElement("span");
          newBadge.className = "da-variant-badge";
          newBadge.textContent = "Inactive";
          var metaEl = main.querySelector(".da-variant-meta");
          if (metaEl) metaEl.appendChild(newBadge);
        } else if (active && badge) {
          badge.remove();
        }
      }

      closeEditPanel(row);
      setFeedback("Changes staged. Save the form to confirm.");
    });

    cancelBtn.addEventListener("click", function () {
      closeEditPanel(row);
    });

    return panel;
  }

  function openEditPanel(row) {
    if (row.classList.contains("da-variant-row--editing")) return;
    var panel = buildEditPanel(row);
    row.insertBefore(panel, row.firstChild);
    row.classList.add("da-variant-row--editing");
    panel.querySelector(".da-form-input").focus();
  }

  function closeEditPanel(row) {
    var panel = row.querySelector(".da-variant-edit-panel");
    if (panel) panel.remove();
    row.classList.remove("da-variant-row--editing");
  }

  function buildRow(v, index) {
    var li = document.createElement("li");
    li.className = "da-variant-row";
    if (v.id) li.setAttribute("data-variant-id", v.id);
    li.setAttribute("data-variant-index", String(index));

    // Hidden inputs serialised on form submit
    function hidden(name, value) {
      var inp = document.createElement("input");
      inp.type = "hidden";
      inp.name = "variants[" + index + "][" + name + "]";
      inp.value = value != null ? String(value) : "";
      li.appendChild(inp);
    }
    if (v.id) hidden("id", v.id);
    hidden("title",       v.title);
    hidden("priceAmount", v.priceAmount);
    hidden("quantity",    v.quantity);
    hidden("sku",         v.sku || "");
    hidden("active",      v.active ? "1" : "0");

    // Visible row content
    var main = document.createElement("div");
    main.className = "da-variant-row-main";

    var titleEl = document.createElement("span");
    titleEl.className = "da-variant-title";
    titleEl.textContent = v.title;

    var meta = document.createElement("span");
    meta.className = "da-variant-meta";

    var price = document.createElement("span");
    price.className = "da-variant-price";
    price.textContent = currency + " " + Number(v.priceAmount).toFixed(2);

    var dot1 = document.createElement("span");
    dot1.className = "da-variant-dot";
    dot1.textContent = " · ";

    var sku = document.createElement("span");
    sku.className = "da-variant-sku";
    sku.textContent = v.sku || "auto";

    var dot2 = document.createElement("span");
    dot2.className = "da-variant-dot";
    dot2.textContent = " · ";

    var qty = document.createElement("span");
    qty.className = "da-variant-qty";
    qty.textContent = "Qty " + v.quantity;

    meta.appendChild(price);
    meta.appendChild(dot1);
    meta.appendChild(sku);
    meta.appendChild(dot2);
    meta.appendChild(qty);

    if (!v.active) {
      var badge = document.createElement("span");
      badge.className = "da-variant-badge";
      badge.textContent = "Inactive";
      meta.appendChild(badge);
    }

    main.appendChild(titleEl);
    main.appendChild(meta);

    var editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "da-btn da-btn--ghost da-variant-edit";
    editBtn.textContent = "Edit";

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "da-btn da-btn--ghost da-variant-remove";
    removeBtn.textContent = "Remove";

    li.appendChild(main);
    li.appendChild(editBtn);
    li.appendChild(removeBtn);
    return li;
  }

  // Add variant button — stage a new row in the DOM (no server call)
  if (addBtn) {
    addBtn.addEventListener("click", function () {
      var titleEl  = document.getElementById("newVariantTitle");
      var priceEl  = document.getElementById("newVariantPrice");
      var qtyEl    = document.getElementById("newVariantQty");
      var skuEl    = document.getElementById("newVariantSku");
      var activeEl = document.getElementById("newVariantActive");

      var title = titleEl ? titleEl.value.trim() : "";
      if (!title) {
        setFeedback("Title is required.", true);
        if (titleEl) titleEl.focus();
        return;
      }

      var priceRaw = priceEl && priceEl.value !== "" ? parseFloat(priceEl.value) : 0;
      if (isNaN(priceRaw) || priceRaw < 0) {
        setFeedback("Price must be a number ≥ 0.", true);
        if (priceEl) priceEl.focus();
        return;
      }

      var qty = qtyEl && qtyEl.value !== "" ? parseInt(qtyEl.value, 10) : 0;
      if (isNaN(qty) || qty < 0) qty = 0;

      var v = {
        id:          null,
        title:       title,
        priceAmount: priceRaw,
        quantity:    qty,
        sku:         skuEl ? skuEl.value.trim() : "",
        active:      activeEl ? activeEl.checked : true,
      };

      var index = nextIndex++;
      var row = buildRow(v, index);
      if (listEl) listEl.appendChild(row);

      setFeedback("Variant staged. It will be saved when you submit the form.");

      // Clear add fields
      if (titleEl)  titleEl.value   = "";
      if (priceEl)  priceEl.value   = "";
      if (qtyEl)    qtyEl.value     = "0";
      if (skuEl)    skuEl.value     = "";
      if (activeEl) activeEl.checked = false;
      if (titleEl)  titleEl.focus();
    });
  }

  // List event delegation: edit and remove
  if (listEl) {
    listEl.addEventListener("click", function (e) {
      var editTarget = e.target.closest(".da-variant-edit");
      if (editTarget) {
        var row = editTarget.closest(".da-variant-row");
        if (row) openEditPanel(row);
        return;
      }
      var removeTarget = e.target.closest(".da-variant-remove");
      if (removeTarget) {
        var row = removeTarget.closest(".da-variant-row");
        if (row) row.remove();
        setFeedback("Variant removed. Save the form to confirm.");
      }
    });
  }
})();
