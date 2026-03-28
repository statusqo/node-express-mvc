(function () {
  "use strict";
  var sel = document.getElementById("upload-selected");
  var inp = document.getElementById("media-file");
  if (inp && sel) {
    inp.addEventListener("change", function () {
      sel.textContent = this.files[0] ? this.files[0].name : "";
    });
  }
})();
