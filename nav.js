(function() {
  // Determine active page
  const page = window.location.pathname.split('/').pop() || 'index.html';

  // Inject Inter + DM Mono fonts if not already loaded
  if (!document.querySelector('link[href*="Inter"]')) {
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=DM+Mono:ital,wght@0,400;0,500;1,400&display=swap';
    document.head.appendChild(font);
  }

  // Inject sidebar CSS — matches dashboard sidebar exactly
  const style = document.createElement('style');
  style.textContent = `
    :root { --mnav-w: 210px; --mnav-collapsed: 52px; }
    #mnav-sidebar {
      position: fixed !important; left: 0 !important; top: 0 !important; bottom: 0 !important;
      width: var(--mnav-w) !important;
      background: #0E0E0E !important; border-right: 1px solid #222222 !important;
      display: flex !important; flex-direction: column !important; z-index: 200 !important;
      transition: width .2s; overflow: hidden !important; flex-shrink: 0 !important;
      box-sizing: border-box !important;
    }
    #mnav-sidebar.collapsed { width: var(--mnav-collapsed) !important; }
    .mnav-top {
      display: flex !important; flex-direction: row !important; align-items: center !important;
      justify-content: space-between !important;
      padding: 16px 14px !important; border-bottom: 1px solid #222222 !important;
      height: 48px !important; flex-shrink: 0 !important; box-sizing: border-box !important;
    }
    .mnav-logo {
      font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500;
      letter-spacing: .25em; color: #F0F0EE; white-space: nowrap; overflow: hidden;
      text-decoration: none;
    }
    #mnav-sidebar.collapsed .mnav-logo { opacity: 0; }
    .mnav-collapse-btn {
      background: none; border: none; cursor: pointer; color: rgba(240,240,238,.28);
      padding: 4px; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: color .15s;
    }
    .mnav-collapse-btn:hover { color: #F0F0EE; }
    .mnav-collapse-icon { transition: transform .2s; }
    #mnav-sidebar.collapsed .mnav-collapse-icon { transform: rotate(180deg); }
    .mnav-list {
      display: block !important; flex: 1 !important;
      overflow-y: auto !important; overflow-x: hidden !important;
      padding: 10px 0 !important; scrollbar-width: none !important;
    }
    .mnav-list::-webkit-scrollbar { width: 0 !important; }
    .mnav-section {
      display: block !important;
      font-family: 'Inter', sans-serif !important; font-size: 9px !important;
      font-weight: 700 !important; letter-spacing: .18em !important;
      color: rgba(240,240,238,.28) !important;
      padding: 16px 14px 6px !important; white-space: nowrap !important;
      overflow: hidden !important;
    }
    #mnav-sidebar.collapsed .mnav-section { opacity: 0 !important; }
    .mnav-item {
      font-family: 'Inter', sans-serif !important;
      display: flex !important; flex-direction: row !important;
      align-items: center !important; gap: 10px !important;
      padding: 9px 14px !important; color: rgba(240,240,238,.28) !important;
      text-decoration: none !important; cursor: pointer !important;
      transition: all .15s !important; border-left: 2px solid transparent !important;
      white-space: nowrap !important; box-sizing: border-box !important;
    }
    .mnav-item:hover { color: #F0F0EE !important; background: rgba(255,255,255,.03) !important; }
    .mnav-item.active {
      color: #F0F0EE !important; border-left-color: #F0F0EE !important;
      background: rgba(255,255,255,.04) !important;
    }
    .mnav-icon {
      display: block !important; width: 16px !important; height: 16px !important;
      flex-shrink: 0 !important; color: currentColor !important; opacity: .7 !important;
    }
    .mnav-item.active .mnav-icon { opacity: 1 !important; }
    .mnav-label {
      display: block !important;
      font-size: 11px !important; font-weight: 600 !important;
      letter-spacing: .06em !important; overflow: hidden !important;
      transition: opacity .15s !important;
    }
    #mnav-sidebar.collapsed .mnav-label { opacity: 0 !important; width: 0 !important; }
    .mnav-bottom {
      display: block !important; padding: 10px 0 !important;
      border-top: 1px solid #222222 !important; flex-shrink: 0 !important;
    }
    body.mnav-injected { padding-left: var(--mnav-w) !important; transition: padding-left .2s; }
    body.mnav-injected.mnav-collapsed-body { padding-left: var(--mnav-collapsed) !important; }
    @media (max-width: 768px) {
      #mnav-sidebar { display: none !important; }
      body.mnav-injected { padding-left: 0 !important; }
    }
  `;
  document.head.appendChild(style);

  // Nav items definition
  const NAV = [
    { section: 'OVERVIEW' },
    { label: 'DASHBOARD', href: 'index.html', icon: '<path d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9"/>' },
    { section: 'DEALS' },
    { label: 'PIPELINE', href: 'pipeline.html', icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' },
    { label: 'OFFER BUILDER', href: 'offer-builder.html', icon: '<path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>' },
    { label: 'COMPLIANCE', href: 'compliance-checklist.html', icon: '<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>' },
    { section: 'CLIENTS' },
    { label: 'LEADS', href: 'lead-intake.html', icon: '<path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>' },
    { label: 'COMMS', href: 'client-comms.html', icon: '<path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>' },
    { section: 'INTELLIGENCE' },
    { label: 'SMART CAL', href: 'smart-calendar.html', icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 14h.01M12 14h.01M15 14h.01"/>' },
  ];
  const NAV_BOTTOM = [
    { label: 'PERFORMANCE', href: 'agent-performance.html', icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
    { label: 'SETTINGS', href: 'meridian-onboarding.html', icon: '<path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/>' },
  ];

  function makeItem(item) {
    if (item.section) return `<div class="mnav-section">${item.section}</div>`;
    const pageBase = page.replace(/\.html$/, '') || 'index';
    const hrefBase = item.href.replace(/\.html$/, '');
    const active = (hrefBase === pageBase) ? ' active' : '';
    return `<a class="mnav-item${active}" href="${item.href}">
      <svg class="mnav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${item.icon}</svg>
      <span class="mnav-label">${item.label}</span>
    </a>`;
  }

  function init() {
    // Build sidebar
    const aside = document.createElement('aside');
    aside.id = 'mnav-sidebar';
    aside.innerHTML = `
      <div class="mnav-top">
        <a class="mnav-logo" href="index.html">MERIDIAN</a>
        <button class="mnav-collapse-btn" onclick="mnavToggle()">
          <svg class="mnav-collapse-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      </div>
      <div class="mnav-list">${NAV.map(makeItem).join('')}</div>
      <div class="mnav-bottom">${NAV_BOTTOM.map(makeItem).join('')}</div>
    `;
    document.body.prepend(aside);
    document.body.classList.add('mnav-injected');

    // Restore collapsed state
    try {
      if (localStorage.getItem('meridian_sidebar_collapsed') === 'true') {
        aside.classList.add('collapsed');
        document.body.classList.add('mnav-collapsed-body');
      }
    } catch {}

    window.mnavToggle = function() {
      const collapsed = aside.classList.toggle('collapsed');
      document.body.classList.toggle('mnav-collapsed-body', collapsed);
      try { localStorage.setItem('meridian_sidebar_collapsed', collapsed); } catch {}
    };
  }

  // Run immediately if body exists, otherwise wait for DOMContentLoaded
  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
