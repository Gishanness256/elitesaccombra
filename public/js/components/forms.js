(() => {
  "use strict";

  function serialize(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function showError(element, message) {
    if (!element) return;
    element.textContent = message;
  }

  function clearError(element) {
    showError(element, "");
  }

  function validate(form, options = {}) {
    const {
      errorSelector = "#pwmsg",
      passwordSelector = '[name="password"], #pw1',
      confirmPasswordSelector = '[name="confirm_password"], #pw2'
    } = options;

    const errorElement = form.querySelector(errorSelector);
    clearError(errorElement);

    if (!form.checkValidity()) {
      form.reportValidity();
      return false;
    }

    const password = form.querySelector(passwordSelector);
    const confirmation = form.querySelector(confirmPasswordSelector);

    if (password && confirmation && password.value !== confirmation.value) {
      showError(errorElement, "Passwords do not match.");
      confirmation.focus();
      return false;
    }

    return true;
  }

  function init(formOrSelector = "#regform", options = {}) {
    const form = typeof formOrSelector === "string"
      ? document.querySelector(formOrSelector)
      : formOrSelector;

    if (!(form instanceof HTMLFormElement)) {
      throw new Error("Forms.init requires a form element or a valid form selector.");
    }

    if (form.dataset.formsInitialized === "true") return form;

    const { onSubmit } = options;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!validate(form, options)) return;

      if (typeof onSubmit === "function") {
        try {
          await onSubmit(serialize(form), form);
        } catch (error) {
          const errorElement = form.querySelector(options.errorSelector || "#pwmsg");
          showError(errorElement, error.message || "Unable to submit the form.");
        }
      }
    });

    form.dataset.formsInitialized = "true";
    return form;
  }

  window.Forms = {
    init,
    validate,
    serialize
  };

  function initRegistrationForm() {
    const form = document.querySelector("#regform");
    if (form) init(form);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRegistrationForm, { once: true });
  } else {
    initRegistrationForm();
  }
})();
