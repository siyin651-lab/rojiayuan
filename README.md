# SullyOS 小屋与热点 · Roche 插件

复刻 SullyOS 的「热点日报」与「小小窝」两个功能，作为 Roche 插件运行。

## 功能简介

| App | 功能 |
|-----|------|
| 热点日报 | 聚合微博、知乎实时热榜；支持展开详情；可将热点作为上下文注入角色聊天。 |
| 小小窝 | 选择一个角色，生成今日的「生活碎片」：心情、地点、今日计划、日程、私密记事。 |

## GitHub 文件结构

```
sullyos-roche-plugin/
  manifest.json       # 插件清单
  sullyos-features.js # 插件主文件
  README.md           # 本说明
```

## 安装时填的链接

把 `manifest.json` 上传到你的 GitHub 仓库后，填写 Raw 链接：

```
https://raw.githubusercontent.com/你的用户名/你的仓库名/main/manifest.json
```

**安装前必须修改**：打开 `manifest.json`，把 `entry` 改成你仓库中 `sullyos-features.js` 的 Raw 链接。

## 新手安装步骤

1. 在 GitHub 新建一个公开仓库，例如 `sullyos-roche-plugin`。
2. 上传本文件夹中的 `manifest.json` 和 `sullyos-features.js`。
3. 修改 `manifest.json` 里的 `entry` 字段为你的 Raw 链接。
4. 在 Roche 中进入插件管理，粘贴 `manifest.json` 的 Raw 链接，完成安装。

## 关键代码解释

- `createHotDailyApp`：热点日报 App，调用 `hot.shaomingbo.com` 的公开热榜 API（支持 CORS），渲染微博/知乎榜单。
- `createLittleNestApp`：小小窝 App，通过 `roche.character.list()` 读取角色，使用 `roche.ai.chat()` 根据角色人设生成今日生活碎片 JSON。
- `chat.contextProvider`：将当前热点缓存格式化为字符串，注入到 Noir 主聊天的 system prompt 中，让角色知道今日热点。
- `onLoad`：插件加载时预读设置与缓存到内存，保证 `contextProvider` 能同步返回上下文。

## 数据存储方案

- 全部使用 `roche.storage` 私有存储，键名隔离在插件内。
- `hot-settings`：热点注入设置。
- `hot-cache`：热点缓存（含时间戳，按设置里的缓存时间过期）。
- `nest-character`：小小窝当前选中的角色 ID。
- `nest-cache`：每个角色每日生成的生活碎片缓存。
- `nest-prompt`：小小窝生成提示词（可自定义）。
- 卸载插件时，Roche 会清理上述 `roche.storage` 数据。

## 风险提示和注意事项

- 本插件为全信任 JS，安装前请确认文件来源。
- 热榜 API 为第三方公开接口，稳定性与可用性由其维护方决定；如失效可更换其他支持 CORS 的热榜 API。
- 热点注入聊天后，角色会获得今日热点信息，可能主动提及，请根据场景判断是否开启。
- AI 生成的生活碎片基于角色人设与记忆，偶尔可能 OOC，可点击「编辑提示词」调整生成要求。
- 插件不会写入 Roche 主记忆，所有数据均为插件私有存储。
