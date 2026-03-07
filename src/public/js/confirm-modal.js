(function () {
    'use strict';

    var modal     = document.getElementById('da-confirm-modal');
    if (!modal) return;

    var titleEl   = document.getElementById('da-confirm-modal-title');
    var msgEl     = document.getElementById('da-confirm-modal-msg');
    var bulletsEl = document.getElementById('da-confirm-modal-bullets');
    var okBtn     = document.getElementById('da-confirm-modal-ok');
    var cancelBtn = document.getElementById('da-confirm-modal-cancel');
    var backdrop  = modal.querySelector('.da-confirm-modal__backdrop');
    var pendingForm = null;

    function open(title, msg, bullets, form) {
        titleEl.textContent = title;

        msgEl.textContent = msg;
        msgEl.style.display = msg ? '' : 'none';

        // Render bullet list
        bulletsEl.innerHTML = '';
        if (bullets && bullets.length) {
            bullets.forEach(function (text) {
                var li = document.createElement('li');
                li.textContent = text;
                bulletsEl.appendChild(li);
            });
            bulletsEl.style.display = '';
        } else {
            bulletsEl.style.display = 'none';
        }

        pendingForm = form;
        modal.classList.add('da-confirm-modal--open');
        okBtn.focus();
    }

    function close() {
        pendingForm = null;
        modal.classList.add('da-confirm-modal--closing');
        var box = modal.querySelector('.da-confirm-modal__box');
        function onEnd() {
            box.removeEventListener('animationend', onEnd);
            modal.classList.remove('da-confirm-modal--open', 'da-confirm-modal--closing');
        }
        box.addEventListener('animationend', onEnd);
    }

    okBtn.addEventListener('click', function () {
        var form = pendingForm;
        close();
        if (form) form.submit();
    });

    cancelBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') close();
    });

    // Delegate: intercept any button with [data-confirm-modal]
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-confirm-modal]');
        if (!btn) return;
        e.preventDefault();

        var form = btn.closest('form');
        if (!form && btn.dataset.formId) {
            form = document.getElementById(btn.dataset.formId);
        }

        var title   = btn.dataset.confirmTitle   || 'Confirm';
        var msg     = btn.dataset.confirmMsg     || '';
        var bullets = [];
        try {
            var raw = btn.dataset.confirmBullets;
            if (raw) bullets = JSON.parse(raw);
        } catch (e) {}

        open(title, msg, bullets, form);
    });
})();
