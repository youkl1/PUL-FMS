/**
 * _t-wh-pick.js — 领用备货单 → 领用快捷扫码深链自动验证（截图用，非交付页面）
 * 流程：点待出库单 LY20260914002（加罗新×60瓶）的「备货」→ 深链续作
 *      → 跳转 quick-scan.html?billNo=（深链续作；进度落盘由 quick-scan 页承接验证）
 */
window.addEventListener('load', function () {
  setTimeout(function () {
    var btn = document.querySelector('[data-resume="LY20260914002"]');
    if (btn) btn.click();   // 续作并跳转领用快捷扫码
  }, 600);
});
