window.RochePlugin.register({
  id: "cozy-little-nest",
  name: "小小窝",
  version: "1.0.0",
  apps: [
    {
      id: "little-nest-app",
      name: "小小窝",
      icon: "home",
      
      async mount(container, roche) {
        // --- 1. 注入温馨风格样式 ---
        const styleId = "little-nest-style";
        if (!document.getElementById(styleId)) {
          const style = document.createElement("style");
          style.id = styleId;
          style.innerHTML = `
            .roche-plugin-nest { 
              font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
              background: #fffaf0; /* 温馨的暖米色底 */
              color: #5c4b43; 
              height: 100%; 
              display: flex; 
              flex-direction: column; 
              overflow: hidden; 
              padding: 20px; 
              box-sizing: border-box;
            }
            .roche-plugin-nest * { box-sizing: border-box; }
            
            .nest-header { 
              text-align: center; 
              font-size: 20px; 
              font-weight: bold; 
              color: #d4a373; 
              margin-bottom: 20px; 
              letter-spacing: 2px; 
            }
            
            .nest-select { 
              width: 100%; 
              background: #fff; 
              color: #5c4b43; 
              border: 2px solid #fae1dd; 
              padding: 10px 14px; 
              border-radius: 12px; 
              font-size: 15px; 
              outline: none; 
              margin-bottom: 20px;
              box-shadow: 0 4px 10px rgba(212, 163, 115, 0.1);
            }
            
            .nest-stage {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              background: #fff;
              border-radius: 20px;
              border: 2px dashed #fae1dd;
              padding: 20px;
              position: relative;
              box-shadow: inset 0 0 20px rgba(250, 225, 221, 0.3);
            }
            
            /* 对话气泡 */
            .nest-bubble {
              background: #fdf5f2;
              border: 1px solid #fae1dd;
              border-radius: 16px;
              padding: 12px 20px;
              margin-bottom: 20px;
              max-width: 80%;
              text-align: center;
              font-size: 15px;
              line-height: 1.5;
              position: relative;
              box-shadow: 0 4px 8px rgba(212, 163, 115, 0.1);
              transition: all 0.3s ease;
              opacity: 0;
              transform: translateY(10px);
            }
            .nest-bubble.show {
              opacity: 1;
              transform: translateY(0);
            }
            .nest-bubble::after {
              content: '';
              position: absolute;
              bottom: -10px;
              left: 50%;
              transform: translateX(-50%);
              border-width: 10px 10px 0;
              border-style: solid;
              border-color: #fdf5f2 transparent transparent transparent;
            }
            
            /* 头像与状态 */
            .nest-avatar-wrap {
              position: relative;
              margin-bottom: 16px;
            }
            .nest-avatar {
              width: 100px;
              height: 100px;
              border-radius: 50%;
              object-fit: cover;
              border: 4px solid #fae1dd;
              box-shadow: 0 6px 16px rgba(212, 163, 115, 0.2);
              background: #eee;
            }
            .nest-status {
              position: absolute;
              bottom: -10px;
              left: 50%;
              transform: translateX(-50%);
              background: #d4a373;
              color: #fff;
              font-size: 12px;
              padding: 4px 12px;
              border-radius: 12px;
              white-space: nowrap;
              border: 2px solid #fff;
            }
            
            /* 互动按钮 */
            .nest-actions {
              display: flex;
              gap: 12px;
              margin-top: 24px;
              flex-wrap: wrap;
              justify-content: center;
            }
            .nest-btn {
              background: #fff;
              color: #d4a373;
              border: 2px solid #d4a373;
              padding: 8px 20px;
              border-radius: 20px;
              cursor: pointer;
              font-size: 14px;
              font-weight: bold;
              transition: 0.2s;
            }
            .nest-btn:hover {
              background: #d4a373;
              color: #fff;
              transform: scale(1.05);
            }
            .nest-btn:disabled {
              opacity: 0.5;
              cursor: not-allowed;
              transform: none;
            }
            
            /* 加载提示 */
            .nest-loading {
              font-size: 13px;
              color: #d4a373;
              margin-top: 10px;
              display: none;
            }
          `;
          document.head.appendChild(style);
        }

        // --- 2. 挂载 HTML 结构 ---
        container.innerHTML = `
          <div class="roche-plugin-nest">
            <div class="nest-header">✦ 小 小 窝 ✦</div>
            
            <select class="nest-select" id="nest-conv-select">
              <option value="">载入羁绊中...</option>
            </select>

            <div class="nest-stage" id="nest-stage" style="display: none;">
              <div class="nest-bubble" id="nest-bubble">欢迎回到小小窝，我一直在等你~</div>
              
              <div class="nest-avatar-wrap">
                <img class="nest-avatar" id="nest-avatar" src="" alt="avatar">
                <div class="nest-status" id="nest-status">发呆中...</div>
              </div>
              
              <div style="font-weight: bold; font-size: 16px;" id="nest-char-name">角色名</div>
              <div class="nest-loading" id="nest-loading">正在读取心声...</div>
              
              <div class="nest-actions">
                <button class="nest-btn interact-btn" data-action="戳了戳你的脸颊">戳一戳</button>
                <button class="nest-btn interact-btn" data-action="温柔地摸了摸你的头">摸摸头</button>
                <button class="nest-btn interact-btn" data-action="给你递了一杯热饮">递饮料</button>
                <button class="nest-btn interact-btn" data-action="一言不发地抱住了你">抱一抱</button>
              </div>
            </div>
            
            <!-- 离开按钮 -->
            <div style="text-align: center; margin-top: 20px;">
              <button class="nest-btn" style="border-color:#ccc; color:#888;" onclick="roche.ui.closeApp()">离开小小窝</button>
            </div>
          </div>
        `;

        // --- 3. 逻辑绑定 ---
        const convSelect = document.getElementById("nest-conv-select");
        const stage = document.getElementById("nest-stage");
        const avatarEl = document.getElementById("nest-avatar");
        const charNameEl = document.getElementById("nest-char-name");
        const statusEl = document.getElementById("nest-status");
        const bubbleEl = document.getElementById("nest-bubble");
        const loadingEl = document.getElementById("nest-loading");
        const actionBtns = container.querySelectorAll(".interact-btn");

        let activeConvId = "";
        let charContext = null;

        // 辅助函数：显示气泡并带动画
        function showBubble(text) {
          bubbleEl.classList.remove("show");
          setTimeout(() => {
            bubbleEl.textContent = text;
            bubbleEl.classList.add("show");
          }, 100);
        }

        // 加载会话与角色
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

        // 获取角色语境（人设+记忆）
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

          const st = await roche.memory.getShortTerm({ conversationId: convId, limit: 15 });
          const lt = await roche.memory.getLongTerm({ conversationId: convId, limit: 10 });
          
          const recentMemories = st.map(m => m.text).join("\n");
          const facts = (lt.facts||[]).map(f => f.summaryText).join("\n");

          return { persona, avatar, name, recentMemories, facts };
        }

        // 切换角色：加载基础信息与初始状态
        convSelect.onchange = async (e) => {
          activeConvId = e.target.value;
          if (!activeConvId) {
            stage.style.display = "none";
            return;
          }
          
          stage.style.display = "flex";
          actionBtns.forEach(btn => btn.disabled = true);
          loadingEl.style.display = "block";
          showBubble("......");
          statusEl.textContent = "感知中...";

          try {
            charContext = await fetchContext(activeConvId);
            avatarEl.src = charContext.avatar;
            charNameEl.textContent = charContext.name;

            // 让 AI 根据近期记忆生成当前的「四字状态」和「一句招呼」
            const prompt = `你是角色，正在你的专属私密空间(小小窝)休息。
【设定】：\n${charContext.persona}
【近期记忆】：\n${charContext.recentMemories}
【核心事实】：\n${charContext.facts}

请根据记忆推断你此刻的心情，并生成：
1. 状态：2到6个字的简短状态（如：心情愉悦、正在生闷气、有点困倦、期待着什么）。
2. 招呼：看到用户进来时的一句心里话或打招呼（纯对白，不加动作描写，50字以内）。
请严格按照以下JSON格式输出，不要有其他文字：
{"status": "...", "greeting": "..."}`;

            const res = await roche.ai.chat({
              messages: [{ role: "user", content: prompt }],
              temperature: 0.7
            });

            try {
              // 提取 JSON
              const match = res.text.match(/\\{.*\\}/s) || [res.text];
              const parsed = JSON.parse(match[0]);
              statusEl.textContent = parsed.status || "安静休息中";
              showBubble(parsed.greeting || "你来啦...");
            } catch(err) {
              statusEl.textContent = "安静休息中";
              showBubble(res.text.replace(/["'{}]/g, "").trim());
            }

          } catch (error) {
            roche.ui.toast("读取记忆失败");
          } finally {
            actionBtns.forEach(btn => btn.disabled = false);
            loadingEl.style.display = "none";
          }
        };

        // 绑定互动事件
        actionBtns.forEach(btn => {
          btn.onclick = async () => {
            if (!activeConvId || !charContext) return;
            const actionText = btn.dataset.action;
            
            actionBtns.forEach(b => b.disabled = true);
            loadingEl.style.display = "block";
            showBubble("...");

            try {
              // 为了避免互动显得脱节，每次互动都再拉取一次最新的短期记忆
              const st = await roche.memory.getShortTerm({ conversationId: activeConvId, limit: 10 });
              charContext.recentMemories = st.map(m => m.text).join("\n");

              const prompt = `你是角色，身处私密的"小小窝"。
【设定】:\n${charContext.persona}
【近期记忆】:\n${charContext.recentMemories}

用户刚刚对你做了这个动作：【${actionText}】
请以角色的性格和第一人称，直接给出你的回应（纯对白，可以包含极少量的括号内的动作/表情，总字数不超过60字）。`;

              const res = await roche.ai.chat({
                messages: [{ role: "user", content: prompt }],
                temperature: 0.8
              });

              showBubble(res.text.trim());

            } catch (err) {
              showBubble("（对方似乎没反应过来...）");
            } finally {
              actionBtns.forEach(b => b.disabled = false);
              loadingEl.style.display = "none";
            }
          };
        });

        // 自动加载列表
        await loadConversations();
      },
      
      async unmount(container, roche) {
        // 清理样式和容器
        const style = document.getElementById("little-nest-style");
        if (style) style.remove();
        container.replaceChildren();
      }
    }
  ]
});