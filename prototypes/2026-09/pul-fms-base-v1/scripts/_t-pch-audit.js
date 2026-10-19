/**
 * _t-pch-audit.js — 采购到货单「审核入库 / 编辑」按钮反馈复现驱动（非交付页面）
 * 用法：Edge headless --dump-dom 跑 _t-pch-audit.html?t=<场景>，结果写 #_tresult
 * 场景：audit-pulled=拉取单审核 | audit-plan=清单单审核(开弹窗) | audit-commit=清单单审核到底(点确定)
 *       audit-bad=异常单审核 | edit-plan=清单单编辑 | edit-pulled=拉取单编辑
 *       （2026-10-13 Round BU）edit-pulled-ui=拉取单编辑弹窗结构（计划数量+码聚合药品表） |
 *       edit-pulled-save=批次改写保存（#edPlan 已随 PulDrugPicker 移除，仅批次/保存链路有效） | audit-leftover=计划调小残留码审核两阶段
 *       （2026-10-16 Round DB）audit-pass / edit-floor-block / audit-leftover 改指 204-13824814
 *       （FK5XSG01484628-1 种子退役）；edit-floor-block 按 Round CT 现行口径重写（picker 数量输入 min=扫码总量，改小即时回正+toast）
 */
(function () {
  var errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message || e.error)); });
  window.addEventListener('unhandledrejection', function (e) { errs.push('rej:' + String(e.reason)); });

  function qs() { return new URLSearchParams(location.search).get('t') || 'audit-pulled'; }
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
  function clickBtn(selAttr) {
    var b = document.querySelector(selAttr);
    if (!b) return { found: false };
    b.click();
    return { found: true };
  }

  window.addEventListener('load', function () {
    setTimeout(function () {
      var t = qs(), res = { scenario: t };
      var docs = {
        pulled: '204-13824814',     // 拉取单：2 码未核对 → Round CX 起期望直接审批自动全核对→进审核确认弹窗（CS 的 0 量拦截被 CX 直接审批翻转覆盖）
        bad: '223342530',           // 拉取单：解析异常全集中（库存码已存在+解析失败 8999001/8999002，Round CO）→ 期望 toast 异常拦截+跳异常页签
        plan: 'DH20261011001'       // 清单录入演示单：码空、计划 3 → Round CS 起期望「扫码总量为 0 不允许审核」拦截弹窗（无码审核分支已下线）
      };

      if (t === 'audit-pulled' || t === 'audit-bad' || t === 'audit-plan') {
        var key = t === 'audit-pulled' ? 'pulled' : (t === 'audit-bad' ? 'bad' : 'plan');
        res.click = clickBtn('[data-audit="' + docs[key] + '"]');
        setTimeout(function () {
          res.toast = toastText(); res.toastActive = toastActive();
          res.pchAudit = modalState('pchAudit');
          res.blockModal = modalState('pchAuditBlock');
          var bm = document.getElementById('pchAuditBlock');
          res.blockText = bm ? bm.textContent.replace(/\s+/g, ' ').slice(0, 220) : '';
          res.badTabActive = !!document.querySelector('.pch-tab.active[data-ptab="bad"]');
          // audit-bad：弹窗「去异常码页签」按钮点击后才跳页签
          if (t === 'audit-bad') {
            var go = document.querySelector('#pchAuditBlock #abGo');
            res.abGoBtn = !!go;
            if (go) go.click();
            setTimeout(function () {
              res.badTabAfterGo = !!document.querySelector('.pch-tab.active[data-ptab="bad"]');
              res.blockModalAfterGo = modalState('pchAuditBlock');
              dump(res);
            }, 250);
            return;
          }
          // audit-plan：无码审核弹窗应带醒目警示核对区
          if (t === 'audit-plan') {
            var am = document.getElementById('pchAudit');
            res.checkHasNoCodeWarn = am ? am.textContent.indexOf('无码审核') !== -1 && am.textContent.indexOf('⚠') !== -1 : false;
            res.checkHasExcOk = am ? am.textContent.indexOf('无异常码') !== -1 : false;
          }
          dump(res);
        }, 300);
        return;
      }

      if (t === 'audit-commit') {
        res.click = clickBtn('[data-audit="' + docs.plan + '"]');
        setTimeout(function () {
          res.pchAudit = modalState('pchAudit');
          var am0 = document.getElementById('pchAudit');
          res.checkAreaPresent = am0 ? am0.textContent.indexOf('审核确认信息') !== -1 : false;
          var ok = document.querySelector('#pchAudit #auOk');
          res.okBtn = !!ok;
          if (ok) ok.click();
          setTimeout(function () {
            res.toastAfterCommit = toastText(); res.toastActive = toastActive();
            res.pchAuditAfter = modalState('pchAudit');
            // 审核后行状态（应翻已审核，操作列变 —）
            var row = document.querySelector('[data-sel="' + docs.plan + '"]');
            res.rowAfter = row ? row.textContent.replace(/\s+/g, ' ').slice(0, 200) : '(row gone)';
            dump(res);
          }, 300);
        }, 300);
        return;
      }

      if (t === 'edit-plan' || t === 'edit-pulled') {
        var k2 = t === 'edit-plan' ? 'plan' : 'pulled';
        res.click = clickBtn('[data-edit="' + docs[k2] + '"]');
        setTimeout(function () {
          res.toast = toastText();
          res.pchEdit = modalState('pchEdit');
          var pick = document.querySelector('#pchEdit #edPick');
          res.edPickPresent = !!pick;
          res.edPickHtmlLen = pick ? pick.innerHTML.length : -1;
          res.okBtn = !!document.querySelector('#pchEdit #edOk');
          dump(res);
        }, 400);
        return;
      }

      // 场景六（Round DB 改指 204-13824814，FK5XSG01484628-1 种子退役）：拉取单未核对点审核 →
      // Round CX 直接审批翻转（全部可解析码置已核对）→ 直进确认弹窗（✓✓ 无 ⚠）→ 确定 → 成功落账
      if (t === 'audit-pass') {
        var PASS = '204-13824814';
        var b6 = document.querySelector('[data-audit="' + PASS + '"]');
        res.btnFound = !!b6;
        // 先记录列表态：数量 2 / 扫码总量 0（未核对起，审核时翻转）
        var row6 = document.querySelector('[data-sel="' + PASS + '"]');
        res.rowText = row6 ? row6.textContent.replace(/\s+/g, ' ').slice(0, 160) : '(row missing)';
        if (b6) b6.click();
        setTimeout(function () {
          res.pchAudit = modalState('pchAudit');
          res.blockModal = modalState('pchAuditBlock');
          var am = document.getElementById('pchAudit');
          res.checkHasExcOk = am ? am.textContent.indexOf('无异常码') !== -1 : false;
          res.checkHasQtyEq = am ? am.textContent.indexOf('数量一致') !== -1 : false;
          res.checkHasNoCodeWarn = am ? am.textContent.indexOf('无码审核') !== -1 : '(no modal)';
          var ok6 = document.querySelector('#pchAudit #auOk');
          res.auOkBtn = !!ok6;
          if (ok6 && new URLSearchParams(location.search).get('hold') !== '1') ok6.click();
          if (ok6 && new URLSearchParams(location.search).get('hold') === '1') { dump(res); return; }
          setTimeout(function () {
            res.toastAfterCommit = toastText(); res.toastActive = toastActive();
            var rowA = document.querySelector('[data-sel="' + PASS + '"]');
            res.rowAfter = rowA ? rowA.textContent.replace(/\s+/g, ' ').slice(0, 160) : '(row gone)';
            dump(res);
          }, 300);
        }, 300);
        return;
      }

      // ===== Round BU（2026-10-13）：编辑弹窗药品清单区 + 计划数量可改 + 落账只入已核对码 =====
      // edit-pulled-ui：拉取单编辑弹窗结构——计划数量输入（默认=码个数）+ 码聚合药品表（批次可改）+ 无 PulDrugPicker
      if (t === 'edit-pulled-ui') {
        res.click = clickBtn('[data-edit="' + docs.pulled + '"]');
        setTimeout(function () {
          res.pchEdit = modalState('pchEdit');
          var plan = document.querySelector('#pchEdit #edPlan');
          res.edPlanPresent = !!plan;
          res.edPlanValue = plan ? plan.value : null;
          res.batchInputs = document.querySelectorAll('#pchEdit [data-df="batch"]').length;
          res.edPickPresent = !!document.querySelector('#pchEdit #edPick');
          dump(res);
        }, 400);
        return;
      }
      // edit-pulled-save：计划 2→1 + 首行批次改 B9 → 保存 → toast / 存储（planQty+码批次写回）双验
      if (t === 'edit-pulled-save') {
        res.click = clickBtn('[data-edit="' + docs.pulled + '"]');
        setTimeout(function () {
          var plan = document.querySelector('#pchEdit #edPlan');
          var b0 = document.querySelector('#pchEdit [data-drow="0"][data-df="batch"]');
          res.planFound = !!plan; res.batchFound = !!b0;
          if (plan) plan.value = '1';
          if (b0) b0.value = 'B9';
          var okb = document.querySelector('#pchEdit #edOk');
          if (okb) okb.click();
          setTimeout(function () {
            res.toastAfter = toastText();
            var st = window.PUL_PCH.load();
            var ob = st.arrive.filter(function (x) { return x.orderNo === docs.pulled; })[0] || {};
            res.storePlanQty = ob.planQty;
            res.code0Batch = ob.codes && ob.codes[0] ? ob.codes[0].batch : null;
            dump(res);
          }, 300);
        }, 400);
        return;
      }
      // edit-floor-block（2026-10-16 Round DB 重写：BX 轮起 #edPlan 已随 PulDrugPicker 统一移除，原场景空跑恒「通过」；
      // 改验 Round CT 现行口径——拉取单 204-13824814 扫码总量=全码折合 2（CW/CZ），数量输入 min=2，改 1 即时回正 + toast）
      if (t === 'edit-floor-block') {
        res.click = clickBtn('[data-edit="204-13824814"]');
        setTimeout(function () {
          var qty = document.querySelector('#pchEdit [data-dpqty]');
          res.qtyFound = !!qty; res.qtyMin = qty ? qty.getAttribute('min') : null;
          if (qty) { qty.value = '1'; qty.dispatchEvent(new Event('change', { bubbles: true })); }
          setTimeout(function () {
            var q2 = document.querySelector('#pchEdit [data-dpqty]');
            res.qtyAfter = q2 ? q2.value : null;   // 期望回正为 2（=扫码总量）
            res.toastAfter = toastText();
            res.pchEditStill = modalState('pchEdit');
            dump(res);
          }, 300);
        }, 400);
        return;
      }
      // audit-leftover（两阶段）：phase1 直改存储（2 码去 1 核对 + planQty=1）→ 重载；phase2 审核放行（计划1=扫码1）
      // → 确认区 ⚠ 残留提示 → 落账入库单只入 1 码、到货单留 2 码（Round DB 改指 204-13824814，FK5XSG01484628-1 种子退役）
      if (t === 'audit-leftover') {
        var LB = '204-13824814';
        if ((new URLSearchParams(location.search).get('phase') || '1') === '1') {
          var st1 = window.PUL_PCH.load();
          var o1 = st1.arrive.filter(function (x) { return x.orderNo === LB; })[0];
          res.seedFound = !!o1;
          if (o1) {
            o1.codes[0].checked = true; o1.codes[1].checked = false; o1.planQty = 1;
            window.PUL_PCH.save(st1);
          }
          location.href = location.pathname + '?t=audit-leftover&phase=2';
          dump(res);
          return;
        }
        res.click = clickBtn('[data-audit="' + LB + '"]');
        setTimeout(function () {
          res.pchAudit = modalState('pchAudit');
          res.blockModal = modalState('pchAuditBlock');
          var am = document.getElementById('pchAudit');
          res.hasLeftoverWarn = am ? am.textContent.indexOf('不入库') !== -1 && am.textContent.indexOf('短收') !== -1 : false;
          var okb = document.querySelector('#pchAudit #auOk');
          if (okb) okb.click();
          setTimeout(function () {
            res.toastAfterCommit = toastText();
            var st2 = window.PUL_PCH.load();
            res.inDoc0Codes = st2.inDocs[0] ? st2.inDocs[0].codes.length : -1;
            var o2 = st2.arrive.filter(function (x) { return x.orderNo === LB; })[0] || {};
            res.arriveCodesAfter = o2.codes ? o2.codes.length : -1;
            dump(res);
          }, 300);
        }, 300);
        return;
      }

      res.unknown = true; dump(res);
    }, 700);
  });
})();
