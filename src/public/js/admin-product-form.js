(function () {
  "use strict";
  var isPhysical = document.getElementById("isPhysical");
  var physicalFields = document.getElementById("physicalProductFields");

  function togglePhysicalFields() {
    if (!physicalFields) return;
    physicalFields.style.display = isPhysical && isPhysical.checked ? "grid" : "none";
  }

  if (isPhysical) isPhysical.addEventListener("change", togglePhysicalFields);
  togglePhysicalFields();
})();
