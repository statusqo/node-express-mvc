(function () {
  "use strict";

  function initDeleteFlow() {
    document.querySelectorAll(".da-delete-trigger").forEach(function (trigger) {
      trigger.addEventListener("click", function () {
        var row = trigger.closest("tr.da-row");
        if (!row) return;
        row.classList.add("da-row--confirming");
        trigger.setAttribute("aria-expanded", "true");
        var cancel = row.querySelector(".da-delete-cancel");
        if (cancel) setTimeout(function () { cancel.focus(); }, 200);
      });
    });

    document.querySelectorAll(".da-delete-cancel").forEach(function (cancel) {
      cancel.addEventListener("click", function () {
        var row = cancel.closest("tr.da-row");
        if (!row) return;
        row.classList.remove("da-row--confirming");
        var trigger = row.querySelector(".da-delete-trigger");
        if (trigger) {
          trigger.setAttribute("aria-expanded", "false");
          setTimeout(function () { trigger.focus(); }, 200);
        }
      });
    });

    document.querySelectorAll(".da-delete-form").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var row = form.closest("tr");
        if (!row) { form.submit(); return; }
        row.classList.add("da-row--removing");
        setTimeout(function () { form.submit(); }, 340);
      });
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    document.querySelectorAll("tr.da-row--confirming").forEach(function (row) {
      row.classList.remove("da-row--confirming");
      var trigger = row.querySelector(".da-delete-trigger");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDeleteFlow);
  } else {
    initDeleteFlow();
  }
})();
