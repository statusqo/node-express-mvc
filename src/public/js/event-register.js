/**
 * Event register: Stripe Elements, place-order (event), confirmCardPayment, confirm-order (shared).
 * Works for /webinars/:slug/register, /seminars/:slug/register, /classrooms/:slug/register.
 * Supports free sessions (data-is-free="1") — skips Stripe and handles { free: true, orderId } response.
 */
(function () {
  function init() {
    var form = document.getElementById("eventRegisterForm");
    if (!form) return;

    var stripePublishableKey = form.getAttribute("data-stripe-key") || "";
    var placeOrderUrl = form.getAttribute("data-place-order-url") || "";
    var userLoggedIn = form.getAttribute("data-user-logged-in") === "1";
    var isFree = form.getAttribute("data-is-free") === "1";
    var payBtn = document.getElementById("payBtn");
    var cardErrors = document.getElementById("cardErrors");
    var paySavedCard = document.getElementById("paySavedCard");
    var payNewCard = document.getElementById("payNewCard");
    var savedCardSelect = document.getElementById("savedCardSelect");
    var cardElementWrap = document.getElementById("cardElementWrap");
    var saveCardCheckbox = document.getElementById("saveCardCheckbox");
    var saveCardHidden = document.getElementById("saveCardHidden");
    var saveCardRow = form.querySelector(".saveCardRow");

    function syncSaveCardHidden() {
      if (saveCardHidden && saveCardCheckbox) saveCardHidden.value = saveCardCheckbox.checked ? "1" : "0";
    }
    if (saveCardCheckbox) saveCardCheckbox.addEventListener("change", syncSaveCardHidden);

    function updatePaymentUI() {
      var useSaved = paySavedCard && paySavedCard.checked;
      if (savedCardSelect) savedCardSelect.style.display = useSaved ? "block" : "none";
      if (cardElementWrap) cardElementWrap.style.display = useSaved ? "none" : "block";
      if (saveCardRow) saveCardRow.style.display = useSaved ? "none" : "block";
      syncSaveCardHidden();
    }
    if (paySavedCard) paySavedCard.addEventListener("change", updatePaymentUI);
    if (payNewCard) payNewCard.addEventListener("change", updatePaymentUI);
    updatePaymentUI();

    // Stripe is only initialised for paid sessions.
    var stripe = null;
    var cardElement = null;
    if (!isFree && stripePublishableKey && typeof Stripe !== "undefined") {
      stripe = Stripe(stripePublishableKey);
      var elements = stripe.elements();
      var cardElementContainer = document.getElementById("card-element");
      if (cardElementContainer) {
        var elementStyle = { base: { fontSize: "16px", color: "#32325d" } };
        cardElement = elements.create("card", { style: elementStyle, hidePostalCode: true, disableLink: true });
        cardElement.mount("#card-element");
        cardElement.on("change", function (e) {
          if (cardErrors) cardErrors.textContent = e.error ? e.error.message : "";
        });
      }
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();

      var eventIdEl = form.querySelector('input[name="eventId"]');
      var eventId = eventIdEl ? eventIdEl.value.trim() : "";
      var emailEl = form.querySelector('input[name="email"]');
      var email = emailEl ? emailEl.value.trim() : "";
      if (!eventId) {
        if (cardErrors) cardErrors.textContent = "Please select a session.";
        return;
      }
      if (!email) {
        if (cardErrors) cardErrors.textContent = "Email is required.";
        return;
      }

      // Saved-card / Stripe validation only applies to paid sessions.
      var useSavedCard = false;
      var selectedPmId = "";
      if (!isFree) {
        useSavedCard = paySavedCard && paySavedCard.checked;
        var savedPaymentMethodSelect = document.getElementById("savedPaymentMethod");
        selectedPmId = savedPaymentMethodSelect && savedPaymentMethodSelect.value
          ? String(savedPaymentMethodSelect.value).trim()
          : "";
        if (useSavedCard && !selectedPmId && userLoggedIn) {
          if (cardErrors) cardErrors.textContent = "Please select a saved card or use a new card.";
          return;
        }
        if (!useSavedCard && stripe && !cardElement && cardErrors) {
          cardErrors.textContent = "Please enter your card details.";
          return;
        }
        if (!stripe) {
          if (cardErrors) cardErrors.textContent = "Payment is not available. Please try again later.";
          return;
        }

        // Billing address is required for paid sessions.
        var billingLine1El = form.querySelector('input[name="billingLine1"]');
        var billingCityEl = form.querySelector('input[name="billingCity"]');
        var billingPostcodeEl = form.querySelector('input[name="billingPostcode"]');
        var billingCountryEl = form.querySelector('input[name="billingCountry"]');
        if (!billingLine1El || !billingLine1El.value.trim()) {
          if (cardErrors) cardErrors.textContent = "Billing address line 1 is required.";
          return;
        }
        if (!billingCityEl || !billingCityEl.value.trim()) {
          if (cardErrors) cardErrors.textContent = "Billing city is required.";
          return;
        }
        if (!billingPostcodeEl || !billingPostcodeEl.value.trim()) {
          if (cardErrors) cardErrors.textContent = "Billing postcode is required.";
          return;
        }
        if (!billingCountryEl || !billingCountryEl.value.trim()) {
          if (cardErrors) cardErrors.textContent = "Billing country is required.";
          return;
        }
      }

      if (payBtn) {
        payBtn.disabled = true;
        payBtn.textContent = "Processing…";
      }
      if (cardErrors) cardErrors.textContent = "";

      function buildPlaceOrderBody() {
        var params = new URLSearchParams();
        params.append("eventId", eventId);
        params.append("email", email);
        var forename = form.querySelector('input[name="forename"]');
        var surname = form.querySelector('input[name="surname"]');
        if (forename && forename.value) params.append("forename", forename.value);
        if (surname && surname.value) params.append("surname", surname.value);
        if (!isFree && useSavedCard && selectedPmId) params.append("paymentMethodId", selectedPmId);
        if (!isFree) {
          var billingFields = ["billingLine1", "billingLine2", "billingCity", "billingState", "billingPostcode", "billingCountry"];
          billingFields.forEach(function (name) {
            var el = form.querySelector('input[name="' + name + '"]');
            if (el && el.value) params.append(name, el.value);
          });
          var wantToSaveCard = saveCardCheckbox && saveCardCheckbox.checked;
          params.append("saveCard", wantToSaveCard ? "1" : "0");
        }
        return params.toString();
      }

      fetch(placeOrderUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: buildPlaceOrderBody(),
        credentials: "same-origin",
      })
        .then(function (res) {
          if (res.status === 429) { window.location.reload(); return Promise.reject(new Error("Rate limited")); }
          if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || res.statusText); });
          return res.json();
        })
        .then(function (data) {
          // Free session — server fulfilled the order without any payment gateway interaction.
          if (data.free && data.orderId) {
            if (payBtn) payBtn.textContent = "Confirmed!";
            window.location.href = "/orders/" + data.orderId;
            return new Promise(function () {});
          }
          var clientSecret = data.clientSecret;
          var orderId = data.orderId;
          if (!clientSecret || !orderId) throw new Error("Invalid response from server.");
          var confirmOptions = {};
          if (useSavedCard && selectedPmId) {
            confirmOptions.payment_method = selectedPmId;
          } else if (cardElement) {
            confirmOptions.payment_method = { card: cardElement };
          }
          return stripe.confirmCardPayment(clientSecret, confirmOptions).then(function (result) {
            if (result.error) throw result.error;
            var paymentIntentId = result.paymentIntent && result.paymentIntent.id;
            var pm = result.paymentIntent && result.paymentIntent.payment_method;
            var paymentMethodIdFromIntent = (typeof pm === "string") ? pm : (pm && pm.id);
            if (!paymentIntentId) throw new Error("Payment succeeded but no payment intent id.");
            syncSaveCardHidden();
            var wantToSaveCard = saveCardCheckbox && saveCardCheckbox.checked;
            var validPmId = typeof paymentMethodIdFromIntent === "string" && paymentMethodIdFromIntent.indexOf("pm_") === 0;
            var confirmParams = new URLSearchParams();
            confirmParams.append("paymentIntentId", paymentIntentId);
            confirmParams.append("orderId", orderId);
            confirmParams.set("saveCard", wantToSaveCard ? "1" : "0");
            if (validPmId) confirmParams.append("paymentMethodId", paymentMethodIdFromIntent);
            return fetch("/checkout/confirm-order", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: confirmParams.toString(),
              credentials: "same-origin",
            });
          });
        })
        .then(function (res) {
          if (res && res.status === 429) { window.location.reload(); return Promise.reject(new Error("Rate limited")); }
          if (!res || !res.ok) return res && res.json ? res.json().then(function (d) { throw new Error(d.detail || d.error || res.statusText); }) : Promise.reject(new Error("Request failed"));
          return res.json();
        })
        .then(function (data) {
          var orderId = data.orderId;
          if (!orderId) throw new Error("Invalid response from server.");
          if (payBtn) payBtn.textContent = "Success!";
          if (cardErrors) cardErrors.textContent = "";
          window.location.href = "/orders/" + orderId;
        })
        .catch(function (err) {
          if (cardErrors) cardErrors.textContent = err.message || "Payment failed. Please try again.";
          if (payBtn) {
            payBtn.disabled = false;
            payBtn.textContent = isFree ? "Register for free" : "Pay and register";
          }
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
