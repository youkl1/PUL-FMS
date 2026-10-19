/**
 * _t-wh-return-in.js — 领用退回「库房直收」自动交互验证（截图用，非交付页面）
 * 流程：+ 新增退回 → 选门诊药房创建直收单 → 扫码收码（在架码√）→ 重复扫（⚠过滤）
 *      → 扫无关码（×拦截）→ 关闭 → 审核入库（一次落账）
 */
window.addEventListener('load', function () {
  setTimeout(function () {
    document.getElementById('btnAddRet').click();
    setTimeout(function () {
      var ok = document.getElementById('btnRetAddOk');
      if (!ok) return;
      ok.click();                                                       // 创建直收退回单（默认门诊药房）
      setTimeout(function () {
        var bs = document.getElementById('btnScan');
        if (!bs) return;
        bs.click();                                                     // 打开扫码收码
        setTimeout(function () {
          var input = document.getElementById('pchScanInput');
          if (!input) return;
          var S = window.PUL_WH.load();
          var code = (window.PUL_WH.pharmacyStock(S, '门诊药房')[0] || {}).code || '8400431002599999001';
          function scan(c, next) {
            input.value = c;
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            setTimeout(next, 250);
          }
          scan(code, function () {                                      // √ 收码
            scan(code, function () {                                    // ⚠ 重复过滤
              scan('99999999999999999999', function () {                // × 非该药房领出未回
                document.querySelector('#pchScan [data-mclose2]').click();
                setTimeout(function () {
                  var ba = document.getElementById('btnAudit');
                  if (!ba) return;
                  ba.click();                                           // 审核入库
                  setTimeout(function () {
                    var okBtn = document.querySelector('#pchConfirm [data-ok]');
                    if (okBtn) okBtn.click();
                  }, 300);
                }, 300);
              });
            });
          });
        }, 400);
      }, 400);
    }, 400);
  }, 700);
});
