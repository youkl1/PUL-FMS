/**
 * _t-pout.js — 采购退货单「审核退货」对齐到货单口径复现驱动（非交付页面）
 * 用法：Edge headless --dump-dom 跑 _t-pout.html?t=<场景>，结果写 #_tresult
 * 场景：audit-block=无库存码单拦截弹窗 | audit-pass=库房退货移除异常码后审核到底（2026-10-13 Round BU 到货退货删除）
 *       | audit-empty=新增空单拦截弹窗
 */
(function () {
  var errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message || e.error)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + String(e.reason)); });

  function toastText() { var t = document.getElementById('toast'); return t ? t.textContent : '(no #toast)'; }
  function modalState(id) {
    var m = document.getElementById(id);
    if (!m) return 'absent';
    return m.style.display === 'none' ? 'hidden' : 'OPEN';
  }
  function dump(res) {
    res.errors = errs;
    var pre = document.createElement('pre');
    pre.id = '_tresult';
    pre.textContent = '===TRESULT===' + JSON.stringify(res, null, 1) + '===END===';
    document.body.appendChild(pre);
  }

  window.addEventListener('load', function () {
    setTimeout(function () {
      var t = new URLSearchParams(location.search).get('t') || 'audit-block';
      var res = { scenario: t };
      // 列表断言：无「解析数量」列、有「扫码数量」列
      var thead = document.querySelector('thead');
      res.hasParseCol = thead ? thead.textContent.indexOf('解析数量') !== -1 : '(no thead)';
      res.hasScanCol = thead ? thead.textContent.indexOf('扫码数量') !== -1 : '(no thead)';

      if (t === 'audit-block') {
        var b = document.querySelector('[data-audit="202609110002"]');
        res.btnFound = !!b; res.btnDisabled = b ? b.disabled : null;
        if (b) b.click();
        setTimeout(function () {
          res.blockModal = modalState('pchAuditBlock');
          var bm = document.getElementById('pchAuditBlock');
          res.blockText = bm ? bm.textContent.replace(/\s+/g, ' ').slice(0, 200) : '';
          res.badTabActive = !!document.querySelector('.pch-tab.active[data-ptab="bad"]');
          var go = document.querySelector('#pchAuditBlock #abGo');
          res.obGoBtn = !!go;
          if (go) go.click();
          setTimeout(function () {
            res.badTabAfterGo = !!document.querySelector('.pch-tab.active[data-ptab="bad"]');
            res.blockModalAfterGo = modalState('pchAuditBlock');
            dump(res);
          }, 250);
        }, 300);
        return;
      }

      if (t === 'audit-pass') {
        // 2026-10-13 Round BU：到货退货删除——改为库房退货「码明细移除无库存码 → 审核到底」全链（走页面真实交互）
        var tabBad = document.querySelector('[data-ptab="bad"]');
        res.badTabFound = !!tabBad;
        if (tabBad) tabBad.click();
        setTimeout(function () {
          var rm = document.querySelector('[data-rmbad]');
          res.rmBtn = !!rm;
          if (rm) rm.click();   // 移除无库存码（页面内存同步，审核放行）
          setTimeout(function () {
            var b2 = document.querySelector('[data-audit="202609110002"]');
            res.btnFound = !!b2;
            if (b2) b2.click();
            setTimeout(function () {
              res.auditModal = modalState('pchOutAudit');
              var am = document.getElementById('pchOutAudit');
              res.checkHasExcOk = am ? am.textContent.indexOf('无异常码') !== -1 : false;
              res.checkNoRef = am ? am.textContent.indexOf('关联到货单') === -1 : false;
              var ok = document.querySelector('#pchOutAudit #auOk');
              res.auOkBtn = !!ok;
              if (ok) ok.click();
              setTimeout(function () {
                res.toastAfterCommit = toastText();
                var P = window.PUL_PCH.load();
                var ret = P.outDocs.filter(function (d) { return d.billNo === '202609110002'; })[0];
                res.retStatus = ret ? ret.status : '(gone)';
                res.noArrDoc = !P.outDocs.some(function (d) { return d.type === '到货退货'; });
                dump(res);
              }, 300);
            }, 300);
          }, 300);
        }, 300);
        return;
      }

      if (t === 'audit-empty') {
        document.getElementById('btnAdd').click();
        setTimeout(function () {
          var ok2 = document.querySelector('#pchOutAdd #oaOk');
          res.addModal = modalState('pchOutAdd');
          res.noTypeModal = !document.getElementById('pchOutType');   // Round BU：类型选择弹窗删除
          if (ok2) ok2.click();
            setTimeout(function () {
              var P = window.PUL_PCH.load();
              var d0 = P.outDocs.filter(function (d) { return d.status !== '已审核' && !d.codes.length; })[0];
              res.newBill = d0 ? d0.billNo : null;
              var b3 = d0 && document.querySelector('[data-audit="' + d0.billNo + '"]');
              res.btnFound = !!b3; res.btnDisabled = b3 ? b3.disabled : null;
              if (b3) b3.click();
              setTimeout(function () {
                res.blockModal = modalState('pchAuditBlock');
                var bm = document.getElementById('pchAuditBlock');
                res.blockText = bm ? bm.textContent.replace(/\s+/g, ' ').slice(0, 160) : '';
                res.obGoBtn = !!document.querySelector('#pchAuditBlock #abGo');
                dump(res);
              }, 300);
          }, 300);
        }, 300);
        return;
      }

      res.unknown = true; dump(res);
    }, 700);
  });
})();
