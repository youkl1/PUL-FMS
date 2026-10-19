const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('❌ 缺少 deploy/config.json，请参考 deploy/config.json.example 创建');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const PROTOTYPES_DIR = path.join(__dirname, '..', 'prototypes');
const INDEX_PATH = path.join(__dirname, 'index.html');
const BUSINESS_DIR = path.join(__dirname, 'business');

// 上传排除规则：截图、浏览器 profile、编辑器配置、临时审计产物等本地产物不上传（本地文件保留，不删除）
const EXCLUDE_SEGMENTS = ['.claude', '.git', 'node_modules'];
function isExcluded(relPath) {
  return relPath.split('/').some(seg =>
    EXCLUDE_SEGMENTS.includes(seg) || seg.startsWith('_shots') || seg.startsWith('_t-')
  );
}

const BUSINESS_SLUG_MAP = {
  'PUL-FMS 药品精细化管理系统 · 基础平台骨架': 'pul-fms-base',
  '未分类': 'uncategorized',
};

function slugifyBusinessCategory(name) {
  return BUSINESS_SLUG_MAP[name] || 'uncategorized';
}

function md5File(filePath) {
  return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
}

function parseMeta(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const stat = fs.statSync(filePath);
  const headMatch = content.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const head = headMatch ? headMatch[1] : '';

  const getMeta = (name) => {
    const m = head.match(new RegExp(`<meta[^>]+name="${name}"[^>]+content="([^"]*)"`, 'i'));
    return m ? m[1].trim() : '';
  };

  const titleMatch = head.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : path.basename(filePath, '.html');

  let category = getMeta('prototype-category').toLowerCase();
  if (!['mobile', 'desktop'].includes(category)) {
    // 文件名兜底判断
    const base = path.basename(filePath).toLowerCase();
    if (base.includes('-mobile-') || base.includes('-m-') || base.includes('_mobile')) {
      category = 'mobile';
    } else {
      category = 'desktop';
    }
  }

  let desc = getMeta('prototype-desc');
  if (!desc) desc = title;

  // Extract business category and description
  const businessCategory = getMeta('business-category') || getMeta('prototype-business-class') || '';
  const businessCategoryDesc = getMeta('business-category-desc') || getMeta('prototype-business-class-desc') || '';

  return { title, category, desc, businessCategory, businessCategoryDesc, updatedAt: stat.mtime };
}

function formatMonth(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function formatDate(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getCurrentMonthFolder() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function ensureMonthlyFolder(dir) {
  const monthFolder = getCurrentMonthFolder();
  const monthPath = path.join(dir, monthFolder);
  if (!fs.existsSync(monthPath)) {
    fs.mkdirSync(monthPath, { recursive: true });
    console.log(`  创建月份文件夹: prototypes/${monthFolder}/`);
  }
  return monthFolder;
}

function moveLooseHtmlToMonth(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const looseHtml = entries.filter(e => e.isFile() && e.name.endsWith('.html'));
  if (looseHtml.length === 0) return;

  const monthFolder = ensureMonthlyFolder(dir);
  for (const entry of looseHtml) {
    const src = path.join(dir, entry.name);
    const dst = path.join(dir, monthFolder, entry.name);
    fs.renameSync(src, dst);
    console.log(`  自动归档: ${entry.name} -> prototypes/${monthFolder}/`);
  }
}

function moveLoosePrototypeFoldersToMonth(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const monthFolder = getCurrentMonthFolder();
  const monthPath = path.join(dir, monthFolder);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // 跳过月份文件夹和共享资源目录
    if (/^\d{4}-\d{2}$/.test(entry.name)) continue;
    if (['shared', 'styles', 'scripts'].includes(entry.name)) continue;

    const src = path.join(dir, entry.name);
    // 只有包含 index.html 的目录才视为拆分后的原型文件夹
    const hasIndex = fs.existsSync(path.join(src, 'index.html'));
    if (!hasIndex) continue;

    if (!fs.existsSync(monthPath)) {
      fs.mkdirSync(monthPath, { recursive: true });
      console.log(`  创建月份文件夹: prototypes/${monthFolder}/`);
    }
    const dst = path.join(monthPath, entry.name);
    if (fs.existsSync(dst)) {
      console.warn(`  ⚠️ 目标已存在，跳过归档: ${entry.name}`);
      continue;
    }
    fs.renameSync(src, dst);
    console.log(`  自动归档: ${entry.name}/ -> prototypes/${monthFolder}/${entry.name}/`);
  }
}

function parseMonthFromFolder(relPath) {
  const firstSegment = relPath.split('/')[0];
  const match = firstSegment.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  if (month < 1 || month > 12) return null;
  return `${year}年${month}月`;
}

function collectHtmlFiles(dir, base = '') {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.posix.join(base, entry.name).replace(/\\/g, '/');
    if (isExcluded(rel)) continue;
    // shared/ 是共享资源目录（tabler、图纸库等），只上传、不进原型门户索引，避免图纸页混入原型列表
    if (entry.isDirectory() && rel === 'shared') continue;
    const local = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectHtmlFiles(local, rel));
    } else if (entry.name.endsWith('.html')) {
      result.push({ local, rel });
    }
  }
  return result;
}

function generateIndex(items, businessGroups) {
  const totalDesktop = items.filter(i => i.category === 'desktop').length;
  const totalMobile = items.filter(i => i.category === 'mobile').length;

  const businessCards = businessGroups.map(group => {
    const desktopCount = group.items.filter(i => i.category === 'desktop').length;
    const mobileCount = group.items.filter(i => i.category === 'mobile').length;
    const latestUpdate = group.items.reduce((max, i) => i.updatedAt > max ? i.updatedAt : max, group.items[0]?.updatedAt || new Date());
    return {
      name: group.name,
      desc: group.desc || '该分类下暂无描述',
      slug: group.slug,
      count: group.items.length,
      desktopCount,
      mobileCount,
      lastUpdate: formatDate(latestUpdate),
    };
  });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PUL-FMS 原型库</title>
  <style>
    :root {
      --bg: #030712;
      --bg-elevated: #0b1221;
      --surface: rgba(17, 25, 40, 0.78);
      --surface-hover: rgba(23, 33, 54, 0.86);
      --border: rgba(148, 163, 184, 0.12);
      --border-strong: rgba(56, 189, 248, 0.28);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --cyan: #22d3ee;
      --cyan-glow: rgba(34, 211, 238, 0.35);
      --violet: #8b5cf6;
      --violet-glow: rgba(139, 92, 246, 0.35);
      --amber: #f59e0b;
      --amber-glow: rgba(245, 158, 11, 0.35);
      --desktop: #38bdf8;
      --mobile: #34d399;
      --shadow-card: 0 8px 32px rgba(2, 8, 23, 0.45);
      --shadow-glow: 0 0 40px rgba(34, 211, 238, 0.10);
      --radius: 16px;
      --radius-sm: 10px;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html { scroll-behavior: smooth; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    /* 顶部指挥台 */
    .site-header {
      position: relative;
      background: radial-gradient(ellipse at 50% 0%, rgba(56, 189, 248, 0.18), transparent 55%),
                  linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg) 100%);
      color: #fff;
      overflow: hidden;
      border-bottom: 1px solid var(--border);
    }

    .site-header::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(34, 211, 238, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(34, 211, 238, 0.05) 1px, transparent 1px);
      background-size: 40px 40px;
      mask-image: linear-gradient(to bottom, rgba(0,0,0,0.65), transparent 75%);
      -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0.65), transparent 75%);
      pointer-events: none;
      animation: gridMove 24s linear infinite;
    }

    @keyframes gridMove {
      0% { transform: perspective(500px) translateY(0); }
      100% { transform: perspective(500px) translateY(40px); }
    }

    .glow-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.35;
      pointer-events: none;
    }
    .glow-orb.cyan { top: -80px; right: 10%; width: 320px; height: 320px; background: var(--cyan); }
    .glow-orb.violet { bottom: -60px; left: 5%; width: 260px; height: 260px; background: var(--violet); }

    .header-inner {
      position: relative;
      z-index: 2;
      max-width: 1280px;
      margin: 0 auto;
      padding: 64px 24px 48px;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 32px;
    }

    .header-main { flex: 1; min-width: 0; }

    .header-label {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--cyan);
      margin-bottom: 14px;
      text-shadow: 0 0 18px var(--cyan-glow);
    }

    .header-label .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--cyan);
      box-shadow: 0 0 12px var(--cyan-glow);
      animation: pulse 2.4s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.65; transform: scale(1.15); }
    }

    h1 {
      font-size: clamp(36px, 5.6vw, 56px);
      font-weight: 800;
      letter-spacing: -0.04em;
      line-height: 1.08;
      margin-bottom: 12px;
      background: linear-gradient(90deg, #fff 0%, #bae6fd 55%, var(--cyan) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 16px;
      max-width: 540px;
    }

    .stats {
      display: flex;
      gap: 14px;
      flex-shrink: 0;
    }

    .stat {
      text-align: left;
      min-width: 92px;
      padding: 16px 18px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: var(--shadow-card);
      position: relative;
      overflow: hidden;
      transition: transform 200ms ease-out, border-color 200ms ease-out;
    }

    .stat::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--cyan), transparent);
      opacity: 0.6;
    }

    .stat:hover { transform: translateY(-3px); border-color: var(--border-strong); }

    .stat-value {
      font-size: 28px;
      font-weight: 800;
      line-height: 1;
      color: #fff;
      font-variant-numeric: tabular-nums;
    }

    .stat-value.accent { color: var(--amber); text-shadow: 0 0 18px var(--amber-glow); }

    .stat-label {
      font-size: 11px;
      color: var(--text-dim);
      margin-top: 6px;
      font-weight: 600;
      letter-spacing: 0.05em;
    }

    /* 业务分类 */
    .business-section {
      max-width: 1280px;
      margin: 0 auto;
      padding: 48px 24px 64px;
    }

    .section-header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 28px;
    }

    .section-title {
      font-size: 22px;
      font-weight: 700;
      color: var(--text);
      letter-spacing: -0.02em;
    }

    .section-title span {
      color: var(--cyan);
      text-shadow: 0 0 16px var(--cyan-glow);
    }

    .section-desc {
      font-size: 13px;
      color: var(--text-dim);
      margin-top: 6px;
    }

    .business-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }

    .business-card {
      position: relative;
      display: flex;
      flex-direction: column;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      text-decoration: none;
      color: var(--text);
      box-shadow: var(--shadow-card);
      overflow: hidden;
      transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), border-color 220ms ease-out, box-shadow 220ms ease-out;
    }

    .business-card::before {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(600px circle at var(--mx, 50%) var(--my, 50%), rgba(34, 211, 238, 0.10), transparent 40%);
      opacity: 0;
      transition: opacity 220ms ease-out;
      pointer-events: none;
    }

    .business-card:hover {
      transform: translateY(-4px);
      border-color: var(--border-strong);
      box-shadow: var(--shadow-card), var(--shadow-glow);
    }

    .business-card:hover::before { opacity: 1; }

    .business-card-accent {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--cyan), var(--violet));
      opacity: 0.8;
    }

    .business-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }

    .business-card-title {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      letter-spacing: -0.01em;
    }

    .business-card-count {
      font-size: 13px;
      font-weight: 800;
      color: var(--cyan);
      background: rgba(34, 211, 238, 0.10);
      border: 1px solid rgba(34, 211, 238, 0.22);
      padding: 4px 10px;
      border-radius: 999px;
      box-shadow: 0 0 16px rgba(34, 211, 238, 0.12);
    }

    .business-card-desc {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.6;
      margin-bottom: 20px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .business-card-meta {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: var(--text-dim);
      margin-top: auto;
    }

    .business-card-meta span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      background: rgba(255,255,255,0.03);
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.04);
    }

    .business-card-arrow {
      position: absolute;
      bottom: 20px;
      right: 20px;
      width: 18px;
      height: 18px;
      color: var(--text-dim);
      transition: transform 180ms ease-out, color 180ms ease-out;
    }

    .business-card:hover .business-card-arrow {
      color: var(--cyan);
      transform: translate(3px, -3px);
    }

    footer {
      text-align: center;
      padding: 28px 24px 40px;
      font-size: 12px;
      color: var(--text-dim);
      border-top: 1px solid var(--border);
      background: var(--bg-elevated);
    }

    @media (max-width: 1024px) {
      .business-grid { grid-template-columns: repeat(2, 1fr); }
      .header-inner { flex-direction: column; align-items: flex-start; }
      .stats { align-self: flex-start; }
    }

    @media (max-width: 720px) {
      .header-inner { padding: 48px 16px 36px; }
      h1 { font-size: 34px; }
      .stats { flex-wrap: wrap; }
      .business-section { padding: 36px 16px 48px; }
      .business-grid { grid-template-columns: 1fr; }
      .section-header { flex-direction: column; align-items: flex-start; }
    }

    @media (prefers-reduced-motion: reduce) {
      .site-header::before, .header-label .dot { animation: none; }
      .business-card, .business-card::before, .business-card-arrow, .stat { transition: none; }
    }
  </style>
</head>
<body>
  <header class="site-header">
    <div class="glow-orb cyan" aria-hidden="true"></div>
    <div class="glow-orb violet" aria-hidden="true"></div>
    <div class="header-inner">
      <div class="header-main">
        <div class="header-label"><span class="dot" aria-hidden="true"></span>Prototype Library</div>
        <h1>PUL-FMS 原型库</h1>
        <p class="subtitle">高保真交互原型 · 按月归档 · 即点即看</p>
      </div>
      <div class="stats" role="group" aria-label="原型统计">
        <div class="stat"><div class="stat-value">${items.length}</div><div class="stat-label">总原型数</div></div>
        <div class="stat"><div class="stat-value accent">${totalDesktop}</div><div class="stat-label">电脑端</div></div>
        <div class="stat"><div class="stat-value accent">${totalMobile}</div><div class="stat-label">移动端</div></div>
      </div>
    </div>
  </header>

  <main>
    <section class="business-section" aria-label="业务分类">
      <div class="section-header">
        <div>
          <h2 class="section-title">业务分类 <span>Business Categories</span></h2>
          <p class="section-desc">按业务线浏览全部原型，点击卡片进入分类详情</p>
        </div>
      </div>
      <div class="business-grid" id="businessGrid">
        ${businessCards.map((bc, idx) => `
        <a class="business-card" href="business/${bc.slug}/" style="--delay: ${idx * 40}ms">
          <div class="business-card-accent"></div>
          <div class="business-card-header">
            <div class="business-card-title">${escapeHtml(bc.name)}</div>
            <div class="business-card-count">${bc.count}</div>
          </div>
          <div class="business-card-desc">${escapeHtml(bc.desc)}</div>
          <div class="business-card-meta">
            <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg> 电脑端 ${bc.desktopCount}</span>
            <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg> 移动端 ${bc.mobileCount}</span>
            <span style="opacity:.7"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${bc.lastUpdate}</span>
          </div>
          <svg class="business-card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </a>`).join('')}
      </div>
    </section>
  </main>

  <footer>
    部署于 /opt/pul-fms · nginx 静态站点 · 自动同步
  </footer>

  <script>
    // 卡片光晕跟随鼠标
    document.querySelectorAll('.business-card').forEach(function(card) {
      card.addEventListener('mousemove', function(e) {
        var rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - rect.left) + 'px');
        card.style.setProperty('--my', (e.clientY - rect.top) + 'px');
      });
    });

    // 交错入场
    (function() {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var cards = document.querySelectorAll('.business-card');
      cards.forEach(function(card, i) {
        card.style.opacity = '0';
        card.style.transform = 'translateY(16px)';
        setTimeout(function() {
          card.style.transition = 'opacity 400ms ease-out, transform 400ms cubic-bezier(0.16, 1, 0.3, 1)';
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        }, 80 + i * 60);
      });
    })();
  </script>
</body>
</html>
`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadHiddenFiles(dir) {
  const hiddenPath = path.join(dir, '.hidden.json');
  if (!fs.existsSync(hiddenPath)) return new Set();
  try {
    const list = JSON.parse(fs.readFileSync(hiddenPath, 'utf8'));
    return new Set(Array.isArray(list) ? list : []);
  } catch (err) {
    console.warn(`  读取 .hidden.json 失败: ${err.message}`);
    return new Set();
  }
}

function generateBusinessPage(group) {
  const data = [...group.items]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(item => ({
      ...item,
      month: item.monthOverride || formatMonth(item.updatedAt),
      date: formatDate(item.updatedAt),
    }));

  const desktopCount = data.filter(i => i.category === 'desktop').length;
  const mobileCount = data.filter(i => i.category === 'mobile').length;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(group.name)} - PUL-FMS 原型库</title>
  <style>
    :root {
      --bg: #030712;
      --bg-elevated: #0b1221;
      --surface: rgba(17, 25, 40, 0.78);
      --surface-hover: rgba(23, 33, 54, 0.86);
      --border: rgba(148, 163, 184, 0.12);
      --border-strong: rgba(56, 189, 248, 0.28);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --cyan: #22d3ee;
      --cyan-glow: rgba(34, 211, 238, 0.35);
      --violet: #8b5cf6;
      --violet-glow: rgba(139, 92, 246, 0.35);
      --amber: #f59e0b;
      --amber-glow: rgba(245, 158, 11, 0.35);
      --desktop: #38bdf8;
      --mobile: #34d399;
      --shadow-card: 0 8px 32px rgba(2, 8, 23, 0.45);
      --shadow-glow: 0 0 40px rgba(34, 211, 238, 0.10);
      --radius: 16px;
      --radius-sm: 10px;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }

    .site-header {
      position: relative;
      background: radial-gradient(ellipse at 50% 0%, rgba(56, 189, 248, 0.14), transparent 55%),
                  linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg) 100%);
      color: #fff;
      overflow: hidden;
      border-bottom: 1px solid var(--border);
    }

    .site-header::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(34, 211, 238, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(34, 211, 238, 0.04) 1px, transparent 1px);
      background-size: 40px 40px;
      mask-image: linear-gradient(to bottom, rgba(0,0,0,0.55), transparent 80%);
      -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0.55), transparent 80%);
      pointer-events: none;
    }

    .glow-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.3;
      pointer-events: none;
    }
    .glow-orb.cyan { top: -70px; right: 8%; width: 280px; height: 280px; background: var(--cyan); }

    .header-inner {
      position: relative;
      z-index: 2;
      max-width: 1280px;
      margin: 0 auto;
      padding: 40px 24px 36px;
    }

    .breadcrumb {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-muted);
      text-decoration: none;
      margin-bottom: 16px;
      transition: color 160ms ease-out;
    }

    .breadcrumb:hover { color: var(--cyan); }

    h1 {
      font-size: clamp(28px, 4.2vw, 42px);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.12;
      margin-bottom: 10px;
      background: linear-gradient(90deg, #fff 0%, #bae6fd 60%, var(--cyan) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 15px;
      max-width: 640px;
    }

    .header-stats {
      display: flex;
      gap: 14px;
      margin-top: 22px;
    }

    .header-stat {
      min-width: 88px;
      padding: 12px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: var(--shadow-card);
      position: relative;
      overflow: hidden;
    }

    .header-stat::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--cyan), transparent);
      opacity: 0.6;
    }

    .header-stat-value {
      font-size: 22px;
      font-weight: 800;
      line-height: 1;
      color: #fff;
      font-variant-numeric: tabular-nums;
    }

    .header-stat-value.accent { color: var(--amber); text-shadow: 0 0 14px var(--amber-glow); }

    .header-stat-label {
      font-size: 11px;
      color: var(--text-dim);
      margin-top: 4px;
      font-weight: 600;
    }

    .filter-bar {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(3, 7, 18, 0.86);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
    }

    .filter-inner {
      max-width: 1280px;
      margin: 0 auto;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
    }

    .segmented {
      display: flex;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 4px;
      box-shadow: var(--shadow-card);
    }

    .tab {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      background: transparent;
      border: 1px solid transparent;
      border-radius: 999px;
      cursor: pointer;
      transition: all 160ms ease-out;
      white-space: nowrap;
    }

    .tab:hover { color: var(--text); background: rgba(255,255,255,0.04); }

    .tab.active {
      background: linear-gradient(135deg, rgba(34,211,238,0.16), rgba(139,92,246,0.16));
      color: #fff;
      border-color: var(--border-strong);
      box-shadow: 0 0 16px rgba(34, 211, 238, 0.12);
    }

    .tab-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 999px;
      background: rgba(255,255,255,0.06);
      color: var(--text-muted);
      font-size: 10px;
      font-weight: 700;
    }

    .tab.active .tab-count {
      background: rgba(34, 211, 238, 0.18);
      color: var(--cyan);
    }

    .container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }

    .card-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }

    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      text-decoration: none;
      color: var(--text);
      overflow: hidden;
      box-shadow: var(--shadow-card);
      transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), border-color 220ms ease-out, box-shadow 220ms ease-out;
    }

    .card::before {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(500px circle at var(--mx, 50%) var(--my, 50%), rgba(34, 211, 238, 0.09), transparent 40%);
      opacity: 0;
      transition: opacity 220ms ease-out;
      pointer-events: none;
    }

    .card:hover {
      transform: translateY(-4px);
      border-color: var(--border-strong);
      box-shadow: var(--shadow-card), var(--shadow-glow);
    }

    .card:hover::before { opacity: 1; }

    .card-accent {
      height: 3px;
      background: linear-gradient(90deg, var(--cyan), var(--violet));
      opacity: 0.8;
    }
    .card-desktop .card-accent { background: linear-gradient(90deg, var(--desktop), #60a5fa); }
    .card-mobile .card-accent { background: linear-gradient(90deg, var(--mobile), #6ee7b7); }

    .card-body {
      padding: 18px 20px 20px;
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .card-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 12px;
    }

    .tag {
      font-size: 11px;
      font-weight: 700;
      padding: 4px 9px;
      border-radius: 999px;
      letter-spacing: 0.02em;
      border: 1px solid rgba(255,255,255,0.06);
    }

    .tag-desktop { background: rgba(56, 189, 248, 0.10); color: var(--desktop); }
    .tag-mobile { background: rgba(52, 211, 153, 0.10); color: var(--mobile); }

    .date {
      font-size: 12px;
      color: var(--text-dim);
      font-variant-numeric: tabular-nums;
    }

    .card-title {
      font-size: 16px;
      font-weight: 700;
      line-height: 1.4;
      margin-bottom: 8px;
      color: #fff;
    }

    .card-desc {
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.6;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      margin-top: auto;
    }

    .card-arrow {
      width: 16px;
      height: 16px;
      color: var(--text-dim);
      flex-shrink: 0;
      transition: transform 160ms ease-out, color 160ms ease-out;
    }

    .card:hover .card-arrow {
      color: var(--cyan);
      transform: translateX(3px);
    }

    .empty {
      grid-column: 1 / -1;
      text-align: center;
      padding: 64px 24px;
      background: var(--surface);
      border: 1px dashed var(--border);
      border-radius: var(--radius);
      color: var(--text-muted);
    }

    footer {
      text-align: center;
      padding: 28px 24px 40px;
      font-size: 12px;
      color: var(--text-dim);
      border-top: 1px solid var(--border);
      background: var(--bg-elevated);
    }

    @media (max-width: 1024px) {
      .card-grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 720px) {
      .header-inner { padding: 32px 16px 28px; }
      .header-stats { flex-wrap: wrap; }
      .filter-inner { padding: 12px 16px; }
      .container { padding: 24px 16px 48px; }
      .card-grid { grid-template-columns: 1fr; gap: 16px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .card, .card::before, .card-arrow, .tab { transition: none; }
    }
  </style>
</head>
<body>
  <header class="site-header">
    <div class="glow-orb cyan" aria-hidden="true"></div>
    <div class="header-inner">
      <a class="breadcrumb" href="../../">← 返回原型库首页</a>
      <h1>${escapeHtml(group.name)}</h1>
      <p class="subtitle">${escapeHtml(group.desc || '该分类下暂无描述')}</p>
      <div class="header-stats">
        <div class="header-stat"><div class="header-stat-value">${data.length}</div><div class="header-stat-label">总原型数</div></div>
        <div class="header-stat"><div class="header-stat-value accent">${desktopCount}</div><div class="header-stat-label">电脑端</div></div>
        <div class="header-stat"><div class="header-stat-value accent">${mobileCount}</div><div class="header-stat-label">移动端</div></div>
      </div>
    </div>
  </header>

  <div class="filter-bar">
    <div class="filter-inner">
      <nav class="segmented" id="categoryTabs" aria-label="端别筛选"></nav>
    </div>
  </div>

  <main class="container">
    <div class="card-grid" id="cardGrid"></div>
  </main>

  <footer>
    部署于 /opt/pul-fms · nginx 静态站点 · 自动同步
  </footer>

  <script>
    var PROTOTYPES = ${JSON.stringify(data)};
    var CATEGORIES = [
      { key: 'all', label: '全部' },
      { key: 'desktop', label: '电脑端' },
      { key: 'mobile', label: '移动端' },
    ];

    var state = { category: 'all' };

    function getCounts() {
      var all = 0, desktop = 0, mobile = 0;
      PROTOTYPES.forEach(function(p) {
        if (p.hidden) return;
        all++;
        if (p.category === 'desktop') desktop++;
        if (p.category === 'mobile') mobile++;
      });
      return { all: all, desktop: desktop, mobile: mobile };
    }

    function renderTabs() {
      var counts = getCounts();
      document.getElementById('categoryTabs').innerHTML = CATEGORIES.map(function(c) {
        return '<button class="tab ' + (state.category === c.key ? 'active' : '') + '" data-category="' + c.key + '">' +
          c.label + '<span class="tab-count">' + counts[c.key] + '</span></button>';
      }).join('');
    }

    function renderGrid() {
      var grid = document.getElementById('cardGrid');
      var filtered = PROTOTYPES
        .filter(function(p) { return state.category === 'all' || p.category === state.category; })
        .filter(function(p) { return !p.hidden; });

      if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty">该分类下暂无原型</div>';
        return;
      }

      grid.innerHTML = filtered.map(function(item) {
        var isMobile = item.category === 'mobile';
        return '<a class="card card-' + item.category + '" href="../../prototypes/' + item.relPath + '" target="_blank" rel="noopener">' +
          '<div class="card-accent"></div>' +
          '<div class="card-body">' +
            '<div class="card-meta">' +
              '<span class="tag tag-' + item.category + '">' + (isMobile ? '移动端' : '电脑端') + '</span>' +
              '<span class="date">' + item.date + '</span>' +
              '<svg class="card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' +
            '</div>' +
            '<div class="card-title">' + escapeHtml(item.title) + '</div>' +
            '<div class="card-desc">' + escapeHtml(item.desc) + '</div>' +
          '</div>' +
        '</a>';
      }).join('');

      document.querySelectorAll('.card').forEach(function(card) {
        card.addEventListener('mousemove', function(e) {
          var rect = card.getBoundingClientRect();
          card.style.setProperty('--mx', (e.clientX - rect.left) + 'px');
          card.style.setProperty('--my', (e.clientY - rect.top) + 'px');
        });
      });
    }

    function escapeHtml(text) {
      var div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    document.getElementById('categoryTabs').addEventListener('click', function(e) {
      var tab = e.target.closest('.tab');
      if (tab) {
        state.category = tab.dataset.category;
        renderTabs();
        renderGrid();
      }
    });

    renderTabs();
    renderGrid();
  </script>
</body>
</html>
`;
}

async function sync() {
  console.log('== 1. 扫描本地原型 ==');

  // 自动将 prototypes 根目录下散落的 HTML 归档到当前月份文件夹
  moveLooseHtmlToMonth(PROTOTYPES_DIR);

  // 自动将 prototypes 根目录下散落的拆分原型文件夹（含 index.html）归档到当前月份文件夹
  moveLoosePrototypeFoldersToMonth(PROTOTYPES_DIR);

  // 读取隐藏配置：文件名列表，这些原型会上传但不在首页展示
  const hiddenFiles = loadHiddenFiles(PROTOTYPES_DIR);

  const htmlFiles = collectHtmlFiles(PROTOTYPES_DIR)
    .sort((a, b) => a.rel.localeCompare(b.rel));

  const items = htmlFiles.map(({ local, rel }) => {
    const meta = parseMeta(local);
    const fileName = path.basename(rel);
    return {
      file: fileName,
      relPath: rel,
      monthOverride: parseMonthFromFolder(rel),
      hidden: hiddenFiles.has(fileName),
      ...meta,
      localMd5: md5File(local),
      localSize: fs.statSync(local).size,
    };
  });

  // 对于 index.html 结尾的拆分原型，首页卡片链接应指向其目录本身，
  // 避免生成类似 /prototypes/2026-06/watermark-settings-v2/index.html 的显式路径
  items.forEach(item => {
    if (item.relPath.endsWith('/index.html')) {
      item.relPath = item.relPath.replace(/\/index\.html$/, '/');
      item.localSize = fs.statSync(path.join(PROTOTYPES_DIR, item.relPath + 'index.html')).size;
      item.localMd5 = md5File(path.join(PROTOTYPES_DIR, item.relPath + 'index.html'));
    }
  });

  // 展示/统计收敛：同一文件夹代表同一原型，只展示入口 index.html。
  // 文件夹内其余子页面（camera.html / chat.html 等）仍需上传供跳转，但不计入首页与统计。
  // 判定：某项所在目录存在 index.html 且自身不是 index.html → 视为文件夹原型的子页面。
  const dirHasIndex = new Set(
    items
      .filter(i => i.relPath.endsWith('/'))
      .map(i => i.relPath) // 已转成目录形式的原型文件夹
  );
  const displayItems = items.filter(i => {
    if (i.relPath.endsWith('/')) return true; // 文件夹原型入口本身，保留
    const dir = path.posix.dirname(i.relPath);
    return !dirHasIndex.has(dir + '/'); // 顶层单文件原型保留；文件夹内子页面剔除
  });

  console.log(`发现 ${displayItems.length} 个原型（共 ${items.length} 个页面文件）`);
  displayItems.forEach(i => console.log(`  [${i.category}] ${i.relPath} - ${i.title}`));

  // 按业务分类聚合（仅统计展示项：文件夹原型只算入口，子页面不计入）
  const businessMap = new Map();
  displayItems.forEach(item => {
    const name = item.businessCategory || '未分类';
    if (!businessMap.has(name)) {
      businessMap.set(name, {
        name,
        desc: item.businessCategoryDesc || '',
        slug: slugifyBusinessCategory(name),
        items: [],
      });
    }
    const group = businessMap.get(name);
    group.items.push(item);
    if (!group.desc && item.businessCategoryDesc) group.desc = item.businessCategoryDesc;
  });
  // 排序：未分类放最后，其余按数量降序
  const businessGroups = [...businessMap.values()].sort((a, b) => {
    if (a.name === '未分类') return 1;
    if (b.name === '未分类') return -1;
    return b.items.length - a.items.length;
  });
  console.log(`\n业务分类: ${businessGroups.map(g => `${g.name}(${g.items.length})`).join('、')}`);

  console.log('\n== 2. 生成首页 ==');
  const indexHtml = generateIndex(displayItems, businessGroups);
  fs.writeFileSync(INDEX_PATH, indexHtml);
  console.log(`已生成 ${INDEX_PATH}`);

  console.log('\n== 2.5 生成业务分类页 ==');
  if (fs.existsSync(BUSINESS_DIR)) {
    fs.rmSync(BUSINESS_DIR, { recursive: true, force: true });
  }
  businessGroups.forEach(group => {
    const dir = path.join(BUSINESS_DIR, group.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), generateBusinessPage(group));
    console.log(`  生成 business/${group.slug}/index.html (${group.items.length} 个原型)`);
  });

  console.log('\n== 3. 连接服务器 ==');
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject).connect({
      host: config.host,
      port: config.port || 22,
      username: config.username,
      password: config.password,
      readyTimeout: 20000,
    });
  });

  function exec(cmd) {
    return new Promise((resolve, reject) => {
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let stdout = '';
        let stderr = '';
        stream.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
        stream.on('data', (data) => { stdout += data; });
        stream.stderr.on('data', (data) => { stderr += data; });
      });
    });
  }

  function sftpAction(fn) {
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        fn(sftp, resolve, reject);
      });
    });
  }

  function uploadFile(sftp, localPath, remotePath) {
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(localPath);
      const writeStream = sftp.createWriteStream(remotePath);
      writeStream.on('close', resolve);
      writeStream.on('error', reject);
      readStream.pipe(writeStream);
    });
  }

  function remoteStat(sftp, remotePath) {
    return new Promise((resolve) => {
      sftp.stat(remotePath, (err, stat) => {
        if (err) resolve(null);
        else resolve(stat);
      });
    });
  }

  function collectFiles(dir, base = '') {
    const result = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = path.posix.join(base, entry.name).replace(/\\/g, '/');
      if (isExcluded(rel)) continue;
      const local = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        result.push(...collectFiles(local, rel));
      } else {
        result.push({ local, remote: rel });
      }
    }
    return result;
  }

  // 确保远程目录存在（包含月份子目录与拆分目录本身）
  const htmlDirs = [...new Set(items.flatMap(i => {
    const dir = path.posix.dirname(i.relPath);
    const dirs = dir && dir !== '.' ? [dir] : [];
    if (i.relPath.endsWith('/')) dirs.push(i.relPath.replace(/\/$/, ''));
    return dirs;
  }))];
  if (htmlDirs.length > 0) {
    await exec(`mkdir -p ${htmlDirs.map(d => `"${config.remoteDir}/prototypes/${d}"`).join(' ')}`);
  } else {
    await exec(`mkdir -p ${config.remoteDir}/prototypes`);
  }

  console.log('\n== 4. 增量上传 ==');
  let uploaded = 0;
  let skipped = 0;

  // 复用同一个 SFTP 会话完成所有文件操作
  await sftpAction(async (sftp, resolve, reject) => {
    try {
      for (const item of items) {
        let localPath = path.join(PROTOTYPES_DIR, item.relPath);
        let remotePath = `${config.remoteDir}/prototypes/${item.relPath}`;
        if (fs.statSync(localPath).isDirectory()) {
          localPath = path.join(localPath, 'index.html');
          remotePath = path.posix.join(remotePath, 'index.html');
        }
        const remote = await remoteStat(sftp, remotePath);

        if (remote && remote.size === item.localSize) {
          // 大小相同仍需校验 MD5，避免仅修改内容未改大小的情况被跳过
          const remoteMd5 = await exec(`md5sum ${remotePath} | awk '{print $1}'`);
          if (remoteMd5.stdout.trim() === item.localMd5) {
            console.log(`  ⏭ 跳过 ${item.relPath}（远程文件内容相同）`);
            skipped++;
            continue;
          }
        }

        await uploadFile(sftp, localPath, remotePath);
        console.log(`  ↑ 上传 ${item.relPath} (${(item.localSize / 1024).toFixed(1)} KB)`);
        uploaded++;
      }

      // 上传原型依赖（styles / scripts / assets 等子目录）
      // 注意：shared/ 下的 HTML（图纸库页面）不在门户索引 items 里，必须走依赖通道上传，否则图纸页永远不更新
      console.log('\n== 4.5 上传原型依赖 ==');
      const depFiles = collectFiles(PROTOTYPES_DIR).filter(f => !f.remote.endsWith('.html') || f.remote.startsWith('shared/'));
      const depDirs = [...new Set(depFiles.map(f => path.posix.dirname(f.remote)).filter(d => d && d !== '.'))];
      if (depDirs.length > 0) {
        await exec(`mkdir -p ${depDirs.map(d => `"${config.remoteDir}/prototypes/${d}"`).join(' ')}`);
      }
      for (const f of depFiles) {
        const localSize = fs.statSync(f.local).size;
        const remotePath = `${config.remoteDir}/prototypes/${f.remote}`;
        const remote = await remoteStat(sftp, remotePath);
        if (remote && remote.size === localSize) {
          // 大小相同仍需校验 MD5（同 HTML 通道）：改名类编辑字节数不变（5字→5字），只看大小会漏传
          const remoteMd5 = await exec(`md5sum ${remotePath} | awk '{print $1}'`);
          if (remoteMd5.stdout.trim() === md5File(f.local)) {
            console.log(`  ⏭ 跳过 ${f.remote}（远程文件内容相同）`);
            skipped++;
            continue;
          }
        }
        await uploadFile(sftp, f.local, remotePath);
        console.log(`  ↑ 上传 ${f.remote} (${(localSize / 1024).toFixed(1)} KB)`);
        uploaded++;
      }

      // 首页每次都上传（因为它会随原型列表变化）
      console.log('\n== 5. 上传首页 ==');
      await uploadFile(sftp, INDEX_PATH, `${config.remoteDir}/index.html`);
      console.log('  ↑ 上传 index.html');

      // 上传业务分类页
      console.log('\n== 5.5 上传业务分类页 ==');
      await exec(`mkdir -p ${businessGroups.map(g => `${config.remoteDir}/business/${g.slug}`).join(' ')}`);
      for (const group of businessGroups) {
        const localPath = path.join(BUSINESS_DIR, group.slug, 'index.html');
        const remotePath = `${config.remoteDir}/business/${group.slug}/index.html`;
        const localSize = fs.statSync(localPath).size;
        const localMd5 = md5File(localPath);
        const remote = await remoteStat(sftp, remotePath);
        if (remote && remote.size === localSize) {
          const remoteMd5 = await exec(`md5sum ${remotePath} | awk '{print $1}'`);
          if (remoteMd5.stdout.trim() === localMd5) {
            console.log(`  ⏭ 跳过 business/${group.slug}/（内容相同）`);
            skipped++;
            continue;
          }
        }
        await uploadFile(sftp, localPath, remotePath);
        console.log(`  ↑ 上传 business/${group.slug}/index.html (${(localSize / 1024).toFixed(1)} KB)`);
        uploaded++;
      }

      resolve();
    } catch (err) {
      reject(err);
    }
  });

  console.log('\n== 6. 验证 ==');
  const curl = await exec(`curl -s -o /dev/null -w "%{http_code}" ${config.domain}/`);
  console.log(`  首页 HTTP: ${curl.stdout.trim()}`);

  const curlCount = await exec(`curl -s ${config.domain}/ | grep -o '"file":"[^"]*"' | wc -l`);
  console.log(`  首页原型数据条数: ${curlCount.stdout.trim()}`);

  for (const group of businessGroups) {
    const bc = await exec(`curl -s -o /dev/null -w "%{http_code}" ${config.domain}/business/${group.slug}/`);
    console.log(`  分类页 ${group.name} (/business/${group.slug}/) HTTP: ${bc.stdout.trim()}`);
  }

  conn.end();
  console.log(`\n✅ 同步完成：上传 ${uploaded} 个，跳过 ${skipped} 个`);
  console.log(`   访问地址：${config.domain}/`);
}

sync().catch(err => {
  console.error('\n❌ 同步失败:', err.message);
  process.exit(1);
});
