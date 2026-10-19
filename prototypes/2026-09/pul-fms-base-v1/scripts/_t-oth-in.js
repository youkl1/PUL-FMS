/**
 * _t-oth-in.js — 其他入库单「审核入库 / 编辑」按钮反馈复现驱动（非交付页面）
 * 用法：Edge headless --dump-dom 跑 _t-oth-in.html?t=<场景>，结果写 #_tresult
 * 场景：audit-empty=走页面新增空单→点审核（期望：修复后 toast「请先扫码入库」）
 *       audit-ok=赠品单 QTRK20261002001 点审核（期望：未解析码硬拦 toast+跳异常页签）
 *       edit-seed=赠品单点编辑（期望：修复后弹窗含药品清单编辑区）
 */
(function () {
  var errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message || e.error)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + String(e.reason)); });

  function toastText() { var t = document.getElementById('toast'); return t ? t.textContent : '(no #toast)'; }
  function toastActive() { var t = document.getElementById('toast'); return t ? t.classList.contains('active') : false; }
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
  var GIFT = 'QTRK20261002001';

  window.addEventListener('load', function () {
    setTimeout(function () {
      var t = new URLSearchParams(location.search).get('t') || 'audit-empty';
      var res = { scenario: t };

      // 场景一：真实用户流——新增空单 → 行内点审核入库
      if (t === 'audit-empty') {
        document.getElementById('btnAdd').click();
        setTimeout(function () {
          res.addModal = modalState('othInAdd');
          var ok = document.querySelector('#othInAdd #oaOk');
          res.addOkBtn = !!ok;
          if (ok) ok.click();
          setTimeout(function () {
            res.toastAfterAdd = toastText();
            // 新建单 billNo（页面闭包已落账，从存储读第一张未审核空单）
            var S = window.PUL_WH.load();
            var d0 = (S.othInDocs || []).filter(function (d) { return d.status !== '已审核' && !d.codes.length; })[0];
            res.newBill = d0 ? d0.billNo : null;
            var b = d0 && document.querySelector('[data-audit="' + d0.billNo + '"]');
            res.btnFound = !!b;
            res.btnDisabled = b ? b.disabled : null;
            res.btnTitle = b ? (b.getAttribute('title') || '') : null;
            if (b) b.click();
            setTimeout(function () {
              res.toastAfterAudit = toastText(); res.toastActive = toastActive();
              res.auditModal = modalState('othInAudit');
              dump(res);
            }, 250);
          }, 250);
        }, 250);
        return;
      }

      // 场景二：赠品单（实物2/解析1/扫码2）点审核 → 未解析码硬拦
      if (t === 'audit-ok') {
        var b2 = document.querySelector('[data-audit="' + GIFT + '"]');
        res.btnFound = !!b2; res.btnDisabled = b2 ? b2.disabled : null;
        if (b2) b2.click();
        setTimeout(function () {
          res.toast = toastText(); res.toastActive = toastActive();
          res.auditModal = modalState('othInAudit');
          res.badTabActive = !!document.querySelector('.pch-tab.active[data-ptab="bad"]');
          dump(res);
        }, 250);
        return;
      }

      // 场景三：赠品单点编辑 → 记录弹窗内容（修复后期望含药品清单编辑区）
      if (t === 'edit-seed') {
        var b3 = document.querySelector('[data-edit="' + GIFT + '"]');
        res.btnFound = !!b3;
        if (b3) b3.click();
        setTimeout(function () {
          res.editModal = modalState('othInEdit');
          var m = document.getElementById('othInEdit');
          res.hasDrugSection = m ? !!m.querySelector('[data-oi-drugs]') : false;
          res.drugRows = m ? m.querySelectorAll('[data-oi-drugs] tbody tr').length : -1;
          res.bodyTextHead = m ? m.textContent.replace(/\s+/g, ' ').slice(0, 200) : '';
          dump(res);
        }, 250);
        return;
      }

      // 场景四：编辑提交——改批次后保存，验证落账到码记录 + 药品清单页签回显 + toast
      if (t === 'edit-commit') {
        var b4 = document.querySelector('[data-edit="' + GIFT + '"]');
        res.btnFound = !!b4;
        if (b4) b4.click();
        setTimeout(function () {
          var m = document.getElementById('othInEdit');
          var inp = m && m.querySelector('[data-drow="0"][data-df="batch"]');
          res.batchInputFound = !!inp;
          if (inp) { inp.value = 'PC20261013'; }
          var ok = m && m.querySelector('#oiOk');
          if (ok) ok.click();
          setTimeout(function () {
            res.toastAfterSave = toastText(); res.toastActive = toastActive();
            var S2 = window.PUL_WH.load();
            var g = (S2.othInDocs || []).filter(function (d) { return d.billNo === GIFT; })[0];
            res.batches = g ? g.codes.map(function (c) { return c.code.slice(0, 7) + ':' + (c.batch || '∅'); }) : null;
            // 药品清单页签回显（赠品单已被编辑流程选中；批次在 input value 属性上，不在 textContent）
            var tab = document.querySelector('[data-ptab="drugs"]');
            if (tab) tab.click();
            setTimeout(function () {
              var bi = document.querySelector('.pch-tab-panel input[data-f="batch"]');
              res.drugsTabBatchValue = bi ? bi.value : '(no input)';
              dump(res);
            }, 250);
          }, 250);
        }, 250);
        return;
      }

      // 场景五：审核到底——新建空单→扫码入库 2 码→批次拦截→编辑弹窗补批次→审核入库→弹窗→确定→落账
      // （端到端复现用户路径：验证 openAudit 弹窗是否弹出 + 成功后有无 JS 异常报错）
      if (t === 'audit-commit') {
        var CODE1 = '84619350009999010001', CODE2 = '84619350009999020001';
        document.getElementById('btnAdd').click();
        setTimeout(function () {
          document.querySelector('#othInAdd #oaOk').click();
          setTimeout(function () {
            var S0 = window.PUL_WH.load();
            var d0 = S0.othInDocs.filter(function (d) { return d.status !== '已审核' && !d.codes.length; })[0];
            res.newBill = d0 ? d0.billNo : null;
            // 行内扫码入库 → openScan 弹窗
            document.querySelector('[data-scan="' + d0.billNo + '"]').click();
            setTimeout(function () {
              res.scanModal = modalState('pchScan');
              var inp = document.getElementById('pchScanInput');
              function scanOne(cd, next) {
                inp.value = cd;
                inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                setTimeout(next, 200);
              }
              scanOne(CODE1, function () {
                scanOne(CODE2, function () {
                  setTimeout(function () {
                    var S1 = window.PUL_WH.load();
                    var d1 = S1.othInDocs.filter(function (d) { return d.billNo === res.newBill; })[0];
                    res.codesAfterScan = d1.codes.length;
                    // 关扫码弹窗，直接点行内审核入库 → 批次未填应拦截 toast
                    var closeBtn = document.querySelector('#pchScan [data-mclose2]');
                    if (closeBtn) closeBtn.click();
                    setTimeout(function () {
                      document.querySelector('[data-audit="' + res.newBill + '"]').click();
                      setTimeout(function () {
                        res.toastBatchBlock = toastText();
                        // 编辑弹窗补批次/效期（验收 Round BN 编辑药品清单）
                        document.querySelector('[data-edit="' + res.newBill + '"]').click();
                        setTimeout(function () {
                          var m = document.getElementById('othInEdit');
                          res.editDrugRows = m ? m.querySelectorAll('[data-oi-drugs] tbody tr').length : -1;
                          var bInp = m && m.querySelector('[data-drow="0"][data-df="batch"]');
                          var pInp = m && m.querySelector('[data-drow="0"][data-df="prodDate"]');
                          var eInp = m && m.querySelector('[data-drow="0"][data-df="expDate"]');
                          if (bInp) bInp.value = 'PC20261013';
                          if (pInp) pInp.value = '2026-10-01';
                          if (eInp) eInp.value = '2028-09-30';
                          if (m) m.querySelector('#oiOk').click();
                          setTimeout(function () {
                            // 再点审核入库 → 应弹 othInAudit（用户报障点：此处是否弹窗）
                            document.querySelector('[data-audit="' + res.newBill + '"]').click();
                            setTimeout(function () {
                              res.auditModal = modalState('othInAudit');
                              var ok2 = document.querySelector('#othInAudit #auOk');
                              res.auOkBtn = !!ok2;
                              if (ok2) ok2.click();
                              setTimeout(function () {
                                res.toastAfterCommit = toastText(); res.toastActive = toastActive();
                                var S2 = window.PUL_WH.load();
                                var d2 = S2.othInDocs.filter(function (d) { return d.billNo === res.newBill; })[0];
                                res.statusAfter = d2 ? d2.status : '(gone)';
                                res.batchesAfter = d2 ? d2.codes.map(function (c) { return c.batch; }) : null;
                                dump(res);
                              }, 300);
                            }, 300);
                          }, 300);
                        }, 300);
                      }, 300);
                    }, 300);
                  }, 300);
                });
              });
            }, 300);
          }, 300);
        }, 300);
        return;
      }

      res.unknown = true; dump(res);
    }, 700);
  });
})();
