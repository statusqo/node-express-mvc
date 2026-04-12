(function () {
  "use strict";

  /* ── Upload zone preview ─────────────────────────────────────────── */
  var zone      = document.querySelector(".admin-upload-zone");
  var inp       = document.getElementById("media-file");
  var clearBtn  = document.querySelector(".admin-upload-zone-clear");
  var prevImg   = document.querySelector(".admin-upload-zone-preview-img");
  var prevPh    = document.querySelector(".admin-upload-zone-preview-placeholder");
  var prevName  = document.querySelector(".admin-upload-zone-preview-name");

  function setFile(file) {
    prevName.textContent = file.name;

    if (file.type.startsWith("image/")) {
      var url = URL.createObjectURL(file);
      prevImg.src = url;
      prevImg.style.display = "block";
      prevPh.style.display  = "none";
    } else {
      prevImg.style.display = "none";
      prevImg.src = "";
      var ext = file.name.split(".").pop().toUpperCase() || "FILE";
      prevPh.textContent   = ext;
      prevPh.style.display = "flex";
    }

    zone.classList.add("admin-upload-zone--has-file");
    clearBtn.style.display = "inline-flex";
  }

  function clearFile() {
    inp.value = "";
    if (prevImg.src) URL.revokeObjectURL(prevImg.src);
    prevImg.src           = "";
    prevImg.style.display = "none";
    prevPh.style.display  = "none";
    prevName.textContent  = "";
    zone.classList.remove("admin-upload-zone--has-file");
    clearBtn.style.display = "none";
  }

  if (inp && zone) {
    inp.addEventListener("change", function () {
      if (this.files && this.files[0]) {
        setFile(this.files[0]);
      } else {
        clearFile();
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      clearFile();
    });
  }

  /* ── Copy path buttons ───────────────────────────────────────────── */
  document.querySelectorAll(".da-copy-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.dataset.copy;
      if (!text) return;
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = "Copied!";
        btn.classList.add("da-copy-btn--copied");
        setTimeout(function () {
          btn.textContent = "Copy";
          btn.classList.remove("da-copy-btn--copied");
        }, 1800);
      }).catch(function () {
        btn.textContent = "Error";
        setTimeout(function () { btn.textContent = "Copy"; }, 1800);
      });
    });
  });
})();
