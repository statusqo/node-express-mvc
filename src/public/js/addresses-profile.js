(function () {
  function init() {
    var addressView = document.getElementById("addressView");
    var addressFormWrap = document.getElementById("addressFormWrap");
    var editBtn = document.getElementById("editAddressBtn");
    if (editBtn && addressView && addressFormWrap) {
      editBtn.addEventListener("click", function () {
        addressView.style.display = "none";
        addressFormWrap.style.display = "block";
      });
    }

    var sameAsDelivery = document.getElementById("sameAsDelivery");
    var billingSection = document.getElementById("billingSection");
    var billingFields = document.getElementById("billingFields");
    if (sameAsDelivery && billingSection) {
      var billingInputs = billingFields ? billingFields.querySelectorAll("input") : [];
      function toggleBilling() {
        var hide = sameAsDelivery.checked;
        if (hide) {
          billingSection.classList.add("js-billing-hidden");
        } else {
          billingSection.classList.remove("js-billing-hidden");
        }
        for (var i = 0; i < billingInputs.length; i++) {
          var inp = billingInputs[i];
          inp.disabled = hide;
          if (hide) {
            inp.removeAttribute("required");
          } else if (
            inp.id === "billingLine1" ||
            inp.id === "billingCity" ||
            inp.id === "billingPostcode" ||
            inp.id === "billingCountry"
          ) {
            inp.setAttribute("required", "required");
          }
        }
      }
      sameAsDelivery.addEventListener("change", toggleBilling);
      toggleBilling();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
