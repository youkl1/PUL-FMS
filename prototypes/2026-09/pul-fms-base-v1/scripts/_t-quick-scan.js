/**
 * _t-quick-scan.js — 领用快捷扫码自动交互验证（截图用，非交付页面）
 * 流程：选单 LY20260914002（加罗新×60瓶）→ 点行选中 →「选择」确认（待出库单内备货，落盘）
 *      → 扫箱码（+60备齐）→ 重复扫（自动过滤⚠）→ 扫非在架码（红拦截）
 *      → 切「扫码移除」→ 再扫箱码（➖已剔除）→ 切回加入再扫箱码
 *      → 审核出库（推进同一单为已出库·待入库，不新建单据）→ 跳 wh-pick 看终态行
 */
window.addEventListener('load', function () {
  setTimeout(function () {
    document.getElementById('qsPick').click();
    setTimeout(function () {
      var tr = document.querySelector('[data-pickreq="LY20260914002"]');
      if (tr) tr.click();                                  // 选中行（明细预览）
      setTimeout(function () {
        var ok = document.getElementById('qsPickOk');
        if (ok) ok.click();                                // 「选择」确认
      }, 300);
      setTimeout(function () {
        var input = document.getElementById('qsInput');
        if (!input) return;
        function scan(code, next) {
          input.value = code;
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          setTimeout(next, 250);
        }
        scan('84147840007702017701', function () {          // 箱码 +60 备齐
          scan('84147840007702017701', function () {        // 重复扫自动过滤
            scan('8400431002599999001', function () {       // 非在架红拦截
              document.getElementById('qsModeRm').click();  // 切移除模式
              setTimeout(function () {
                scan('84147840007702017701', function () {  // ➖ 已剔除
                  document.getElementById('qsModeAdd').click();
                  setTimeout(function () {
                    scan('84147840007702017701', function () {  // 重新加入
                      document.getElementById('qsAudit').click();
                      setTimeout(function () {
                        var okBtn = document.querySelector('#pchConfirm [data-ok]');
                        if (okBtn) okBtn.click();           // 审核出库（单推进已出库·待入库）
                        setTimeout(function () {
                          location.href = 'wh-pick.html';   // 回列表看终态（已出库·待入库）
                        }, 400);
                      }, 300);
                    });
                  }, 250);
                });
              }, 250);
            });
          });
        });
      }, 500);
    }, 400);
  }, 700);
});
