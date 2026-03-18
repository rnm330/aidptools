(function () {
  if (window.__taskCounterLoaded) return;
  window.__taskCounterLoaded = true;

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
          <button id="settingsBtn" class="tc-ghost">设置</button>
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

    updateUI();
  }

  function createSettingsPanel() {
    const panel = document.createElement("div");
    panel.id = "tc-settings";

    panel.innerHTML = `
      <div class="tc-modal">
        <h3>工作设置</h3>

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

        <div class="tc-actions">
          <button id="saveSettings">保存</button>
          <button id="closeSettings" class="tc-ghost">取消</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    document.getElementById("closeSettings").onclick = () => {
      panel.style.display = "none";
    };

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
      const btn = e.target.closest("button");
      if (!btn) return;
      const text = btn.innerText;
      if (text.includes("提交")) {
        setTodayCount(getTodayCount() + 1);
        updateUI();
      } else if (text.includes("上一题")) {
        setTodayCount(Math.max(0, getTodayCount() - 1));
        updateUI();
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
