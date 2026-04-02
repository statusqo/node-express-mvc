(function () {
  "use strict";

  var section = document.getElementById("productVariantsSection");
  if (!section) return;

  var addUrl = section.getAttribute("data-add-url");
  var removeBase = section.getAttribute("data-remove-base");
  var currency = section.getAttribute("data-currency") || "EUR";
  var listEl = document.getElementById("productVariantsList");
  var feedback = document.getElementById("productVariantsFeedback");
  var addBtn = document.getElementById("addProductVariantBtn");
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setFeedback(msg, isError) {
    if (!feedback) return;
    feedback.textContent = msg || "";
    feedback.classList.toggle("da-variant-feedback--error", !!isError);
  }

  function flashSection() {
    if (reducedMotion) return;
    section.classList.remove("da-variant-section--pulse");
    void section.offsetWidth;
    section.classList.add("da-variant-section--pulse");
    window.setTimeout(function () {
      section.classList.remove("da-variant-section--pulse");
    }, 600);
  }

  function buildRow(v) {
    var li = document.createElement("li");
    li.className = "da-variant-row";
    li.setAttribute("data-variant-id", v.id);

    var main = document.createElement("div");
    main.className = "da-variant-row-main";

    var title = document.createElement("span");
    title.className = "da-variant-title";
    title.textContent = v.title;

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
    sku.textContent = v.sku;

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

    main.appendChild(title);
    main.appendChild(meta);

    var removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "da-btn da-btn--ghost da-variant-remove";
    removeBtn.setAttribute("data-variant-id", v.id);
    removeBtn.textContent = "Remove";

    li.appendChild(main);
    li.appendChild(removeBtn);
    return li;
  }

  function renderList(variants) {
    if (!listEl) return;
    listEl.innerHTML = "";
    (variants || []).forEach(function (v) {
      listEl.appendChild(buildRow(v));
    });
  }

  function postJson(url, body) {
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json().then(function (data) {
        return { ok: r.ok, status: r.status, data: data };
      });
    });
  }

  if (addBtn && addUrl) {
    addBtn.addEventListener("click", function () {
      var titleEl = document.getElementById("newVariantTitle");
      var priceEl = document.getElementById("newVariantPrice");
      var qtyEl = document.getElementById("newVariantQty");
      var skuEl = document.getElementById("newVariantSku");
      var activeEl = document.getElementById("newVariantActive");
      var body = {
        title: titleEl ? titleEl.value.trim() : "",
        priceAmount: priceEl && priceEl.value !== "" ? priceEl.value : "0",
        quantity: qtyEl && qtyEl.value !== "" ? qtyEl.value : "0",
        sku: skuEl ? skuEl.value.trim() : "",
        active: activeEl ? activeEl.checked : false,
      };
      setFeedback("");
      addBtn.disabled = true;
      section.classList.add("da-variant-add--busy");
      postJson(addUrl, body)
        .then(function (res) {
          if (!res.ok || !res.data || !res.data.ok) {
            setFeedback((res.data && res.data.error) || "Could not add variant.", true);
            return;
          }
          renderList(res.data.variants);
          flashSection();
          setFeedback("Variant added.");
          if (titleEl) titleEl.value = "";
          if (priceEl) priceEl.value = "";
          if (qtyEl) qtyEl.value = "0";
          if (skuEl) skuEl.value = "";
          if (activeEl) activeEl.checked = false;
          if (titleEl) titleEl.focus();
        })
        .catch(function () {
          setFeedback("Something went wrong. Try again.", true);
        })
        .finally(function () {
          addBtn.disabled = false;
          section.classList.remove("da-variant-add--busy");
        });
    });
  }

  if (listEl && removeBase) {
    listEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".da-variant-remove");
      if (!btn) return;
      var id = btn.getAttribute("data-variant-id");
      if (!id) return;
      if (!window.confirm("Remove this variant? This cannot be undone.")) return;

      var row = btn.closest(".da-variant-row");
      if (row && !reducedMotion) {
        row.classList.add("da-variant-row--leaving");
      }

      btn.disabled = true;
      var url = removeBase + id + "/delete";
      window.setTimeout(function () {
        postJson(url, {})
          .then(function (res) {
            if (!res.ok || !res.data || !res.data.ok) {
              if (row) row.classList.remove("da-variant-row--leaving");
              setFeedback((res.data && res.data.error) || "Could not remove variant.", true);
              btn.disabled = false;
              return;
            }
            renderList(res.data.variants);
            flashSection();
            setFeedback("Variant removed.");
          })
          .catch(function () {
            if (row) row.classList.remove("da-variant-row--leaving");
            setFeedback("Something went wrong. Try again.", true);
            btn.disabled = false;
          });
      }, reducedMotion ? 0 : 180);
    });
  }
})();
