(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var flash = document.querySelector('.flash');
    if (!flash) return;

    var AUTO_DISMISS_MS = 6000;
    var dismissed = false;
    var timer;

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(timer);
      flash.classList.add('flash-dismissing');
      flash.addEventListener('animationend', function () {
        flash.remove();
      }, { once: true });
    }

    timer = setTimeout(dismiss, AUTO_DISMISS_MS);

    var closeBtn = flash.querySelector('.flash-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', dismiss);
    }
  });
}());
