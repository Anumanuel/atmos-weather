(function () {
  var shown = false;
  var fromDisk = window.location.protocol === 'file:';
  var diskMessage = 'ATMOS uses JavaScript modules, which browsers block when a page is opened straight from disk. Start a local server in this folder (for example "npx serve .") and open the address it prints.';
  var failMessage = 'ATMOS could not start in this browser. Please use a recent version of Chrome, Edge, Firefox or Safari.';

  function show(text) {
    if (shown || document.documentElement.getAttribute('data-app') === 'ready') return;
    shown = true;
    var box = document.createElement('div');
    box.className = 'noscript';
    box.setAttribute('role', 'alert');
    box.textContent = text;
    document.body.appendChild(box);
  }

  var main = document.querySelector('script[type="module"]');
  if (main) {
    main.addEventListener('error', function () {
      show(fromDisk ? diskMessage : failMessage);
    });
  }

  window.setTimeout(function () {
    show(fromDisk ? diskMessage : failMessage);
  }, fromDisk ? 2500 : 25000);
})();
