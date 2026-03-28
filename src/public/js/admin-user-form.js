(function () {
  "use strict";

  /* ── Person type field toggle ─────────────────────────── */
  var personTypeSelect = document.getElementById("personType");
  var privateFields    = document.getElementById("privateFields");
  var legalFields      = document.getElementById("legalFields");

  function togglePersonTypeFields() {
    if (!privateFields || !legalFields) return;
    var isLegal = personTypeSelect && personTypeSelect.value === "legal";
    privateFields.style.display = isLegal ? "none" : "";
    legalFields.style.display   = isLegal ? ""     : "none";
  }

  if (personTypeSelect) personTypeSelect.addEventListener("change", togglePersonTypeFields);
  togglePersonTypeFields();

  /* ── Password reset panel ─────────────────────────────── */
  var showResetBtn    = document.getElementById("showResetBtn");
  var resetFields     = document.getElementById("resetFields");
  var cancelResetBtn  = document.getElementById("cancelResetBtn");
  var setPasswordBtn  = document.getElementById("setPasswordBtn");
  var newPassword     = document.getElementById("newPassword");
  var confirmPassword = document.getElementById("confirmPassword");
  var resetError      = document.getElementById("resetError");
  var hiddenPassword  = document.getElementById("hiddenPassword");
  var userEditForm    = document.getElementById("userEditForm");

  if (showResetBtn && resetFields) {
    showResetBtn.addEventListener("click", function () {
      resetFields.classList.add("da-reset-fields--open");
      showResetBtn.disabled = true;
      showResetBtn.style.opacity = "0.38";
      showResetBtn.style.pointerEvents = "none";
      setTimeout(function () {
        if (newPassword) newPassword.focus();
      }, 320);
    });
  }

  if (cancelResetBtn) {
    cancelResetBtn.addEventListener("click", function () {
      collapseReset();
    });
  }

  function collapseReset() {
    if (!resetFields) return;
    resetFields.classList.remove("da-reset-fields--open");
    hideError();
    setTimeout(function () {
      if (newPassword)     newPassword.value = "";
      if (confirmPassword) confirmPassword.value = "";
      if (showResetBtn) {
        showResetBtn.disabled = false;
        showResetBtn.style.opacity = "";
        showResetBtn.style.pointerEvents = "";
        showResetBtn.focus();
      }
    }, 320);
  }

  if (setPasswordBtn) {
    setPasswordBtn.addEventListener("click", function () {
      hideError();
      var pw  = newPassword     ? newPassword.value     : "";
      var cpw = confirmPassword ? confirmPassword.value : "";

      if (!pw) {
        showError("Please enter a new password.");
        if (newPassword) newPassword.focus();
        return;
      }
      if (pw.length < 4) {
        showError("Password must be at least 4 characters.");
        if (newPassword) newPassword.focus();
        return;
      }
      if (pw !== cpw) {
        showError("Passwords do not match.");
        if (confirmPassword) confirmPassword.focus();
        return;
      }

      if (hiddenPassword) hiddenPassword.value = pw;
      if (userEditForm)   userEditForm.submit();
    });
  }

  function showError(msg) {
    if (!resetError) return;
    resetError.textContent = msg;
    resetError.style.display = "block";
  }

  function hideError() {
    if (resetError) resetError.style.display = "none";
  }

  /* ── Escape: collapse reset panel ─────────────────────── */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (resetFields && resetFields.classList.contains("da-reset-fields--open")) {
      collapseReset();
    }
  });
})();
