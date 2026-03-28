(function () {
  var tzInput = document.getElementById("timezone");
  if (tzInput && !tzInput.value && !tzInput.disabled) {
    try {
      tzInput.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch (e) {
      tzInput.value = "UTC";
    }
  }
})();
