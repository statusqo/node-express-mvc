/**
 * Account page: Add card via Stripe SetupIntent. Mounts single Card Element, confirms setup, saves PaymentMethod to our DB.
 */
(function () {
  function init() {
    var script = document.querySelector('script[src*="account-payment-methods.js"]');
    var stripePublishableKey = script && script.getAttribute("data-stripe-key") ? script.getAttribute("data-stripe-key") : "";
    var wrap = document.getElementById("addCardElementWrap");
    var saveBtn = document.getElementById("saveCardBtn");
    var errorsEl = document.getElementById("addCardErrors");

    if (!stripePublishableKey || !wrap || !saveBtn || typeof Stripe === "undefined") return;

    var stripe = Stripe(stripePublishableKey);
    var elements = stripe.elements();
    var cardElement = elements.create("card", {
      style: { base: { fontSize: "16px", color: "#32325d" } },
      hidePostalCode: true,
      disableLink: true,
    });
    cardElement.mount("#add-card-element");
    cardElement.on("change", function (e) {
      if (errorsEl) errorsEl.textContent = e.error ? e.error.message : "";
    });

    saveBtn.addEventListener("click", function () {
      if (!errorsEl) return;
      errorsEl.textContent = "";
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";

      fetch("/account/payment-methods/setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
      })
        .then(function (res) {
          if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || res.statusText); });
          return res.json();
        })
        .then(function (data) {
          var clientSecret = data.clientSecret;
          if (!clientSecret) throw new Error("Invalid response from server.");
          return stripe.confirmCardSetup(clientSecret, {
            payment_method: { card: cardElement },
          });
        })
        .then(function (result) {
          if (result.error) throw result.error;
          var pm = result.setupIntent && result.setupIntent.payment_method;
          var paymentMethodId = (typeof pm === "string") ? pm : (pm && pm.id);
          if (!paymentMethodId) throw new Error("Card saved but could not retrieve payment method.");
          var formData = new URLSearchParams();
          formData.append("paymentMethodId", paymentMethodId);
          return fetch("/account/payment-methods", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString(),
            credentials: "same-origin",
          });
        })
        .then(function (res) {
          if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || res.statusText); });
          window.location.reload();
        })
        .catch(function (err) {
          if (errorsEl) errorsEl.textContent = err.message || "Could not save card.";
          saveBtn.disabled = false;
          saveBtn.textContent = "Save card";
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
