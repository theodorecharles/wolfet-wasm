/**
 * Persist ET control bindings in localStorage.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.ETJSBinds = api;
  } else if (root) {
    root.ETJSBinds = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var STORAGE_KEY = 'etjs.binds';

  function storageOf(storage) {
    if (storage) {
      return storage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
    throw new Error('localStorage is not available');
  }

  function loadBinds(storage) {
    try {
      return storageOf(storage).getItem(STORAGE_KEY);
    } catch (err) {
      return null;
    }
  }

  function saveBinds(text, storage) {
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('bind config is required');
    }
    storageOf(storage).setItem(STORAGE_KEY, text);
    return text;
  }

  /**
   * If a saved bind dump exists, it replaces the default unbindall+bind block.
   */
  function mergeAutoexec(defaultLines, stored) {
    var lines = Array.isArray(defaultLines) ? defaultLines.slice() : [];
    if (!stored || !String(stored).trim()) {
      return lines;
    }
    var filtered = lines.filter(function (line) {
      return !/^\s*unbindall\b/.test(line) && !/^\s*bind\s+/.test(line);
    });
    return filtered.concat(String(stored).split(/\r?\n/).filter(Boolean));
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    loadBinds: loadBinds,
    saveBinds: saveBinds,
    mergeAutoexec: mergeAutoexec
  };
});
