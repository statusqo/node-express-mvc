/**
 * Checkout: billing sync, Stripe payment (saved card or new card). Single Card Element; optional "Save this card".
 */
(function () {
  function init() {
    var form = document.getElementById("checkoutForm");
    if (!form) return;

    var stripePublishableKey = form.getAttribute("data-stripe-key") || "";
    var sameAsDelivery = document.getElementById("sameAsDelivery");
    var billingFields = document.getElementById("billingFields");
    var deliveryLine1 = document.getElementById("deliveryLine1");
    var deliveryLine2 = document.getElementById("deliveryLine2");
    var deliveryCity = document.getElementById("deliveryCity");
    var deliveryState = document.getElementById("deliveryState");
    var deliveryPostcode = document.getElementById("deliveryPostcode");
    var deliveryCountry = document.getElementById("deliveryCountry");
    var billingLine1 = document.getElementById("billingLine1");
    var billingLine2 = document.getElementById("billingLine2");
    var billingCity = document.getElementById("billingCity");
    var billingState = document.getElementById("billingState");
    var billingPostcode = document.getElementById("billingPostcode");
    var billingCountry = document.getElementById("billingCountry");

    function copyDeliveryToBilling() {
      if (billingLine1) billingLine1.value = deliveryLine1 ? deliveryLine1.value : "";
      if (billingLine2) billingLine2.value = deliveryLine2 ? deliveryLine2.value : "";
      if (billingCity) billingCity.value = deliveryCity ? deliveryCity.value : "";
      if (billingState) billingState.value = deliveryState ? deliveryState.value : "";
      if (billingPostcode) billingPostcode.value = deliveryPostcode ? deliveryPostcode.value : "";
      if (billingCountry) billingCountry.value = deliveryCountry ? deliveryCountry.value : "";
    }

    function toggleBilling() {
      var hide = sameAsDelivery && sameAsDelivery.checked;
      if (billingFields) billingFields.style.display = hide ? "none" : "block";
      if (hide) copyDeliveryToBilling();
    }

    if (sameAsDelivery) sameAsDelivery.addEventListener("change", toggleBilling);
    if (deliveryLine1) deliveryLine1.addEventListener("input", function () { if (sameAsDelivery && sameAsDelivery.checked) copyDeliveryToBilling(); });
    if (deliveryLine2) deliveryLine2.addEventListener("input", function () { if (sameAsDelivery && sameAsDelivery.checked) copyDeliveryToBilling(); });
    if (deliveryCity) deliveryCity.addEventListener("input", function () { if (sameAsDelivery && sameAsDelivery.checked) copyDeliveryToBilling(); });
    if (deliveryState) deliveryState.addEventListener("input", function () { if (sameAsDelivery && sameAsDelivery.checked) copyDeliveryToBilling(); });
    if (deliveryPostcode) deliveryPostcode.addEventListener("input", function () { if (sameAsDelivery && sameAsDelivery.checked) copyDeliveryToBilling(); });
    if (deliveryCountry) deliveryCountry.addEventListener("input", function () { if (sameAsDelivery && sameAsDelivery.checked) copyDeliveryToBilling(); });

    toggleBilling();

    var paySavedCard = document.getElementById("paySavedCard");
    var payNewCard = document.getElementById("payNewCard");
    var savedCardSelect = document.getElementById("savedCardSelect");
    var cardElementWrap = document.getElementById("cardElementWrap");
    var saveCardCheckbox = document.getElementById("saveCardCheckbox");
    var saveCardHidden = document.getElementById("saveCardHidden");
    var saveCardRow = document.querySelector(".saveCardRow");
    var userLoggedIn = form.getAttribute("data-user-logged-in") === "1";
    var attendeesPayloadInput = document.getElementById("attendeesPayload");

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

    if (stripePublishableKey && typeof Stripe !== "undefined") {
      var stripe = Stripe(stripePublishableKey);
      var elements = stripe.elements();
      var cardErrors = document.getElementById("cardErrors");
      var placeOrderBtn = document.getElementById("placeOrderBtn");
      var cardElement = null;
      var cardElementContainer = document.getElementById("card-element");

      if (cardElementContainer) {
        var elementStyle = { base: { fontSize: "16px", color: "#32325d" } };
        cardElement = elements.create("card", { style: elementStyle, hidePostalCode: true, disableLink: true });
        cardElement.mount("#card-element");
        cardElement.on("change", function (e) {
          if (cardErrors) cardErrors.textContent = e.error ? e.error.message : "";
        });
      }

      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (sameAsDelivery && sameAsDelivery.checked) copyDeliveryToBilling();

        function collectAttendeesPayload() {
          var groups = form.querySelectorAll("[data-attendee-group='1']");
          var payload = [];
          for (var g = 0; g < groups.length; g++) {
            var group = groups[g];
            var productVariantId = (group.getAttribute("data-product-variant-id") || "").trim();
            if (!productVariantId) continue;
            var rows = group.querySelectorAll("[data-attendee-row='1']");
            var attendees = [];
            for (var r = 0; r < rows.length; r++) {
              var row = rows[r];
              var emailEl = row.querySelector("[data-attendee-email='1']");
              var forenameEl = row.querySelector("[data-attendee-forename='1']");
              var surnameEl = row.querySelector("[data-attendee-surname='1']");
              var email = emailEl && emailEl.value ? String(emailEl.value).trim().toLowerCase() : "";
              var forename = forenameEl && forenameEl.value ? String(forenameEl.value).trim() : "";
              var surname = surnameEl && surnameEl.value ? String(surnameEl.value).trim() : "";
              if (!email) {
                return { error: "Each event attendee must have an email address." };
              }
              attendees.push({ email: email, forename: forename, surname: surname });
            }
            payload.push({ productVariantId: productVariantId, attendees: attendees });
          }
          return { value: payload };
        }

        var useSavedCard = paySavedCard && paySavedCard.checked;
        var savedPaymentMethodSelect = document.getElementById("savedPaymentMethod");
        var selectedPmId = savedPaymentMethodSelect && savedPaymentMethodSelect.value ? String(savedPaymentMethodSelect.value).trim() : "";

        if (useSavedCard && selectedPmId && !cardElement) {
          if (cardErrors) cardErrors.textContent = "Please select a saved card or use a new card.";
          return;
        }
        if (!useSavedCard && !cardElement && cardErrors) {
          cardErrors.textContent = "Please enter your card details.";
          if (placeOrderBtn) { placeOrderBtn.disabled = false; placeOrderBtn.textContent = "Place order"; }
          return;
        }

        if (placeOrderBtn) {
          placeOrderBtn.disabled = true;
          placeOrderBtn.textContent = "Processing…";
        }
        if (cardErrors) cardErrors.textContent = "";

        var attendeesResult = collectAttendeesPayload();
        if (attendeesResult.error) {
          if (cardErrors) cardErrors.textContent = attendeesResult.error;
          if (placeOrderBtn) {
            placeOrderBtn.disabled = false;
            placeOrderBtn.textContent = "Place order";
          }
          return;
        }
        if (attendeesPayloadInput) {
          attendeesPayloadInput.value = JSON.stringify(attendeesResult.value || []);
        }

        function buildFormBody() {
          var bodyParams = new URLSearchParams();
          var fields = ["forename","surname","email","mobile","deliveryLine1","deliveryLine2","deliveryCity","deliveryState","deliveryPostcode","deliveryCountry","billingLine1","billingLine2","billingCity","billingState","billingPostcode","billingCountry","sameAsDelivery","saveCard","paymentMethodId","attendees"];
          for (var i = 0; i < fields.length; i++) {
            var el = form.querySelector('[name="' + fields[i] + '"]');
            if (el && el.name && (el.value !== undefined)) bodyParams.append(el.name, el.value || "");
          }
          if (useSavedCard && selectedPmId) bodyParams.set("paymentMethodId", selectedPmId);
          return bodyParams.toString();
        }

        fetch("/checkout/place-order", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: buildFormBody(),
          credentials: "same-origin",
        })
          .then(function (res) {
            if (res.status === 429) { window.location.reload(); return Promise.reject(new Error("Rate limited")); }
            if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || res.statusText); });
            return res.json();
          })
          .then(function (data) {
            var clientSecret = data.clientSecret;
            var orderId = data.orderId;
            if (data.free && data.orderId) {
              if (placeOrderBtn) placeOrderBtn.textContent = "Confirmed!";
              window.location.href = "/orders/" + data.orderId;
              return new Promise(function () {});
            }
            if (!clientSecret) throw new Error("Invalid response from server.");
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
              var bodyParams = new URLSearchParams();
              var fields = ["forename","surname","email","mobile","deliveryLine1","deliveryLine2","deliveryCity","deliveryState","deliveryPostcode","deliveryCountry","billingLine1","billingLine2","billingCity","billingState","billingPostcode","billingCountry","sameAsDelivery","saveCard"];
              for (var i = 0; i < fields.length; i++) {
                var el = form.querySelector('[name="' + fields[i] + '"]');
                if (el && el.name && (el.value !== undefined)) bodyParams.append(el.name, el.value || "");
              }
              bodyParams.append("paymentIntentId", paymentIntentId);
              bodyParams.append("orderId", orderId);
              bodyParams.set("saveCard", wantToSaveCard ? "1" : "0");
              if (validPmId) bodyParams.append("paymentMethodId", paymentMethodIdFromIntent);
              return fetch("/checkout/confirm-order", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: bodyParams.toString(),
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
            if (placeOrderBtn) placeOrderBtn.textContent = "Success!";
            if (cardErrors) cardErrors.textContent = "";
            window.location.href = "/orders/" + orderId;
          })
          .catch(function (err) {
            if (cardErrors) cardErrors.textContent = err.message || "Payment failed. Please try again.";
            if (placeOrderBtn) {
              placeOrderBtn.disabled = false;
              placeOrderBtn.textContent = "Place order";
            }
          });
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
