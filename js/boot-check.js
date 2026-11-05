(function () {
  window.setTimeout(function () {
    if (document.documentElement.getAttribute('data-app') === 'ready') return;
    var box = document.createElement('div');
    box.className = 'noscript';
    box.setAttribute('role', 'alert');
    box.textContent = window.location.protocol === 'file:'
      ? 'ATMOS uses JavaScript modules, which browsers block when a page is opened straight from disk. Start a local server in this folder (for example "npx serve .") and open the address it prints.'
      : 'ATMOS could not start in this browser. Please use a recent version of Chrome, Edge, Firefox or Safari.';
    document.body.appendChild(box);
  }, 3000);
})();
