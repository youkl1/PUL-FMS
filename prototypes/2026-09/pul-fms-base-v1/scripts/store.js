/**
 * store.js — 跨页 sessionStorage 状态层（web-admin 版）
 *
 * 用法：
 *   const state = window.store.load();           // 读全部
 *   window.store.save(state);                    // 整体写
 *   window.store.update({ key: value });         // 深合并写
 *   window.store.go('list.html');                // 跳页（自动保存）
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'web_admin_prototype_state_v1';
  var memFallback = null;

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function deepMerge(target, source) {
    Object.keys(source).forEach(function (k) {
      if (isPlainObject(source[k]) && isPlainObject(target[k])) {
        deepMerge(target[k], source[k]);
      } else {
        target[k] = source[k];
      }
    });
    return target;
  }

  function defaultState() {
    return {
      currentUser: null,   // 登录后写入 { account, name, roleName, org }
      demoMode: true,      // 未登录直达页面时自动注入演示账号
    };
  }

  function read() {
    try {
      var raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) { memFallback = raw; return JSON.parse(raw); }
    } catch (e) { /* fallthrough */ }
    if (memFallback) {
      try { return JSON.parse(memFallback); } catch (e) { /* fallthrough */ }
    }
    return defaultState();
  }

  function write(state) {
    var raw;
    try { raw = JSON.stringify(state); } catch (e) { return false; }
    memFallback = raw;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, raw);
      return true;
    } catch (e) { return false; }
  }

  window.store = {
    load: read,
    save: write,
    update: function (patch) {
      var s = read();
      deepMerge(s, patch);
      return write(s);
    },
    go: function (url) { window.location.href = url; },
    reset: function () {
      memFallback = null;
      try { window.sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    }
  };
})();
