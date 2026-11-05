(() => {
  "use strict";

  function getDialog(dialogOrId) {
    if (dialogOrId instanceof HTMLDialogElement) return dialogOrId;

    const id = String(dialogOrId || "regmodal").replace(/^#/, "");
    const dialog = document.getElementById(id);

    if (!(dialog instanceof HTMLDialogElement)) {
      throw new Error(`Dialog "${id}" was not found or is not a <dialog>.`);
    }

    return dialog;
  }

  function open(dialogOrId = "regmodal") {
    const dialog = getDialog(dialogOrId);
    if (!dialog.open) dialog.showModal();
    return dialog;
  }

  function close(dialogOrId = "regmodal", returnValue = "") {
    const dialog = getDialog(dialogOrId);
    if (dialog.open) dialog.close(returnValue);
    return dialog;
  }

  function init(dialogOrId = "regmodal", options = {}) {
    const dialog = getDialog(dialogOrId);
    if (dialog.dataset.dialogInitialized === "true") return dialog;

    const {
      openSelector = "#openReg",
      closeSelector = "#closeReg",
      closeOnBackdrop = true
    } = options;

    document.querySelectorAll(openSelector).forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        open(dialog);
      });
    });

    document.querySelectorAll(closeSelector).forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        close(dialog);
      });
    });

    if (closeOnBackdrop) {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) close(dialog);
      });
    }

    dialog.dataset.dialogInitialized = "true";
    return dialog;
  }

  window.Dialog = {
    open,
    close,
    init
  };

  function initializeRegistrationDialog() {
    const dialog = document.getElementById("regmodal");
    if (dialog) init(dialog);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeRegistrationDialog, {
      once: true
    });
  } else {
    initializeRegistrationDialog();
  }
})();
