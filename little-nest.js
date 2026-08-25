window.RochePlugin.register({
  id: "cozy-little-nest",
  name: "小小窝",
  version: "1.1.0",
  apps: [
    {
      id: "little-nest-app",
      name: "小小窝",
      icon: "home",
      
      async mount(container, roche) {
        // --- 1. 注入温馨风格与双栏布局样式 ---
        const styleId = "little-nest-style";
        if (!document.getElementById(styleId)) {
          const style = document.createElement("style");
          style.id = styleId;
          style.innerHTML = `
            .roche-plugin-nest { 
              font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
              background: #fffaf0; 
              color: #5c4b43; 
              height: 100%; 
              display: flex; 
              flex-direction: column; 
              overflow: hidden; 
              padding: 20px; 
              box-sizing: border-box;
            }
            .roche-plugin-nest * { box-sizing: border-box; }
            
            .nest-select-wrap { margin-bottom: 20px; }
            .nest-select { 
              width: 100%; background: #fff; color: #5c4b43; 
              border: 2px solid #fae1dd; padding: 10px 14px; 
              border-radius: 12px; font-size: 15px; outline: none; 
              box-shadow: 0 4px 10px rgba(212, 163, 115, 0.1);
            }
            
            .nest-layout {
              flex: 1; display: flex; gap: 20px; overflow: hidden;
            }
            
            .nest-left {
              flex: 1; display: flex; flex-direction: column; align-items: center;
              justify-content: center; background: #fff; border-radius: 20px;
              border: 2px dashed #fae1dd; padding: 20px; position: relative;
              box-shadow: inset 0 0 20px rgba(250, 225, 221, 0.3);
            }
            
            .nest-bubble {
              background: #fdf5f2; border: 1px solid #fae1dd; border-radius: 16px; 
              padding: 12px 20px; margin-bottom: 20px; max-width: 80%; text-align: center; 
              font-size: 15px; line-height: 1.5; position: relative; 
              box-shadow: 0 4px 8px rgba(212, 163, 115, 0.1); transition: all 0.3s ease; 
              opacity: 0; transform: translateY(10px);
            }
            .nest-bubble.show { opacity: 1; transform: translateY(0); }
            .nest-bubble::after {
              content: ''; position: absolute; bottom: -10px; left: 50%; transform: translateX(-50%);
              border-width: 10px 10px 0; border-style: solid; border-color: #fdf5f2 transparent transparent transparent;
            }
            
            .nest-avatar-wrap { position: relative; margin-bottom: 16px; }
            .nest-avatar {
              width: 100px; height: 100px; border-radius: 50%; object-fit: cover;
              border: 4px solid #fae1dd; box-shadow: 0 6px 16px rgba(212, 163, 115, 0.2); background: #eee;
            }
            .nest-status {
              position: absolute; bottom: -10px; left: 50%; transform: translateX(-50%);
              background: #d4a373; color: #fff; font-size: 12px; padding: 4px 12px;
              border-radius: 12px; white-space: nowrap; border: 2px solid #fff;
            }
            
            .nest-actions { display: flex; gap: 12px; margin-top: 24px; flex-wrap: wrap; justify-content: center; }
            .nest-btn {
              background: #fff; color: #d4a373; border: 2px solid #d4a373;
              padding: 8px 20px; border-radius: 20px; cursor: pointer;
              font-size: 14px; font-weight: bold; transition: 0.2s;
            }
            .nest-btn:hover { background: #d4a373; color: #fff; transform: scale(1.05); }
            .nest-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
            
            .nest-right {
              width: 320px; background: #fff; border-radius: 20px; border: 1px solid #fae1dd;
              box-shadow: 0 8px 24px rgba(212, 163, 115, 0.1); display: flex; flex-direction: column; overflow: hidden;
            }
            .frag-header {
              padding: 16px 20px; font-size: 16px; font-weight: bold; border-bottom: 1px solid #fdf5f2;
              display: flex; justify-content: space-between; align-items: center;
            }
            .frag-tabs { display: flex; border-bottom: 1px solid #fdf5f2; }
            .frag-tab {
              flex: 1; text-align: center; padding: 12px 0; font-size: 13px;
              color: #a0938d; cursor: pointer; transition: 0.2s;
            }
            .frag-tab.active { color: #d4a373; font-weight: bold; border-bottom: 2px solid #d4a373; }
            
            .frag-content { flex: 1; padding: 20px; overflow-y: auto; font-size: 14px; }
            .frag-panel { display: none; animation: fadeIn 0.3s; }
            .frag-panel.active { display: block; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
            
            .frag-progress-bar {
              display: flex; justify-content: space-between; align-items: center;
              font-size: 12px; color: #a0938d; margin-bottom: 16px; letter-spacing: 1px;
            }
            .frag-progress-val { background: #f0e4df; padding: 2px 6px; border-radius: 4px; }
            .frag-task-list { margin-bottom: 20px; }
            .frag-task-item { display: flex; align-items: flex-start; margin-bottom: 12px; gap: 8px; }
            .frag-task-check { 
              width: 16px; height: 16px; border: 2px solid #d4a373; border-radius: 4px; 
              display: inline-block; flex-shrink: 0; margin-top: 2px;
            }
            .frag-task-check.done { background: #d4a373; }
            
            .frag-schedule-item { display: flex; gap: 12px; margin-bottom: 16px; }
            .frag-time { font-weight: bold; color: #d4a373; flex-shrink: 0; width: 45px; }
            .frag-activity { color: #5c4b43; }
            
            .frag-note-text {
              background: #fffaf0; padding: 16px; border-radius: 12px;
              border-left: 4px solid #fae1dd; line-height: 1.6; font-family: "KaiTi", "STKaiti", serif;
              font-size: 15px; color: #8c7366;
            }
            
            .frag-sticky {
              background: #fff9e6; border: 1px solid #ffebb5; padding: 12px 16px;
              border-radius: 8px; font-size: 12px; color: #a68a47; position: relative;
              margin-top: 20px; line-height: 1.5;
            }
            .frag-sticky::before { content: '📌'; position: absolute; top: -10px; left: -10px; font-size: 18px; }
            
            .nest-loading { font-size: 13px; color: #d4a373; margin-top: 10px; display: none; }
          `;
          document.head.appendChild(style);
        }

        // --- 2. 挂载 HTML 结构 ---
        container.innerHTML = `
          <div class="roche-plugin-nest">
            <div class="nest-select-wrap">
              <select class="nest-select" id="nest-conv-select">
                <option value="">载入羁绊中...</option>
              </select>
            </div>

            <div class="nest-layout" id="nest-layout" style="visibility: hidden;">
              <!-- 左侧：互动舞台 -->
              <div class="nest-left">
                <div class="nest-bubble" id="nest-bubble">欢迎回到小小窝，我一直在等你~</div>
                <div class="nest-avatar-wrap">
                  <img class="nest-avatar" id="nest-avatar" src="" alt="avatar">
                  <div class="nest-status" id="nest-status">发呆中...</div>
                </div>
                <div style="font-weight: bold; font-size: 16px;" id="nest-char-name">角色名</div>
                <div class="nest-loading" id="nest-loading">正在感知状态...</div>
                
                <div class="nest-actions">
                  <button class="nest-btn interact-btn" data-action="戳了戳你的脸颊">戳一戳</button>
                  <button class="nest-btn interact-btn" data-action="温柔地摸了摸你的头">摸摸头</button>
                  <button class="nest-btn interact-btn" data-action="给你递了一杯热饮">递饮料</button>
                  <button class="nest-btn interact-btn" data-action="一言不发地抱住了你">抱一抱</button>
                </div>
                <div style="margin-top: 30px;">
                  <button class="nest-btn" style="border: none; background: transparent; color:#a0938d; font-size:12px; text-decoration: underline;" onclick="roche.ui.closeApp()">离开小小窝</button>
                </div>
              </div>
              
              <!-- 右侧：生活碎片面板 -->
              <div class="nest-right">
                <div class="frag-header">生活碎片 <span style="cursor:pointer; color:#ccc;" onclick="roche.ui.closeApp()">✕</span></div>
                <div class="frag-tabs">
                  <div class="frag-tab active" data-target="frag-plan">今日计划</div>
                  <div class="frag-tab" data-target="frag-schedule">日程</div>
                  <div class="frag-tab" data-target="frag-notes">私密记事</div>
                </div>
                <div class="frag-content">
                  <div id="frag-plan" class="frag-panel active">
                    <div class="frag-progress-bar">
                      <span>TODAY</span>
                      <span class="frag-progress-val" id="plan-progress">完成度: 0%</span>
                    </div>
                    <div id="plan-list" class="frag-task-list">
                       <div style="text-align:center; color:#ccc; margin-top:20px;">碎片生成中...</div>
                    </div>
                    <div class="frag-sticky">
                      这是 <span id="sticky-char-name" style="font-weight:bold;">TA</span> 今天的自动行程表。虽然你不能帮TA做，但可以监督TA哦。
                    </div>
                  </div>
                  <div id="frag-schedule" class="frag-panel">
                    <div id="schedule-list">
                       <div style="text-align:center; color:#ccc; margin-top:20px;">生成中...</div>
                    </div>
                  </div>
                  <div id="frag-notes" class="frag-panel">
                    <div id="notes-content" class="frag-note-text">读取心声中...</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;

        // --- 3. 逻辑绑定 ---
        const convSelect = document.getElementById("nest-conv-select");
        const layoutEl = document.getElementById("nest-layout");
        
        const avatarEl = document.getElementById("nest-avatar");
        const charNameEl = document.getElementById("nest-char-name");
        const statusEl = document.getElementById("nest-status");
        const bubbleEl = document.getElementById("nest-bubble");
        const loadingEl = document.getElementById("nest-loading");
        const actionBtns = container.querySelectorAll(".interact-btn");
        
        const fragTabs = container.querySelectorAll(".frag-tab");
        const fragPanels = container.querySelectorAll(".frag-panel");
        const planListEl = document.getElementById("plan-list");
        const scheduleListEl = document.getElementById("schedule-list");
        const notesContentEl = document.getElementById("notes-content");
        const progressEl = document.getElementById("plan-progress");
        const stickyCharNameEl = document.getElementById("sticky-char-name");

        let activeConvId = "";
        let charContext = null;

        fragTabs.forEach(tab => {
          tab.onclick = () => {
            fragTabs.forEach(t => t.classList.remove("active"));
            fragPanels.forEach(p => p.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById(tab.dataset.target).classList.add("active");
          };
        });

        function showBubble(text) {
          bubbleEl.classList.remove("show");
          setTimeout(() => {
            bubbleEl.textContent = text;
            bubbleEl.classList.add("show");
          }, 100);
        }

        async function loadConversations() {
          try {
            const list = await roche.conversation.list();
            if (list.length === 0) {
              convSelect.innerHTML = `<option value="">暂无会话</option>`;
              return;
            }
            convSelect.innerHTML = `<option value="">请选择要拜访的对象...</option>` + 
              list.map(c => `<option value="${c.id || c.conversationId}">${c.title || c.name || c.handle}</option>`).join("");
          } catch (e) {
            convSelect.innerHTML = `<option value="">加载失败</option>`;
          }
        }

        async function fetchContext(convId) {
          let persona = "";
          let avatar = "";
          let name = "";
          try {
            const convInfo = await roche.conversation.get(convId);
            if (convInfo && convInfo.contactId) {
              const char = await roche.character.get(convInfo.contactId);
              persona = char.persona || char.bio || "";
              avatar = char.avatar || "";
              name = char.handle || char.name || "TA";
            }
          } catch(e) {}

          const st = await roche.memory.getShortTerm({ conversationId: convId, limit: 20 });
          const lt = await roche.memory.getLongTerm({ conversationId: convId, limit: 10 });
          
          const recentMemories = st.map(m => m.text).join("\n");
          const facts = (lt.facts||[]).map(f => f.summaryText).join("\n");

          return { persona, avatar, name, recentMemories, facts };
        }

        convSelect.onchange = async (e) => {
          activeConvId = e.target.value;
          if (!activeConvId) {
            layoutEl.style.visibility = "hidden";
            return;
          }
          
          layoutEl.style.visibility = "visible";
          actionBtns.forEach(btn => btn.disabled = true);
          loadingEl.style.display = "block";
          showBubble("......");
          statusEl.textContent = "感知中...";
          
          planListEl.innerHTML = `<div style="text-align:center; color:#ccc; margin-top:20px;">碎片生成中...</div>`;
          scheduleListEl.innerHTML = `<div style="text-align:center; color:#ccc; margin-top:20px;">生成中...</div>`;
          notesContentEl.textContent = "读取心声中...";

          try {
            charContext = await fetchContext(activeConvId);
            avatarEl.src = charContext.avatar;
            charNameEl.textContent = charContext.name;
            stickyCharNameEl.textContent = charContext.name;

            const statusPrompt = `你是角色。
设定：\n${charContext.persona}\n
近期记忆：\n${charContext.recentMemories}\n
请根据记忆推断你此刻的心情，严格按JSON输出：
{"status": "2-6个字的状态", "greeting": "打招呼对白(不要动作描写)"}`;

            const statusResPromise = roche.ai.chat({ messages: [{ role: "user", content: statusPrompt }], temperature: 0.7 });

            const now = new Date();
            const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
            
            const fragmentPrompt = `你是角色。当前时间是 ${timeStr}。
设定：\n${charContext.persona}\n
近期记忆：\n${charContext.recentMemories}\n
请生成你今天的「生活碎片」，必须严格返回以下JSON格式（不要加其他文字，不要markdown）：
{
  "plan": [
    {"task": "小目标1", "done": true},
    {"task": "小目标2", "done": false},
    {"task": "小目标3", "done": false}
  ],
  "schedule": [
    {"time": "09:00", "activity": "日程安排1"},
    {"time": "14:30", "activity": "日程安排2"},
    {"time": "20:00", "activity": "日程安排3"}
  ],
  "notes": "一段不为人知的私密内心独白，50字以内，结合近期发生的事。"
}`;

            const fragmentResPromise = roche.ai.chat({ messages: [{ role: "user", content: fragmentPrompt }], temperature: 0.8 });

            const [statusRes, fragmentRes] = await Promise.all([statusResPromise, fragmentResPromise]);

            try {
              const sMatch = statusRes.text.match(/\{.*\}/s) || [statusRes.text];
              const sParsed = JSON.parse(sMatch[0]);
              statusEl.textContent = sParsed.status || "安静休息中";
              showBubble(sParsed.greeting || "你来啦...");
            } catch(err) {
              statusEl.textContent = "安静休息中";
              showBubble("发呆中，没注意到你...");
            }

            try {
              const fMatch = fragmentRes.text.match(/\{.*\}/s) || [fragmentRes.text];
              const fParsed = JSON.parse(fMatch[0]);
              
              if (fParsed.plan && Array.isArray(fParsed.plan)) {
                let doneCount = 0;
                planListEl.innerHTML = fParsed.plan.map(p => {
                  if (p.done) doneCount++;
                  return `
                    <div class="frag-task-item">
                      <div class="frag-task-check ${p.done ? 'done' : ''}"></div>
                      <div>${p.task}</div>
                    </div>
                  `;
                }).join("");
                const pct = Math.round((doneCount / fParsed.plan.length) * 100) || 0;
                progressEl.textContent = `完成度: ${pct}%`;
              }

              if (fParsed.schedule && Array.isArray(fParsed.schedule)) {
                scheduleListEl.innerHTML = fParsed.schedule.map(s => `
                  <div class="frag-schedule-item">
                    <div class="frag-time">${s.time}</div>
                    <div class="frag-activity">${s.activity}</div>
                  </div>
                `).join("");
              }

              if (fParsed.notes) {
                notesContentEl.textContent = fParsed.notes;
              }

            } catch(err) {
              planListEl.innerHTML = `<div style="color:red;">获取数据出错，请稍后重试</div>`;
            }

          } catch (error) {
            roche.ui.toast("读取羁绊数据失败");
          } finally {
            actionBtns.forEach(btn => btn.disabled = false);
            loadingEl.style.display = "none";
          }
        };

        actionBtns.forEach(btn => {
          btn.onclick = async () => {
            if (!activeConvId || !charContext) return;
            const actionText = btn.dataset.action;
            
            actionBtns.forEach(b => b.disabled = true);
            loadingEl.style.display = "block";
            showBubble("...");

            try {
              const st = await roche.memory.getShortTerm({ conversationId: activeConvId, limit: 10 });
              charContext.recentMemories = st.map(m => m.text).join("\n");

              const prompt = `你是角色，身处私密的"小小窝"。
设定:\n${charContext.persona}\n
近期记忆:\n${charContext.recentMemories}\n
用户刚刚对你做了这个动作：【${actionText}】
请以角色的性格和第一人称直接给出你的回应（纯对白，不超50字）。`;

              const res = await roche.ai.chat({
                messages: [{ role: "user", content: prompt }],
                temperature: 0.8
              });

              showBubble(res.text.replace(/["'{}]/g, "").trim());

            } catch (err) {
              showBubble("（对方似乎没反应过来...）");
            } finally {
              actionBtns.forEach(b => b.disabled = false);
              loadingEl.style.display = "none";
            }
          };
        });

        await loadConversations();
      },
      
      async unmount(container, roche) {
        const style = document.getElementById("little-nest-style");
        if (style) style.remove();
        container.replaceChildren();
      }
    }
  ]
});
