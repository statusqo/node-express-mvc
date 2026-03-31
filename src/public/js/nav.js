document.addEventListener("DOMContentLoaded", function () {
  const navHeader = document.querySelector(".nav-header");
  const menuToggle = document.querySelector(".menu-toggle");
  const overlay = document.querySelector(".page-overlay");
  const drawer = document.getElementById("cart-drawer");
  const closeBtn = document.getElementById("cart-drawer-close");
  const triggers = document.querySelectorAll(".cart-drawer-trigger");
  const bodyEl = document.getElementById("cart-drawer-body");
  const checkoutLink = document.getElementById("cart-drawer-checkout-link");
  const countEl = document.getElementById("nav-cart-count") || document.querySelector(".cart-count");

  /* Nav: menu toggle */
  if (navHeader && menuToggle) {
    menuToggle.addEventListener("click", function () {
      navHeader.classList.toggle("is-open");
    });
  }

  /* Overlay click: close nav and cart */
  if (overlay) {
    overlay.addEventListener("click", function () {
      if (navHeader) navHeader.classList.remove("is-open");
      if (drawer) {
        drawer.classList.remove("is-open");
        drawer.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
      }
    });
  }

  /* Cart drawer */
  if (!drawer || !overlay) return;

  function openCart() {
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeCart() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function escapeHtml(s) {
    if (s == null) return "";
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function buildLineHtml(line) {
    const price = Number(line.price);
    const qty = line.quantity;
    const subtotal = (price * qty).toFixed(2);
    const priceStr = price.toFixed(2);
    const productVariantId = escapeHtml(line.productVariantId);
    const title = escapeHtml(line.title);
    const showQuantityStepper = line.showQuantityStepper !== false;
    const plusDisabled = line.canIncrease === false;
    const plusDisabledAttr = plusDisabled ? ' disabled aria-disabled="true"' : "";
    const stepperHtml = showQuantityStepper
      ? (
        '<button type="button" class="cart-drawer-qty-btn cart-drawer-qty-minus" data-product-variant-id="' +
        productVariantId +
        '" aria-label="Decrease quantity">−</button>' +
        '<span class="cart-drawer-qty" aria-live="polite">' +
        qty +
        "</span>" +
        '<button type="button" class="cart-drawer-qty-btn cart-drawer-qty-plus" data-product-variant-id="' +
        productVariantId +
        '" aria-label="Increase quantity"' +
        plusDisabledAttr +
        ">+</button>"
      )
      : "";
    return (
      '<li class="cart-drawer-item" data-product-variant-id="' +
      productVariantId +
      '" data-quantity="' +
      qty +
      '" data-price="' +
      price +
      '">' +
      '<span class="cart-drawer-item-title">' +
      title +
      "</span>" +
      '<span class="cart-drawer-item-meta">' +
      qty +
      " × " +
      priceStr +
      " = " +
      subtotal +
      "</span>" +
      '<div class="cart-drawer-item-actions">' +
      stepperHtml +
      '<button type="button" class="cart-drawer-remove-btn" data-product-variant-id="' +
      productVariantId +
      '" aria-label="Remove from cart"><i class="fa-solid fa-trash-can"></i></button>' +
      "</div>" +
      "</li>"
    );
  }

  function renderCart(data) {
    if (!bodyEl) return;
    const lines = data.lines || [];
    const count = data.count != null ? data.count : 0;

    if (lines.length === 0) {
      bodyEl.innerHTML =
        '<p class="cart-drawer-empty" id="cart-drawer-empty">Your cart is empty.</p>';
    } else {
      bodyEl.innerHTML =
        '<ul class="cart-drawer-list" id="cart-drawer-list">' +
        lines.map(buildLineHtml).join("") +
        "</ul>";
    }

    if (countEl) {
      if (count > 0) {
        countEl.textContent = count;
        countEl.style.display = "";
      } else {
        countEl.style.display = "none";
      }
    }
    if (checkoutLink) {
      checkoutLink.style.display = count > 0 ? "" : "none";
    }
  }

  function api(method, url, body) {
    const opts = {
      method: method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    };
    if (body && (method === "POST" || method === "PUT")) {
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (res) {
      if (res.status === 429) {
        window.location.reload();
        return Promise.reject(new Error("Rate limited"));
      }
      if (!res.ok) throw new Error(res.statusText || "Request failed");
      return res.json();
    });
  }

  function updateQuantity(productVariantId, quantity) {
    return api("POST", "/api/cart/update", { productVariantId: productVariantId, quantity: quantity });
  }

  function removeItem(productVariantId) {
    return api("POST", "/api/cart/remove", { productVariantId: productVariantId });
  }

  drawer.addEventListener("click", function (ev) {
    const minusBtn = ev.target.closest(".cart-drawer-qty-minus");
    if (minusBtn) {
      ev.preventDefault();
      const productVariantId = minusBtn.getAttribute("data-product-variant-id");
      const item = minusBtn.closest(".cart-drawer-item");
      const qtyEl = item ? item.querySelector(".cart-drawer-qty") : null;
      const currentQty = qtyEl ? parseInt(qtyEl.textContent, 10) : 1;
      if (currentQty <= 1) {
        removeItem(productVariantId).then(renderCart).catch(function () {});
      } else {
        updateQuantity(productVariantId, currentQty - 1).then(renderCart).catch(function () {});
      }
      return;
    }

    const plusBtn = ev.target.closest(".cart-drawer-qty-plus");
    if (plusBtn) {
      ev.preventDefault();
      if (plusBtn.disabled || plusBtn.getAttribute("aria-disabled") === "true") return;
      const productVariantId = plusBtn.getAttribute("data-product-variant-id");
      const item = plusBtn.closest(".cart-drawer-item");
      const qtyEl = item ? item.querySelector(".cart-drawer-qty") : null;
      const currentQty = qtyEl ? parseInt(qtyEl.textContent, 10) : 1;
      updateQuantity(productVariantId, currentQty + 1).then(renderCart).catch(function () {});
      return;
    }

    const removeBtn = ev.target.closest(".cart-drawer-remove-btn");
    if (removeBtn) {
      ev.preventDefault();
      const productVariantId = removeBtn.getAttribute("data-product-variant-id");
      removeItem(productVariantId).then(renderCart).catch(function () {});
    }
  });

  window.addEventListener("cart:updated", function (ev) {
    if (ev.detail && ev.detail.lines != null) {
      renderCart(ev.detail);
    }
  });

  triggers.forEach(function (el) {
    el.addEventListener("click", openCart);
  });

  if (closeBtn) closeBtn.addEventListener("click", closeCart);

  drawer.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeCart();
  });
});
