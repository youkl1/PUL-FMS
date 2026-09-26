/**
 * _t-wh-pick.js — 领用备货出库自动交互验证（截图用，非交付页面）
 * 流程：选住院药房申请单（加罗新×60瓶）→ 扫码备货 → 扫 1 个在架箱码（应 +60瓶备齐）→ 扫 1 个非在架码（应红拦截）
 */
window.addEventListener('load', function () {
  setTimeout(function () {
    var cards = document.querySelectorAll('[data-req]');
    if (cards[1]) cards[1].click();
    setTimeout(function () {
      var btn = document.getElementById('btnScan');
      if (btn) btn.click();
      setTimeout(function () {
        var input = document.getElementById('pchScanInput');
        if (!input) return;
        input.value = '84147840007702017701';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        setTimeout(function () {
          input.value = '8400431002599999001';
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }, 300);
      }, 500);
    }, 400);
  }, 600);
});
