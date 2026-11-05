(() => {
  "use strict";

  const PUBLIC_TABS = new Set(["login", "about", "services"]);
  const DASHBOARD_VIEWS = new Set([
    "home",
    "users",
    "access",
    "members",
    "sdep",
    "sacc",
    "lreq",
    "lapp",
    "lsec",
    "ledger",
    "liquidity",
    "reports",
    "regrep",
    "audit"
  ]);

  let app = null;
  let initialized = false;

  function selectPublicTab(tabId, { focus = false } = {}) {
    if (!PUBLIC_TABS.has(tabId)) return false;

    const tab = document.querySelector(`[data-tab="${tabId}"]`);
    const panel = document.getElementById(tabId);
    if (!tab || !panel) return false;

    document.querySelectorAll("[data-tab]").forEach((item) => {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
    });

    document.querySelectorAll("main section").forEach((section) => {
      section.hidden = section.id !== tabId;
    });

    if (focus) tab.focus();
    return true;
  }

  function navigateDashboard(viewId) {
    if (!DASHBOARD_VIEWS.has(viewId)) return false;

    if (app && typeof app.navigate === "function") {
      app.navigate(viewId);
      return true;
    }

    document.dispatchEvent(
      new CustomEvent("sacco:navigate", { detail: { view: viewId } })
    );
    return true;
  }

  function onClick(event) {
    const tab = event.target.closest("[data-tab]");
    if (tab) {
      event.preventDefault();
      selectPublicTab(tab.dataset.tab);
      return;
    }

    const viewButton = event.target.closest("#side [data-v]");
    if (viewButton) {
      event.preventDefault();
      navigateDashboard(viewButton.dataset.v);
    }
  }

  function onKeydown(event) {
    const currentTab = event.target.closest('[role="tab"][data-tab]');
    if (!currentTab) return;

    const tabs = [...document.querySelectorAll('[role="tab"][data-tab]')];
    const currentIndex = tabs.indexOf(currentTab);
    if (currentIndex < 0) return;

    let nextIndex;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    selectPublicTab(tabs[nextIndex].dataset.tab, { focus: true });
  }

  function init(application) {
    if (application) app = application;
    if (initialized) return;

    initialized = true;
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeydown);

    const initiallySelected = document.querySelector(
      '[role="tab"][data-tab][aria-selected="true"]'
    );

    if (initiallySelected) {
      selectPublicTab(initiallySelected.dataset.tab);
    }
  }

  window.Router = {
    init,
    selectPublicTab,
    navigateDashboard
  };
})();
