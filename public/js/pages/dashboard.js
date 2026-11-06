(function (root, factory) {
  'use strict';

  const DashboardPage = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = DashboardPage;
  }

  if (root) {
    root.DashboardPage = DashboardPage;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TITLES = {
    home: 'Dashboard',
    users: 'Users',
    access: 'Access Levels',
    members: 'Members',
    sdep: 'Deposits / Withdrawals',
    sacc: 'Member Accounts',
    audit: 'System Auditor',
    ledger: 'Ledger',
    liquidity: 'Liquidity',
    lreq: 'Loan Requests',
    lapp: 'Loan Approval',
    lsec: 'Loans Section',
    reports: 'Statements',
    regrep: 'Auditing — Regulatory Returns'
  };

  const SUBMENUS = {
    home: 'cfg',
    users: 'cfg',
    access: 'cfg',
    sdep: 'svm',
    sacc: 'svm',
    lreq: 'lnm',
    lapp: 'lnm',
    lsec: 'lnm',
    ledger: 'pfm',
    liquidity: 'pfm',
    reports: 'rpm',
    regrep: 'rpm'
  };

  function init(options) {
    options = options || {};

    const doc = options.document || (typeof document !== 'undefined' ? document : null);
    if (!doc) {
      throw new Error('DashboardPage.init requires a browser document.');
    }

    const side = options.sidebar || doc.querySelector('#side');
    const view = options.view || doc.querySelector('#view');
    const title = options.title || doc.querySelector('#vt');
    const who = options.who || doc.querySelector('#who');
    const pinButton = options.pinButton || doc.querySelector('#pinBtn');
    const pinText = options.pinText || doc.querySelector('#pinTx');
    const logoutButton = options.logoutButton || doc.querySelector('#logout');

    if (!side || !view || !title) {
      throw new Error('DashboardPage.init could not find the dashboard sidebar, view, or title.');
    }

    const renderers = options.renderers || {};
    const canView = typeof options.canView === 'function'
      ? options.canView
      : function () { return true; };
    const onNavigate = typeof options.onNavigate === 'function'
      ? options.onNavigate
      : function () {};
    const onLogout = typeof options.onLogout === 'function'
      ? options.onLogout
      : function () {};
    const onBlankToggle = typeof options.onBlankToggle === 'function'
      ? options.onBlankToggle
      : function () {};

    function resetSidebar() {
      side.classList.remove('manual', 'pin', 'open');
      doc.body.classList.remove('pinned');

      if (pinButton) {
        pinButton.setAttribute('aria-expanded', 'false');
        pinButton.title = 'Hide the dashboard';
      }
      if (pinText) pinText.textContent = 'Hide dashboard';
    }

    function togglePinned() {
      if (!pinButton) return;

      const isPinned = side.classList.contains('pin');
      const shouldPin = !isPinned;

      side.classList.add('manual');
      side.classList.remove('open');
      side.classList.toggle('pin', shouldPin);
      doc.body.classList.toggle('pinned', shouldPin);

      pinButton.setAttribute('aria-expanded', String(shouldPin));
      pinButton.title = shouldPin ? 'Hide the dashboard' : 'Show the dashboard';
      if (pinText) pinText.textContent = shouldPin ? 'Hide dashboard' : 'Show dashboard';
    }

    function toggleBlank() {
      const blank = doc.body.classList.toggle('blank');
      side.classList.remove('open');

      side.querySelectorAll('.sub.show').forEach((submenu) => {
        submenu.classList.remove('show');
      });

      onBlankToggle(blank);
    }

    function selectView(name) {
      const requested = name || 'home';
      const route = canView(requested) ? requested : 'home';
      const render = renderers[route];

      doc.body.classList.remove('blank');
      title.textContent = TITLES[route] || route;

      side.querySelectorAll('[data-v]').forEach((button) => {
        button.classList.toggle('on', button.dataset.v === route);
      });

      side.querySelectorAll('.sub').forEach((submenu) => {
        submenu.classList.remove('show');
      });

      const submenuId = SUBMENUS[route];
      if (submenuId) {
        const submenu = doc.getElementById(submenuId);
        if (submenu) submenu.classList.add('show');
      }

      if (typeof render === 'function') {
        render(view);
      }

      onNavigate(route, view);
      if (typeof render !== 'function') {
        view.replaceChildren();
      }

      if (window.matchMedia && window.matchMedia('(hover: none)').matches) {
        side.classList.remove('open');
      }

      return route;
    }

    function handleSidebarClick(event) {
      const button = event.target.closest('button');
      if (!button || !side.contains(button)) return;

      if (button === pinButton) {
        togglePinned();
        return;
      }

      if (button.dataset.sub) {
        const submenu = doc.getElementById(button.dataset.sub);
        if (submenu) submenu.classList.toggle('show');

        if (side.classList.contains('manual') && !side.classList.contains('pin')) {
          side.classList.add('pin');
          doc.body.classList.add('pinned');
          if (pinButton) pinButton.setAttribute('aria-expanded', 'true');
          if (pinText) pinText.textContent = 'Hide dashboard';
        }
        return;
      }

      if (button.dataset.v) {
        selectView(button.dataset.v);
      }
    }

    function handleBrandKeydown(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleBlank();
      }
    }

    function handleLogout(event) {
      if (event) event.preventDefault();
      doc.body.classList.remove('in', 'blank');
      resetSidebar();
      onLogout();
    }

    side.addEventListener('click', handleSidebarClick);

    const brand = side.querySelector('.top');
    if (brand) {
      brand.addEventListener('click', toggleBlank);
      brand.addEventListener('keydown', handleBrandKeydown);
    }

    if (pinButton) {
      // The sidebar click handler handles this button.
      pinButton.setAttribute('aria-expanded', pinButton.getAttribute('aria-expanded') || 'false');
    }

    if (logoutButton) {
      logoutButton.addEventListener('click', handleLogout);
    }

    if (who && options.user) {
      setUser(options.user);
    }

    if (options.initialView !== false) {
      selectView(options.initialView || 'home');
    }

    function setUser(user) {
      if (!who || !user) return;
      who.textContent = `Signed in as ${user.email || user.name || ''} · ${user.role || ''}`;
    }

    return {
      navigate: selectView,
      setUser,
      resetSidebar,
      toggleBlank,
      destroy() {
        side.removeEventListener('click', handleSidebarClick);
        if (brand) {
          brand.removeEventListener('click', toggleBlank);
          brand.removeEventListener('keydown', handleBrandKeydown);
        }
        if (logoutButton) logoutButton.removeEventListener('click', handleLogout);
      }
    };
  }

  return { init };
});
