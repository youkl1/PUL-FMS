/**
 * rx-bind.js — 手动补绑/改绑共用弹窗：系统按规则推荐码清单，人工勾选确认（T3 首版手动）
 * 复用方：disp.js / tray.js（补绑）、rx-exc.js（改绑）
 * 约定：弹窗只改 state 内存并调 onDone；save 由调用页在 onDone 里完成（占用派生须先 save 再查架）
 */
(function () {
  'use strict';
  var UI = window.PchUI, esc = UI.esc;
  function me() { return (window.store.load().currentUser || {}).name || '演示员'; }
  function drugName(dc) { var d = window.PUL_RX.drugOf(dc); return d ? d.drugName : dc; }

  function candRows(cands, inputType) {
    return cands.map(function (c) {
      return '<tr><td><input type="' + inputType + '" name="bindPick" value="' + esc(c.code) + '"></td>' +
        '<td style="font-family:Consolas,monospace;font-size:12px;">' + esc(c.code) + '</td>' +
        '<td>' + esc(c.batch || '—') + '</td><td>' + esc(c.expDate || '—') + '</td>' +
        '<td>' + esc(c.phLoc || '不入槽') + '</td>' +
        '<td><span class="badge bg-azure-lt">' + (c.phLoc ? '货位FEFO' : 'FIFO') + '</span></td></tr>';
    }).join('');
  }
  function ruleNote() {
    return '<div class="text-secondary" style="font-size:12.5px;margin-bottom:8px;">' +
      '推荐序：有货位按 货位→FEFO→入库先后；无货位按入库先后 FIFO。' +
      '系统与实物可能不一致，请按手中实物勾选，差异由盘点/台账复核修补。</div>';
  }
  var EMPTY = '<div class="text-secondary" style="padding:12px 0;">本药房在架无码可绑——该药可能入库无码，' +
    '请走「处方取药赋码」生成院内码（占位功能）。</div>';

  // 补绑 opts: { wh, state, pharmacy, refKind, refNo, item, excNo?, onDone }
  function open(opts) {
    var R = window.PUL_RX;
    var it = opts.item;
    var cands = R.bindSuggest(opts.wh, opts.pharmacy, it.drugCode);
    var bound = (it.codes || []).filter(function (c) { return c.split !== '是'; }).length;
    var remain = it.qty - bound;
    var body = !cands.length ? EMPTY :
      ruleNote() + '<div class="text-secondary" style="font-size:12.5px;margin-bottom:8px;">还需 <b>' + remain + '</b> 个码，勾选后确认。</div>' +
      '<div class="table-responsive" style="max-height:320px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th></th><th>追溯码</th><th>批次</th><th>效期</th><th>货位</th><th>推荐规则</th></tr></thead>' +
      '<tbody>' + candRows(cands, 'checkbox') + '</tbody></table></div>' +
      '<div style="margin-top:10px;"><label class="text-secondary" style="font-size:12.5px;margin-right:6px;">补绑原因</label>' +
      '<select class="form-select" id="bindReason" style="width:auto;display:inline-block;">' +
      '<option>扫码失败</option><option>码不符</option><option>住院后置</option></select></div>';
    UI.modalShell('rxBind', '手动补绑 · ' + drugName(it.drugCode) + ' · ' + opts.refNo, body,
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      (cands.length ? '<button class="btn btn-primary" id="bindOk">确认绑定</button>' : ''), 860);
    var el = UI.open('rxBind');
    var ok = el.querySelector('#bindOk');
    if (!ok) return;
    ok.addEventListener('click', function () {
      var picks = [];
      el.querySelectorAll('input[name="bindPick"]:checked').forEach(function (cb) { picks.push(cb.value); });
      if (!picks.length) { window.showToast('请勾选要绑定的码'); return; }
      if (picks.length > remain) { window.showToast('只需再绑 ' + remain + ' 个，请减少勾选'); return; }
      var reason = el.querySelector('#bindReason').value;
      var fail = '';
      picks.forEach(function (code) {
        var r = R.bindManual(opts.wh, opts.state, opts.pharmacy, opts.refKind, opts.refNo,
          it.drugCode, code, { type: reason, operator: me(), excNo: opts.excNo });
        if (!r.ok) fail = r.msg;
      });
      if (fail) { window.showToast(fail); return; }
      UI.close('rxBind');
      if (opts.onDone) opts.onDone();
    });
  }

  // 改绑 opts: { wh, state, pharmacy, exc, onDone }
  function rebind(opts) {
    var R = window.PUL_RX;
    var e = opts.exc;
    var cands = R.bindSuggest(opts.wh, opts.pharmacy, e.drugCode);
    var body = '<div class="text-secondary" style="font-size:12.5px;margin-bottom:8px;">原绑定码 <b style="font-family:Consolas,monospace;">' +
      esc(e.code) + '</b> 将回架；单选新码后确认。</div>' +
      (!cands.length ? EMPTY :
      ruleNote() +
      '<div class="table-responsive" style="max-height:320px;overflow-y:auto;"><table class="table table-vcenter card-table">' +
      '<thead><tr><th></th><th>追溯码</th><th>批次</th><th>效期</th><th>货位</th><th>推荐规则</th></tr></thead>' +
      '<tbody>' + candRows(cands, 'radio') + '</tbody></table></div>');
    UI.modalShell('rxRebind', '改绑 · ' + e.excNo, body,
      '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
      (cands.length ? '<button class="btn btn-primary" id="rebindOk">确认改绑</button>' : ''), 860);
    var el = UI.open('rxRebind');
    var ok = el.querySelector('#rebindOk');
    if (!ok) return;
    ok.addEventListener('click', function () {
      var radio = el.querySelector('input[name="bindPick"]:checked');
      if (!radio) { window.showToast('请选择新码'); return; }
      var r = R.rebindExc(opts.wh, opts.state, opts.pharmacy, e.excNo, radio.value, me());
      if (!r.ok) { window.showToast(r.msg); return; }
      UI.close('rxRebind');
      if (opts.onDone) opts.onDone();
    });
  }

  window.RxBind = { open: open, rebind: rebind };
})();
