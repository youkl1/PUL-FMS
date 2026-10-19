/**
 * store.js — 跨页 sessionStorage 状态层（web-admin 版）
 *
 * 用法：
 *   const state = window.store.load();           // 读全部
 *   window.store.save(state);                    // 整体写
 *   window.store.update({ key: value });         // 深合并写
 *   window.store.go('list.html');                // 跳页（自动保存）
 */

// ===== PUL_VOCAB 状态词表（2026-10-15 拍板：全站代码级唯一事实源）=====
// 状态词/字段词变更只改这里；数据层与页面脚本一律引用常量，禁止再写带引号字面量。
// store.js 在所有页面与 node 测试中均最先加载，挂此处即可全局可用。
// 词面口径与 .claude/guides/pul-fms-doc-page-conventions.md 状态词表保持一致。
window.PUL_VOCAB = {
  ST: {
    DRAFT: '草稿',            // 新建未提交
    PENDING_AUDIT: '待审核',  // 审核制单据：已提交待审核
    AUDITED: '已审核',        // 审核通过（过账）
    VOID: '已作废',           // 终态作废
    PENDING_OUT: '待出库',    // 领用链：已提交待库房备货出库
    OUT: '已出库',            // 领用链：出库审核即扣账，在途
    PENDING_IN: '待入库',     // 退回/领用入库链：待收货入库
    IN: '已入库',             // 领用链闭环 / 退回入库完成
    SHELVED: '已上架'         // 推导展示态（不落库，由码的 phLoc 齐备推导）
  },
  // 领用单链推进顺序（时间轴/下钻用）
  PICK_FLOW: ['草稿', '待出库', '已出库', '已入库', '已上架']
};

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
