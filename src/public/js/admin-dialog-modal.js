/**
 * Shared open/close for admin selection dialogs (media/meta pickers, etc.).
 * Uses the same --open / --closing animation pattern as confirm-modal.js.
 */
(function () {
  "use strict";

  function getBox(root) {
    return root.querySelector(".da-admin-dialog__box");
  }

  function focusBox(root) {
    var box = getBox(root);
    if (!box) return;
    if (!box.hasAttribute("tabindex")) box.setAttribute("tabindex", "-1");
    box.focus({ preventScroll: true });
  }

  function open(root) {
    if (!root) return;
    root.setAttribute("aria-hidden", "false");
    root.classList.add("da-admin-dialog--open");

    function onKey(e) {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onKey);
        close(root);
      }
    }
    root._adminDialogOnEscape = onKey;
    document.addEventListener("keydown", onKey);

    focusBox(root);
  }

  /**
   * @param {HTMLElement} root - .da-admin-dialog root
   * @param {function} [onClosed] - called after close animation finishes
   */
  function close(root, onClosed) {
    if (!root) return;
    if (root._adminDialogOnEscape) {
      document.removeEventListener("keydown", root._adminDialogOnEscape);
      root._adminDialogOnEscape = null;
    }

    if (!root.classList.contains("da-admin-dialog--open")) {
      root.setAttribute("aria-hidden", "true");
      if (onClosed) onClosed();
      return;
    }

    // Keep --open until exit animation finishes (same as confirm-modal.js). Removing --open
    // immediately would apply the base hidden state and skip the out animation.
    root.classList.add("da-admin-dialog--closing");

    var box = getBox(root);
    if (!box) {
      root.classList.remove("da-admin-dialog--open", "da-admin-dialog--closing");
      root.setAttribute("aria-hidden", "true");
      if (onClosed) onClosed();
      return;
    }

    function onEnd() {
      box.removeEventListener("animationend", onEnd);
      root.classList.remove("da-admin-dialog--open", "da-admin-dialog--closing");
      root.setAttribute("aria-hidden", "true");
      if (onClosed) onClosed();
    }
    box.addEventListener("animationend", onEnd);
  }

  window.AdminDialogModal = { open: open, close: close };
})();
