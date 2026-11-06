(function (root, factory) {
  'use strict';

  const RegistrationPage = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = RegistrationPage;
  }

  if (root) {
    root.RegistrationPage = RegistrationPage;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function init(options) {
    options = options || {};

    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) {
      throw new Error('RegistrationPage.init requires a browser document.');
    }

    const dialog = options.dialog || doc.querySelector('#regmodal');
    const openButton = options.openButton || doc.querySelector('#openReg');
    const closeButton = options.closeButton || doc.querySelector('#closeReg');
    const form = options.form || doc.querySelector('#regform');
    const message = options.message || doc.querySelector('#pwmsg');

    if (!dialog || !openButton || !closeButton || !form || !message) {
      throw new Error('RegistrationPage.init could not find all registration dialog elements.');
    }

    const notify = typeof options.notify === 'function'
      ? options.notify
      : function (text) {
          if (typeof alert === 'function') alert(text);
        };

    const onRegistered = typeof options.onRegistered === 'function'
      ? options.onRegistered
      : null;

    function clearMessage() {
      message.textContent = '';
    }

    function openDialog(event) {
      if (event) event.preventDefault();
      if (!dialog.open) dialog.showModal();
      clearMessage();
    }

    function closeDialog() {
      if (dialog.open) dialog.close();
    }

    function handleBackdropClick(event) {
      if (event.target === dialog) closeDialog();
    }

    function handleSubmit(event) {
      event.preventDefault();
      clearMessage();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const password = form.querySelector('#pw1');
      const confirmation = form.querySelector('#pw2');

      if (!password || !confirmation) {
        message.textContent = 'Password fields could not be found.';
        return;
      }

      if (password.value !== confirmation.value) {
        message.textContent = 'Passwords do not match.';
        confirmation.focus();
        return;
      }

      if (onRegistered) {
        onRegistered(new FormData(form));
      } else {
        notify('Account details captured. Connect this form to your backend to complete registration.');
      }

      closeDialog();
    }

    openButton.addEventListener('click', openDialog);
    closeButton.addEventListener('click', closeDialog);
    dialog.addEventListener('click', handleBackdropClick);
    form.addEventListener('submit', handleSubmit);

    return {
      open: openDialog,
      close: closeDialog,
      destroy() {
        openButton.removeEventListener('click', openDialog);
        closeButton.removeEventListener('click', closeDialog);
        dialog.removeEventListener('click', handleBackdropClick);
        form.removeEventListener('submit', handleSubmit);
      }
    };
  }

  return { init };
});
