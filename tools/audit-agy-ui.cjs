const {discover, Cdp} = require('../shared/host.cjs');
(async () => {
  const d = await discover();
  if (!d) return;
  const cdp = new Cdp(d.target.webSocketDebuggerUrl);
  await cdp.ready;
  const audit = await cdp.evaluate(`(() => {
    // 1. Check titlebar and headers
    const titlebar = document.querySelector('.titlebar, header, [role="navigation"]');
    // 2. Check sidebar items
    const sidebar = document.querySelector('.bg-sidebar, aside');
    const sidebarItems = sidebar ? Array.from(sidebar.querySelectorAll('button, a, [role="button"]')).map(el => ({
      text: el.innerText?.trim().slice(0, 30),
      bg: getComputedStyle(el).backgroundColor,
      color: getComputedStyle(el).color
    })) : [];
    // 3. Check composer elements
    const composer = document.querySelector('.surface-composer');
    const modelSelector = composer?.querySelector('[data-testid="model-selector-trigger"]');
    const sendBtn = composer?.querySelector('button[type="submit"], button:has(svg)');
    // 4. Check popovers / dialogs in DOM
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]')).map(el => ({
      tag: el.tagName,
      role: el.getAttribute('role'),
      bg: getComputedStyle(el).backgroundColor,
      filter: getComputedStyle(el).backdropFilter
    }));
    // 5. Check Overview panel
    const overview = document.querySelector('.animate-overview-panel');
    // 6. Check all text in UI that might be English
    const englishLabels = Array.from(document.querySelectorAll('button, a, span, p')).filter(el => {
      const text = el.innerText?.trim();
      return text && /^[A-Z][a-z]+(\s+[A-Z]?[a-z]+)*$/.test(text) && text.length > 3 && text.length < 35 && el.children.length === 0;
    }).map(el => el.innerText.trim()).filter((v, i, a) => a.indexOf(v) === i).slice(0, 40);

    return {
      titlebarFound: !!titlebar,
      sidebarItemsCount: sidebarItems.length,
      modelSelectorBg: modelSelector ? getComputedStyle(modelSelector).backgroundColor : null,
      sendBtnBg: sendBtn ? getComputedStyle(sendBtn).backgroundColor : null,
      dialogsCount: dialogs.length,
      dialogs,
      overviewFound: !!overview,
      overviewBg: overview ? getComputedStyle(overview).backgroundColor : null,
      englishLabels
    };
  })()`);
  console.log('AGY UI Audit:\n', JSON.stringify(audit, null, 2));
  cdp.close();
})().catch(e => console.error(e));
