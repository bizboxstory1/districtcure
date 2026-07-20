/* District Cure PWA bootstrap — registers the service worker and shows a simple
   "Install App" button on phones/tablets (with an iOS Add-to-Home-Screen hint).
   Self-contained: works on any page, no markup required. */
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (standalone) return; // already installed — don't nag

  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  var deferred = null;

  function makeBtn(label) {
    var b = document.getElementById('dc-install-btn');
    if (b) { b.textContent = label; return b; }
    b = document.createElement('button');
    b.id = 'dc-install-btn';
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-label', 'Install the District Cure app');
    b.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9400;' +
      'padding:13px 22px;border:none;border-radius:100px;cursor:pointer;' +
      'background:linear-gradient(135deg,#B8832A,#D4A03C);color:#07090F;' +
      "font:700 13px/1 'Outfit',system-ui,sans-serif;letter-spacing:.04em;" +
      'box-shadow:0 8px 28px rgba(0,0,0,.45);animation:dcInstallIn .4s ease';
    if (!document.getElementById('dc-install-style')) {
      var st = document.createElement('style'); st.id = 'dc-install-style';
      st.textContent = '@keyframes dcInstallIn{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}';
      document.head.appendChild(st);
    }
    document.body.appendChild(b);
    return b;
  }
  function hideBtn() { var b = document.getElementById('dc-install-btn'); if (b) b.remove(); }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    var b = makeBtn('⬇  Install App');
    b.onclick = async function () {
      if (!deferred) return;
      deferred.prompt();
      try { await deferred.userChoice; } catch (_) {}
      deferred = null; hideBtn();
    };
  });
  window.addEventListener('appinstalled', hideBtn);

  // iOS Safari has no install prompt — offer a tap-for-instructions button
  if (isIOS) {
    window.addEventListener('load', function () {
      setTimeout(function () {
        var b = makeBtn('⬇  Add to Home Screen');
        b.onclick = function () {
          alert('Install District Cure:\n\n1. Tap the Share button  ⬆\n2. Scroll down and tap “Add to Home Screen”\n3. Tap “Add”');
        };
      }, 1800);
    });
  }
})();
