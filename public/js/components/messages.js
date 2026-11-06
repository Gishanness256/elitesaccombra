(function (root, factory) {
  'use strict';

  const Messages = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = Messages;
  }

  if (root) {
    root.Messages = Messages;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Find a message element from a selector or an element reference.
   * Defaults to the dashboard's existing #msg element.
   */
  function resolveTarget(target) {
    if (typeof document === 'undefined') return null;
    if (!target) return document.querySelector('#msg');

    if (typeof target === 'string') {
      return document.querySelector(target);
    }

    return target instanceof Element ? target : null;
  }

  /**
   * Display a message in an existing message element.
   *
   * @param {string} text Message text.
   * @param {Object} options Options: target, error, role.
   * @returns {Element|null} The updated element, if found.
   */
  function show(text, options) {
    options = options || {};

    const element = resolveTarget(options.target);
    if (!element) return null;

    const isError = Boolean(options.error);
    element.classList.add('msg');
    element.classList.toggle('err', isError);
    element.textContent = text == null ? '' : String(text);

    if (options.role) {
      element.setAttribute('role', options.role);
    } else if (!element.hasAttribute('role')) {
      element.setAttribute('role', isError ? 'alert' : 'status');
    }

    element.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    return element;
  }

  /**
   * Compatibility helper for the say(text, err) function in index.html.
   */
  function say(text, err) {
    return show(text, { error: err });
  }

  /**
   * Clear a message element and remove its error styling.
   *
   * @param {string|Element} target Selector or element; defaults to #msg.
   * @returns {Element|null} The cleared element, if found.
   */
  function clear(target) {
    const element = resolveTarget(target);
    if (!element) return null;

    element.textContent = '';
    element.classList.remove('err');
    return element;
  }

  return {
    show,
    say,
    clear
  };
});
