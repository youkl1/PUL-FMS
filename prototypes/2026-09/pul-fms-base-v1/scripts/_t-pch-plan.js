/**
 * _t-pch-plan.js — 采购到货单·清单录入单「药品清单」页签自动交互验证（截图用，非交付页面）
 * 流程：点演示单 DH20261011001 行 → 切「药品清单」页签（计划清单直渲染 + 扫码进度对照）
 */
window.addEventListener('load', function () {
  setTimeout(function () {
    var row = document.querySelector('[data-sel="DH20261011001"]');
    if (row) row.click();
    setTimeout(function () {
      var tab = document.querySelector('[data-ptab="drugs"]');
      if (tab) tab.click();
    }, 300);
  }, 600);
});
