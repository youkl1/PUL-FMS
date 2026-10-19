/**
 * _t-pch-add.js — 采购到货单「新增到货单（清单录入）」自动交互验证（截图用，非交付页面）
 * 流程：点「+ 新增到货单」→ 切「清单录入」单选 → PulDrugPicker 公共组件展开
 */
window.addEventListener('load', function () {
  setTimeout(function () {
    document.getElementById('btnAdd').click();
    setTimeout(function () {
      var r = document.getElementById('adModePlan');
      if (r) { r.checked = true; r.dispatchEvent(new Event('change')); }
    }, 400);
  }, 600);
});
