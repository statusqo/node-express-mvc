/**
 * Intercepts add-to-cart form submissions and uses the API instead of full-page POST.
 * Forms must have class "js-add-to-cart-form".
 */
document.addEventListener("DOMContentLoaded", function () {
  const forms = document.querySelectorAll(".js-add-to-cart-form");
  if (!forms.length) return;

  function showToast(message, type) {
    const toast = document.createElement("div");
    toast.className = "toast toast-" + (type || "success");
    toast.setAttribute("role", "alert");
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.remove();
    }, 3000);
  }

  function addToCart(productVariantId, quantity) {
    return fetch("/api/cart/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ productVariantId, quantity }),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || res.statusText || "Request failed");
        return data;
      });
    });
  }

  forms.forEach(function (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      const productVariantId = form.querySelector('input[name="productVariantId"]')?.value?.trim();
      const quantityInput = form.querySelector('input[name="quantity"]');
      const quantity = quantityInput ? parseInt(quantityInput.value, 10) || 1 : 1;

      if (!productVariantId) {
        showToast("Invalid product.", "error");
        return;
      }

      const btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Adding…";
      }

      addToCart(productVariantId, quantity)
        .then(function (data) {
          showToast("Added to cart.", "success");
          window.dispatchEvent(new CustomEvent("cart:updated", { detail: data }));
        })
        .catch(function (err) {
          showToast(err.message || "Could not add to cart.", "error");
        })
        .finally(function () {
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Add to cart";
          }
        });
    });
  });
});
