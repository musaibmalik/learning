(function () {
  var body = document.body;
  var menu = document.getElementById('menu-btn');
  var scrim = document.getElementById('scrim');

  function setNav(open) {
    body.classList.toggle('nav-open', open);
    if (menu) menu.setAttribute('aria-expanded', String(open));
    if (scrim) scrim.hidden = !open;
  }
  if (menu) menu.addEventListener('click', function () { setNav(!body.classList.contains('nav-open')); });
  if (scrim) scrim.addEventListener('click', function () { setNav(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });
  document.querySelectorAll('.sidebar a').forEach(function (a) {
    a.addEventListener('click', function () { setNav(false); });
  });

  // Top bar: hide when scrolling down, show again when scrolling up or near the top.
  var bar = document.querySelector('.topbar');
  if (bar) {
    var lastY = window.scrollY, ticking = false;
    var update = function () {
      ticking = false;
      var y = Math.max(0, window.scrollY);
      var dy = y - lastY;
      if (body.classList.contains('nav-open') || y < 80) { bar.classList.remove('hide'); lastY = y; return; }
      if (Math.abs(dy) < 8) return; // ignore tiny jitter
      bar.classList.toggle('hide', dy > 0);
      lastY = y;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    // Keyboard users tabbing into the bar always see it.
    bar.addEventListener('focusin', function () { bar.classList.remove('hide'); });
    update();
  }

  // Light or dark, remembered per browser.
  var themeBtn = document.getElementById('theme-btn');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var root = document.documentElement;
    var dark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
  });

  // Copy buttons on code blocks.
  document.querySelectorAll('pre .copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var code = btn.parentElement.querySelector('code');
      var text = code ? code.innerText : '';
      var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1400); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
    });
  });

  // Mark diagrams that overflow on small screens.
  function checkViz() {
    document.querySelectorAll('.viz').forEach(function (f) {
      var sc = f.querySelector('.viz-scroll');
      if (!sc) return;
      var over = sc.scrollWidth > sc.clientWidth + 4;
      f.classList.toggle('scrollable', over);
      f.classList.toggle('at-end', over && sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 4);
    });
  }
  document.querySelectorAll('.viz-scroll').forEach(function (sc) { sc.addEventListener('scroll', checkViz, { passive: true }); });
  window.addEventListener('resize', checkViz);
  checkViz();

  // Highlight the section you are reading in the sidebar.
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
  if (links.length && 'IntersectionObserver' in window) {
    var map = {};
    links.forEach(function (l) { map[l.getAttribute('href').slice(1)] = l; });
    var heads = links.map(function (l) { return document.getElementById(l.getAttribute('href').slice(1)); }).filter(Boolean);
    var current = null;
    var obs = new IntersectionObserver(function () {
      var top = null;
      heads.forEach(function (h) { if (h.getBoundingClientRect().top < 140) top = h; });
      var next = top ? map[top.id] : null;
      if (next !== current) {
        if (current) current.classList.remove('on');
        if (next) next.classList.add('on');
        current = next;
      }
    }, { rootMargin: '0px 0px -60% 0px', threshold: [0, 1] });
    heads.forEach(function (h) { obs.observe(h); });
  }
})();
