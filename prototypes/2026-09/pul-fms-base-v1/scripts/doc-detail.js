/**
 * doc-detail.js — PulDocDetail 共享单据明细组件（药品清单 / 码详情 / 异常码）
 * 纯视图：输入标准化 model，返回 HTML；bind 只转发事件，不保存、不审核、不读写业务数据
 */
(function () {
  'use strict';
  var esc = window.PchUI.esc;
  var DEFAULT_COLUMNS = {
    drugs: ['seq', 'drugName', 'formSpec', 'maker', 'approval', 'price', 'qty', 'scanQty', 'diff', 'unit', 'amount'],
    codes: ['seq', 'code', 'drugName', 'level', 'parentCode', 'batch', 'prodDate', 'expDate', 'scanQty', 'checkStatus', 'idcode', 'issuer'],
    bad: ['seq', 'code', 'idcode', 'reason', 'time', 'actions']
  };
  var TITLES = {
    seq: '序号', drugCode: '药品编码', drugName: '药品名称', formSpec: '药品规格', packSpec: '包装规格',
    maker: '生产厂家', approval: '批准文号', price: '单价（元）', qty: '数量', scanQty: '扫码总量',
    diff: '差异', unit: '单位', amount: '金额（元）', code: '药品追溯码', level: '码层级',
    parentCode: '父级码', batch: '生产批次', prodDate: '生产日期', expDate: '有效期至',
    checkStatus: '核对状态', idcode: '标识码', issuer: '发码机构', location: '库位',
    expectLoc: '预期货位', split: '拆零', splitQty: '零头', reason: '异常原因', time: '时间', actions: '操作'
  };
  var TABLE_TITLES = { codes: { drugName: '药名通用名', scanQty: '扫码数量' } };
  var REGISTRY = { drugs: {}, codes: {}, bad: {} };
  function allow(table, keys) { keys.forEach(function (key) { REGISTRY[table][key] = true; }); }
  allow('drugs', DEFAULT_COLUMNS.drugs.concat([
    'drugCode', 'packSpec', 'batch', 'prodDate', 'expDate', 'location', 'expectLoc', 'split', 'splitQty', 'actions'
  ]));
  allow('codes', DEFAULT_COLUMNS.codes.concat([
    'drugCode', 'formSpec', 'packSpec', 'maker', 'approval', 'location', 'expectLoc', 'split', 'splitQty', 'unit', 'actions'
  ]));
  allow('bad', DEFAULT_COLUMNS.bad);
  var EMPTY_TEXT = { drugs: '暂无药品', codes: '暂无码明细', bad: '无异常码' };
  var ACTIONS = {
    removeCode: { label: '移除', cls: 'btn btn-sm btn-outline-secondary' },   // 公约 §4.3：码行级统一「移除」，不弹确认
    removeBad: { label: '移除', cls: 'btn btn-sm btn-outline-secondary' },
    editBad: { label: '编辑', cls: 'btn btn-sm btn-primary' },
    maintainBad: { label: '去维护', cls: 'btn btn-sm btn-outline-secondary' },
    goScan: { label: '去扫码录入', cls: 'btn btn-sm btn-outline-secondary' },
    reparse: { label: '重新解析', cls: 'btn btn-sm btn-outline-primary' }
  };

  var DIFF_CLASSES = { full: 'bg-green-lt', short: 'bg-orange-lt', over: 'bg-red-lt' };

  function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  function rowsOf(model, table) { return model && hasOwn(model, table) && model[table] ? model[table] : []; }
  function isEmpty(v) { return v == null || v === ''; }
  function text(v) { return isEmpty(v) || (typeof v === 'number' && !isFinite(v)) ? '—' : esc(v); }
  function money(v) {
    if (isEmpty(v) || (typeof v === 'number' && !isFinite(v))) return '—';
    return typeof v === 'number' ? v.toFixed(2) : esc(v);
  }
  function titleOf(table, key) {
    var overrides = TABLE_TITLES[table];
    if (overrides && hasOwn(overrides, key)) return overrides[key];
    return hasOwn(TITLES, key) ? TITLES[key] : '';
  }

  function actionButtons(actions, table, index) {
    return (actions || []).map(function (action) {
      var key = typeof action === 'string' ? action : action && action.key;
      var disabled = !!(action && typeof action === 'object' && action.disabled === true);
      var def = hasOwn(ACTIONS, key) ? ACTIONS[key] : null;
      if (!def) throw new Error('PulDocDetail: 未知操作 "' + key + '"');
      return '<button type="button" class="' + def.cls + '" data-dd-action="' + key +
        '" data-dd-table="' + table + '" data-dd-index="' + (index == null ? '' : index) + '"' +
        (disabled ? ' disabled' : '') + '>' + def.label + '</button>';
    }).join('');
  }

  function cell(table, key, row, index) {
    if (key === 'seq') return '<td>' + (index + 1) + '</td>';
    if (key === 'price' || key === 'amount') return '<td>' + money(row[key]) + '</td>';
    if (key === 'qty') return '<td><b>' + text(row.qty) + '</b></td>';
    if (key === 'scanQty') {
      var scan = isEmpty(row.scanText) ? row.scanQty : row.scanText;
      var html = '<td><b>' + text(scan) + '</b>';
      if (typeof row.progress === 'number' && isFinite(row.progress) && row.progress >= 0 && row.progress <= 100) {
        html += '<div class="progress" style="height:6px;margin-top:4px;max-width:220px;">' +
          '<div class="progress-bar" style="width:' + row.progress + '%;"></div></div>';
      }
      return html + '</td>';
    }
    if (key === 'diff') {
      if (!row.diff || isEmpty(row.diff.text)) return '<td>—</td>';
      var diffCls = hasOwn(DIFF_CLASSES, row.diff.kind) ? DIFF_CLASSES[row.diff.kind] : 'bg-secondary-lt';
      return '<td><span class="badge ' + diffCls + '">' + text(row.diff.text) + '</span></td>';
    }
    if (key === 'checkStatus') {
      if (!row.status || isEmpty(row.status.text)) return '<td>—</td>';
      return '<td><span class="' + (row.status.kind === 'done' ? 'text-success' : 'text-secondary') + '">' +
        text(row.status.text) + '</span></td>';
    }
    if (key === 'actions') {
      var buttons = actionButtons(row.actions, table, index);
      return '<td>' + (buttons ? '<div class="btn-list">' + buttons + '</div>' : '—') + '</td>';
    }
    if (key === 'code') return '<td style="font-family:Consolas,monospace;font-size:12.5px;">' + text(row.code) + '</td>';
    if (key === 'parentCode' || key === 'idcode') {
      return '<td class="text-secondary" style="font-family:Consolas,monospace;font-size:12px;">' + text(row[key]) + '</td>';
    }
    if (key === 'maker' || key === 'approval' || key === 'time' || key === 'issuer') {
      return '<td class="text-secondary">' + text(row[key]) + '</td>';
    }
    if (key === 'reason') return '<td class="text-danger">' + text(row.reason) + '</td>';
    if (key === 'drugName') return '<td><b>' + text(row.drugName) + '</b></td>';
    return '<td>' + text(row[key]) + '</td>';
  }

  function badBar(rows, options) {
    var panelActions = options.panelActions || [];
    if (!options.note && !panelActions.length) return '';
    return '<div class="pch-tabbar"><span class="pch-progress-txt">异常码 <b class="text-danger">' + rows.length + '</b> 个' +
      (options.note ? ' · ' + esc(options.note) : '') + '</span>' +
      (panelActions.length ? '<div class="ms-auto btn-list">' + actionButtons(panelActions, 'bad', null) + '</div>' : '') + '</div>';
  }

  function renderTable(table, model, options) {
    options = options || {};
    var rows = rowsOf(model, table);
    var columns = options.columns || DEFAULT_COLUMNS[table];
    var extras = options.extraColumns || [];
    if (!columns.length && !extras.length) throw new Error('PulDocDetail: ' + table + ' 至少保留一个公共列或扩展列');
    columns.forEach(function (key) {
      if (!hasOwn(REGISTRY[table], key)) throw new Error('PulDocDetail: ' + table + ' 未知列 "' + key + '"');
    });
    extras.forEach(function (col) {
      if (!col || typeof col.cell !== 'function') throw new Error('PulDocDetail: ' + table + ' 扩展列 "' + (col && col.key) + '" 缺少 cell 函数');
    });
    var head = columns.map(function (key) { return '<th>' + esc(titleOf(table, key)) + '</th>'; }).join('') +
      extras.map(function (col) { return '<th>' + esc(col.title) + '</th>'; }).join('');
    var body;
    if (!rows.length) {
      var emptyText = options.emptyText == null ? EMPTY_TEXT[table] : options.emptyText;
      body = '<tr><td colspan="' + (columns.length + extras.length) + '" class="text-center text-secondary" style="padding:28px;">' +
        esc(emptyText) + '</td></tr>';
    } else {
      body = rows.map(function (row, index) {
        return '<tr' + (row.className ? ' class="' + esc(row.className) + '"' : '') + '>' +
          columns.map(function (key) { return cell(table, key, row, index); }).join('') +
          extras.map(function (col) {
            var value = col.cell(row, index);
            return '<td>' + (value == null ? '' : value) + '</td>';
          }).join('') + '</tr>';
      }).join('');
    }
    return (table === 'bad' ? badBar(rows, options) : '') +
      '<div class="table-responsive"><table class="table table-vcenter card-table">' +
      '<thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }
  function renderDrugs(model, options) { return renderTable('drugs', model, options); }
  function renderCodes(model, options) { return renderTable('codes', model, options); }
  function renderBad(model, options) { return renderTable('bad', model, options); }

  function countOf(model, table, options) {
    var mode = (options.counts && hasOwn(options.counts, table)) ? options.counts[table] : 'rows';
    var rows = rowsOf(model, table);
    if (mode === 'rows') return rows.length;
    if (mode === 'scanQty') {
      var total = 0;
      rows.forEach(function (row) {
        if (typeof row.scanQty === 'number' && isFinite(row.scanQty)) total += row.scanQty;
      });
      return Math.round(total * 100) / 100;   // 与页面 fmtN 同口径两位取整，避免拆零循环小数显长浮点
    }
    throw new Error('PulDocDetail: ' + table + ' 未知计数模式 "' + mode + '"');
  }

  function renderTabs(model, options) {
    model = model || {}; options = options || {};
    var tabs = options.tabs || ['drugs', 'codes', 'bad'];
    if (!tabs.length) throw new Error('PulDocDetail: tabs 至少包含一个页签');
    // 页签显示名覆盖（2026-10-18 拍板方案①）：仅允许 drugs/codes/bad 三 key、只覆盖显示名，esc 转义，计数括号仍组件生成
    var names = { drugs: '药品清单', codes: '码详情', bad: '异常码' };
    if (options.names) Object.keys(options.names).forEach(function (key) {
      if (!hasOwn(names, key)) throw new Error('PulDocDetail: names 未知页签 "' + key + '"');
      names[key] = esc(options.names[key]);
    });
    var active = tabs.indexOf(model.activeTab) > -1 ? model.activeTab : tabs[0];
    var counts = {};
    tabs.forEach(function (key) {
      if (!hasOwn(DEFAULT_COLUMNS, key)) throw new Error('PulDocDetail: 未知页签 "' + key + '"');
      counts[key] = countOf(model, key, options);
    });
    var tabsHtml = '<div class="pch-tabs">' + tabs.map(function (key) {
      var count = key === 'bad' && counts[key] !== 0 ? '<b class="text-danger">' + counts[key] + '</b>' : counts[key];
      return '<button type="button" class="pch-tab' + (key === active ? ' active' : '') + '" data-dd-tab="' + key + '">' +
        names[key] + '（' + count + '）</button>';
    }).join('') + '</div>';
    var body;
    if (model.empty === true) {
      var emptyText = options.emptyText == null ? '点选上方单据行查看明细' : options.emptyText;
      body = '<div class="text-center text-secondary" style="padding:36px;">' + esc(emptyText) + '</div>';
    } else if (active === 'drugs') body = renderDrugs(model, options.drugs);
    else if (active === 'codes') body = renderCodes(model, options.codes);
    else if (active === 'bad') body = renderBad(model, options.bad);
    else body = '';
    var title = options.title == null ? '单据明细' : options.title;
    var footer = options.footerHtml ? '<div class="card-footer' + (options.footerClass ? ' ' + esc(options.footerClass) : '') + '">' +
      options.footerHtml + '</div>' : '';
    return '<div class="card"><div class="card-header"><b>' + esc(title) + '</b>' + (options.metaHtml || '') + '</div>' +
      tabsHtml + '<div class="pch-tab-panel">' + body + '</div>' + footer + '</div>';
  }

  function bind(root, handlers) {
    handlers = handlers || {};
    root.querySelectorAll('[data-dd-tab]').forEach(function (el) {
      el.addEventListener('click', function () {
        var key = el.getAttribute('data-dd-tab');
        if (!hasOwn(handlers, 'onTab') || typeof handlers.onTab !== 'function') throw new Error('PulDocDetail: 缺少页签回调 onTab（' + key + '）');
        handlers.onTab(key);
      });
    });
    root.querySelectorAll('[data-dd-action]').forEach(function (el) {
      el.addEventListener('click', function (event) {
        if (el.disabled || el.getAttribute('disabled') != null) return;
        var action = el.getAttribute('data-dd-action');
        var table = el.getAttribute('data-dd-table');
        var rawIndex = el.getAttribute('data-dd-index');
        var index = rawIndex == null || rawIndex === '' ? null : Number(rawIndex);
        var callback = handlers.actions && hasOwn(handlers.actions, action) ? handlers.actions[action] : null;
        if (typeof callback !== 'function') throw new Error('PulDocDetail: 缺少操作回调 "' + action + '"');
        var row = index == null ? null : rowsOf(handlers.model, table)[index];
        callback({ action: action, table: table, index: index, row: row, event: event });
      });
    });
  }

  window.PulDocDetail = {
    renderTabs: renderTabs, renderDrugs: renderDrugs, renderCodes: renderCodes, renderBad: renderBad, bind: bind
  };
})();
