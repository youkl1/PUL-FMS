/**
 * login.js — 客户新版登录流程（2026-09-21 拍板）：
 * ① 账号密码校验 → ② 超级用户选院区 / 非超管自动进入唯一所属院区
 * → ③ 既属库房又属药房的用户先选「库房管理/药房管理」→ ④ 选具体库房/药房
 * 单一授权用户（候选=1 且非超管）直达工作台；行数据按所选上下文自动隔离。
 */
(function () {
  'use strict';

  document.getElementById('brandIcon').innerHTML = window.AppShell.icon('pills', 24);

  var inpAccount = document.getElementById('inpAccount');
  var inpPwd = document.getElementById('inpPwd');
  var step1 = document.getElementById('step1');
  var step2 = document.getElementById('step2');
  var selOrg = document.getElementById('selOrg');
  var selNode = document.getElementById('selNode');
  var modeField = document.getElementById('modeField');
  var pending = null; // { user, cands, mode }

  // ===== 演示账号芯片 =====
  var chipsBox = document.getElementById('demoChips');
  window.PUL.DEMO_ACCOUNTS.forEach(function (d) {
    var chip = document.createElement('span');
    chip.className = 'demo-chip';
    chip.textContent = d.label + ' ' + d.account;
    chip.title = '点击填充账号密码';
    chip.addEventListener('click', function () {
      inpAccount.value = d.account;
      inpPwd.value = d.pwd;
      chipsBox.querySelectorAll('.demo-chip').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      backToStep1();
      setError('');
    });
    chipsBox.appendChild(chip);
  });

  function setError(msg) {
    document.getElementById('loginError').textContent = msg;
  }

  function fail(msg) {
    setError(msg);
    var card = document.querySelector('.card-md');
    card.classList.remove('login-shake');
    void card.offsetWidth;
    card.classList.add('login-shake');
  }

  function backToStep1() {
    pending = null;
    step2.style.display = 'none';
    step1.style.display = 'block';
  }

  // ===== 第二步：院区（超管可选/非超管锁定）→ 模式（双栖用户）→ 具体库房/药房 =====
  function showStep2(u, cands) {
    pending = { user: u, cands: cands, mode: '' };
    var kinds = {};
    cands.forEach(function (c) { kinds[c.kind] = true; });
    var dual = kinds['库房'] && kinds['药房']; // 既属库房又属药房
    document.getElementById('step2Desc').textContent =
      u.name + '（' + window.PUL.userRoleNames(u) + '），本次登录可进入 ' + cands.length + ' 个库房/药房';
    // 院区：超级用户可选全部；非超管锁定其唯一所属院区
    var orgs = [];
    cands.forEach(function (c) { if (orgs.indexOf(c.org) === -1) orgs.push(c.org); });
    selOrg.innerHTML = orgs.map(function (o) { return '<option>' + o + '</option>'; }).join('');
    selOrg.disabled = !u.super;
    document.getElementById('orgHint').textContent = u.super ? '（超级用户可选院区）' : '（按所属院区自动进入）';
    // 模式选择：仅双栖用户出现
    modeField.style.display = dual ? 'block' : 'none';
    if (dual) {
      modeCards.querySelectorAll('.mode-card').forEach(function (b) { b.classList.remove('active'); });
      selNode.innerHTML = '<option value="">请先选择业务模块</option>';
    } else {
      pending.mode = kinds['药房'] ? '药房管理' : '库房管理';
      fillNodes();
    }
    step1.style.display = 'none';
    step2.style.display = 'block';
  }

  var modeCards = document.getElementById('modeCards');
  modeCards.querySelectorAll('.mode-card').forEach(function (btn) {
    btn.addEventListener('click', function () {
      modeCards.querySelectorAll('.mode-card').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      pending.mode = btn.getAttribute('data-mode');
      fillNodes();
    });
  });

  function fillNodes() {
    if (!pending) return;
    var kind = pending.mode === '药房管理' ? '药房' : '库房';
    var list = pending.cands.filter(function (c) {
      return c.org === selOrg.value && (!pending.mode || c.kind === kind);
    });
    document.getElementById('nodeLabel').textContent = pending.mode === '药房管理' ? '药房' : '库房 / 药房';
    selNode.innerHTML = list.map(function (c) {
      return '<option value="' + c.node + '">' + c.node + '（' + c.type + '）</option>';
    }).join('');
  }
  selOrg.addEventListener('change', function () {
    if (pending && pending.mode) fillNodes();
    else if (pending && modeField.style.display === 'none') fillNodes();
  });

  // ===== 写入登录态并进入工作台 =====
  function enter(u, org, warehouse, mode, direct) {
    window.store.update({
      currentUser: {
        account: u.account, name: u.name, roles: u.roles,
        roleName: window.PUL.userRoleNames(u),
        org: org, warehouse: warehouse, mode: mode
      }
    });
    if (window.showToast) {
      window.showToast(direct
        ? '登录成功：' + u.name + '，已进入 ' + org + ' / ' + warehouse
        : '登录成功：' + org + ' / ' + warehouse + (mode ? '（' + mode + '）' : ''));
    }
    setTimeout(function () { window.location.href = 'index.html'; }, 400);
  }

  // ===== 第一步：校验账号 → 分流 =====
  function doLogin() {
    var account = inpAccount.value.trim();
    var pwd = inpPwd.value;
    if (!account) { setError('请输入账号'); return; }
    if (!pwd) { setError('请输入密码'); return; }
    var u = window.PUL.findUser(account);
    if (!u) { fail('账号不存在，请检查输入'); return; }
    if (u.status !== '正常') { fail('该账号已禁用，请联系上级管理员（4.4.4 权限注销）'); return; }
    if (pwd !== '123456') { fail('密码错误（演示密码统一为 123456）'); return; }
    var cands = window.PUL.candidateContexts(u);
    // 直达：非超管且唯一候选节点（无需选模式）
    if (!u.super && cands.length === 1) {
      var c = cands[0];
      enter(u, c.org, c.node, c.kind + '管理', true);
      return;
    }
    if (!cands.length) { fail('该账号未授权任何库房/药房，请联系管理员分配'); return; }
    setError('');
    showStep2(u, cands);
  }

  document.getElementById('btnLogin').addEventListener('click', doLogin);
  document.getElementById('btnEnter').addEventListener('click', function () {
    if (!pending) return;
    if (modeField.style.display !== 'none' && !pending.mode) { fail('请先选择「库房管理」或「药房管理」'); return; }
    if (!selNode.value) { fail('请选择具体库房/药房'); return; }
    enter(pending.user, selOrg.value, selNode.value, pending.mode, false);
  });
  document.getElementById('btnBack').addEventListener('click', backToStep1);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || document.getElementById('introModal').style.display !== 'none') return;
    if (step2.style.display !== 'none') document.getElementById('btnEnter').click();
    else doLogin();
  });

  // 已登录提示
  var state = window.store.load();
  if (state.currentUser && !state.currentUser._demo) {
    setError('当前已登录：' + state.currentUser.name + '（' + (state.currentUser.org || '-') + ' / ' + (state.currentUser.warehouse || '-') + '），可直接换账号重新登录');
  }
})();
