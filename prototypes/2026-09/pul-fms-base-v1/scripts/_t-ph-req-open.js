/**
 * _t-ph-req.js — 领用申请单自动交互验证（截图用，非交付页面）
 * 流程：点「新增申请」→ 选择器搜索「加罗新」→ 点候选行「+ 加入」→ 数量改 3 → 提交
 * 断言：reqPool 新增 source=药房申请 的待备货申请，items[0].qty===3
 */
window.addEventListener('load', function () {
  setTimeout(function () {
    document.getElementById('btnAdd').click();
    setTimeout(function () {
      var kw = document.querySelector('#phReqEdit #dpKw');
      if (!kw) { console.log('[t-ph-req] FAIL: 选择器未挂载'); return; }
      kw.value = '加罗新';
      kw.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(function () {
        var add = document.querySelector('#phReqEdit [data-add]');
        if (!add) { console.log('[t-ph-req] FAIL: 搜索无候选'); return; }
        add.click();
        setTimeout(function () {
          var qty = document.querySelector('#phReqEdit [data-dpqty="0"]');
          if (qty) { qty.value = 3; qty.dispatchEvent(new Event('change', { bubbles: true })); }
          /* 截图停在提交前 */
          setTimeout(function () {
            var wh = window.store.load().wh || {};
            var r = (wh.reqPool || [])[0];
            console.log('[t-ph-req] 新增申请断言:',
              r && r.source === '药房申请', r && r.status === '待备货',
              r && r.items && r.items.length === 1 && r.items[0].qty === 3,
              r && r.items && r.items[0].drugCode);
          }, 400);
        }, 300);
      }, 400);
    }, 500);
  }, 600);
});
