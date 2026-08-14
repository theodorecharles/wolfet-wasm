(function () {
  'use strict';

  var sources = [
    '/js/player-name.js?v=2',
    '/js/etjs-input.js?v=3',
    '/js/bind-store.js?v=2',
    '/js/pk3-cache.js?v=3',
    '/js/pk3-download.js?v=1',
    '/js/client.js?v=18'
  ];

  function load(source) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = source;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('Could not load ' + source)); };
      document.head.appendChild(script);
    });
  }

  var ready = sources.reduce(function (pending, source) {
    return pending.then(function () { return load(source); });
  }, Promise.resolve());

  function inner() {
    if (!window.ETJSGameAdapter) {
      throw new Error('The Enemy Territory engine adapter did not initialize.');
    }
    return window.ETJSGameAdapter;
  }

  window.WasmGameAdapter = {
    init: function (context) {
      return ready.then(function () { return inner().init(context); });
    },
    start: function (context) {
      return ready.then(function () { return inner().start(context); });
    },
    readEngineState: function () {
      return window.ETJSGameAdapter ? inner().readEngineState() : 'launcher';
    },
    resize: function (detail, context) {
      if (window.ETJSGameAdapter) { return inner().resize(detail, context); }
    }
  };
})();
