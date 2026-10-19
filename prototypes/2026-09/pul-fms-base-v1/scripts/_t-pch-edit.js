/**
 * _t-pch-edit.js — 采购到货单「编辑·清单录入单」自动交互验证（截图用，非交付页面）
 * 流程：点演示单 DH20261011001 行内「编辑」→ 弹窗带 PulDrugPicker 预填计划清单
 */
window.addEventListener('load', function () {
  setTimeout(function () {
    var b = document.querySelector('[data-edit="DH20261011001"]');
    if (b) b.click();
  }, 600);
});
