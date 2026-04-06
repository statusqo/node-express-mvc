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
    hidden("title", v.title);
    hidden("priceAmount", v.priceAmount);
    hidden("quantity", v.quantity);
    hidden("sku", v.sku || "");
    hidden("active", v.active ? "1" : "0");

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

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "da-btn da-btn--ghost da-variant-remove";
    removeBtn.textContent = "Remove";

    li.appendChild(main);
    li.appendChild(removeBtn);
    return li;
  }

  // Add variant button — stage a new row in the DOM (no server call)
  if (addBtn) {
    addBtn.addEventListener("click", function () {
      var titleEl = document.getElementById("newVariantTitle");
      var priceEl = document.getElementById("newVariantPrice");
      var qtyEl = document.getElementById("newVariantQty");
      var skuEl = document.getElementById("newVariantSku");
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
        id: null,
        title: title,
        priceAmount: priceRaw,
        quantity: qty,
        sku: skuEl ? skuEl.value.trim() : "",
        active: activeEl ? activeEl.checked : true,
      };

      var index = nextIndex++;
      var row = buildRow(v, index);
      if (listEl) listEl.appendChild(row);

      setFeedback("Variant staged. It will be saved when you submit the form.");

      // Clear add fields
      if (titleEl) titleEl.value = "";
      if (priceEl) priceEl.value = "";
      if (qtyEl) qtyEl.value = "0";
      if (skuEl) skuEl.value = "";
      if (activeEl) activeEl.checked = false;
      if (titleEl) titleEl.focus();
    });
  }

  // Remove button — remove row from DOM (its hidden inputs go with it)
  if (listEl) {
    listEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".da-variant-remove");
      if (!btn) return;
      var row = btn.closest(".da-variant-row");
      if (!row) return;
      row.remove();
      setFeedback("Variant removed. Save the form to confirm.");
    });
  }
})();
