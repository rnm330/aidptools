(function () {
  if (window.__taskCounterLoaded) return;
  window.__taskCounterLoaded = true;

  // ================== AutoFiller Module ==================
  const AutoFiller = {
    queue: [],
    isProcessing: false,

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

      // 前置检查：标签已存在则跳过
      if (this.isTagAdded(comboboxIndex, path)) return true;

      // 执行填充，循环重试直到标签确认存在
      const maxRetries = 5;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (attempt > 0) await this.delay(300);

        const result = await this.executeFill(path, comboboxIndex);
        if (!result) continue;

        // 验证标签是否已存在
        if (this.isTagAdded(comboboxIndex, path)) return true;
      }

      return false;
    },

    // 检查标签是否已存在（用 "/" 分隔符，与 cascader title 一致）
    isTagAdded(comboboxIndex, path) {
      const comboboxes = document.querySelectorAll('[role="combobox"]');
      if (comboboxes.length === 0 || comboboxIndex >= comboboxes.length) return false;
      const target = path.join('/');
      const tags = comboboxes[comboboxIndex].querySelectorAll('.arco-cascader-tag');
      return Array.from(tags).some(t => t.getAttribute('title') === target);
    },

    // 实际填充逻辑
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
          if (!column) {
            this.closeAllMenus();
            return false;
          }

          const item = this.findItemInColumn(column, text);
          if (!item) {
            this.closeAllMenus();
            return false;
          }

          const icon = item.querySelector('.arco-cascader-list-item-icon .arco-icon-hover');
          if (icon) {
            icon.click();
          } else {
            const label = item.querySelector('.arco-cascader-list-item-label');
            if (label) label.click();
          }

          await this.delay(180);
        }

        const lastText = path[path.length - 1];
        const lastColumn = this.getColumn(popup, path.length - 1);
        if (!lastColumn) {
          this.closeAllMenus();
          return false;
        }

        const lastItem = this.findItemInColumn(lastColumn, lastText);
        if (!lastItem) {
          this.closeAllMenus();
          return false;
        }

        const checkbox = lastItem.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.checked) {
          checkbox.click();
          await this.delay(100);
        }

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
    },

    async waitForMenuClose(timeout = 500) {
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        if (document.querySelectorAll('.arco-cascader-list').length === 0) {
          return true;
        }
        await this.delay(50);
      }
      return false;
    }
  };

  // ================== QuickSelect Module ==================
  const QUICK_SELECT_KEY = "tc_quick_select";
  
  function loadQuickSelect() {
    const raw = localStorage.getItem(QUICK_SELECT_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  function saveQuickSelect(items) {
    localStorage.setItem(QUICK_SELECT_KEY, JSON.stringify(items));
  }

  // 点击计数
  const CLICK_COUNT_KEY = 'tc_tag_click_count';

  function loadClickCount() {
    const raw = localStorage.getItem(CLICK_COUNT_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  function saveClickCount(counts) {
    localStorage.setItem(CLICK_COUNT_KEY, JSON.stringify(counts));
  }

  function incrementClickCount(pathStr) {
    const counts = loadClickCount();
    counts[pathStr] = (counts[pathStr] || 0) + 1;
    saveClickCount(counts);
    return counts[pathStr];
  }

  // 读取当前页面已选标签
  function readCurrentTags() {
    const comboboxes = document.querySelectorAll('[role="combobox"]');
    const result = [];

    comboboxes.forEach((combobox, cbIndex) => {
      const tags = combobox.querySelectorAll('.arco-cascader-tag');
      if (tags.length === 0) return;

      // 获取标题（从第一个标签的路径中提取）
      const firstTagTitle = tags[0].getAttribute('title') || '';
      const pathParts = firstTagTitle.split('/').map(p => p.trim());
      const title = pathParts.length >= 2 ? pathParts[1] : `题目${cbIndex + 1}`;

      tags.forEach(tag => {
        const titleAttr = tag.getAttribute('title') || '';
        const parts = titleAttr.split('/').map(p => p.trim());
        
        if (parts.length < 2) return;

        const path = parts;
        const lastLabel = parts[parts.length - 1];
        const category = parts.length >= 2 ? parts[parts.length - 2] : '';

        result.push({
          title,
          displayLabel: lastLabel,
          category,
          path,
          pathStr: titleAttr,
          cbIndex
        });
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

  function todayKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function toMinutes(timeStr) {
    if (!timeStr || !timeStr.includes(":")) return null;
    const [h, m] = timeStr.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  }

  function minutesToTime(minutes) {
    const h = String(Math.floor(minutes / 60)).padStart(2, "0");
    const m = String(minutes % 60).padStart(2, "0");
    return `${h}:${m}`;
  }

  function normalizeSchedule(schedule) {
    if (!Array.isArray(schedule)) return [...DEFAULT_SCHEDULE];

    const normalized = schedule
      .map((seg) => {
        const startM = toMinutes(seg?.start);
        const endM = toMinutes(seg?.end);
        if (startM === null || endM === null || endM <= startM) return null;
        return { startM, endM };
      })
      .filter(Boolean)
      .sort((a, b) => a.startM - b.startM)
      .slice(0, 2)
      .map((seg) => ({ start: minutesToTime(seg.startM), end: minutesToTime(seg.endM) }));

    if (!normalized.length) {
      return [...DEFAULT_SCHEDULE];
    }

    return normalized;
  }

  function loadSettings() {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (!raw) {
      return { target: DEFAULT_TARGET, schedule: [...DEFAULT_SCHEDULE] };
    }
    try {
      const parsed = JSON.parse(raw);
      return {
        target: Number(parsed?.target) > 0 ? Number(parsed.target) : DEFAULT_TARGET,
        schedule: normalizeSchedule(parsed?.schedule)
      };
    } catch {
      return { target: DEFAULT_TARGET, schedule: [...DEFAULT_SCHEDULE] };
    }
  }

  function saveSettings(s) {
    localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(s));
  }

  function loadData() {
    const raw = localStorage.getItem(STORAGE_DATA_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  function saveData(data) {
    localStorage.setItem(STORAGE_DATA_KEY, JSON.stringify(data));
  }

  function getTodayCount() {
    const data = loadData();
    const value = Number(data[todayKey()]);
    return Number.isFinite(value) ? value : 0;
  }

  function setTodayCount(v) {
    const data = loadData();
    data[todayKey()] = Math.max(0, Math.floor(Number(v) || 0));
    saveData(data);
  }

  function expected() {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

    let workedMinutes = 0;
    let totalMinutes = 0;

    for (const seg of settings.schedule) {
      const startM = toMinutes(seg.start);
      const endM = toMinutes(seg.end);
      if (startM === null || endM === null || endM <= startM) continue;

      totalMinutes += endM - startM;
      if (nowMinutes <= startM) continue;

      workedMinutes += Math.max(0, Math.min(nowMinutes, endM) - startM);
    }

    if (totalMinutes <= 0) return 0;
    return Math.floor(Math.min(1, workedMinutes / totalMinutes) * settings.target);
  }

  let settings = loadSettings();

  function progress() {
    const done = getTodayCount();
    const exp = expected();
    return { done, exp, diff: done - exp };
  }

  function getTip(diff) {
    if (diff >= 4) return "做题太快啦 🚀";
    if (diff <= -4) return "抓紧做题！⏰";
    return "节奏稳定，继续保持";
  }

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

            <div class="tc-stat">
              <span class="tc-label">应完成</span>
              <span id="expected" class="tc-number tc-expected"></span>
            </div>

            <div class="tc-stat">
              <span class="tc-label">进度差</span>
              <span id="diff" class="tc-number tc-diff"></span>
            </div>

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
          <div id="moyuTimer" class="tc-moyu-timer" style="display: none;">
            <span class="tc-moyu-icon">🐟</span>
            <span id="moyuCountdown">120</span>s 后刷新
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(bar);
    createSettingsPanel();

    const doneInput = document.getElementById("doneInput");
    doneInput.addEventListener("input", () => {
      const raw = doneInput.textContent || "";
      const onlyDigits = raw.replace(/[^\d]/g, "");
      if (raw !== onlyDigits) doneInput.textContent = onlyDigits;
      setTodayCount(Number(onlyDigits) || 0);
      updateUI(true);
    });

    doneInput.addEventListener("blur", () => updateUI());

    document.getElementById("jumpBtn").onclick = () => {
      const id = document.getElementById("taskIdInput").value.trim();
      if (!id) return;
      window.open(`${TASK_URL_PREFIX}${id}`, "_blank");
    };

    document.getElementById("settingsBtn").onclick = () => {
      fillSettings();
      document.getElementById("tc-settings").style.display = "flex";
    };

    document.getElementById("quickSelectBtn").onclick = () => {
      const tags = readCurrentTags();
      const saved = loadQuickSelect();

      if (tags.length === 0) {
        // 没有选择标签
        if (saved.length === 0) {
          // 也没有已保存的标签
          showToast('请先在页面上选择标签', 'warn');
        } else {
          // 有已保存的标签，显示替换/新增菜单
          showQuickSelectMenu([], saved);
        }
        return;
      }

      // 有选择标签
      if (saved.length === 0) {
        // 没有已保存的标签，直接保存
        saveQuickSelect(tags);
        renderQuickFillSection();
        showToast(`已保存 ${tags.length} 个标签`, 'ok');
      } else {
        // 有已保存的标签，显示替换/新增菜单
        showQuickSelectMenu(tags, saved);
      }
    };

    // 摸鱼按钮逻辑
    let moyuInterval = null;
    let moyuCountdownValue = 120;

    document.getElementById("moyuBtn").onclick = () => {
      const timer = document.getElementById("moyuTimer");
      const btn = document.getElementById("moyuBtn");

      if (moyuInterval) {
        // 关闭自动刷新
        clearInterval(moyuInterval);
        moyuInterval = null;
        timer.style.display = "none";
        btn.textContent = "摸鱼";
        btn.classList.remove("tc-moyu-active");
        showToast("已关闭摸鱼模式", "ok");
      } else {
        // 开启自动刷新
        moyuCountdownValue = 120;
        timer.style.display = "flex";
        btn.textContent = "停止";
        btn.classList.add("tc-moyu-active");
        document.getElementById("moyuCountdown").textContent = moyuCountdownValue;
        showToast("摸鱼模式已开启，120秒后自动刷新", "ok");

        moyuInterval = setInterval(() => {
          moyuCountdownValue--;
          document.getElementById("moyuCountdown").textContent = moyuCountdownValue;

          if (moyuCountdownValue <= 0) {
            location.reload();
          }
        }, 1000);
      }
    };

    updateUI();
    renderQuickFillSection();
  }

  // 显示快捷选择菜单
  function showQuickSelectMenu(newTags, savedTags) {
    const existing = document.querySelector('.tc-quick-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'tc-quick-menu';
    menu.innerHTML = `
      <div class="tc-quick-menu-item" data-action="replace">替换标签</div>
      <div class="tc-quick-menu-item" data-action="add">${newTags.length === 0 ? '清空标签' : '新增标签'}</div>
    `;

    const btn = document.getElementById('quickSelectBtn');
    const rect = btn.getBoundingClientRect();
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.top - 70) + 'px';

    document.body.appendChild(menu);

    menu.querySelectorAll('.tc-quick-menu-item').forEach(item => {
      item.onclick = () => {
        const action = item.dataset.action;
        if (action === 'replace') {
          if (newTags.length === 0) {
            saveQuickSelect([]);
            renderQuickFillSection();
            showToast('已清空标签', 'ok');
          } else {
            saveQuickSelect(newTags);
            renderQuickFillSection();
            showToast(`已替换为 ${newTags.length} 个标签`, 'ok');
          }
        } else if (action === 'add') {
          if (newTags.length === 0) {
            // 清空标签
            saveQuickSelect([]);
            renderQuickFillSection();
            showToast('已清空标签', 'ok');
          } else {
            // 合并标签，去重
            const existingPaths = new Set(savedTags.map(t => t.pathStr));
            const toAdd = newTags.filter(t => !existingPaths.has(t.pathStr));
            const merged = [...savedTags, ...toAdd];
            saveQuickSelect(merged);
            renderQuickFillSection();
            showToast(`新增 ${toAdd.length} 个标签，共 ${merged.length} 个`, 'ok');
          }
        }
        menu.remove();
      };
    });

    // 点击外部关闭
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target) && e.target !== btn) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 100);
  }

  const WINDOW_POS_KEY = 'tc_float_window_pos';

  function loadWindowPositions() {
    const raw = localStorage.getItem(WINDOW_POS_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  function saveWindowPositions(positions) {
    localStorage.setItem(WINDOW_POS_KEY, JSON.stringify(positions));
  }

  // 更新最小化图标
  function updateMinimizedIcons() {
    // 移除旧图标
    document.querySelectorAll('.tc-minimized-icon').forEach(i => i.remove());

    // 为每个隐藏的窗口创建图标
    const windows = document.querySelectorAll('.tc-float-window[data-hidden="true"]');
    windows.forEach((win, i) => {
      const icon = document.createElement('div');
      icon.className = 'tc-minimized-icon';

      // 使用窗口的颜色
      const borderColor = win.style.getPropertyValue('--block-border') || '#60a5fa';
      icon.style.background = borderColor;
      icon.title = win.dataset.title;

      icon.style.left = (20 + i * 40) + 'px';

      icon.onclick = () => {
        win.style.display = 'block';
        win.dataset.hidden = 'false';
        icon.remove();
      };

      document.body.appendChild(icon);
    });
  }

  // 渲染浮动窗口
  function renderQuickFillSection() {
    // 清除旧窗口
    document.querySelectorAll('.tc-float-window').forEach(w => w.remove());

    const savedQuick = loadQuickSelect();
    if (savedQuick.length === 0) return;

    const savedPositions = loadWindowPositions();

    // 按标题分组
    const groupedByTitle = {};
    savedQuick.forEach(item => {
      const title = item.title || `题目${item.cbIndex + 1}`;
      if (!groupedByTitle[title]) groupedByTitle[title] = [];
      groupedByTitle[title].push(item);
    });

    const colors = [
      { bg: 'rgba(96, 165, 250, 0.08)', border: '#60a5fa', hover: 'rgba(96, 165, 250, 0.3)' },
      { bg: 'rgba(34, 197, 94, 0.08)', border: '#22c55e', hover: 'rgba(34, 197, 94, 0.3)' },
      { bg: 'rgba(251, 191, 36, 0.08)', border: '#fbbf24', hover: 'rgba(251, 191, 36, 0.3)' },
      { bg: 'rgba(168, 85, 247, 0.08)', border: '#a855f7', hover: 'rgba(168, 85, 247, 0.3)' },
      { bg: 'rgba(239, 68, 68, 0.08)', border: '#ef4444', hover: 'rgba(239, 68, 68, 0.3)' },
    ];

    let colorIndex = 0;
    let offsetX = 20;
    const offsetY = 60;

    for (const title in groupedByTitle) {
      const items = groupedByTitle[title];
      const color = colors[colorIndex % colors.length];
      colorIndex++;

      // 创建浮动窗口
      const win = document.createElement('div');
      win.className = 'tc-float-window';

      // 使用保存的位置或默认位置
      const savedPos = savedPositions[title];
      const left = savedPos?.left || offsetX;
      const top = savedPos?.top || offsetY;
      const width = savedPos?.width || '';

      win.style.cssText = `--block-bg: ${color.bg}; --block-border: ${color.border}; --block-hover: ${color.hover}; left: ${left}px; top: ${top}px; ${width ? 'width: ' + width + 'px' : ''}`;
      win.dataset.title = title;

      // 按 category 分组
      const grouped = {};
      items.forEach(item => {
        const cat = item.category || '其他';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
      });

      const categories = Object.keys(grouped);
      const singleCategory = categories.length === 1;

      const clickCounts = loadClickCount();
      // 计算平均点击次数，热门阈值 = 平均 + 5
      const allCounts = items.map(i => clickCounts[i.pathStr] || 0);
      const avg = allCounts.reduce((a, b) => a + b, 0) / allCounts.length;
      const hotThreshold = Math.max(avg + 5, 5);

      let innerHTML = `<div class="tc-float-header"><span class="tc-float-title">${title}</span><button class="tc-float-close">−</button></div><div class="tc-float-body">`;

      if (singleCategory) {
        grouped[categories[0]].forEach(item => {
          const count = clickCounts[item.pathStr] || 0;
          const highlight = count >= hotThreshold ? 'tc-tag-hot' : '';
          innerHTML += `<button class="tc-fill-tag ${highlight}" data-cbindex="${item.cbIndex}" data-path='${JSON.stringify(item.path)}' title="${item.pathStr}">${item.displayLabel}</button>`;
        });
      } else {
        categories.forEach(cat => {
          innerHTML += `<div class="tc-fill-category-col"><div class="tc-fill-category-name">${cat}</div><div class="tc-fill-category-tags">`;
          grouped[cat].forEach(item => {
            const count = clickCounts[item.pathStr] || 0;
            const highlight = count >= hotThreshold ? 'tc-tag-hot' : '';
            innerHTML += `<button class="tc-fill-tag ${highlight}" data-cbindex="${item.cbIndex}" data-path='${JSON.stringify(item.path)}' title="${item.pathStr}">${item.displayLabel}</button>`;
          });
          innerHTML += `</div></div>`;
        });
      }

      innerHTML += '</div>';
      win.innerHTML = innerHTML;

      document.body.appendChild(win);

      // 拖拽
      const header = win.querySelector('.tc-float-header');
      let isDragging = false;
      let dragStartX, dragStartY, winStartX, winStartY;

      header.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('tc-float-close')) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        winStartX = win.offsetLeft;
        winStartY = win.offsetTop;
        e.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        win.style.left = (winStartX + dx) + 'px';
        win.style.top = (winStartY + dy) + 'px';
      });

      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          // 保存位置
          const positions = loadWindowPositions();
          positions[title] = {
            left: win.offsetLeft,
            top: win.offsetTop,
            width: win.offsetWidth
          };
          saveWindowPositions(positions);
        }
      });

      // 调整大小时保存
      const resizeObserver = new ResizeObserver(() => {
        const positions = loadWindowPositions();
        positions[title] = {
          left: win.offsetLeft,
          top: win.offsetTop,
          width: win.offsetWidth
        };
        saveWindowPositions(positions);
      });
      resizeObserver.observe(win);

      // 最小化
      win.querySelector('.tc-float-close').onclick = () => {
        win.style.display = 'none';
        win.dataset.hidden = 'true';
        updateMinimizedIcons();
      };

      // 标签点击
      win.querySelectorAll('.tc-fill-tag').forEach(btn => {
        btn.addEventListener('mousedown', (e) => e.stopPropagation());
        btn.onclick = async (e) => {
          e.stopPropagation();
          const cbIndex = parseInt(btn.dataset.cbindex);
          const path = JSON.parse(btn.dataset.path);
          const pathStr = btn.title;

          // 增加点击计数
          const newCount = incrementClickCount(pathStr);

          // 动态高亮：重新计算所有标签的平均值
          const allPathStrs = Array.from(win.querySelectorAll('.tc-fill-tag')).map(b => b.title);
          const rawCounts = loadClickCount();
          const counts = allPathStrs.map(ps => rawCounts[ps] || 0);
          const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
          const threshold = Math.max(avg + 5, 5);
          if (newCount >= threshold) {
            btn.classList.add('tc-tag-hot');
          }

          btn.classList.add('loading');
          await AutoFiller.fill(path, cbIndex);
          btn.classList.remove('loading');
        };
      });

      offsetX += 220;
    }
  }

  function createSettingsPanel() {
    const panel = document.createElement("div");
    panel.id = "tc-settings";

    panel.innerHTML = `
      <div class="tc-modal">
        <div class="tc-modal-header">
          <h3>设置</h3>
        </div>

        <div class="tc-modal-body">
          <label>每日目标</label>
          <input id="setTarget" type="number" min="1" />

          <label>工作时间1</label>
          <div class="tc-time">
            <input id="t1s" type="time" />
            <span>-</span>
            <input id="t1e" type="time" />
          </div>

          <label>工作时间2</label>
          <div class="tc-time">
            <input id="t2s" type="time" />
            <span>-</span>
            <input id="t2e" type="time" />
          </div>
        </div>

        <div class="tc-actions">
          <button id="saveSettings">保存</button>
          <button id="closeSettings" class="tc-ghost">取消</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    document.getElementById("saveSettings").onclick = () => {
      const target = Number(document.getElementById("setTarget").value) || DEFAULT_TARGET;
      const nextSchedule = normalizeSchedule([
        { start: document.getElementById("t1s").value, end: document.getElementById("t1e").value },
        { start: document.getElementById("t2s").value, end: document.getElementById("t2e").value }
      ]);

      settings = {
        target: target > 0 ? Math.floor(target) : DEFAULT_TARGET,
        schedule: nextSchedule
      };

      saveSettings(settings);
      panel.style.display = "none";
      updateUI();
    };

    document.getElementById("closeSettings").onclick = () => {
      panel.style.display = "none";
    };

    panel.addEventListener("click", (e) => {
      if (e.target === panel) panel.style.display = "none";
    });

    fillSettings();
  }


  function fillSettings() {
    document.getElementById("setTarget").value = settings.target;
    document.getElementById("t1s").value = settings.schedule[0]?.start || DEFAULT_SCHEDULE[0].start;
    document.getElementById("t1e").value = settings.schedule[0]?.end || DEFAULT_SCHEDULE[0].end;
    document.getElementById("t2s").value = settings.schedule[1]?.start || "";
    document.getElementById("t2e").value = settings.schedule[1]?.end || "";
  }

  // 气泡提示
  function showToast(msg, type = 'ok') {
    const existing = document.querySelector('.tc-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `tc-toast tc-toast-${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  function updateUI(keepEditing = false) {
    const p = progress();
    const doneInput = document.getElementById("doneInput");

    if (doneInput && (!keepEditing && document.activeElement !== doneInput)) {
      doneInput.textContent = String(p.done);
    }

    document.getElementById("target").innerText = settings.target;
    document.getElementById("expected").innerText = p.exp;
    document.getElementById("diff").innerText = p.diff;

    const doneRatio = settings.target > 0 ? Math.min(1, p.done / settings.target) : 0;
    const expectedRatio = settings.target > 0 ? Math.min(1, p.exp / settings.target) : 0;
    document.getElementById("doneBar").style.width = `${doneRatio * 100}%`;
    document.getElementById("expectedBar").style.width = `${expectedRatio * 100}%`;

    const progressBar = document.getElementById("progressBar");
    progressBar.title = `已完成 ${p.done} / ${settings.target}，应完成 ${p.exp}，进度差 ${p.diff}`;

    const diffEl = document.getElementById("diff");
    diffEl.classList.remove("is-positive", "is-negative", "is-neutral");
    if (p.diff > 0) diffEl.classList.add("is-positive");
    else if (p.diff < 0) diffEl.classList.add("is-negative");
    else diffEl.classList.add("is-neutral");

    document.getElementById("tip").innerText = getTip(p.diff);
  }

  function detectSubmit() {
    document.addEventListener("click", (e) => {
      let el = e.target;
      for (let i = 0; i < 5 && el; i++) {
        const text = (el.innerText || '').trim();
        if (text === '提交') {
          setTodayCount(getTodayCount() + 1);
          updateUI();
          return;
        }
        if (text === '上一题') {
          // 向上找到实际的按钮容器（含 btn-hover class），再检查 disabled
          let container = el;
          while (container && container !== document.body) {
            if ((container.className + '').includes('btn-hover')) break;
            container = container.parentElement;
          }
          if (container && !(container.className + '').includes('disabled')) {
            setTodayCount(Math.max(0, getTodayCount() - 1));
            updateUI();
          }
          return;
        }
        el = el.parentElement;
      }
    });
  }

  function init() {
    createUI();
    detectSubmit();
    setInterval(updateUI, 60000);
  }

  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init);
  }
})();
