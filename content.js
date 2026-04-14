(function () {
  if (window.__taskCounterLoaded) return;
  window.__taskCounterLoaded = true;

  // ================== AutoFiller Module ==================
  const AutoFiller = {
    queue: [],
    isProcessing: false,
    isFilling: false,

    delay(ms) {
      return new Promise(r => setTimeout(r, ms));
    },

    async waitForPanel(timeout = 2000) {
      await this.delay(200);
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        const lists = document.querySelectorAll('.arco-cascader-list');
        if (lists.length > 0) return lists[0].closest('.arco-cascader-popup') || lists[0];
        await this.delay(100);
      }
      return null;
    },

    findItemInColumn(columnEl, text) {
      const items = columnEl.querySelectorAll(':scope > li[role="menuitem"]');
      for (const item of items) {
        const labelEl = item.querySelector('.arco-cascader-list-item-label span, .arco-cascader-list-item-label');
        const itemText = labelEl ? labelEl.textContent.trim() : item.textContent.trim();
        if (itemText === text) return item;
      }
      return null;
    },

    getColumn(popup, index) {
      const columns = popup.querySelectorAll('.arco-cascader-list');
      return columns[index] || null;
    },

    async fill(path, comboboxIndex = 0) {
      return new Promise((resolve) => {
        this.queue.push({ path, comboboxIndex, resolve });
        this.processQueue();
      });
    },

    async processQueue() {
      if (this.isProcessing || this.queue.length === 0) return;

      this.isProcessing = true;
      const { path, comboboxIndex, resolve } = this.queue.shift();

      try {
        const result = await this.doFill(path, comboboxIndex);
        resolve(result);
      } catch (err) {
        console.error('AutoFiller error:', err);
        resolve(false);
      } finally {
        this.isProcessing = false;
        if (this.queue.length > 0) {
          await this.delay(100);
          this.processQueue();
        }
      }
    },

    async doFill(path, comboboxIndex = 0) {
      if (!path || path.length === 0) return false;

      this.isFilling = true;

      if (this.isTagAdded(comboboxIndex, path)) {
        this.isFilling = false;
        return true;
      }

      const maxRetries = 5;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (attempt > 0) await this.delay(300);

        const result = await this.executeFill(path, comboboxIndex);
        if (!result) continue;

        if (this.isTagAdded(comboboxIndex, path)) {
          this.isFilling = false;
          return true;
        }
      }

      this.isFilling = false;
      return false;
    },

    isTagAdded(comboboxIndex, path) {
      const comboboxes = document.querySelectorAll('[role="combobox"]');
      if (comboboxes.length === 0 || comboboxIndex >= comboboxes.length) return false;
      const target = path.join('/');
      const tags = comboboxes[comboboxIndex].querySelectorAll('.arco-cascader-tag');
      return Array.from(tags).some(t => t.getAttribute('title') === target);
    },

    async executeFill(path, comboboxIndex = 0) {
      if (!path || path.length === 0) return false;

      try {
        this.closeAllMenus();

        const comboboxes = document.querySelectorAll('[role="combobox"]');
        if (comboboxes.length === 0 || comboboxIndex >= comboboxes.length) return false;

        const targetCombobox = comboboxes[comboboxIndex];
        const textbox = targetCombobox.querySelector('input, [role="textbox"]');
        if (!textbox) return false;

        textbox.click();
        await this.delay(300);

        const popup = await this.waitForPanel();
        if (!popup) return false;

        for (let i = 0; i < path.length - 1; i++) {
          const text = path[i];
          const column = this.getColumn(popup, i);
          if (!column) { this.closeAllMenus(); return false; }

          const item = this.findItemInColumn(column, text);
          if (!item) { this.closeAllMenus(); return false; }

          const icon = item.querySelector('.arco-cascader-list-item-icon .arco-icon-hover');
          if (icon) { icon.click(); }
          else { const label = item.querySelector('.arco-cascader-list-item-label'); if (label) label.click(); }

          await this.delay(180);
        }

        const lastText = path[path.length - 1];
        const lastColumn = this.getColumn(popup, path.length - 1);
        if (!lastColumn) { this.closeAllMenus(); return false; }

        const lastItem = this.findItemInColumn(lastColumn, lastText);
        if (!lastItem) { this.closeAllMenus(); return false; }

        const checkbox = lastItem.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.checked) { checkbox.click(); await this.delay(100); }

        await this.delay(80);
        this.closeAllMenus();

        return true;
      } catch (err) {
        console.error('AutoFiller doFill error:', err);
        this.closeAllMenus();
        return false;
      }
    },

    closeAllMenus() {
      const hasMenu = document.querySelectorAll('.arco-cascader-list').length > 0;
      if (hasMenu) {
        const evt = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        document.body.dispatchEvent(evt);
        document.body.click();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      }
    }
  };

  // ================== QuickSelect Module ==================
  const QUICK_SELECT_KEY = "tc_quick_select";
  
  function loadQuickSelect() {
    const raw = localStorage.getItem(QUICK_SELECT_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  function saveQuickSelect(items) { localStorage.setItem(QUICK_SELECT_KEY, JSON.stringify(items)); }

  const CLICK_COUNT_KEY = 'tc_tag_click_count';

  function loadClickCount() {
    const raw = localStorage.getItem(CLICK_COUNT_KEY);
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
  }

  function saveClickCount(counts) { localStorage.setItem(CLICK_COUNT_KEY, JSON.stringify(counts)); }

  function incrementClickCount(pathStr) {
    const counts = loadClickCount();
    counts[pathStr] = (counts[pathStr] || 0) + 1;
    saveClickCount(counts);
    return counts[pathStr];
  }

  function readCurrentTags() {
    const comboboxes = document.querySelectorAll('[role="combobox"]');
    const result = [];
    comboboxes.forEach((combobox, cbIndex) => {
      const tags = combobox.querySelectorAll('.arco-cascader-tag');
      if (tags.length === 0) return;
      const firstTagTitle = tags[0].getAttribute('title') || '';
      const pathParts = firstTagTitle.split('/').map(p => p.trim());
      const title = pathParts.length >= 2 ? pathParts[1] : `题目${cbIndex + 1}`;
      tags.forEach(tag => {
        const titleAttr = tag.getAttribute('title') || '';
        const parts = titleAttr.split('/').map(p => p.trim());
        if (parts.length < 2) return;
        const lastLabel = parts[parts.length - 1];
        const category = parts.length >= 2 ? parts[parts.length - 2] : '';
        result.push({ title, displayLabel: lastLabel, category, path: parts, pathStr: titleAttr, cbIndex });
      });
    });
    return result;
  }

  const DEFAULT_TARGET = 160;
  const DEFAULT_SCHEDULE = [
    { start: "10:00", end: "12:00" },
    { start: "13:00", end: "19:00" }
  ];
  const STORAGE_SETTINGS_KEY = "tc_settings";
  const STORAGE_DATA_KEY = "taskCounterData";
  const TASK_URL_PREFIX = "https://aidp.bytedance.com/operation/task-v2/7583977724970585862/scan/2/";
  const MOYU_AUTO_KEY = 'tc_moyu_auto';
  const MOYU_AUTO_IDLE_KEY = 'tc_moyu_auto_idle';
  const MOYU_AUTO_BG_KEY = 'tc_moyu_auto_bg';

  function todayKey() {
    const now = new Date();
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, "0"), d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function toMinutes(timeStr) {
    if (!timeStr || !timeStr.includes(":")) return null;
    const [h, m] = timeStr.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  }

  function minutesToTime(minutes) {
    const h = String(Math.floor(minutes / 60)).padStart(2, "0"), mm = String(minutes % 60).padStart(2, "0");
    return `${h}:${mm}`;
  }

  function normalizeSchedule(schedule) {
    if (!Array.isArray(schedule)) return [...DEFAULT_SCHEDULE];
    const normalized = schedule.map(seg => {
      const startM = toMinutes(seg?.start), endM = toMinutes(seg?.end);
      if (startM === null || endM === null || endM <= startM) return null;
      return { startM, endM };
    }).filter(Boolean).sort((a, b) => a.startM - b.startM).slice(0, 2)
      .map(seg => ({ start: minutesToTime(seg.startM), end: minutesToTime(seg.endM) }));
    return normalized.length ? normalized : [...DEFAULT_SCHEDULE];
  }

  function loadSettings() {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (!raw) return { target: DEFAULT_TARGET, schedule: [...DEFAULT_SCHEDULE] };
    try { const p = JSON.parse(raw); return { target: Number(p?.target) > 0 ? Number(p.target) : DEFAULT_TARGET, schedule: normalizeSchedule(p?.schedule) }; }
    catch { return { target: DEFAULT_TARGET, schedule: [...DEFAULT_SCHEDULE] }; }
  }

  function saveSettings(s) { localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(s)); }

  function loadData() { const r = localStorage.getItem(STORAGE_DATA_KEY); if (!r) return {}; try { return JSON.parse(r); } catch { return {}; } }
  function saveData(data) { localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(data)); }

  function getTodayCount() { const d = loadData(); const v = Number(d[todayKey()]); return Number.isFinite(v) ? v : 0; }
  function setTodayCount(v) { const d = loadData(); d[todayKey()] = Math.max(0, Math.floor(Number(v) || 0)); saveData(d); }

  function expected() {
    const now = new Date(), nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    let workedMinutes = 0, totalMinutes = 0;
    for (const seg of settings.schedule) {
      const sM = toMinutes(seg.start), eM = toMinutes(seg.end);
      if (sM === null || eM === null || eM <= sM) continue;
      totalMinutes += eM - sM;
      if (nowMinutes <= sM) continue;
      workedMinutes += Math.max(0, Math.min(nowMinutes, eM) - sM);
    }
    return totalMinutes <= 0 ? 0 : Math.floor(Math.min(1, workedMinutes / totalMinutes) * settings.target);
  }

  let settings = loadSettings();

  function progress() { const done = getTodayCount(), exp = expected(); return { done, exp, diff: done - exp }; }
  function getTip(diff) { if (diff >= 4) return "做题太快啦 🚀"; if (diff <= -4) return "抓紧做题！⏰"; return "节奏稳定，继续保持"; }

  function createUI() {
    const bar = document.createElement("div");
    bar.id = "tc-bar";
    bar.innerHTML = `
      <div class="tc-wrap">
        <div id="progressBar" class="tc-progress" aria-hidden="true" title="">
          <div id="expectedBar" class="tc-progress-expected"></div>
          <div id="doneBar" class="tc-progress-done"></div>
        </div>
        <div class="tc-main-row">
          <div class="tc-left">
            <div class="tc-stat">
              <span class="tc-label">完成</span>
              <span id="doneInput" class="tc-number tc-editable" contenteditable="true" role="spinbutton" inputmode="numeric" aria-label="已完成题目"></span>
              <span class="tc-divider">/</span>
              <span id="target" class="tc-number tc-target"></span>
            </div>
            <div class="tc-stat"><span class="tc-label">应完成</span><span id="expected" class="tc-number tc-expected"></span></div>
            <div class="tc-stat"><span class="tc-label">进度差</span><span id="diff" class="tc-number tc-diff"></span></div>
            <div id="tip" class="tc-tip"></div>
          </div>
          <div class="tc-center">小肥羊 2026</div>
          <div class="tc-right">
            <input id="taskIdInput" placeholder="任务ID" />
            <button id="jumpBtn">跳转</button>
            <button id="quickSelectBtn" class="tc-ghost">快捷选择</button>
            <button id="moyuBtn" class="tc-ghost">摸鱼</button>
            <button id="settingsBtn" class="tc-ghost">设置</button>
          </div>
          <div id="moyuTimer" class="tc-moyu-timer" style="display:none;">
            <div class="tc-moyu-header"><span class="tc-moyu-icon">🐟</span><span id="moyuCountdown">120</span>s 后刷新（操作模拟中）</div>
            <div class="tc-moyu-tip">已开启摸鱼，请不要关闭窗口，不要提交题目，不要打开左侧侧边栏，不要手动刷新页面，在设置里调整是否开启自动摸鱼</div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(bar);
    createSettingsPanel();

    const doneInput = document.getElementById("doneInput");
    let inputDebounce;
    doneInput.addEventListener("input", () => {
      clearTimeout(inputDebounce);
      inputDebounce = setTimeout(() => {
        const raw = doneInput.textContent || "", onlyDigits = raw.replace(/[^\d]/g, "");
        if (raw !== onlyDigits) doneInput.textContent = onlyDigits;
        setTodayCount(Number(onlyDigits) || 0); updateUI(true);
      }, 150);
    });

    doneInput.addEventListener("blur", () => updateUI());

    document.getElementById("jumpBtn").onclick = () => {
      const id = document.getElementById("taskIdInput").value.trim();
      if (!id) return;
      window.open(`${TASK_URL_PREFIX}${id}`, "_blank");
    };

    document.getElementById("settingsBtn").onclick = () => {
      fillSettings(); document.getElementById("tc-settings").style.display = "flex";
    };

    document.getElementById("quickSelectBtn").onclick = () => {
      const tags = readCurrentTags(), saved = loadQuickSelect();
      if (tags.length === 0) {
        if (saved.length === 0) showToast('请先在页面上选择标签', 'warn');
        else showQuickSelectMenu([], saved);
        return;
      }
      if (saved.length === 0) { saveQuickSelect(tags); renderQuickFillSection(); showToast(`已保存 ${tags.length} 个标签`, 'ok'); }
      else { showQuickSelectMenu(tags, saved); }
    };

    // ================== 摸鱼模式 v2 ==================
    const MOYU_KEY = 'tc_moyu_active';
    const MOYU_RELOAD_KEY = 'tc_moyu_reload'; // 标记是否为摸鱼自身触发的刷新
    const IDLE_TIMEOUT = 30;
    const MOYU_REFRESH_INTERVAL = 120;

    let moyuInterval = null, moyuCountdownValue = MOYU_REFRESH_INTERVAL, moyuEnabled = false;
    let idleTimer = null, lastActivityTime = Date.now();
    let originalMutedState = new Map(), originalPlayingState = new Map(), originalLoopState = new Map(), moyuActionInterval = null;

    function recordUserActivity() { lastActivityTime = Date.now(); }
    document.addEventListener('mousemove', recordUserActivity, { passive: true });
    document.addEventListener('keydown', recordUserActivity, { passive: true });
    document.addEventListener('click', recordUserActivity, { passive: true });
    document.addEventListener('touchstart', recordUserActivity, { passive: true });
    document.addEventListener('wheel', recordUserActivity, { passive: true });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !moyuEnabled && localStorage.getItem(MOYU_AUTO_BG_KEY) === 'true') {
        sessionStorage.setItem(MOYU_AUTO_KEY, 'true'); startMoyu();
      }
    });

    function startIdleDetection() {
      clearInterval(idleTimer);
      idleTimer = setInterval(() => {
        const autoMoyuEnabled = localStorage.getItem(MOYU_AUTO_IDLE_KEY) === 'true';
        if (!autoMoyuEnabled || moyuEnabled || document.hidden) return;
        const idleSeconds = Math.floor((Date.now() - lastActivityTime) / 1000);
        if (idleSeconds >= IDLE_TIMEOUT) { sessionStorage.setItem(MOYU_AUTO_KEY, 'true'); startMoyu(); }
      }, 5000);
    }

    // 摸鱼模拟点击：4步循环，3秒一轮
    let moyuClickStep = 0, allComboboxInputs = [];

    function simulateMoyuClick() {
      try {
        // 只点击题目内容区域的 combobox（排除侧边栏等非题目区域）
        const mainContent = document.querySelector('.mark-container') || document.querySelector('.task-content') || document.querySelector('main') || document.body;
        const comboboxes = mainContent.querySelectorAll('[role="combobox"]');
        allComboboxInputs = Array.from(comboboxes).map(cb => cb.querySelector('input, [role="textbox"], .arco-input-wrapper')).filter(Boolean);
        switch (moyuClickStep % 4) {
          case 0: if (allComboboxInputs[0]) allComboboxInputs[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); break;
          case 1: document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.click(); break;
          case 2: if (allComboboxInputs[1]) allComboboxInputs[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); break;
          case 3: document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.click(); break;
        }
        moyuClickStep = (moyuClickStep + 1) % 4;
      } catch (e) {}
    }

    function setupVideoMutedLoop() {
      try {
        document.querySelectorAll('video').forEach(video => {
          if (!originalMutedState.has(video)) { originalMutedState.set(video, video.muted); originalPlayingState.set(video, !video.paused); originalLoopState.set(video, video.loop); }
          video.muted = true; video.loop = true;
          if (video.paused && video.readyState >= 2) video.play().catch(() => {});
        });
      } catch (e) {}
    }

    function restoreVideoState() {
      try {
        originalMutedState.forEach((wasMuted, video) => { video.muted = wasMuted; });
        originalPlayingState.forEach((wasPlaying, video) => { if (!wasPlaying && !video.paused) video.pause(); });
        originalLoopState.forEach((wasLoop, video) => { video.loop = wasLoop; });
        originalMutedState.clear(); originalPlayingState.clear(); originalLoopState.clear();
      } catch (e) {}
    }

    function startMoyu() {
      const timer = document.getElementById("moyuTimer"), btn = document.getElementById("moyuBtn");
      moyuCountdownValue = MOYU_REFRESH_INTERVAL; moyuEnabled = true;
      timer.style.display = "flex"; btn.textContent = "停止"; btn.classList.add("tc-moyu-active");
      document.getElementById("moyuCountdown").textContent = moyuCountdownValue;
      sessionStorage.setItem(MOYU_KEY, 'true');
      setupVideoMutedLoop();
      clearInterval(moyuActionInterval);
      moyuActionInterval = setInterval(() => { if (!moyuEnabled) return; simulateMoyuClick(); setupVideoMutedLoop(); }, 10000);
      moyuInterval = setInterval(() => {
        if (!moyuEnabled) { clearInterval(moyuInterval); moyuInterval = null; return; }
        moyuCountdownValue--; document.getElementById("moyuCountdown").textContent = moyuCountdownValue;
        if (moyuCountdownValue <= 0) {
          sessionStorage.setItem(MOYU_RELOAD_KEY, 'true'); // 标记为摸鱼自动刷新
          location.reload();
        }
      }, 1000);
    }

    function stopMoyu() {
      moyuEnabled = false;
      const timer = document.getElementById("moyuTimer"), btn = document.getElementById("moyuBtn");
      if (moyuInterval) { clearInterval(moyuInterval); } moyuInterval = null;
      clearInterval(moyuActionInterval); moyuActionInterval = null;
      moyuClickStep = 0; allComboboxInputs = [];
      // 关闭可能残留的下拉菜单
      try { AutoFiller.closeAllMenus(); } catch(e) {}
      timer.style.display = "none"; btn.textContent = "摸鱼"; btn.classList.remove("tc-moyu-active");
      sessionStorage.removeItem(MOYU_KEY); sessionStorage.removeItem(MOYU_AUTO_KEY);
      restoreVideoState();
      // 重置空闲时间，防止 idle detection 立即重新触发自动摸鱼
      lastActivityTime = Date.now();
    }

    document.getElementById("moyuBtn").onclick = () => {
      if (moyuInterval) { stopMoyu(); } else { lastActivityTime = Date.now(); startMoyu(); }
    };
    // 仅摸鱼自身刷新时恢复（手动F5/跳转不触发）
    if (sessionStorage.getItem(MOYU_KEY) === 'true' && sessionStorage.getItem(MOYU_RELOAD_KEY) === 'true') {
      sessionStorage.removeItem(MOYU_RELOAD_KEY);
      startMoyu();
    }
    startIdleDetection();
    updateUI();
    renderQuickFillSection();
  }

  function showQuickSelectMenu(newTags, savedTags) {
    const existing = document.querySelector('.tc-quick-menu');
    if (existing) existing.remove();
    const menu = document.createElement('div');
    menu.className = 'tc-quick-menu';
    menu.innerHTML = `<div class="tc-quick-menu-item" data-action="replace">替换标签</div><div class="tc-quick-menu-item" data-action="add">${newTags.length === 0 ? '清空标签' : '新增标签'}</div>`;
    const btn = document.getElementById('quickSelectBtn');
    const rect = btn.getBoundingClientRect();
    menu.style.left = rect.left + 'px'; menu.style.top = (rect.top - 70) + 'px';
    document.body.appendChild(menu);
    menu.querySelectorAll('.tc-quick-menu-item').forEach(item => {
      item.onclick = () => {
        const action = item.dataset.action;
        if (action === 'replace') {
          if (newTags.length === 0) { saveQuickSelect([]); renderQuickFillSection(); showToast('已清空标签', 'ok'); }
          else { saveQuickSelect(newTags); renderQuickFillSection(); showToast(`已替换为 ${newTags.length} 个标签`, 'ok'); }
        } else if (action === 'add') {
          if (newTags.length === 0) { saveQuickSelect([]); renderQuickFillSection(); showToast('已清空标签', 'ok'); }
          else { const eps = new Set(savedTags.map(t => t.pathStr)), toAdd = newTags.filter(t => !eps.has(t.pathStr)), merged = [...savedTags, ...toAdd]; saveQuickSelect(merged); renderQuickFillSection(); showToast(`新增 ${toAdd.length} 个标签，共 ${merged.length} 个`, 'ok'); }
        }
        menu.remove();
      };
    });
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) { if (!menu.contains(e.target) && e.target !== btn) { menu.remove(); document.removeEventListener('click', closeMenu); } });
    }, 100);
  }

  const WINDOW_POS_KEY = 'tc_float_window_pos';

  function loadWindowPositions() {
    const raw = localStorage.getItem(WINDOW_POS_KEY);
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
  }
  function saveWindowPositions(positions) { localStorage.setItem(WINDOW_POS_KEY, JSON.stringify(positions)); }

  function clampPosition(left, top, winWidth, winHeight) {
    const vw = window.innerWidth || document.documentElement.clientWidth, vh = window.innerHeight || document.documentElement.clientHeight;
    return { left: Math.max(10, Math.min(left, vw - winWidth - 20)), top: Math.max(10, Math.min(top, vh - winHeight - 80)) };
  }

  function getViewportPosition(el) { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top }; }

  function updateMinimizedIcons() {
    document.querySelectorAll('.tc-minimized-icon').forEach(i => i.remove());
    document.querySelectorAll('.tc-float-window[data-hidden="true"]').forEach((win, i) => {
      const icon = document.createElement('div');
      icon.className = 'tc-minimized-icon'; icon.style.background = win.style.getPropertyValue('--block-border') || '#60a5fa';
      icon.title = win.dataset.title; icon.style.left = (20 + i * 40) + 'px';
      icon.onclick = () => { win.style.display = 'block'; win.dataset.hidden = 'false'; icon.remove(); };
      document.body.appendChild(icon);
    });
  }

  function renderQuickFillSection() {
    document.querySelectorAll('.tc-float-window').forEach(w => w.remove());
    const savedQuick = loadQuickSelect(); if (savedQuick.length === 0) return;
    const savedPositions = loadWindowPositions();
    const groupedByTitle = {};
    savedQuick.forEach(item => { const title = item.title || `题目${item.cbIndex + 1}`; if (!groupedByTitle[title]) groupedByTitle[title] = []; groupedByTitle[title].push(item); });
    const colors = [
      { bg: 'rgba(96, 165, 250, 0.08)', border: '#60a5fa', hover: 'rgba(96, 165, 250, 0.3)' },
      { bg: 'rgba(34, 197, 94, 0.08)', border: '#22c55e', hover: 'rgba(34, 197, 94, 0.3)' },
      { bg: 'rgba(251, 191, 36, 0.08)', border: '#fbbf24', hover: 'rgba(251, 191, 36, 0.3)' },
      { bg: 'rgba(168, 85, 247, 0.08)', border: '#a855f7', hover: 'rgba(168, 85, 247, 0.3)' },
      { bg: 'rgba(239, 68, 68, 0.08)', border: '#ef4444', hover: 'rgba(239, 68, 68, 0.3)' },
    ];
    let colorIndex = 0, offsetX = 20, offsetY = 60;

    for (const title in groupedByTitle) {
      const items = groupedByTitle[title], color = colors[colorIndex++ % colors.length];
      const win = document.createElement('div'); win.className = 'tc-float-window';
      const savedPos = savedPositions[title]; let left = savedPos?.left || offsetX, top = savedPos?.top || offsetY, width = savedPos?.width || 380;
      win.style.cssText = `--block-bg: ${color.bg}; --block-border: ${color.border}; --block-hover: ${color.hover}; left: ${left}px; top: ${top}px; width: ${width}px; resize: both;`;
      win.dataset.title = title;
      document.body.appendChild(win);
      const clamped = clampPosition(left, top, win.offsetWidth || 380, win.offsetHeight || 300);
      if (clamped.left !== left || clamped.top !== top) { win.style.left = clamped.left + 'px'; win.style.top = clamped.top + 'px'; const pos = loadWindowPositions(); pos[title] = { left: clamped.left, top: clamped.top, width }; saveWindowPositions(pos); }

      const grouped = {}; items.forEach(item => { const cat = item.category || '其他'; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(item); });
      const categories = Object.keys(grouped), singleCategory = categories.length === 1;
      const clickCounts = loadClickCount(); const allCounts = items.map(i => clickCounts[i.pathStr] || 0);
      const avg = allCounts.reduce((a, b) => a + b, 0) / allCounts.length; const hotThreshold = Math.max(avg + 5, 5);

      let innerHTML = `<div class="tc-float-header"><span class="tc-float-title">${title}</span><button class="tc-float-close">−</button></div><div class="tc-float-body">`;
      if (singleCategory) {
        grouped[categories[0]].forEach(item => { const c = clickCounts[item.pathStr] || 0; innerHTML += `<button class="tc-fill-tag ${c >= hotThreshold ? 'tc-tag-hot' : ''}" data-cbindex="${item.cbIndex}" data-path='${JSON.stringify(item.path)}' title="${item.pathStr}">${item.displayLabel}</button>`; });
      } else {
        categories.forEach(cat => { innerHTML += `<div class="tc-fill-category-col"><div class="tc-fill-category-name">${cat}</div><div class="tc-fill-category-tags">`; grouped[cat].forEach(item => { const c = clickCounts[item.pathStr] || 0; innerHTML += `<button class="tc-fill-tag ${c >= hotThreshold ? 'tc-tag-hot' : ''}" data-cbindex="${item.cbIndex}" data-path='${JSON.stringify(item.path)}' title="${item.pathStr}">${item.displayLabel}</button>`; }); innerHTML += `</div></div>`; });
      }
      innerHTML += '</div>'; win.innerHTML = innerHTML;

      const header = win.querySelector('.tc-float-header');
      let isDragging = false, dragStartX, dragStartY, winStartX, winStartY;
      header.addEventListener('mousedown', (e) => { if (e.target.classList.contains('tc-float-close')) return; isDragging = true; dragStartX = e.clientX; dragStartY = e.clientY; winStartX = win.offsetLeft; winStartY = win.offsetTop; e.preventDefault(); });
      document.addEventListener('mousemove', (e) => { if (!isDragging) return; win.style.left = (winStartX + e.clientX - dragStartX) + 'px'; win.style.top = (winStartY + e.clientY - dragStartY) + 'px'; });
      document.addEventListener('mouseup', () => { if (isDragging) { isDragging = false; const vp = getViewportPosition(win); const pos = loadWindowPositions(); pos[title] = { left: vp.left, top: vp.top, width: win.offsetWidth }; saveWindowPositions(pos); } });
      let resizeTimeout; new ResizeObserver(() => { clearTimeout(resizeTimeout); resizeTimeout = setTimeout(() => { const vp = getViewportPosition(win); const pos = loadWindowPositions(); pos[title] = { left: vp.left, top: vp.top, width: win.offsetWidth }; saveWindowPositions(pos); }, 300); }).observe(win);
      win.querySelector('.tc-float-close').onclick = () => { win.style.display = 'none'; win.dataset.hidden = 'true'; updateMinimizedIcons(); };
      win.querySelectorAll('.tc-fill-tag').forEach(btn => { btn.addEventListener('mousedown', (e) => e.stopPropagation()); btn.onclick = async (e) => { e.stopPropagation(); const cbIndex = parseInt(btn.dataset.cbindex), path = JSON.parse(btn.dataset.path), pathStr = btn.title; incrementClickCount(pathStr); const nC = incrementClickCount(pathStr); const aPs = Array.from(win.querySelectorAll('.tc-fill-tag')).map(b => b.title), rCs = loadClickCount(); const cts = aPs.map(ps => rCs[ps] || 0), avg2 = cts.reduce((a, b) => a + b, 0) / cts.length, th = Math.max(avg2 + 5, 5); if (nC >= th) btn.classList.add('tc-tag-hot'); btn.classList.add('loading'); await AutoFiller.fill(path, cbIndex); btn.classList.remove('loading'); }; });
      offsetX += 220;
    }
  }

  function createSettingsPanel() {
    const panel = document.createElement("div"); panel.id = "tc-settings";
    panel.innerHTML = `
      <div class="tc-modal">
        <div class="tc-modal-header"><h3>设置</h3></div>
        <div class="tc-modal-body">
          <label>每日目标</label><input id="setTarget" type="number" min="1" />
          <label>工作时间1</label><div class="tc-time"><input id="t1s" type="time" /><span>-</span><input id="t1e" type="time" /></div>
          <label>工作时间2</label><div class="tc-time"><input id="t2s" type="time" /><span>-</span><input id="t2e" type="time" /></div>
          <label class="tc-toggle-row"><span>空闲30秒自动摸鱼</span><input type="checkbox" id="autoMoyuIdleToggle" class="tc-toggle-input" /><label for="autoMoyuIdleToggle" class="tc-toggle-switch"></label></label>
          <label class="tc-toggle-row"><span>切换后台自动摸鱼</span><input type="checkbox" id="autoMoyuBgToggle" class="tc-toggle-input" /><label for="autoMoyuBgToggle" class="tc-toggle-switch"></label></label>
        </div>
        <div class="tc-actions"><button id="saveSettings">保存</button><button id="closeSettings" class="tc-ghost">取消</button></div>
      </div>`;
    document.body.appendChild(panel);

    document.getElementById("saveSettings").onclick = () => {
      const target = Number(document.getElementById("setTarget").value) || DEFAULT_TARGET;
      const nextSchedule = normalizeSchedule([
        { start: document.getElementById("t1s").value, end: document.getElementById("t1e").value },
        { start: document.getElementById("t2s").value, end: document.getElementById("t2e").value }
      ]);
      localStorage.setItem(MOYU_AUTO_IDLE_KEY, String(document.getElementById('autoMoyuIdleToggle').checked));
      localStorage.setItem(MOYU_AUTO_BG_KEY, String(document.getElementById('autoMoyuBgToggle').checked));
      settings = { target: target > 0 ? Math.floor(target) : DEFAULT_TARGET, schedule: nextSchedule };
      saveSettings(settings); panel.style.display = "none"; updateUI();
    };
    document.getElementById("closeSettings").onclick = () => { panel.style.display = "none"; };
    panel.addEventListener("click", (e) => { if (e.target === panel) panel.style.display = "none"; });
    fillSettings();
  }

  function fillSettings() {
    document.getElementById("setTarget").value = settings.target;
    document.getElementById("t1s").value = settings.schedule[0]?.start || DEFAULT_SCHEDULE[0].start;
    document.getElementById("t1e").value = settings.schedule[0]?.end || DEFAULT_SCHEDULE[0].end;
    document.getElementById("t2s").value = settings.schedule[1]?.start || "";
    document.getElementById("t2e").value = settings.schedule[1]?.end || "";
    const tIdle = document.getElementById('autoMoyuIdleToggle'); if (tIdle) tIdle.checked = localStorage.getItem(MOYU_AUTO_IDLE_KEY) === 'true';
    const tBg = document.getElementById('autoMoyuBgToggle'); if (tBg) tBg.checked = localStorage.getItem(MOYU_AUTO_BG_KEY) === 'true';
  }

  function showToast(msg, type = 'ok') {
    const ex = document.querySelector('.tc-toast'); if (ex) ex.remove();
    const toast = document.createElement('div'); toast.className = `tc-toast tc-toast-${type}`; toast.textContent = msg;
    document.body.appendChild(toast); requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 2000);
  }

  function updateUI(keepEditing = false) {
    const p = progress(); const doneInput = document.getElementById("doneInput");
    if (doneInput && (!keepEditing && document.activeElement !== doneInput)) doneInput.textContent = String(p.done);
    document.getElementById("target").innerText = settings.target; document.getElementById("expected").innerText = p.exp; document.getElementById("diff").innerText = p.diff;
    const dr = settings.target > 0 ? Math.min(1, p.done / settings.target) : 0, er = settings.target > 0 ? Math.min(1, p.exp / settings.target) : 0;
    document.getElementById("doneBar").style.width = `${dr * 100}%`; document.getElementById("expectedBar").style.width = `${er * 100}%`;
    document.getElementById("progressBar").title = `已完成 ${p.done} / ${settings.target}，应完成 ${p.exp}，进度差 ${p.diff}`;
    const diffEl = document.getElementById("diff"); diffEl.classList.remove("is-positive", "is-negative", "is-neutral");
    if (p.diff > 0) diffEl.classList.add("is-positive"); else if (p.diff < 0) diffEl.classList.add("is-negative"); else diffEl.classList.add("is-neutral");
    document.getElementById("tip").innerText = getTip(p.diff);
  }

  function detectSubmit() {
    document.addEventListener("click", (e) => {
      // 彻底排除插件自身所有元素（通过 tc- 前缀统一识别）
      let exclude = false, checkEl = e.target;
      while (checkEl && checkEl !== document.body) {
        if (checkEl.id && checkEl.id.startsWith('tc')) { exclude = true; break; }
        if (checkEl.className && typeof checkEl.className === 'string' && /\btc-/.test(checkEl.className)) { exclude = true; break; }
        checkEl = checkEl.parentElement;
      }
      if (exclude) return;

      // 排除 AutoFiller 填充期间的程序化点击
      if (AutoFiller.isFilling) return;

      let el = e.target;
      for (let i = 0; i < 8 && el; i++) {
        const rawText = (el.innerText || el.textContent || ''), text = rawText.trim();
        
        // 提交按钮 — 精确匹配
        if (text === '提交') { setTodayCount(getTodayCount() + 1); updateUI(); return; }
        
        // 上一题按钮 — 精确匹配（必须是"上一题"开头）
        const isPrevBtn = /^上一题(\s*\(.*?\)\s*\d*\s*s?)?$/.test(text);
        if (isPrevBtn) {
          // 验证1：向上查找包含 prev/btn-hover 的按钮容器（有class时用style判断禁用状态）
          const btnContainer = el.closest('[class*="prev"], [class*="btn-hover"]');
          if (btnContainer) {
            const style = getComputedStyle(btnContainer);
            const isDisabled =
              !!btnContainer.disabled || btnContainer.getAttribute('disabled') !== null ||
              btnContainer.getAttribute('aria-disabled') === 'true' ||
              (btnContainer.className || '').toLowerCase().includes('disabled') ||
              parseFloat(style.opacity) < 0.5 || style.pointerEvents === 'none' || style.cursor === 'not-allowed';
            if (!isDisabled) { setTodayCount(Math.max(0, getTodayCount() - 1)); updateUI(); }
            return;
          }

          // 验证2：没有class时，检查是否有 svg/img 图标兄弟（确认是按钮而非普通文本）
          const hasIconSibling = el.parentElement && Array.from(el.parentElement.children).some(c =>
            c.tagName === 'IMG' || c.tagName === 'SVG' || c.querySelector('svg, img')
          );
          if (hasIconSibling) {
            // 检查父元素的 cursor 样式判断是否可用
            const parentStyle = el.parentElement ? getComputedStyle(el.parentElement) : null;
            const gpStyle = el.parentElement?.parentElement ? getComputedStyle(el.parentElement.parentElement) : null;
            const isDisabledByCursor =
            (parentStyle && parentStyle.cursor === 'not-allowed') ||
            (gpStyle && gpStyle.cursor === 'not-allowed');
            if (!isDisabledByCursor) { setTodayCount(Math.max(0, getTodayCount() - 1)); updateUI(); }
            return;
          }

          // 验证3：都不满足则继续向上查找（排除页面纯文本误匹配）
          el = el.parentElement;
          continue;
        }
        el = el.parentElement;
      }
    });
  }

  function init() { createUI(); detectSubmit(); setInterval(updateUI, 60000); }
  if (document.readyState === "complete") init(); else window.addEventListener("load", init);
})();
