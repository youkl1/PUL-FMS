/**
 * _t-wh-pick.js — 领用备货单自动交互验证（截图用，非交付页面）
 * 流程：点住院药房申请单 LY20260914002（加罗新×60瓶）的「备货」→ 建备货中草稿 → 扫码备货
 *       → 扫 1 个在架箱码（应 +60瓶备齐，草稿 codes 实时落盘）→ 扫 1 个非在架码（应红拦截）
 * 2026-10-01 备货草稿态统一：备货即建草稿写 pickDocs；断言草稿已落盘（reqNo 关联 + codes.length===1）
 */
window.addEventListener('load', function () {
  setTimeout(function () {
    var btn0 = document.querySelector('[data-pickreq="LY20260914002"]');
    if (btn0) btn0.click();
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
          setTimeout(function () {
            var wh = window.store.load().wh || {};
            var draft = (wh.pickDocs || []).filter(function (d) {
              return d.reqNo === 'LY20260914002' && d.status === '备货中';
            })[0];
            console.log('[t-wh-pick] 草稿落盘断言:',
              !!draft, draft && draft.codes && draft.codes.length === 1,
              draft && draft.codes[0] && draft.codes[0].code);
          }, 400);
        }, 300);
      }, 500);
    }, 400);
  }, 600);
});
