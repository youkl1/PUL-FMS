/**
 * drug-sync.js — 药品字典同步弹窗：HIS 药品目录导入 + 追溯平台标识码更新
 * 由 drug.js 注入当前主表状态与渲染函数，避免同步流程与字典维护互相膨胀。
 */
(function () {
  'use strict';

  window.PUL_DRUG_SYNC = function (ctx) {
    var D = ctx.D, UI = ctx.UI, esc = ctx.esc, S = ctx.S;
    var warehouses = ctx.warehouses, save = ctx.save, renderAll = ctx.renderAll, nowText = ctx.nowText;

    // 模拟 HIS 药品目录：hit = 与本库房的匹配状态（new 新增 / update 已有更新 / same 无变化）
    var HIS_CATALOG = [
      { hisCode: 'HIS-A001', drugName: '阿莫西林胶囊', formSpec: '0.25g×24粒', maker: '珠海联邦制药股份有限公司', approval: '国药准字H44021351', category: '西药', baseUnit: '盒', idcode: '8477221', level: 1, packSpec: '盒24粒', price: 12.50 },
      { hisCode: 'HIS-A002', drugName: '布洛芬缓释胶囊', formSpec: '0.3g×20粒', maker: '中美天津史克制药有限公司', approval: '国药准字H10900089', category: '西药', baseUnit: '盒', idcode: '8491357', level: 1, packSpec: '盒20粒', price: 16.80 },
      { hisCode: 'HIS-B107', drugName: '依姆多', formSpec: '60mg', maker: '华益药业科技(安徽)有限公司', approval: '国药准字H20030418', category: '西药', baseUnit: '盒', matchCode: 'YP010245', price: 46.00 },
      { hisCode: 'HIS-B122', drugName: '加罗新', formSpec: '100ml:盐酸替罗非班5mg', maker: '四川科伦药业股份有限公司', approval: '国药准字H20203013', category: '西药', baseUnit: '瓶', matchCode: 'YP010388', price: 320.00 }
    ];
    function hisHit(item, wh) {
      if (!item.matchCode) return 'new';
      var d = D.drugOf(S, item.matchCode);
      if (!d || d.warehouse !== wh) return 'new';
      return (d.price !== item.price || d.formSpec !== item.formSpec) ? 'update' : 'same';
    }
    function openHisImport() {
      var whOpts = warehouses().map(function (o) { return '<option>' + o + '</option>'; }).join('');
      var rowsHtml = HIS_CATALOG.map(function (it, i) {
        return '<tr data-his-row="' + i + '">' +
          '<td><input type="checkbox" class="form-check-input his-check" data-i="' + i + '" checked></td>' +
          '<td class="text-secondary">' + it.hisCode + '</td>' +
          '<td><b>' + it.drugName + '</b></td><td>' + it.formSpec + '</td>' +
          '<td>' + it.maker + '</td>' +
          '<td>' + (it.price ? '¥' + it.price.toFixed(2) : '—') + '</td>' +
          '<td class="his-hit" data-hit-cell="' + i + '"></td></tr>';
      }).join('');
      UI.modalShell('hisImport', 'HIS 药品目录导入',
        '<div class="mb-3 d-flex align-items-center" style="gap:10px;">' +
        '<label class="form-label" style="margin:0;">导入到库房</label>' +
        '<select class="form-select" id="hiWh" style="width:150px;">' + whOpts + '</select>' +
        '<span class="text-secondary" style="font-size:12px;">按标识码/编码匹配：已存在则更新，可重复导入（幂等）</span></div>' +
        '<div class="table-responsive" style="max-height:300px;overflow:auto;"><table class="table table-vcenter card-table">' +
        '<thead><tr><th style="width:34px;"></th><th>HIS编码</th><th>通用名</th><th>制剂规格</th><th>生产企业</th><th>产品价格</th><th>匹配结果</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table></div>',
        '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
        '<button class="btn btn-primary" id="hiOk">执行导入</button>', 860);
      var el = UI.open('hisImport');
      function refreshHits() {
        var wh = el.querySelector('#hiWh').value;
        HIS_CATALOG.forEach(function (it, i) {
          var hit = hisHit(it, wh);
          var cell = el.querySelector('[data-hit-cell="' + i + '"]');
          cell.innerHTML = hit === 'new' ? '<span class="badge bg-blue-lt">新增建档</span>'
            : hit === 'update' ? '<span class="badge bg-orange-lt">已有·将更新</span>'
            : '<span class="badge bg-secondary-lt">无变化</span>';
        });
      }
      el.querySelector('#hiWh').addEventListener('change', refreshHits);
      refreshHits();
      el.querySelector('#hiOk').addEventListener('click', function () {
        var wh = el.querySelector('#hiWh').value;
        var added = 0, updated = 0, skipped = 0;
        Array.prototype.forEach.call(el.querySelectorAll('.his-check:checked'), function (cb) {
          var it = HIS_CATALOG[+cb.getAttribute('data-i')];
          var hit = hisHit(it, wh);
          if (hit === 'same') { skipped++; return; }
          if (hit === 'update') {
            var d0 = D.drugOf(S, it.matchCode);
            d0.price = it.price; d0.formSpec = it.formSpec; d0.maker = it.maker; d0.approval = it.approval;
            D.normalizeDrug(d0); d0.lastUpdateTime = nowText();
            updated++; return;
          }
          var code = 'YP' + String(Date.now()).slice(-6) + added;
          var nd = { drugCode: code, drugName: it.drugName, formSpec: it.formSpec, maker: it.maker,
            approval: it.approval, category: it.category, baseUnit: it.baseUnit, units: [{ u: it.baseUnit, eq: 1 }],
            minUnit: null, ipUnpack: '否', opUnpack: '否', price: it.price, warehouse: wh, status: '待审核' };
          D.normalizeDrug(nd); nd.lastUpdateTime = nowText(); S.drugs.unshift(nd);
          if (it.idcode) S.idcodes.push({ idcode: it.idcode, drugCode: code, level: it.level || 1,
            packSpec: it.packSpec || '-', packUnit: D.parsePackUnit(it.packSpec), status: '启用' });
          added++;
        });
        save(); UI.close('hisImport'); renderAll();
        window.showToast('HIS 导入完成：新增 ' + added + ' 条（待审核），更新 ' + updated + ' 条，无变化跳过 ' + skipped + ' 条');
      });
    }

    // 模拟追溯平台下发的对照包：hit = new 新增 / same 已存在跳过 / nomatch 药品不在本字典
    var IDC_FEED = [
      { idcode: '8461941', drugName: '唯可来', level: 2, packSpec: '箱60盒', packUnit: '箱', matchDrug: 'YP010401' },
      { idcode: '8130780', drugName: '复方氨基酸注射液(3AA)', level: 1, packSpec: '瓶250ml', packUnit: '瓶', matchDrug: 'YP010477' },
      { idcode: '8414784', drugName: '加罗新', level: 1, packSpec: '箱60瓶', packUnit: '箱', matchDrug: 'YP010388' },
      { idcode: '8499100', drugName: '盐酸二甲双胍缓释片', level: 1, packSpec: '盒30片', packUnit: '盒', matchDrug: '' }
    ];
    function idcHit(item) {
      if (S.idcodes.some(function (c) { return c.idcode === item.idcode; })) return 'same';
      if (!item.matchDrug || !D.drugOf(S, item.matchDrug)) return 'nomatch';
      return 'new';
    }
    function openUpdIc() {
      var hitBadge = function (h) {
        return h === 'new' ? '<span class="badge bg-blue-lt">新增挂接</span>'
          : h === 'same' ? '<span class="badge bg-secondary-lt">已存在·跳过</span>'
          : '<span class="badge bg-orange-lt">药品未建档·跳过</span>';
      };
      var rowsHtml = IDC_FEED.map(function (it) {
        var dg = it.matchDrug ? D.drugOf(S, it.matchDrug) : null;
        return '<tr><td><b style="font-family:Consolas,monospace;">' + esc(it.idcode) + '</b></td>' +
          '<td><b>' + esc(it.drugName) + '</b></td><td>' + esc(it.packSpec) + '</td><td>' + esc(it.level) + ' 级</td>' +
          '<td class="text-secondary">' + (dg ? esc(dg.drugName) + '（' + esc(it.matchDrug) + '）' : '—') + '</td>' +
          '<td>' + hitBadge(idcHit(it)) + '</td></tr>';
      }).join('');
      UI.modalShell('updIc', '更新标识码',
        '<div class="text-secondary mb-2" style="font-size:12.5px;">追溯平台下发的标识码对照包：按药品匹配挂入标识码子表；已存在跳过、药品未建档跳过——可重复执行（幂等）。新增挂接状态=启用，立即可参与扫码解析。</div>' +
        '<div class="table-responsive"><table class="table table-vcenter card-table">' +
        '<thead><tr><th>标识码</th><th>平台药品名</th><th>包装规格</th><th>码等级</th><th>匹配本院药品</th><th>处理结果</th></tr></thead>' +
        '<tbody>' + rowsHtml + '</tbody></table></div>',
        '<button class="btn btn-outline-secondary" data-mclose>取消</button>' +
        '<button class="btn btn-primary" id="uiOk">执行更新</button>', 780);
      var el = UI.open('updIc');
      el.querySelector('#uiOk').addEventListener('click', function () {
        var added = 0, skipped = 0, nomatch = 0;
        IDC_FEED.forEach(function (it) {
          var hit = idcHit(it);
          if (hit === 'same') { skipped++; return; }
          if (hit === 'nomatch') { nomatch++; return; }
          S.idcodes.push({ idcode: it.idcode, drugCode: it.matchDrug, level: it.level,
            packSpec: it.packSpec, packUnit: it.packUnit, status: '启用' });
          added++;
        });
        save(); UI.close('updIc'); renderAll();
        window.showToast('标识码更新完成：新增挂接 ' + added + ' 条，已存在跳过 ' + skipped + ' 条，药品未建档跳过 ' + nomatch + ' 条');
      });
    }

    return { openHisImport: openHisImport, openUpdIc: openUpdIc };
  };
})();
