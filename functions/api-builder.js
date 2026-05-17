/**
 * GET /api-builder
 *
 * 可视化 API 构造器（升级版）。新增能力：
 *   - 三种端点模式：单张随机 (/random) / 批量随机 / 画廊查询 (/api/query) / 每日 (/random/daily) / 相似图 (/random/similar)
 *   - 网格预览：批量/画廊模式下展示 N 张图
 *   - 相似图触发：点击任意预览图 → 一键查相似
 *   - 预设保存：当前组合可命名保存到 localStorage，左侧列出
 *   - 排序与分页（仅画廊模式）
 *   - 嵌入代码自动按所选端点生成
 */
const HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>随机图 API 构造器 · CloudFlare ImgBed</title>
<style>
:root {
  --bg: #f6f8fb; --panel: #ffffff; --border: #e4e8ee;
  --text: #1f2937; --muted: #6b7280;
  --primary: #2563eb; --primary-hover: #1d4ed8;
  --chip: #eef2ff; --chip-text: #3730a3;
  --chip-active: #2563eb; --chip-active-text: #ffffff;
  --code-bg: #0f172a; --code-text: #e2e8f0;
  --success: #10b981; --error: #ef4444;
  --radius: 10px; --shadow: 0 1px 3px rgba(0,0,0,.05), 0 1px 2px rgba(0,0,0,.04);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b1220; --panel: #131a2b; --border: #1f2a44;
    --text: #e5e7eb; --muted: #9ca3af;
    --chip: #1e2a4d; --chip-text: #cfd8ff;
    --code-bg: #050a17; --code-text: #c7d2fe;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font: 14px/1.55 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
.app { max-width: 1280px; margin: 0 auto; padding: 20px 16px 80px; }
header.top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
header.top h1 { margin: 0; font-size: 19px; font-weight: 600; }
.stat { color: var(--muted); font-size: 12px; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 16px; }
@media (max-width: 1020px) { .layout { grid-template-columns: 1fr; } }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); margin-bottom: 12px; }
.panel h2 { margin: 0 0 10px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pill { font-weight: 400; font-size: 10px; color: var(--chip-text); background: var(--chip); padding: 2px 7px; border-radius: 999px; }
.field { margin-bottom: 12px; }
.field:last-child { margin-bottom: 0; }
.field label { display: block; font-size: 11px; color: var(--muted); margin-bottom: 5px; letter-spacing: .2px; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chip { display: inline-flex; align-items: center; gap: 5px; background: var(--chip); color: var(--chip-text); padding: 5px 9px; border-radius: 999px; font-size: 12px; cursor: pointer; user-select: none; border: 1px solid transparent; transition: all .12s; }
.chip:hover { transform: translateY(-1px); }
.chip.active { background: var(--chip-active); color: var(--chip-active-text); border-color: var(--chip-active); }
.chip .count { opacity: .65; font-size: 10px; }
.chip.disabled { opacity: .35; cursor: not-allowed; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
.input, .select { width: 100%; padding: 7px 9px; border: 1px solid var(--border); background: var(--panel); color: var(--text); border-radius: 7px; font-size: 12px; font-family: inherit; }
.input:focus, .select:focus { outline: 2px solid var(--primary); border-color: transparent; }
.helper { font-size: 11px; color: var(--muted); margin-top: 3px; }
.mode-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.mode-tab { padding: 6px 12px; font-size: 12px; border-radius: 999px; cursor: pointer; background: var(--chip); color: var(--chip-text); user-select: none; border: 1px solid transparent; }
.mode-tab.active { background: var(--chip-active); color: var(--chip-active-text); border-color: var(--chip-active); }
.url-box { background: var(--code-bg); color: var(--code-text); padding: 10px 12px; border-radius: 7px; font: 11px/1.5 ui-monospace, Menlo, monospace; word-break: break-all; user-select: all; border: 1px solid var(--border); }
.btn-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.btn { appearance: none; border: 1px solid var(--border); background: var(--panel); color: var(--text); padding: 6px 12px; border-radius: 7px; cursor: pointer; font-size: 12px; font-family: inherit; transition: all .15s; }
.btn:hover { border-color: var(--primary); color: var(--primary); }
.btn.primary { background: var(--primary); color: #fff; border-color: var(--primary); }
.btn.primary:hover { background: var(--primary-hover); color: #fff; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.preview-single { background: var(--code-bg); border-radius: 7px; overflow: hidden; min-height: 160px; display: flex; align-items: center; justify-content: center; position: relative; }
.preview-single img { max-width: 100%; max-height: 380px; display: block; }
.empty { color: #94a3b8; font-size: 12px; text-align: center; padding: 18px; }
.badge { position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,.55); color: #fff; padding: 2px 7px; border-radius: 999px; font-size: 10px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 6px; }
.grid-item { aspect-ratio: 1; background: var(--code-bg); border-radius: 6px; overflow: hidden; position: relative; cursor: pointer; transition: transform .15s; }
.grid-item:hover { transform: scale(1.03); z-index: 2; }
.grid-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.grid-item .ov { position: absolute; inset: auto 0 0 0; background: linear-gradient(to top, rgba(0,0,0,.7), transparent); color: #fff; font-size: 10px; padding: 12px 6px 4px; opacity: 0; transition: opacity .15s; }
.grid-item:hover .ov { opacity: 1; }
.grid-item .score { position: absolute; top: 4px; left: 4px; background: rgba(37,99,235,.92); color: #fff; padding: 2px 6px; border-radius: 999px; font-size: 10px; font-weight: 600; }
.tabs { display: flex; gap: 2px; margin-bottom: 8px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.tab { padding: 6px 10px; cursor: pointer; font-size: 12px; color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tab.active { color: var(--primary); border-bottom-color: var(--primary); }
.snippet { background: var(--code-bg); color: var(--code-text); padding: 10px 12px; border-radius: 7px; font: 11px/1.5 ui-monospace, monospace; white-space: pre-wrap; user-select: all; word-break: break-all; }
.toast { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); background: #111; color: #fff; padding: 8px 16px; border-radius: 999px; font-size: 12px; opacity: 0; transition: opacity .25s; pointer-events: none; z-index: 1000; }
.toast.show { opacity: 1; }
.spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid rgba(255,255,255,.2); border-top-color: #fff; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.error-banner { background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.35); color: var(--error); padding: 9px 11px; border-radius: 7px; font-size: 12px; margin-bottom: 12px; }
.preset-list { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto; }
.preset-item { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 5px 8px; background: var(--chip); border-radius: 6px; font-size: 12px; }
.preset-item .nm { flex: 1; cursor: pointer; color: var(--chip-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preset-item .del { cursor: pointer; opacity: .55; font-size: 14px; line-height: 1; padding: 0 4px; }
.preset-item .del:hover { opacity: 1; color: var(--error); }
.pager { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 10px; font-size: 12px; color: var(--muted); }
.tag-list { max-height: 200px; overflow-y: auto; padding: 4px; border: 1px solid var(--border); border-radius: 6px; }
.toggle { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 12px; user-select: none; }
.toggle input { width: 15px; height: 15px; }
.collapse-h { cursor: pointer; user-select: none; }
.collapse-h::before { content: "▾ "; font-size: 10px; color: var(--muted); }
.collapse-h.closed::before { content: "▸ "; }
.collapse-body { transition: max-height .2s; overflow: hidden; }
</style>
</head>
<body>
<div class="app">
  <header class="top">
    <div>
      <h1>🎨 随机图 API 构造器 <span class="pill" style="font-size:10px;">v2 · 构造 · 浏览 · 相似 · 每日</span></h1>
      <div class="stat" id="stat">正在加载…</div>
    </div>
    <a class="btn" href="/" target="_blank">返回首页</a>
  </header>

  <div id="errorBanner" class="error-banner" style="display:none;"></div>

  <div class="layout">
    <!-- 左侧 -->
    <div style="min-width:0;">

      <!-- 端点模式 -->
      <div class="panel">
        <h2>API 端点 <span class="pill">选哪个接口</span></h2>
        <div class="mode-tabs" id="modeTabs">
          <span class="mode-tab active" data-mode="random">随机一张 /random</span>
          <span class="mode-tab" data-mode="batch">批量随机 /random?count=N</span>
          <span class="mode-tab" data-mode="gallery">画廊查询 /api/query</span>
          <span class="mode-tab" data-mode="daily">每日固定 /random/daily</span>
          <span class="mode-tab" data-mode="similar">相似图 /random/similar</span>
        </div>
      </div>

      <!-- 分面筛选 -->
      <div class="panel" id="facetsPanel">
        <h2>分面筛选 <span class="pill">同分面多选=或 · 跨分面=且</span></h2>
        <div id="facetsContainer"></div>
      </div>

      <!-- 基础参数 -->
      <div class="panel">
        <h2>基础参数</h2>
        <div class="row">
          <div class="field">
            <label>目录 (dir)</label>
            <select class="select" id="dirSelect"><option value="">— 全部 —</option></select>
          </div>
          <div class="field">
            <label>方向 (orientation)</label>
            <select class="select" id="orientationSelect">
              <option value="">不限</option>
              <option value="landscape">横图</option>
              <option value="portrait">竖图</option>
              <option value="square">方图</option>
              <option value="auto">自适应</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>内容类型 (content)</label>
            <select class="select" id="contentSelect">
              <option value="">image (默认)</option>
              <option value="image">image 仅图片</option>
              <option value="video">video 仅视频</option>
              <option value="image,video">image,video</option>
            </select>
          </div>
          <div class="field">
            <label>返回类型 (type)</label>
            <select class="select" id="typeSelect">
              <option value="">默认 path</option>
              <option value="url">完整 URL</option>
              <option value="img">直接图片</option>
            </select>
          </div>
        </div>
      </div>

      <!-- 高级参数（按 mode 动态显示） -->
      <div class="panel">
        <h2>高级参数 <span id="modeHint" class="pill"></span></h2>
        <div class="row">
          <div class="field">
            <label>最小宽度 (minWidth)</label>
            <input class="input" type="number" id="minWidthInput" min="0" placeholder="例如 1920">
          </div>
          <div class="field">
            <label>最小高度 (minHeight)</label>
            <input class="input" type="number" id="minHeightInput" min="0" placeholder="例如 1080">
          </div>
        </div>

        <!-- batch / gallery 模式参数 -->
        <div id="batchParams" style="display:none;">
          <div class="row">
            <div class="field">
              <label id="countLabel">批量数量 (count)</label>
              <input class="input" type="number" id="countInput" min="1" max="100" value="12">
            </div>
            <div class="field">
              <label>随机种子 (seed) <span class="helper" style="display:inline">同 seed 可重现</span></label>
              <input class="input" type="text" id="seedInput" placeholder="可选">
            </div>
          </div>
        </div>

        <!-- gallery 专属 -->
        <div id="galleryParams" style="display:none;">
          <div class="row-3">
            <div class="field">
              <label>排序 (sort)</label>
              <select class="select" id="sortSelect">
                <option value="time">时间</option>
                <option value="random">随机</option>
                <option value="width">宽度</option>
                <option value="height">高度</option>
                <option value="size">大小</option>
                <option value="name">名称</option>
              </select>
            </div>
            <div class="field">
              <label>顺序 (order)</label>
              <select class="select" id="orderSelect">
                <option value="desc">降序</option>
                <option value="asc">升序</option>
              </select>
            </div>
            <div class="field">
              <label>每页 (limit)</label>
              <input class="input" type="number" id="limitInput" min="1" max="100" value="24">
            </div>
          </div>
        </div>

        <!-- daily 专属 -->
        <div id="dailyParams" style="display:none;">
          <div class="row">
            <div class="field">
              <label>时区 (tz)</label>
              <select class="select" id="tzSelect">
                <option value="">UTC</option>
                <option value="Asia/Shanghai">Asia/Shanghai (+08:00)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (+09:00)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (-08:00)</option>
                <option value="America/New_York">America/New_York (-05:00)</option>
                <option value="Europe/London">Europe/London (UTC)</option>
                <option value="Europe/Paris">Europe/Paris (+01:00)</option>
              </select>
            </div>
            <div class="field">
              <label>指定日期 (date, 可选)</label>
              <input class="input" type="text" id="dateInput" placeholder="YYYY-MM-DD">
            </div>
          </div>
        </div>

        <!-- similar 专属 -->
        <div id="similarParams" style="display:none;">
          <div class="field">
            <label>目标图 ID (id) <span class="helper" style="display:inline">点击下方预览图自动填充</span></label>
            <input class="input" type="text" id="similarIdInput" placeholder="例如 wallpaper/static/横图/xxx.png">
          </div>
          <div class="row-3">
            <div class="field">
              <label>返回数量</label>
              <input class="input" type="number" id="similarCount" min="1" max="100" value="12">
            </div>
            <div class="field">
              <label>最小分数</label>
              <input class="input" type="number" id="similarMinScore" min="0" max="1" step="0.01" value="0.05">
            </div>
            <div class="field">
              <label>同方向</label>
              <select class="select" id="similarSameOrient">
                <option value="">不限</option>
                <option value="true">仅同方向</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 自定义 tag -->
        <div class="field">
          <label>包含标签 (tags, AND)</label>
          <input class="input" type="text" id="tagsInput" placeholder="例如 蓝天,云">
        </div>
        <div class="field">
          <label>排除标签 (excludeTags)</label>
          <input class="input" type="text" id="excludeInput" placeholder="例如 性感,暗色">
        </div>
        <div class="field">
          <label class="collapse-h closed" id="freeTagToggle">浏览所有标签…</label>
          <div class="collapse-body" id="freeTagPanel" style="max-height:0;">
            <input class="input" type="text" id="tagFilterInput" placeholder="筛选标签…" style="margin: 8px 0;">
            <div class="tag-list" id="tagList"></div>
          </div>
        </div>
      </div>

      <!-- 预设 -->
      <div class="panel">
        <h2>预设 <span class="pill">保存到本地</span></h2>
        <div class="row" style="grid-template-columns: 1fr auto auto;">
          <input class="input" id="presetNameInput" placeholder="给当前组合起个名字…">
          <button class="btn primary" id="savePresetBtn">💾 保存</button>
          <button class="btn" id="exportPresetsBtn">⇣ 导出</button>
        </div>
        <div class="preset-list" id="presetList" style="margin-top: 10px;"></div>
      </div>
    </div>

    <!-- 右侧 -->
    <div>
      <div class="panel">
        <h2>生成的 API URL</h2>
        <div class="url-box" id="urlBox">/random</div>
        <div class="btn-row">
          <button class="btn primary" id="copyBtn">📋 复制</button>
          <button class="btn" id="openBtn">↗ 打开</button>
          <button class="btn" id="refreshBtn">🎲 换一张</button>
        </div>
      </div>

      <div class="panel">
        <h2>预览 <span class="pill" id="hitsCount">—</span></h2>
        <div id="previewArea"><div class="preview-single"><div class="empty">调整参数后将自动加载</div></div></div>
        <div class="pager" id="pager" style="display:none;">
          <button class="btn" id="prevPageBtn">‹ 上一页</button>
          <span id="pageInfo">第 1 页</span>
          <button class="btn" id="nextPageBtn">下一页 ›</button>
        </div>
      </div>

      <div class="panel">
        <h2>嵌入代码</h2>
        <div class="tabs">
          <div class="tab active" data-fmt="html">HTML</div>
          <div class="tab" data-fmt="md">Markdown</div>
          <div class="tab" data-fmt="css">CSS</div>
          <div class="tab" data-fmt="curl">cURL</div>
          <div class="tab" data-fmt="js">JavaScript</div>
        </div>
        <div class="snippet" id="snippetBox"></div>
        <div class="btn-row">
          <button class="btn" id="copySnippetBtn">📋 复制代码</button>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
(function () {
  'use strict';

  const state = {
    mode: 'random',
    facets: {},
    allTags: [],
    directories: [],
    totalFiles: 0,
    selected: {},        // facetKey -> Set
    extraTags: new Set(),
    snippetFormat: 'html',
    galleryOffset: 0,
    presets: {},         // name -> querystring
  };

  const $ = (id) => document.getElementById(id);
  const debounce = (fn, ms) => { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(this, a), ms); }; };
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (msg) => { const t = $('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1500); };
  const showError = (m) => { const b = $('errorBanner'); b.style.display = 'block'; b.textContent = m; };

  // ---------- URL 构造 ----------
  function buildBaseFilters() {
    const params = new URLSearchParams();
    for (const [k, set] of Object.entries(state.selected)) {
      if (set && set.size > 0) params.set(k, Array.from(set).join(','));
    }
    if (state.extraTags.size > 0) {
      const existing = $('tagsInput').value.split(',').map(s => s.trim()).filter(Boolean);
      const merged = Array.from(new Set([...existing, ...state.extraTags]));
      if (merged.length > 0) params.set('tags', merged.join(','));
    } else if ($('tagsInput').value.trim()) {
      params.set('tags', $('tagsInput').value.trim());
    }
    if ($('excludeInput').value.trim()) params.set('excludeTags', $('excludeInput').value.trim());
    if ($('dirSelect').value) params.set('dir', $('dirSelect').value);
    if ($('orientationSelect').value) params.set('orientation', $('orientationSelect').value);
    if ($('contentSelect').value) params.set('content', $('contentSelect').value);
    const mw = parseInt($('minWidthInput').value) || 0;
    const mh = parseInt($('minHeightInput').value) || 0;
    if (mw > 0) params.set('minWidth', String(mw));
    if (mh > 0) params.set('minHeight', String(mh));
    return params;
  }

  function buildUrl() {
    const p = buildBaseFilters();
    let path = '/random';
    if (state.mode === 'random') {
      if ($('typeSelect').value) p.set('type', $('typeSelect').value);
      return path + (p.toString() ? '?' + p : '');
    }
    if (state.mode === 'batch') {
      const c = parseInt($('countInput').value) || 12;
      p.set('count', String(c));
      if ($('seedInput').value.trim()) p.set('seed', $('seedInput').value.trim());
      if ($('typeSelect').value) p.set('type', $('typeSelect').value);
      return path + '?' + p;
    }
    if (state.mode === 'gallery') {
      path = '/api/query';
      if (state.galleryOffset > 0) p.set('offset', String(state.galleryOffset));
      const limit = parseInt($('limitInput').value) || 24;
      p.set('limit', String(limit));
      p.set('sort', $('sortSelect').value);
      p.set('order', $('orderSelect').value);
      if ($('sortSelect').value === 'random' && $('seedInput').value.trim()) {
        p.set('seed', $('seedInput').value.trim());
      }
      return path + '?' + p;
    }
    if (state.mode === 'daily') {
      path = '/random/daily';
      if ($('tzSelect').value) p.set('tz', $('tzSelect').value);
      if ($('dateInput').value.trim()) p.set('date', $('dateInput').value.trim());
      if ($('typeSelect').value) p.set('type', $('typeSelect').value);
      return path + (p.toString() ? '?' + p : '');
    }
    if (state.mode === 'similar') {
      path = '/random/similar';
      const id = $('similarIdInput').value.trim();
      const sp = new URLSearchParams();
      if (id) sp.set('id', id);
      sp.set('count', $('similarCount').value || '12');
      sp.set('minScore', $('similarMinScore').value || '0.05');
      if ($('similarSameOrient').value) sp.set('sameOrientation', $('similarSameOrient').value);
      return path + '?' + sp;
    }
    return path;
  }

  const fullUrl = (rel) => location.origin + rel;

  // ---------- 渲染 ----------
  function renderFacets() {
    const container = $('facetsContainer');
    container.innerHTML = '';
    const keys = Object.keys(state.facets);
    if (keys.length === 0) {
      container.innerHTML = '<div class="empty">尚无分面配置</div>';
      return;
    }
    for (const key of keys) {
      const f = state.facets[key];
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const lbl = document.createElement('label');
      lbl.innerHTML = '<strong style="color:var(--text);">' + escapeHtml(f.label) + '</strong> '
        + '<span style="color:var(--muted);">(' + key + ')</span>';
      wrap.appendChild(lbl);
      const chips = document.createElement('div');
      chips.className = 'chips';
      for (const v of f.values) {
        const chip = document.createElement('span');
        chip.className = 'chip' + (v.count === 0 ? ' disabled' : '');
        const isActive = state.selected[key] && state.selected[key].has(v.value);
        if (isActive) chip.classList.add('active');
        chip.innerHTML = escapeHtml(v.label) + '<span class="count">' + v.count + '</span>';
        chip.addEventListener('click', () => {
          if (v.count === 0) return;
          if (!state.selected[key]) state.selected[key] = new Set();
          const set = state.selected[key];
          if (set.has(v.value)) set.delete(v.value); else set.add(v.value);
          chip.classList.toggle('active');
          state.galleryOffset = 0;
          update();
        });
        chips.appendChild(chip);
      }
      wrap.appendChild(chips);
      container.appendChild(wrap);
    }
  }

  function renderDirectories() {
    const sel = $('dirSelect');
    sel.innerHTML = '<option value="">— 全部 —</option>';
    for (const d of state.directories.sort()) {
      const o = document.createElement('option');
      o.value = d; o.textContent = d;
      sel.appendChild(o);
    }
  }

  function renderTagList(prefix = '') {
    const p = prefix.trim().toLowerCase();
    const arr = state.allTags.filter(t => !p || t.tag.toLowerCase().includes(p)).slice(0, 300);
    if (arr.length === 0) {
      $('tagList').innerHTML = '<div class="empty">没有匹配的标签</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const t of arr) {
      const chip = document.createElement('span');
      chip.className = 'chip' + (state.extraTags.has(t.tag) ? ' active' : '');
      chip.style.margin = '2px';
      chip.innerHTML = escapeHtml(t.tag) + '<span class="count">' + t.count + '</span>';
      chip.addEventListener('click', () => {
        if (state.extraTags.has(t.tag)) state.extraTags.delete(t.tag);
        else state.extraTags.add(t.tag);
        chip.classList.toggle('active');
        update();
      });
      frag.appendChild(chip);
    }
    $('tagList').innerHTML = '';
    $('tagList').appendChild(frag);
  }

  function renderModeUI() {
    const hide = (id) => $(id).style.display = 'none';
    const show = (id, d = 'block') => $(id).style.display = d;
    hide('batchParams'); hide('galleryParams'); hide('dailyParams'); hide('similarParams');
    $('modeHint').textContent = '';
    $('pager').style.display = 'none';
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === state.mode));

    if (state.mode === 'batch' || state.mode === 'gallery') {
      show('batchParams');
      $('countLabel').textContent = state.mode === 'gallery' ? '每页 (limit)（已下移）' : '批量数量 (count)';
    }
    if (state.mode === 'gallery') {
      show('galleryParams');
      $('modeHint').textContent = '带分页的查询';
    }
    if (state.mode === 'daily') {
      show('dailyParams');
      $('modeHint').textContent = '当日跨请求返回同一张';
    }
    if (state.mode === 'similar') {
      show('similarParams');
      $('modeHint').textContent = '按 tag 重叠度匹配';
    }
  }

  function renderSnippet() {
    const rel = buildUrl();
    const abs = fullUrl(rel);
    const imgAbs = (() => {
      try {
        const u = new URL(abs);
        if (state.mode === 'random' || state.mode === 'daily' || state.mode === 'batch') {
          if (!u.searchParams.has('type')) u.searchParams.set('type', 'img');
        }
        return u.toString();
      } catch (_) { return abs; }
    })();
    let snip = '';
    switch (state.snippetFormat) {
      case 'md':   snip = '![random image](' + imgAbs + ')'; break;
      case 'css':  snip = '.hero {\\n  background-image: url("' + imgAbs + '");\\n  background-size: cover;\\n}'; break;
      case 'curl': snip = "curl -L '" + abs + "'"; break;
      case 'js':
        if (state.mode === 'gallery' || state.mode === 'similar' || state.mode === 'batch') {
          snip = "const res = await fetch('" + abs + "');\\nconst data = await res.json();\\nconsole.log(data);";
        } else {
          snip = "const r = await fetch('" + abs + "');\\nconst { url } = await r.json();\\ndocument.querySelector('img').src = url;";
        }
        break;
      case 'html':
      default:
        if (state.mode === 'gallery' || state.mode === 'batch') {
          snip = '<!-- 调用后渲染 JSON 中的 urls/files 数组 -->\\n<script>\\n  fetch("' + abs + '").then(r => r.json()).then(d => {\\n    /* d.urls (batch) 或 d.files (gallery) */\\n  });\\n<' + '/script>';
        } else if (state.mode === 'similar') {
          snip = '<!-- 调用后渲染 JSON 中的 results 数组 -->';
        } else {
          snip = '<img src="' + imgAbs + '" alt="random image" />';
        }
    }
    $('snippetBox').textContent = snip;
  }

  // ---------- 预览 ----------
  let previewToken = 0;
  async function refreshPreview() {
    const tok = ++previewToken;
    const rel = buildUrl();
    const area = $('previewArea');

    if (state.mode === 'random' || state.mode === 'daily') {
      area.innerHTML = '<div class="preview-single"><div class="spinner"></div></div>';
      try {
        const u = new URL(fullUrl(rel));
        u.searchParams.delete('type'); // 强制走 JSON
        u.searchParams.set('_t', Date.now().toString(36));
        const res = await fetch(u.toString());
        if (tok !== previewToken) return;
        if (!res.ok) {
          area.innerHTML = '<div class="preview-single"><div class="empty">HTTP ' + res.status + '<br>' + escapeHtml((await res.text()).slice(0, 200)) + '</div></div>';
          $('hitsCount').textContent = '—';
          return;
        }
        const data = await res.json();
        $('hitsCount').textContent = data.total ? '命中 ' + data.total : (data.url ? '已命中' : '0 张');
        if (!data.url) {
          area.innerHTML = '<div class="preview-single"><div class="empty">无匹配图</div></div>';
          return;
        }
        const img = new Image();
        img.onload = () => {
          if (tok !== previewToken) return;
          area.innerHTML = '<div class="preview-single"></div>';
          area.firstChild.appendChild(img);
          const b = document.createElement('div');
          b.className = 'badge'; b.textContent = img.naturalWidth + '×' + img.naturalHeight;
          area.firstChild.appendChild(b);
        };
        img.onerror = () => { if (tok === previewToken) area.innerHTML = '<div class="preview-single"><div class="empty">图片加载失败</div></div>'; };
        img.src = data.url;
      } catch (err) {
        if (tok === previewToken) area.innerHTML = '<div class="preview-single"><div class="empty">' + escapeHtml(err.message) + '</div></div>';
      }
      return;
    }

    if (state.mode === 'batch') {
      area.innerHTML = '<div class="preview-single"><div class="spinner"></div></div>';
      try {
        const u = new URL(fullUrl(rel));
        u.searchParams.set('_t', Date.now().toString(36));
        const res = await fetch(u.toString());
        const data = await res.json();
        if (tok !== previewToken) return;
        $('hitsCount').textContent = '命中 ' + (data.total || 0) + ' · 返回 ' + ((data.urls || []).length);
        const urls = data.urls || [];
        if (urls.length === 0) { area.innerHTML = '<div class="preview-single"><div class="empty">无匹配图</div></div>'; return; }
        renderGrid(urls.map(u => ({ url: u, id: u.replace(/^.*\\/file\\//, '') })), tok);
      } catch (err) {
        if (tok === previewToken) area.innerHTML = '<div class="preview-single"><div class="empty">' + escapeHtml(err.message) + '</div></div>';
      }
      return;
    }

    if (state.mode === 'gallery') {
      area.innerHTML = '<div class="preview-single"><div class="spinner"></div></div>';
      try {
        const u = new URL(fullUrl(rel));
        u.searchParams.set('_t', Date.now().toString(36));
        const res = await fetch(u.toString());
        const data = await res.json();
        if (tok !== previewToken) return;
        $('hitsCount').textContent = '命中 ' + (data.total || 0);
        const files = data.files || [];
        if (files.length === 0) { area.innerHTML = '<div class="preview-single"><div class="empty">无匹配图</div></div>'; return; }
        renderGrid(files, tok);
        // 分页器
        $('pager').style.display = 'flex';
        const limit = data.limit || 24;
        const offset = data.offset || 0;
        const totalPages = Math.max(1, Math.ceil((data.total || 0) / limit));
        const curPage = Math.floor(offset / limit) + 1;
        $('pageInfo').textContent = '第 ' + curPage + ' / ' + totalPages + ' 页';
        $('prevPageBtn').disabled = curPage <= 1;
        $('nextPageBtn').disabled = curPage >= totalPages;
      } catch (err) {
        if (tok === previewToken) area.innerHTML = '<div class="preview-single"><div class="empty">' + escapeHtml(err.message) + '</div></div>';
      }
      return;
    }

    if (state.mode === 'similar') {
      const id = $('similarIdInput').value.trim();
      if (!id) {
        area.innerHTML = '<div class="preview-single"><div class="empty">请先在「画廊」或「批量」模式中点击图片选择目标</div></div>';
        $('hitsCount').textContent = '—';
        return;
      }
      area.innerHTML = '<div class="preview-single"><div class="spinner"></div></div>';
      try {
        const u = new URL(fullUrl(rel));
        u.searchParams.set('_t', Date.now().toString(36));
        const res = await fetch(u.toString());
        const data = await res.json();
        if (tok !== previewToken) return;
        if (data.error) {
          area.innerHTML = '<div class="preview-single"><div class="empty">' + escapeHtml(data.error) + '</div></div>';
          return;
        }
        $('hitsCount').textContent = '相似 ' + (data.total || 0) + ' 张 · 显示 ' + ((data.results || []).length);
        renderGrid(data.results || [], tok);
      } catch (err) {
        if (tok === previewToken) area.innerHTML = '<div class="preview-single"><div class="empty">' + escapeHtml(err.message) + '</div></div>';
      }
    }
  }

  function renderGrid(items, tok) {
    const area = $('previewArea');
    area.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const it of items) {
      const cell = document.createElement('div');
      cell.className = 'grid-item';
      cell.title = (it.id || it.url || '');
      const img = new Image();
      img.loading = 'lazy';
      img.src = it.url || (location.origin + '/file/' + it.id);
      cell.appendChild(img);
      if (typeof it.score === 'number') {
        const s = document.createElement('div');
        s.className = 'score'; s.textContent = it.score.toFixed(2);
        cell.appendChild(s);
      }
      if (it.width && it.height) {
        const ov = document.createElement('div');
        ov.className = 'ov';
        ov.textContent = it.width + '×' + it.height;
        cell.appendChild(ov);
      }
      cell.addEventListener('click', () => {
        const fid = it.id || (it.url ? it.url.split('/file/').pop() : '');
        if (!fid) return;
        $('similarIdInput').value = fid;
        switchMode('similar');
        toast('已选目标图，切换到相似图模式');
      });
      grid.appendChild(cell);
    }
    area.appendChild(grid);
  }

  // ---------- 预设 ----------
  function loadPresets() {
    try { state.presets = JSON.parse(localStorage.getItem('cfimgbed_api_presets') || '{}'); }
    catch (_) { state.presets = {}; }
    renderPresets();
  }
  function savePresetsToLocal() {
    localStorage.setItem('cfimgbed_api_presets', JSON.stringify(state.presets));
  }
  function renderPresets() {
    const list = $('presetList');
    list.innerHTML = '';
    const names = Object.keys(state.presets).sort();
    if (names.length === 0) {
      list.innerHTML = '<div class="empty" style="padding:6px;">尚无预设</div>';
      return;
    }
    for (const n of names) {
      const item = document.createElement('div');
      item.className = 'preset-item';
      const nm = document.createElement('div');
      nm.className = 'nm'; nm.textContent = n; nm.title = state.presets[n];
      nm.addEventListener('click', () => loadPreset(n));
      const del = document.createElement('div');
      del.className = 'del'; del.textContent = '×';
      del.addEventListener('click', () => {
        if (confirm('删除预设 “' + n + '” ?')) {
          delete state.presets[n]; savePresetsToLocal(); renderPresets();
        }
      });
      item.appendChild(nm); item.appendChild(del);
      list.appendChild(item);
    }
  }
  function savePreset() {
    const name = $('presetNameInput').value.trim();
    if (!name) { toast('请输入预设名'); return; }
    state.presets[name] = serializeState();
    savePresetsToLocal();
    $('presetNameInput').value = '';
    renderPresets();
    toast('✓ 已保存');
  }
  function loadPreset(name) {
    const s = state.presets[name]; if (!s) return;
    deserializeState(s);
    toast('✓ 已加载: ' + name);
  }
  function serializeState() {
    const p = buildBaseFilters();
    p.set('__mode', state.mode);
    if (state.mode === 'gallery') {
      p.set('__sort', $('sortSelect').value);
      p.set('__order', $('orderSelect').value);
      p.set('__limit', $('limitInput').value);
    }
    if (state.mode === 'batch') p.set('__count', $('countInput').value);
    if ($('seedInput').value) p.set('__seed', $('seedInput').value);
    if ($('typeSelect').value) p.set('__type', $('typeSelect').value);
    return p.toString();
  }
  function deserializeState(qs) {
    const p = new URLSearchParams(qs);
    state.selected = {};
    state.extraTags = new Set();
    for (const k of ['color','category','mood']) {
      const v = p.get(k);
      if (v) state.selected[k] = new Set(v.split(','));
    }
    $('tagsInput').value = p.get('tags') || '';
    $('excludeInput').value = p.get('excludeTags') || '';
    $('dirSelect').value = p.get('dir') || '';
    $('orientationSelect').value = p.get('orientation') || '';
    $('contentSelect').value = p.get('content') || '';
    $('minWidthInput').value = p.get('minWidth') || '';
    $('minHeightInput').value = p.get('minHeight') || '';
    if (p.get('__count')) $('countInput').value = p.get('__count');
    if (p.get('__sort')) $('sortSelect').value = p.get('__sort');
    if (p.get('__order')) $('orderSelect').value = p.get('__order');
    if (p.get('__limit')) $('limitInput').value = p.get('__limit');
    if (p.get('__seed')) $('seedInput').value = p.get('__seed');
    if (p.get('__type')) $('typeSelect').value = p.get('__type');
    state.mode = p.get('__mode') || 'random';
    renderFacets();
    renderModeUI();
    update();
  }
  function exportPresets() {
    const data = JSON.stringify(state.presets, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cfimgbed-presets-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- 切换模式 ----------
  function switchMode(m) {
    state.mode = m;
    state.galleryOffset = 0;
    renderModeUI();
    update();
  }

  function update() {
    $('urlBox').textContent = buildUrl();
    renderSnippet();
    debouncedPreview();
  }
  const debouncedPreview = debounce(refreshPreview, 350);

  // ---------- 加载分面 ----------
  async function loadFacets() {
    try {
      const res = await fetch('/api/facets');
      if (!res.ok) { showError('HTTP ' + res.status + ': ' + (await res.text()).slice(0, 200)); return; }
      const data = await res.json();
      state.facets = data.facets || {};
      state.allTags = data.allTags || [];
      state.directories = data.directories || [];
      state.totalFiles = data.totalFiles || 0;
      $('stat').textContent = '图库共 ' + state.totalFiles + ' 张图 · ' +
        (data.orientations ? ('横 ' + data.orientations.landscape + ' / 竖 ' + data.orientations.portrait + ' / 方 ' + data.orientations.square) : '') +
        ' · ' + state.allTags.length + ' 个标签';
      renderFacets();
      renderDirectories();
      renderTagList('');
      update();
    } catch (err) {
      showError('加载分面失败: ' + err.message);
    }
  }

  // ---------- 事件 ----------
  function bindEvents() {
    document.querySelectorAll('.mode-tab').forEach(t => {
      t.addEventListener('click', () => switchMode(t.dataset.mode));
    });
    [$('dirSelect'), $('orientationSelect'), $('contentSelect'), $('typeSelect'),
     $('sortSelect'), $('orderSelect'), $('tzSelect'), $('similarSameOrient')].forEach(el => {
      el.addEventListener('change', () => { state.galleryOffset = 0; update(); });
    });
    [$('countInput'), $('seedInput'), $('minWidthInput'), $('minHeightInput'),
     $('tagsInput'), $('excludeInput'), $('limitInput'), $('dateInput'),
     $('similarIdInput'), $('similarCount'), $('similarMinScore')].forEach(el => {
      el.addEventListener('input', debounce(() => { state.galleryOffset = 0; update(); }, 220));
    });

    $('freeTagToggle').addEventListener('click', () => {
      const body = $('freeTagPanel');
      const closed = $('freeTagToggle').classList.toggle('closed');
      body.style.maxHeight = closed ? '0' : '260px';
    });
    $('tagFilterInput').addEventListener('input', debounce(() => renderTagList($('tagFilterInput').value), 200));

    $('copyBtn').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(fullUrl($('urlBox').textContent)); toast('✓ 已复制 URL'); }
      catch (_) { toast('复制失败'); }
    });
    $('openBtn').addEventListener('click', () => window.open(fullUrl($('urlBox').textContent), '_blank'));
    $('refreshBtn').addEventListener('click', refreshPreview);
    $('copySnippetBtn').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('snippetBox').textContent); toast('✓ 已复制代码'); }
      catch (_) { toast('复制失败'); }
    });

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.snippetFormat = tab.dataset.fmt;
        renderSnippet();
      });
    });

    $('prevPageBtn').addEventListener('click', () => {
      const lim = parseInt($('limitInput').value) || 24;
      state.galleryOffset = Math.max(0, state.galleryOffset - lim);
      update();
    });
    $('nextPageBtn').addEventListener('click', () => {
      const lim = parseInt($('limitInput').value) || 24;
      state.galleryOffset += lim;
      update();
    });

    $('savePresetBtn').addEventListener('click', savePreset);
    $('exportPresetsBtn').addEventListener('click', exportPresets);
  }

  bindEvents();
  loadPresets();
  loadFacets();
  renderModeUI();
})();
</script>
</body>
</html>`;

export async function onRequest() {
    return new Response(HTML, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=600',
        }
    });
}
