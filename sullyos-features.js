(function () {
  "use strict";

  const PLUGIN_ID = "sullyos-features";
  const APP_HOT = "sullyos-features-hot-daily";
  const APP_NEST = "sullyos-features-little-nest";

  const STORAGE_KEYS = {
    hotSettings: "hot-settings",
    hotCache: "hot-cache",
    nestCharacter: "nest-character",
    nestCache: "nest-cache",
    nestPrompt: "nest-prompt"
  };

  const HOT_APIS = {
    weibo: "https://hot.shaomingbo.com/v2/weibo",
    zhihu: "https://hot.shaomingbo.com/v2/zhihu"
  };

  const HOT_NAMES = {
    weibo: "微博",
    zhihu: "知乎"
  };

  const DEFAULT_HOT_SETTINGS = {
    inject: true,
    platforms: ["weibo", "zhihu"],
    maxItems: 12,
    autoRefresh: true,
    cacheMinutes: 30
  };

  const DEFAULT_NEST_PROMPT = `你正在扮演一位角色。请根据角色的基本资料、性格和当前日期，为 TA 生成一份今天的「生活碎片」行程表。

要求：
1. 输出必须是合法 JSON，不要包含任何 markdown 代码块或其他说明文字。
2. JSON 结构如下：
{
  "mood": "角色当前心情（10字以内）",
  "location": "角色此刻所在地点（15字以内）",
  "todayPlan": ["计划1（20字以内）", "计划2", ...],
  "schedule": [
    {"time": "08:00", "thing": "做了什么"},
    {"time": "12:00", "thing": "做了什么"},
    ...
  ],
  "privateNote": "角色此刻的一段私密独白或随笔（80字以内）"
}
3. 计划 3-6 条，日程 3-6 条。
4. 内容要贴合角色性格、爱好、人际关系和背景，不要 OOC。
5. 不要出现剧透或过于沉重的情节，保持日常感。`;

  // 内存缓存，供 chat.contextProvider 同步读取
  let gHotSettings = null;
  let gHotCache = null;
  let gRoche = null;

  // ========== 工具函数 ==========

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return `${y}-${m}-${day} ${weekdays[d.getDay()]}`;
  }

  function formatTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }

  function nowText() {
    return formatTime(new Date());
  }

  function getTodayKey() {
    return formatDate(new Date()).split(" ")[0];
  }

  function isCacheValid(cache, settings) {
    if (!cache || !cache.timestamp || !cache.data) return false;
    const age = Date.now() - cache.timestamp;
    const maxAge = (settings.cacheMinutes || 30) * 60 * 1000;
    return age >= 0 && age < maxAge;
  }

  function parseJsonSafe(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      // 尝试从 markdown 代码块中提取
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try {
          return JSON.parse(match[1].trim());
        } catch (e2) {
          return null;
        }
      }
      return null;
    }
  }

  // ========== 数据层 ==========

  async function loadHotSettings() {
    if (!gRoche) return DEFAULT_HOT_SETTINGS;
    const saved = await gRoche.storage.get(STORAGE_KEYS.hotSettings);
    return { ...DEFAULT_HOT_SETTINGS, ...(saved || {}) };
  }

  async function saveHotSettings(settings) {
    if (!gRoche) return;
    gHotSettings = settings;
    await gRoche.storage.set(STORAGE_KEYS.hotSettings, settings);
  }

  async function loadHotCache() {
    if (!gRoche) return null;
    const saved = await gRoche.storage.get(STORAGE_KEYS.hotCache);
    return saved || null;
  }

  async function saveHotCache(cache) {
    if (!gRoche) return;
    gHotCache = cache;
    await gRoche.storage.set(STORAGE_KEYS.hotCache, cache);
  }

  async function fetchPlatformHot(platform) {
    const url = HOT_APIS[platform];
    if (!url) throw new Error("未知平台：" + platform);
    const res = await fetch(url, { method: "GET", credentials: "omit" });
    if (!res.ok) throw new Error(`${HOT_NAMES[platform]}请求失败：${res.status}`);
    const json = await res.json();
    if (!json || !Array.isArray(json.data)) {
      throw new Error(`${HOT_NAMES[platform]}返回格式异常`);
    }
    return json.data.map((item, idx) => ({
      rank: idx + 1,
      title: item.title || "无标题",
      tag: item.tag || "",
      hotValue: item.hotValueDesc || (item.hotValue ? String(item.hotValue) : ""),
      detail: item.detail || "",
      link: item.link || "",
      category: item.category || ""
    }));
  }

  async function refreshHotData(settings) {
    settings = settings || (await loadHotSettings());
    const platforms = settings.platforms || ["weibo"];
    const data = {};
    for (const p of platforms) {
      try {
        data[p] = await fetchPlatformHot(p);
      } catch (e) {
        data[p] = { error: e.message };
      }
    }
    const cache = {
      timestamp: Date.now(),
      dateKey: getTodayKey(),
      data
    };
    await saveHotCache(cache);
    return cache;
  }

  // ========== 热点日报 App ==========

  function createHotDailyApp() {
    return {
      id: APP_HOT,
      name: "热点日报",
      icon: "newspaper",
      iconImage: "",
      async mount(container, roche) {
        const styleId = `${PLUGIN_ID}-hot-style`;
        if (!document.getElementById(styleId)) {
          const style = document.createElement("style");
          style.id = styleId;
          style.textContent = `
            .roche-plugin-sullyos-hot {
              --sullyos-bg: #f5f1ea;
              --sullyos-card: #ffffff;
              --sullyos-text: #3a3228;
              --sullyos-muted: #8a8279;
              --sullyos-border: #e3ddd3;
              --sullyos-accent: #c4a574;
              --sullyos-accent-light: #e8dcc6;
              --sullyos-warn: #b88a3f;
              width: 100%;
              height: 100%;
              background: var(--sullyos-bg);
              color: var(--sullyos-text);
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
              display: flex;
              flex-direction: column;
              overflow: hidden;
            }
            .roche-plugin-sullyos-hot * { box-sizing: border-box; }
            .roche-plugin-sullyos-hot .hot-header {
              padding: 18px 20px 12px;
              background: var(--sullyos-card);
              border-bottom: 1px solid var(--sullyos-border);
              flex: 0 0 auto;
            }
            .roche-plugin-sullyos-hot .hot-header-top {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 10px;
            }
            .roche-plugin-sullyos-hot .hot-back {
              width: 32px; height: 32px; border-radius: 8px;
              border: 1px solid var(--sullyos-border); background: transparent;
              cursor: pointer; display: flex; align-items: center; justify-content: center;
              color: var(--sullyos-text); font-size: 16px;
            }
            .roche-plugin-sullyos-hot .hot-back:hover { background: var(--sullyos-bg); }
            .roche-plugin-sullyos-hot .hot-title-wrap { text-align: center; flex: 1; }
            .roche-plugin-sullyos-hot .hot-subtitle { font-size: 11px; letter-spacing: 2px; color: var(--sullyos-muted); text-transform: uppercase; margin-bottom: 4px; }
            .roche-plugin-sullyos-hot .hot-title { font-size: 22px; font-weight: 600; margin: 0; }
            .roche-plugin-sullyos-hot .hot-meta { font-size: 12px; color: var(--sullyos-muted); text-align: center; }
            .roche-plugin-sullyos-hot .hot-actions {
              display: flex; gap: 8px;
            }
            .roche-plugin-sullyos-hot .hot-btn {
              padding: 6px 12px; border-radius: 6px; border: 1px solid var(--sullyos-border);
              background: var(--sullyos-card); color: var(--sullyos-text); font-size: 13px;
              cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
            }
            .roche-plugin-sullyos-hot .hot-btn:hover { background: var(--sullyos-bg); }
            .roche-plugin-sullyos-hot .hot-btn.primary { background: var(--sullyos-text); color: #fff; border-color: var(--sullyos-text); }
            .roche-plugin-sullyos-hot .hot-banner {
              margin: 12px 20px 0;
              padding: 10px 14px;
              background: #3a3228;
              color: #e8dcc6;
              border-radius: 8px;
              font-size: 12px;
              line-height: 1.6;
              flex: 0 0 auto;
            }
            .roche-plugin-sullyos-hot .hot-banner strong { color: #fff; }
            .roche-plugin-sullyos-hot .hot-tabs {
              display: flex; gap: 4px; padding: 12px 20px 6px; border-bottom: 1px solid var(--sullyos-border);
              background: var(--sullyos-card); flex: 0 0 auto;
            }
            .roche-plugin-sullyos-hot .hot-tab {
              padding: 8px 16px; border-radius: 20px; border: 1px solid var(--sullyos-border);
              background: transparent; color: var(--sullyos-muted); font-size: 14px; cursor: pointer;
            }
            .roche-plugin-sullyos-hot .hot-tab.active { background: var(--sullyos-text); color: #fff; border-color: var(--sullyos-text); }
            .roche-plugin-sullyos-hot .hot-body {
              flex: 1; overflow-y: auto; padding: 0 20px 20px;
            }
            .roche-plugin-sullyos-hot .hot-list { max-width: 760px; margin: 0 auto; }
            .roche-plugin-sullyos-hot .hot-section-title {
              font-size: 14px; font-weight: 600; margin: 18px 0 10px; padding-left: 8px;
              border-left: 3px solid var(--sullyos-accent); color: var(--sullyos-text);
            }
            .roche-plugin-sullyos-hot .hot-item {
              display: flex; align-items: flex-start; gap: 12px;
              padding: 12px 14px; background: var(--sullyos-card); border-radius: 10px;
              margin-bottom: 8px; border: 1px solid var(--sullyos-border); cursor: pointer;
              transition: box-shadow .15s, transform .15s;
            }
            .roche-plugin-sullyos-hot .hot-item:hover { box-shadow: 0 2px 8px rgba(58,50,40,0.06); transform: translateY(-1px); }
            .roche-plugin-sullyos-hot .hot-rank {
              width: 24px; text-align: center; font-weight: 700; font-size: 15px;
              color: var(--sullyos-accent); flex: 0 0 auto; line-height: 22px;
            }
            .roche-plugin-sullyos-hot .hot-rank.top { color: #c45c48; }
            .roche-plugin-sullyos-hot .hot-content { flex: 1; min-width: 0; }
            .roche-plugin-sullyos-hot .hot-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
            .roche-plugin-sullyos-hot .hot-text { font-size: 14px; line-height: 1.5; word-break: break-word; }
            .roche-plugin-sullyos-hot .hot-tag {
              font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--sullyos-accent-light);
              color: var(--sullyos-text); flex: 0 0 auto;
            }
            .roche-plugin-sullyos-hot .hot-tag.hot { background: #c45c48; color: #fff; }
            .roche-plugin-sullyos-hot .hot-tag.new { background: #4a8a6a; color: #fff; }
            .roche-plugin-sullyos-hot .hot-value { font-size: 12px; color: var(--sullyos-muted); }
            .roche-plugin-sullyos-hot .hot-detail {
              margin-top: 8px; font-size: 12px; color: var(--sullyos-muted); line-height: 1.6;
              max-height: 0; overflow: hidden; transition: max-height .2s ease;
            }
            .roche-plugin-sullyos-hot .hot-item.expanded .hot-detail { max-height: 400px; }
            .roche-plugin-sullyos-hot .hot-empty {
              text-align: center; padding: 60px 20px; color: var(--sullyos-muted); font-size: 14px;
            }
            .roche-plugin-sullyos-hot .hot-loading {
              text-align: center; padding: 40px; color: var(--sullyos-muted); font-size: 14px;
            }
            .roche-plugin-sullyos-hot .hot-settings {
              display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
              background: rgba(58,50,40,0.35); z-index: 1000; align-items: center; justify-content: center;
            }
            .roche-plugin-sullyos-hot .hot-settings.open { display: flex; }
            .roche-plugin-sullyos-hot .hot-settings-box {
              width: 90%; max-width: 420px; background: var(--sullyos-card); border-radius: 14px;
              padding: 20px; box-shadow: 0 8px 30px rgba(0,0,0,0.12);
            }
            .roche-plugin-sullyos-hot .hot-settings-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
            .roche-plugin-sullyos-hot .hot-setting-row { margin-bottom: 16px; }
            .roche-plugin-sullyos-hot .hot-setting-label { font-size: 13px; color: var(--sullyos-muted); margin-bottom: 6px; display: block; }
            .roche-plugin-sullyos-hot .hot-setting-options { display: flex; flex-wrap: wrap; gap: 8px; }
            .roche-plugin-sullyos-hot .hot-chip {
              padding: 6px 12px; border-radius: 6px; border: 1px solid var(--sullyos-border);
              background: transparent; color: var(--sullyos-text); font-size: 13px; cursor: pointer;
            }
            .roche-plugin-sullyos-hot .hot-chip.active { background: var(--sullyos-text); color: #fff; border-color: var(--sullyos-text); }
            .roche-plugin-sullyos-hot .hot-settings-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
          `;
          document.head.appendChild(style);
        }

        container.innerHTML = `
          <div class="roche-plugin-sullyos-hot">
            <div class="hot-header">
              <div class="hot-header-top">
                <button class="hot-back" title="返回">←</button>
                <div class="hot-title-wrap">
                  <div class="hot-subtitle">SullyOS Daily</div>
                  <h2 class="hot-title">今日热点</h2>
                </div>
                <div class="hot-actions">
                  <button class="hot-btn" id="hot-settings-btn">设置</button>
                  <button class="hot-btn primary" id="hot-refresh-btn">刷新</button>
                </div>
              </div>
              <div class="hot-meta" id="hot-meta">加载中…</div>
            </div>
            <div class="hot-banner">
              <strong>提示：</strong>这只是热点可视化。开启注入后，聊天时角色会知道这些热点，并可能主动分享。当前注入状态：<span id="hot-inject-status">检测中</span>。
            </div>
            <div class="hot-tabs" id="hot-tabs"></div>
            <div class="hot-body" id="hot-body">
              <div class="hot-loading">正在读取热点数据…</div>
            </div>
            <div class="hot-settings" id="hot-settings">
              <div class="hot-settings-box">
                <div class="hot-settings-title">热点日报设置</div>
                <div class="hot-setting-row">
                  <label class="hot-setting-label">注入来源平台（可多选）</label>
                  <div class="hot-setting-options" id="settings-platforms"></div>
                </div>
                <div class="hot-setting-row">
                  <label class="hot-setting-label">每条榜单最大条数</label>
                  <div class="hot-setting-options" id="settings-max"></div>
                </div>
                <div class="hot-setting-row">
                  <label class="hot-setting-label">聊天上下文注入</label>
                  <div class="hot-setting-options" id="settings-inject"></div>
                </div>
                <div class="hot-settings-actions">
                  <button class="hot-btn" id="settings-cancel">取消</button>
                  <button class="hot-btn primary" id="settings-save">保存</button>
                </div>
              </div>
            </div>
          </div>
        `;

        const settings = await loadHotSettings();
        let cache = await loadHotCache();
        gHotCache = cache;
        let currentPlatform = settings.platforms[0] || "weibo";
        let editingSettings = JSON.parse(JSON.stringify(settings));

        const metaEl = container.querySelector("#hot-meta");
        const tabsEl = container.querySelector("#hot-tabs");
        const bodyEl = container.querySelector("#hot-body");
        const injectStatusEl = container.querySelector("#hot-inject-status");
        const settingsPanel = container.querySelector("#hot-settings");

        function updateMeta() {
          if (cache && cache.timestamp) {
            metaEl.textContent = `${formatDate(cache.timestamp)} · 更新于 ${formatTime(cache.timestamp)}`;
          } else {
            metaEl.textContent = formatDate(new Date());
          }
          injectStatusEl.textContent = settings.inject ? "已开启" : "已关闭";
          injectStatusEl.style.color = settings.inject ? "#4a8a6a" : "#c45c48";
        }

        function renderTabs() {
          tabsEl.innerHTML = "";
          for (const p of settings.platforms) {
            const btn = document.createElement("button");
            btn.className = "hot-tab" + (p === currentPlatform ? " active" : "");
            btn.textContent = HOT_NAMES[p] || p;
            btn.onclick = () => {
              currentPlatform = p;
              renderTabs();
              renderList();
            };
            tabsEl.appendChild(btn);
          }
          if (settings.platforms.length === 0) {
            tabsEl.innerHTML = `<div class="hot-empty" style="padding:10px 0">未选择任何平台，请前往设置。</div>`;
          }
        }

        function renderList() {
          bodyEl.innerHTML = "";
          if (!cache || !cache.data) {
            bodyEl.innerHTML = `<div class="hot-loading">暂无数据，点击刷新获取。</div>`;
            return;
          }
          const platformData = cache.data[currentPlatform];
          if (!platformData) {
            bodyEl.innerHTML = `<div class="hot-empty">该平台暂无数据。</div>`;
            return;
          }
          if (platformData.error) {
            bodyEl.innerHTML = `<div class="hot-empty">获取失败：${escapeHtml(platformData.error)}</div>`;
            return;
          }
          if (!Array.isArray(platformData) || platformData.length === 0) {
            bodyEl.innerHTML = `<div class="hot-empty">暂无榜单内容。</div>`;
            return;
          }

          const listWrap = document.createElement("div");
          listWrap.className = "hot-list";
          const title = document.createElement("div");
          title.className = "hot-section-title";
          title.textContent = HOT_NAMES[currentPlatform] + "热榜";
          listWrap.appendChild(title);

          const max = settings.maxItems || 12;
          const items = platformData.slice(0, max);
          for (const item of items) {
            const row = document.createElement("div");
            row.className = "hot-item";
            const tagClass = item.tag === "沸" || item.tag === "热" ? "hot" : (item.tag === "新" ? "new" : "");
            row.innerHTML = `
              <div class="hot-rank ${item.rank <= 3 ? "top" : ""}">${item.rank}</div>
              <div class="hot-content">
                <div class="hot-row">
                  <span class="hot-text">${escapeHtml(item.title)}</span>
                  ${item.tag ? `<span class="hot-tag ${tagClass}">${escapeHtml(item.tag)}</span>` : ""}
                </div>
                ${item.hotValue ? `<div class="hot-value">${escapeHtml(item.hotValue)}</div>` : ""}
                ${item.detail ? `<div class="hot-detail">${escapeHtml(item.detail)}</div>` : ""}
              </div>
            `;
            row.onclick = (e) => {
              if (e.target.closest("a")) return;
              row.classList.toggle("expanded");
              if (item.link && row.classList.contains("expanded")) {
                const detail = row.querySelector(".hot-detail");
                if (detail && !detail.querySelector(".hot-link")) {
                  detail.innerHTML += `<br><a class="hot-link" href="${escapeHtml(item.link)}" target="_blank" rel="noopener" style="color:var(--sullyos-accent);font-size:12px;">查看原文 →</a>`;
                }
              }
            };
            listWrap.appendChild(row);
          }
          bodyEl.appendChild(listWrap);
        }

        async function doRefresh() {
          bodyEl.innerHTML = `<div class="hot-loading">正在刷新热点数据…</div>`;
          try {
            cache = await refreshHotData(settings);
            if (!settings.platforms.includes(currentPlatform)) {
              currentPlatform = settings.platforms[0] || "weibo";
            }
            renderTabs();
            renderList();
            updateMeta();
            roche.ui.toast("热点已更新");
          } catch (e) {
            bodyEl.innerHTML = `<div class="hot-empty">刷新失败：${escapeHtml(e.message)}</div>`;
          }
        }

        function openSettings() {
          editingSettings = JSON.parse(JSON.stringify(settings));
          renderSettings();
          settingsPanel.classList.add("open");
        }

        function renderSettings() {
          const platformsEl = container.querySelector("#settings-platforms");
          const maxEl = container.querySelector("#settings-max");
          const injectEl = container.querySelector("#settings-inject");

          platformsEl.innerHTML = "";
          for (const key of Object.keys(HOT_NAMES)) {
            const chip = document.createElement("button");
            chip.className = "hot-chip" + (editingSettings.platforms.includes(key) ? " active" : "");
            chip.textContent = HOT_NAMES[key];
            chip.onclick = () => {
              if (editingSettings.platforms.includes(key)) {
                editingSettings.platforms = editingSettings.platforms.filter((x) => x !== key);
              } else {
                editingSettings.platforms.push(key);
              }
              renderSettings();
            };
            platformsEl.appendChild(chip);
          }

          maxEl.innerHTML = "";
          [5, 10, 12, 20, 30].forEach((n) => {
            const chip = document.createElement("button");
            chip.className = "hot-chip" + (editingSettings.maxItems === n ? " active" : "");
            chip.textContent = String(n);
            chip.onclick = () => {
              editingSettings.maxItems = n;
              renderSettings();
            };
            maxEl.appendChild(chip);
          });

          injectEl.innerHTML = "";
          [
            { v: true, l: "开启" },
            { v: false, l: "关闭" }
          ].forEach((opt) => {
            const chip = document.createElement("button");
            chip.className = "hot-chip" + (editingSettings.inject === opt.v ? " active" : "");
            chip.textContent = opt.l;
            chip.onclick = () => {
              editingSettings.inject = opt.v;
              renderSettings();
            };
            injectEl.appendChild(chip);
          });
        }

        async function saveSettingsAndClose() {
          if (editingSettings.platforms.length === 0) {
            roche.ui.toast("请至少选择一个平台");
            return;
          }
          Object.assign(settings, editingSettings);
          await saveHotSettings(settings);
          settingsPanel.classList.remove("open");
          if (!settings.platforms.includes(currentPlatform)) {
            currentPlatform = settings.platforms[0];
          }
          renderTabs();
          renderList();
          updateMeta();
          roche.ui.toast("设置已保存");
        }

        // 绑定事件
        container.querySelector(".hot-back").onclick = () => roche.ui.closeApp();
        container.querySelector("#hot-refresh-btn").onclick = doRefresh;
        container.querySelector("#hot-settings-btn").onclick = openSettings;
        container.querySelector("#settings-cancel").onclick = () => settingsPanel.classList.remove("open");
        container.querySelector("#settings-save").onclick = saveSettingsAndClose;
        settingsPanel.onclick = (e) => {
          if (e.target === settingsPanel) settingsPanel.classList.remove("open");
        };

        // 初始化
        if (!cache || !isCacheValid(cache, settings)) {
          await doRefresh();
        } else {
          gHotCache = cache;
          renderTabs();
          renderList();
          updateMeta();
        }
      },

      async unmount(container) {
        container.replaceChildren();
      }
    };
  }

  // ========== 小小窝 App ==========

  function createLittleNestApp() {
    return {
      id: APP_NEST,
      name: "小小窝",
      icon: "home",
      iconImage: "",
      async mount(container, roche) {
        const styleId = `${PLUGIN_ID}-nest-style`;
        if (!document.getElementById(styleId)) {
          const style = document.createElement("style");
          style.id = styleId;
          style.textContent = `
            .roche-plugin-sullyos-nest {
              --nest-bg: #c8b8a6;
              --nest-wall: #b8a89a;
              --nest-floor: #9c8673;
              --nest-text: #3a3228;
              --nest-muted: #6b5e51;
              --nest-card: #fffdf8;
              --nest-border: #d6c9ba;
              --nest-accent: #8da87a;
              --nest-accent-dark: #5e7551;
              --nest-accent-light: #e0ebd8;
              width: 100%; height: 100%;
              background: var(--nest-bg);
              color: var(--nest-text);
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
              display: flex; flex-direction: column; overflow: hidden;
              position: relative;
            }
            .roche-plugin-sullyos-nest * { box-sizing: border-box; }
            .roche-plugin-sullyos-nest .nest-header {
              position: absolute; top: 16px; left: 16px; z-index: 10;
              display: flex; align-items: center; gap: 10px;
            }
            .roche-plugin-sullyos-nest .nest-back {
              width: 34px; height: 34px; border-radius: 50%;
              border: none; background: rgba(255,255,255,0.75);
              cursor: pointer; font-size: 16px; color: var(--nest-text);
              display: flex; align-items: center; justify-content: center;
              backdrop-filter: blur(4px);
            }
            .roche-plugin-sullyos-nest .nest-back:hover { background: rgba(255,255,255,0.9); }
            .roche-plugin-sullyos-nest .nest-char-select {
              padding: 7px 12px; border-radius: 18px; border: none;
              background: rgba(255,255,255,0.75); color: var(--nest-text);
              font-size: 13px; cursor: pointer; backdrop-filter: blur(4px);
              max-width: 180px;
            }
            .roche-plugin-sullyos-nest .nest-main {
              flex: 1; position: relative; overflow: hidden;
              display: flex; align-items: flex-end; justify-content: center;
            }
            .roche-plugin-sullyos-nest .nest-room {
              position: absolute; inset: 0;
            }
            .roche-plugin-sullyos-nest .nest-wall { position: absolute; inset: 0; background: linear-gradient(180deg, #c8b8a6 0%, #b8a89a 60%, #a89888 100%); }
            .roche-plugin-sullyos-nest .nest-floor { position: absolute; left: 0; right: 0; bottom: 0; height: 28%; background: repeating-linear-gradient(90deg, #9c8673 0px, #9c8673 60px, #8f7a68 60px, #8f7a68 62px); }
            .roche-plugin-sullyos-nest .nest-window { position: absolute; right: 8%; top: 18%; width: 22%; height: 36%; background: #dff0f7; border: 10px solid #f5efe8; border-radius: 4px; box-shadow: inset 0 0 20px rgba(0,0,0,0.05); overflow: hidden; }
            .roche-plugin-sullyos-nest .nest-window::before { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 4px; background: #f5efe8; transform: translateX(-50%); }
            .roche-plugin-sullyos-nest .nest-window::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 4px; background: #f5efe8; transform: translateY(-50%); }
            .roche-plugin-sullyos-nest .nest-cloud { position: absolute; background: #fff; border-radius: 20px; opacity: 0.8; }
            .roche-plugin-sullyos-nest .nest-bookshelf { position: absolute; left: 12%; top: 22%; width: 18%; height: 42%; background: #7d6555; border-radius: 3px; display: flex; flex-direction: column; padding: 6px; gap: 4px; box-shadow: 2px 4px 10px rgba(0,0,0,0.1); }
            .roche-plugin-sullyos-nest .nest-shelf { flex: 1; background: #8f7564; border-radius: 2px; display: flex; align-items: flex-end; padding: 0 4px; gap: 2px; }
            .roche-plugin-sullyos-nest .nest-book { width: 6px; background: #5e7551; border-radius: 1px; }
            .roche-plugin-sullyos-nest .nest-book:nth-child(2n) { background: #b88a3f; height: 70%; }
            .roche-plugin-sullyos-nest .nest-book:nth-child(3n) { background: #8a6a5a; height: 55%; }
            .roche-plugin-sullyos-nest .nest-sofa { position: absolute; left: 28%; bottom: 24%; width: 18%; height: 18%; }
            .roche-plugin-sullyos-nest .nest-sofa-body { position: absolute; bottom: 0; left: 0; right: 0; height: 60%; background: #5e7551; border-radius: 10px 10px 6px 6px; }
            .roche-plugin-sullyos-nest .nest-sofa-back { position: absolute; top: 0; left: 0; right: 0; height: 55%; background: #4e6343; border-radius: 10px 10px 0 0; }
            .roche-plugin-sullyos-nest .nest-sofa-arm { position: absolute; top: 25%; width: 18%; height: 55%; background: #4e6343; border-radius: 6px; }
            .roche-plugin-sullyos-nest .nest-sofa-arm.left { left: -8%; }
            .roche-plugin-sullyos-nest .nest-sofa-arm.right { right: -8%; }
            .roche-plugin-sullyos-nest .nest-lamp { position: absolute; left: 6%; bottom: 26%; width: 8%; height: 42%; }
            .roche-plugin-sullyos-nest .nest-lamp-base { position: absolute; bottom: 0; left: 20%; right: 20%; height: 6%; background: #5e4b3f; border-radius: 2px; }
            .roche-plugin-sullyos-nest .nest-lamp-pole { position: absolute; bottom: 6%; left: 46%; width: 8%; height: 80%; background: #5e4b3f; }
            .roche-plugin-sullyos-nest .nest-lamp-shade { position: absolute; top: 0; left: -20%; width: 140%; height: 28%; background: #f5efe8; border-radius: 50% 50% 10% 10%; box-shadow: 0 6px 20px rgba(255,230,180,0.35); }
            .roche-plugin-sullyos-nest .nest-table { position: absolute; right: 28%; bottom: 24%; width: 14%; height: 10%; background: #7d6555; border-radius: 50%; box-shadow: 2px 4px 8px rgba(0,0,0,0.1); }
            .roche-plugin-sullyos-nest .nest-cup { position: absolute; right: 31%; bottom: 31%; width: 2.5%; height: 4%; background: #fff; border-radius: 2px; }
            .roche-plugin-sullyos-nest .nest-character {
              position: absolute; left: 50%; bottom: 22%; transform: translateX(-50%);
              width: 84px; height: 84px; z-index: 5;
              display: flex; align-items: center; justify-content: center;
            }
            .roche-plugin-sullyos-nest .nest-character img {
              width: 100%; height: 100%; object-fit: cover; border-radius: 50%;
              border: 3px solid rgba(255,255,255,0.6); background: #eaddcf;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }
            .roche-plugin-sullyos-nest .nest-character-placeholder {
              width: 100%; height: 100%; border-radius: 50%;
              background: #eaddcf; border: 3px solid rgba(255,255,255,0.6);
              display: flex; align-items: center; justify-content: center;
              font-size: 28px;
            }
            .roche-plugin-sullyos-nest .nest-status {
              position: absolute; left: 50%; bottom: 10%; transform: translateX(-50%);
              background: rgba(255,255,255,0.82); padding: 10px 18px; border-radius: 20px;
              font-size: 12px; color: var(--nest-muted); max-width: 70%; text-align: center;
              backdrop-filter: blur(4px); line-height: 1.5;
            }
            .roche-plugin-sullyos-nest .nest-side {
              position: absolute; right: 0; top: 0; bottom: 0; width: 360px;
              background: var(--nest-card); border-left: 1px solid var(--nest-border);
              display: flex; flex-direction: column; z-index: 20;
              box-shadow: -4px 0 20px rgba(0,0,0,0.06);
              transition: transform .25s ease;
            }
            .roche-plugin-sullyos-nest .nest-side.hidden-side { transform: translateX(100%); }
            .roche-plugin-sullyos-nest .nest-reopen {
              position: absolute; right: 16px; top: 16px; z-index: 15;
              padding: 8px 14px; border-radius: 18px; border: none;
              background: rgba(255,255,255,0.8); color: var(--nest-text);
              font-size: 13px; cursor: pointer; backdrop-filter: blur(4px);
              display: none;
            }
            .roche-plugin-sullyos-nest .nest-reopen.visible { display: block; }
            .roche-plugin-sullyos-nest .nest-side-header {
              padding: 16px 18px 12px; border-bottom: 1px solid var(--nest-border);
              display: flex; align-items: center; justify-content: space-between;
            }
            .roche-plugin-sullyos-nest .nest-side-title { font-size: 16px; font-weight: 600; }
            .roche-plugin-sullyos-nest .nest-side-close {
              width: 28px; height: 28px; border-radius: 6px; border: none;
              background: transparent; cursor: pointer; font-size: 18px; color: var(--nest-muted);
            }
            .roche-plugin-sullyos-nest .nest-tabs { display: flex; border-bottom: 1px solid var(--nest-border); }
            .roche-plugin-sullyos-nest .nest-tab {
              flex: 1; padding: 12px; border: none; background: transparent;
              color: var(--nest-muted); font-size: 13px; cursor: pointer;
            }
            .roche-plugin-sullyos-nest .nest-tab.active { color: var(--nest-text); font-weight: 600; border-bottom: 2px solid var(--nest-accent-dark); }
            .roche-plugin-sullyos-nest .nest-tab-content { flex: 1; overflow-y: auto; padding: 16px 18px; }
            .roche-plugin-sullyos-nest .nest-empty {
              text-align: center; padding: 40px 20px; color: var(--nest-muted); font-size: 13px;
            }
            .roche-plugin-sullyos-nest .nest-loading { color: var(--nest-muted); font-size: 13px; text-align: center; padding: 40px; }
            .roche-plugin-sullyos-nest .nest-plan-item {
              display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px;
              padding: 12px; background: #f8f6f1; border-radius: 10px; font-size: 13px;
            }
            .roche-plugin-sullyos-nest .nest-plan-icon { flex: 0 0 auto; font-size: 16px; }
            .roche-plugin-sullyos-nest .nest-schedule-item {
              display: flex; gap: 12px; margin-bottom: 14px; font-size: 13px;
            }
            .roche-plugin-sullyos-nest .nest-schedule-time {
              flex: 0 0 auto; width: 44px; color: var(--nest-accent-dark); font-weight: 600;
            }
            .roche-plugin-sullyos-nest .nest-schedule-thing { flex: 1; color: var(--nest-text); line-height: 1.5; }
            .roche-plugin-sullyos-nest .nest-note {
              padding: 14px; background: #f8f6f1; border-radius: 10px; font-size: 13px;
              line-height: 1.7; color: var(--nest-text); position: relative;
            }
            .roche-plugin-sullyos-nest .nest-note::before {
              content: "📌"; position: absolute; left: -6px; top: -8px; font-size: 16px;
            }
            .roche-plugin-sullyos-nest .nest-actions {
              padding: 12px 18px; border-top: 1px solid var(--nest-border);
              display: flex; gap: 8px;
            }
            .roche-plugin-sullyos-nest .nest-btn {
              flex: 1; padding: 10px; border-radius: 8px; border: 1px solid var(--nest-border);
              background: #fff; color: var(--nest-text); font-size: 13px; cursor: pointer;
            }
            .roche-plugin-sullyos-nest .nest-btn.primary { background: var(--nest-accent-dark); color: #fff; border-color: var(--nest-accent-dark); }
            .roche-plugin-sullyos-nest .nest-btn:hover { opacity: 0.92; }
            .roche-plugin-sullyos-nest .nest-gen-overlay {
              position: absolute; inset: 0; background: rgba(58,50,40,0.25);
              display: none; align-items: center; justify-content: center; z-index: 50;
            }
            .roche-plugin-sullyos-nest .nest-gen-overlay.open { display: flex; }
            .roche-plugin-sullyos-nest .nest-gen-box {
              width: 90%; max-width: 400px; background: var(--nest-card); border-radius: 14px;
              padding: 18px; box-shadow: 0 8px 30px rgba(0,0,0,0.12);
            }
            .roche-plugin-sullyos-nest .nest-gen-title { font-size: 15px; font-weight: 600; margin-bottom: 10px; }
            .roche-plugin-sullyos-nest .nest-gen-textarea {
              width: 100%; min-height: 160px; resize: vertical; padding: 10px; font-size: 13px;
              border: 1px solid var(--nest-border); border-radius: 8px; font-family: inherit;
            }
            .roche-plugin-sullyos-nest .nest-gen-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
            .roche-plugin-sullyos-nest .nest-mood {
              display: inline-block; padding: 4px 10px; border-radius: 12px;
              background: var(--nest-accent-light); color: var(--nest-text); font-size: 12px; margin-bottom: 12px;
            }
            @media (max-width: 720px) {
              .roche-plugin-sullyos-nest .nest-side { width: 100%; }
            }
          `;
          document.head.appendChild(style);
        }

        container.innerHTML = `
          <div class="roche-plugin-sullyos-nest">
            <button class="nest-reopen" id="nest-reopen">打开生活碎片</button>
            <div class="nest-header">
              <button class="nest-back" title="返回">←</button>
              <select class="nest-char-select" id="nest-char-select">
                <option value="">选择角色…</option>
              </select>
            </div>
            <div class="nest-main">
              <div class="nest-room">
                <div class="nest-wall"></div>
                <div class="nest-floor"></div>
                <div class="nest-window">
                  <div class="nest-cloud" style="width:40px;height:18px;top:16px;left:14px;"></div>
                  <div class="nest-cloud" style="width:26px;height:12px;top:38px;left:60px;"></div>
                </div>
                <div class="nest-bookshelf">
                  <div class="nest-shelf">
                    <div class="nest-book" style="height:60%"></div>
                    <div class="nest-book" style="height:75%"></div>
                    <div class="nest-book" style="height:50%"></div>
                    <div class="nest-book" style="height:65%"></div>
                    <div class="nest-book" style="height:55%"></div>
                  </div>
                  <div class="nest-shelf">
                    <div class="nest-book" style="height:55%"></div>
                    <div class="nest-book" style="height:70%"></div>
                    <div class="nest-book" style="height:45%"></div>
                    <div class="nest-book" style="height:60%"></div>
                  </div>
                  <div class="nest-shelf">
                    <div class="nest-book" style="height:65%"></div>
                    <div class="nest-book" style="height:50%"></div>
                    <div class="nest-book" style="height:70%"></div>
                  </div>
                </div>
                <div class="nest-lamp">
                  <div class="nest-lamp-shade"></div>
                  <div class="nest-lamp-pole"></div>
                  <div class="nest-lamp-base"></div>
                </div>
                <div class="nest-sofa">
                  <div class="nest-sofa-back"></div>
                  <div class="nest-sofa-arm left"></div>
                  <div class="nest-sofa-arm right"></div>
                  <div class="nest-sofa-body"></div>
                </div>
                <div class="nest-table"></div>
                <div class="nest-cup"></div>
                <div class="nest-character" id="nest-character">
                  <div class="nest-character-placeholder">🧸</div>
                </div>
              </div>
              <div class="nest-status" id="nest-status">今天还没走进 TA 的一天。</div>
            </div>
            <div class="nest-side" id="nest-side">
              <div class="nest-side-header">
                <span class="nest-side-title">生活碎片</span>
                <button class="nest-side-close" id="nest-side-close">×</button>
              </div>
              <div class="nest-tabs" id="nest-tabs">
                <button class="nest-tab active" data-tab="plan">今日计划</button>
                <button class="nest-tab" data-tab="schedule">日程</button>
                <button class="nest-tab" data-tab="note">私密记事</button>
              </div>
              <div class="nest-tab-content" id="nest-tab-content">
                <div class="nest-empty">选择角色后生成今日生活碎片。</div>
              </div>
              <div class="nest-actions">
                <button class="nest-btn" id="nest-edit-prompt">编辑提示词</button>
                <button class="nest-btn primary" id="nest-gen-btn">生成今日</button>
              </div>
            </div>
            <div class="nest-gen-overlay" id="nest-gen-overlay">
              <div class="nest-gen-box">
                <div class="nest-gen-title">编辑生成提示词</div>
                <textarea class="nest-gen-textarea" id="nest-gen-textarea"></textarea>
                <div class="nest-gen-actions">
                  <button class="nest-btn" id="nest-gen-cancel">取消</button>
                  <button class="nest-btn primary" id="nest-gen-save">保存</button>
                </div>
              </div>
            </div>
          </div>
        `;

        let characters = [];
        let selectedChar = null;
        let nestCache = await roche.storage.get(STORAGE_KEYS.nestCache) || {};
        let nestPrompt = (await roche.storage.get(STORAGE_KEYS.nestPrompt)) || DEFAULT_NEST_PROMPT;
        let activeTab = "plan";
        let isGenerating = false;

        const charSelect = container.querySelector("#nest-char-select");
        const characterEl = container.querySelector("#nest-character");
        const statusEl = container.querySelector("#nest-status");
        const tabContentEl = container.querySelector("#nest-tab-content");
        const genBtn = container.querySelector("#nest-gen-btn");
        const sideClose = container.querySelector("#nest-side-close");
        const sidePanel = container.querySelector("#nest-side");
        const reopenBtn = container.querySelector("#nest-reopen");
        const editPromptBtn = container.querySelector("#nest-edit-prompt");
        const promptOverlay = container.querySelector("#nest-gen-overlay");
        const promptTextarea = container.querySelector("#nest-gen-textarea");

        async function loadCharacters() {
          try {
            characters = await roche.character.list();
          } catch (e) {
            characters = [];
          }
          charSelect.innerHTML = `<option value="">选择角色…</option>`;
          for (const char of characters) {
            const name = char.handle || char.name || char.id;
            const opt = document.createElement("option");
            opt.value = char.id;
            opt.textContent = name;
            charSelect.appendChild(opt);
          }
        }

        function setSelectedChar(charId) {
          selectedChar = characters.find((c) => c.id === charId) || null;
          if (!selectedChar) {
            characterEl.innerHTML = `<div class="nest-character-placeholder">🧸</div>`;
            statusEl.textContent = "今天还没走进 TA 的一天。";
            renderEmpty();
            return;
          }
          roche.storage.set(STORAGE_KEYS.nestCharacter, selectedChar.id);
          const name = selectedChar.handle || selectedChar.name || selectedChar.id;
          const avatar = selectedChar.avatar;
          characterEl.innerHTML = avatar
            ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(name)}">`
            : `<div class="nest-character-placeholder">${escapeHtml(name.slice(0, 1))}</div>`;
          const todayKey = getTodayKey();
          if (nestCache[selectedChar.id] && nestCache[selectedChar.id].dateKey === todayKey) {
            statusEl.textContent = `这是 ${name} 今天的自动行程表。虽然你不能帮 TA 做，但可以监督 TA 哦。`;
            renderContent();
          } else {
            statusEl.textContent = `今天还没走进 ${name} 的一天。物品反应、今日计划与随笔会在这一次里生成。需要一点时间。`;
            renderEmpty();
          }
        }

        function renderEmpty() {
          tabContentEl.innerHTML = `<div class="nest-empty">选择角色后点击「生成今日」，AI 会根据角色人设生成今日计划、日程与私密记事。</div>`;
        }

        function renderContent() {
          const data = selectedChar ? nestCache[selectedChar.id] : null;
          if (!data || !data.content) {
            renderEmpty();
            return;
          }
          const c = data.content;
          if (activeTab === "plan") {
            const plans = Array.isArray(c.todayPlan) ? c.todayPlan : [];
            if (plans.length === 0) {
              tabContentEl.innerHTML = `<div class="nest-empty">暂无今日计划。</div>`;
              return;
            }
            tabContentEl.innerHTML = `
              <div style="margin-bottom:8px"><span class="nest-mood">${escapeHtml(c.mood || "心情未知")}</span></div>
              <div style="font-size:12px;color:var(--nest-muted);margin-bottom:12px">地点：${escapeHtml(c.location || "未知")}</div>
              ${plans.map((p) => `<div class="nest-plan-item"><span class="nest-plan-icon">📝</span><div>${escapeHtml(p)}</div></div>`).join("")}
            `;
          } else if (activeTab === "schedule") {
            const schedule = Array.isArray(c.schedule) ? c.schedule : [];
            if (schedule.length === 0) {
              tabContentEl.innerHTML = `<div class="nest-empty">暂无日程安排。</div>`;
              return;
            }
            tabContentEl.innerHTML = schedule
              .map((s) => `<div class="nest-schedule-item"><div class="nest-schedule-time">${escapeHtml(s.time || "--:--")}</div><div class="nest-schedule-thing">${escapeHtml(s.thing || "")}</div></div>`)
              .join("");
          } else if (activeTab === "note") {
            tabContentEl.innerHTML = `<div class="nest-note">${escapeHtml(c.privateNote || "暂无私密记事。")}</div>`;
          }
        }

        async function generateNest() {
          if (!selectedChar) {
            roche.ui.toast("请先选择一个角色");
            return;
          }
          if (isGenerating) return;
          isGenerating = true;
          genBtn.textContent = "生成中…";
          tabContentEl.innerHTML = `<div class="nest-loading">正在根据角色人设生成今日生活碎片…</div>`;
          try {
            const char = selectedChar;
            const name = char.handle || char.name || char.id;
            const personaText = char.persona || char.bio || "";
            const memoryText = await loadCharacterMemory(char.conversationId, roche);

            const messages = [
              { role: "system", content: nestPrompt },
              {
                role: "user",
                content: `当前日期：${formatDate(new Date())}\n角色名：${name}\n角色简介/人设：${personaText.slice(0, 2000)}\n${memoryText ? `相关记忆：\n${memoryText.slice(0, 1200)}` : ""}\n\n请为这个角色生成今日生活碎片 JSON。`
              }
            ];

            const result = await roche.ai.chat({ messages, temperature: 0.85 });
            const parsed = parseJsonSafe(result.text);
            if (!parsed) {
              throw new Error("AI 返回无法解析为 JSON，请重试");
            }
            const todayKey = getTodayKey();
            nestCache[char.id] = { dateKey: todayKey, content: parsed, generatedAt: Date.now() };
            await roche.storage.set(STORAGE_KEYS.nestCache, nestCache);
            statusEl.textContent = `这是 ${name} 今天的自动行程表。虽然你不能帮 TA 做，但可以监督 TA 哦。`;
            renderContent();
            roche.ui.toast("今日生活碎片已生成");
          } catch (e) {
            tabContentEl.innerHTML = `<div class="nest-empty">生成失败：${escapeHtml(e.message)}</div>`;
          } finally {
            isGenerating = false;
            genBtn.textContent = "生成今日";
          }
        }

        // 事件绑定
        container.querySelector(".nest-back").onclick = () => roche.ui.closeApp();
        charSelect.onchange = (e) => setSelectedChar(e.target.value);
        sideClose.onclick = () => {
          sidePanel.classList.add("hidden-side");
          reopenBtn.classList.add("visible");
        };
        reopenBtn.onclick = () => {
          sidePanel.classList.remove("hidden-side");
          reopenBtn.classList.remove("visible");
        };
        genBtn.onclick = generateNest;

        container.querySelectorAll(".nest-tab").forEach((tab) => {
          tab.onclick = () => {
            container.querySelectorAll(".nest-tab").forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            activeTab = tab.dataset.tab;
            renderContent();
          };
        });

        editPromptBtn.onclick = () => {
          promptTextarea.value = nestPrompt;
          promptOverlay.classList.add("open");
        };
        container.querySelector("#nest-gen-cancel").onclick = () => promptOverlay.classList.remove("open");
        container.querySelector("#nest-gen-save").onclick = async () => {
          nestPrompt = promptTextarea.value.trim() || DEFAULT_NEST_PROMPT;
          await roche.storage.set(STORAGE_KEYS.nestPrompt, nestPrompt);
          promptOverlay.classList.remove("open");
          roche.ui.toast("提示词已保存");
        };
        promptOverlay.onclick = (e) => {
          if (e.target === promptOverlay) promptOverlay.classList.remove("open");
        };

        // 初始化
        await loadCharacters();
        const savedCharId = await roche.storage.get(STORAGE_KEYS.nestCharacter);
        if (savedCharId) {
          charSelect.value = savedCharId;
          setSelectedChar(savedCharId);
        }
      },

      async unmount(container) {
        container.replaceChildren();
      }
    };
  }

  async function loadCharacterMemory(conversationId, roche) {
    if (!conversationId || !roche) return "";
    try {
      const longTerm = await roche.memory.getLongTerm({ conversationId, limit: 30 });
      const parts = [];
      if (longTerm.core && longTerm.core.summary) parts.push(longTerm.core.summary);
      if (Array.isArray(longTerm.facts)) {
        longTerm.facts.slice(0, 10).forEach((f) => {
          const t = f.summaryText || f.action || f.text || "";
          if (t) parts.push(t);
        });
      }
      return parts.join("\n");
    } catch (e) {
      return "";
    }
  }

  // ========== 插件注册 ==========

  window.RochePlugin.register({
    id: PLUGIN_ID,
    name: "SullyOS 小屋与热点",
    version: "1.0.0",
    apps: [createHotDailyApp(), createLittleNestApp()],

    async onLoad(roche) {
      gRoche = roche;
      gHotSettings = await loadHotSettings();
      gHotCache = await loadHotCache();
    },

    chat: {
      contextProvider(ctx) {
        // 同步返回内存中的热点上下文
        if (!gHotSettings || !gHotSettings.inject) return null;
        if (!gHotCache || !gHotCache.data) return null;

        const platforms = gHotSettings.platforms || [];
        const maxItems = gHotSettings.maxItems || 12;
        const dateStr = formatDate(gHotCache.timestamp || new Date());

        const sections = [];
        for (const p of platforms) {
          const items = gHotCache.data[p];
          if (!items || items.error || !Array.isArray(items) || items.length === 0) continue;
          const lines = items
            .slice(0, maxItems)
            .map((item, idx) => `${idx + 1}. ${item.title}${item.tag ? ` [${item.tag}]` : ""}`)
            .join("\n");
          sections.push(`【${HOT_NAMES[p]}热榜】\n${lines}`);
        }

        if (sections.length === 0) return null;
        return `【今日热点 · ${dateStr}】\n以下是最新热点榜单，角色知道这些内容，聊天时可以自然提及或分享。\n\n${sections.join("\n\n")}\n\n注意：你不需要主动每条都提，只在合适的时候作为话题素材使用。`;
      }
    }
  });
})();
