(() => {
  "use strict";

  const STORAGE_KEY = "esacco";
  const API_BASE_URL = "/api/v1";

  const PERMISSIONS = [
    "Approve loans",
    "Acknowledge savings/deposits",
    "Acknowledge loan repayments",
    "Set interest rates",
    "Create/remove system users",
    "Create/remove member accounts",
    "Weekly reports",
    "Monthly reports",
    "Annual reports"
  ];

  const ROLES = ["Admin", "Treasurer", "Credit Supervisor", "Credit Officer"];

  const defaultRoles = () => {
    const roles = {};
    ROLES.forEach((role) => {
      roles[role] = PERMISSIONS.map((_, index) =>
        role === "Admin" ||
        (role === "Treasurer" && [1, 2, 6, 7, 8].includes(index)) ||
        (role === "Credit Supervisor" && [0, 2, 3, 6, 7].includes(index)) ||
        (role === "Credit Officer" && [0, 2].includes(index))
      );
    });
    return roles;
  };

  const defaultState = () => ({
    users: [
      {
        name: "System Admin",
        email: "admin@elitesacco.co.ug",
        role: "Admin"
      }
    ],
    members: [],
    savings: [],
    loans: [],
    roles: defaultRoles(),
    seq: 0,
    non: [],
    reqs: [],
    lseq: 0,
    audit: [],
    sseq: 0,
    regin: {},
    rcfg: {
      reg: "Uganda Microfinance Regulatory Authority (UMRA)",
      lic: "",
      minLiq: 15,
      minCore: 10,
      minInst: 8,
      maxP30: 5,
      maxP90: 2,
      pr: [1, 5, 25, 50, 100]
    }
  });

  function loadState() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return defaultState();

      const state = { ...defaultState(), ...JSON.parse(stored) };
      state.users ||= [];
      state.members ||= [];
      state.savings ||= [];
      state.loans ||= [];
      state.roles ||= defaultRoles();
      state.non ||= [];
      state.reqs ||= [];
      state.audit ||= [];
      state.regin ||= {};
      state.rcfg = { ...defaultState().rcfg, ...(state.rcfg || {}) };
      return state;
    } catch (error) {
      console.warn("Could not load saved SACCO data; using a fresh state.", error);
      return defaultState();
    }
  }

  const state = loadState();
  const views = new Map();
  let currentUser = state.users[0] || null;

  const VIEW_TITLES = {
    home: "Dashboard",
    users: "Users",
    access: "Access Levels",
    members: "Members",
    sdep: "Deposits / Withdrawals",
    sacc: "Member Accounts",
    lreq: "Loan Requests",
    lapp: "Loan Approval",
    lsec: "Loans Section",
    ledger: "Ledger",
    liquidity: "Liquidity",
    reports: "Statements",
    regrep: "Auditing — Regulatory Returns",
    audit: "System Auditor"
  };

  const ROLE_VIEW_ACCESS = {
    lreq: ["Admin", "Credit Officer", "Credit Supervisor"],
    lapp: ["Admin"],
    lsec: ["Admin", "Credit Officer", "Credit Supervisor"],
    audit: ["Admin", "Treasurer"],
    regrep: ["Admin", "Treasurer", "Credit Supervisor"]
  };

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Could not save SACCO data.", error);
    }
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    })[character]);
  }

  function initials(user = currentUser) {
    if (!user) return "";
    if (user.ini) return user.ini;

    return String(user.name || "")
      .split(/\s+/)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase()
      .slice(0, 3);
  }

  function audit(activity, particulars = "", user = currentUser) {
    if (!user) return;

    state.audit.push({
      t: new Date().toISOString(),
      ini: initials(user),
      user: user.name,
      role: user.role,
      act: activity,
      part: particulars
    });

    if (state.audit.length > 5000) {
      state.audit.splice(0, state.audit.length - 5000);
    }

    save();
  }

  function canOpenView(view) {
    const allowedRoles = ROLE_VIEW_ACCESS[view];
    return !allowedRoles || allowedRoles.includes(currentUser?.role);
  }

  function showMessage(message, isError = false) {
    const element = document.querySelector("#msg");
    if (!element) return;

    element.className = `msg${isError ? " err" : ""}`;
    element.textContent = message;
  }

  function renderView(view) {
    const mount = document.querySelector("#view");
    if (!mount) return;

    if (!canOpenView(view)) {
      view = "home";
    }

    const render = views.get(view);
    if (!render) {
      mount.innerHTML = `
        <div class="card">
          <h3>${escapeHTML(VIEW_TITLES[view] || "Dashboard")}</h3>
          <p class="note">This page has not been registered yet.</p>
        </div>
      `;
      return;
    }

    render({ state, currentUser, save, audit, showMessage, escapeHTML });
  }

  function navigate(view) {
    if (!VIEW_TITLES[view]) return;

    if (!canOpenView(view)) {
      view = "home";
    }

    const title = document.querySelector("#vt");
    if (title) title.textContent = VIEW_TITLES[view];

    document.querySelectorAll("#side [data-v]").forEach((button) => {
      button.classList.toggle("on", button.dataset.v === view);
    });

    document.body.classList.remove("blank");

    const submenu = {
      home: "cfg",
      sdep: "svm",
      sacc: "svm",
      reports: "rpm",
      regrep: "rpm",
      ledger: "pfm",
      liquidity: "pfm",
      lreq: "lnm",
      lapp: "lnm",
      lsec: "lnm"
    }[view];

    if (submenu) {
      document.querySelectorAll("#side .sub").forEach((item) => {
        if (item.id === submenu) item.classList.add("show");
      });
    }

    renderView(view);
  }

  function setupPublicTabs() {
    const tabs = document.querySelectorAll("[data-tab]");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((item) => {
          item.setAttribute("aria-selected", String(item === tab));
        });

        document.querySelectorAll("main section").forEach((section) => {
          section.hidden = section.id !== tab.dataset.tab;
        });
      });
    });
  }

  function setupSidebar() {
    const side = document.querySelector("#side");
    if (!side) return;

    side.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;

      if (button.dataset.sub) {
        const submenu = document.getElementById(button.dataset.sub);
        submenu?.classList.toggle("show");
        return;
      }

      if (button.dataset.v) {
        navigate(button.dataset.v);
        if (window.matchMedia("(hover: none)").matches) {
          side.classList.remove("open");
        }
      }
    });

    const pinButton = document.querySelector("#pinBtn");
    pinButton?.addEventListener("click", () => {
      const isPinned = side.classList.toggle("pin");
      side.classList.add("manual");
      document.body.classList.toggle("pinned", isPinned);
      pinButton.setAttribute("aria-expanded", String(isPinned));

      const label = document.querySelector("#pinTx");
      if (label) label.textContent = isPinned ? "Hide dashboard" : "Show dashboard";
      pinButton.title = isPinned ? "Hide the dashboard" : "Show the dashboard";
    });

    const toggleBlankMode = () => {
      document.body.classList.toggle("blank");
      side.classList.remove("open");
    };

    const brand = side.querySelector(".top");
    brand?.addEventListener("click", toggleBlankMode);
    brand?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleBlankMode();
      }
    });
  }

  function setupLogout() {
    document.querySelector("#logout")?.addEventListener("click", () => {
      audit("Logout", "Signed out");
      currentUser = null;
      document.body.classList.remove("in", "blank", "pinned");
      document.querySelector("#side")?.classList.remove("manual", "pin", "open");

      const loginForm = document.querySelector("#login form");
      loginForm?.reset();

      const loginTab = document.querySelector('[data-tab="login"]');
      loginTab?.click();
    });
  }

  function configureAPI() {
    if (window.API?.configure) {
      window.API.configure({
        baseUrl: API_BASE_URL,
        storage: "session"
      });
    }
  }

  function init() {
    configureAPI();
    setupPublicTabs();
    setupSidebar();
    setupLogout();

    // Let router.js initialize if it is loaded; otherwise use this module's
    // basic dashboard navigation.
    if (window.Router?.init) {
      window.Router.init(App);
    }

    window.addEventListener("sacco:navigate", (event) => {
      if (event.detail?.view) navigate(event.detail.view);
    });
  }

  const App = {
    PERMISSIONS,
    ROLES,
    state,
    save,
    audit,
    initials,
    escapeHTML,
    get currentUser() {
      return currentUser;
    },
    setCurrentUser(user) {
      currentUser = user || null;
    },
    registerView(name, render) {
      if (typeof render !== "function") {
        throw new TypeError(`Renderer for "${name}" must be a function.`);
      }
      views.set(name, render);
    },
    navigate,
    init
  };

  window.App = App;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
