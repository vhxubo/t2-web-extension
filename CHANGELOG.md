# 更新日志

本文件记录 T2 Web Extension 的版本变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.7.2] - 2026-11-17

### 修复

- **Firefox 桌面通知展示详情**：Firefox 的 `browser.notifications` 只支持 `title` / `message` / `iconUrl`，`contextMessage` 会被静默丢弃；现在把帖子标题、失败原因、剩余未读数换行并入正文，详情不再丢失。
- **重复通知同一条消息**：按消息 id 去重并串行弹出，已读消息与「拉到了但没有未读」的空结果不再重复提醒，避免用户读掉之后又收到一条同样的「已读通知」。

## [0.7.1] - 2026-11-17

### 修复

- **系统桌面通知展示消息详情**：正文优先显示评论 / 回复原文、系统提示或失败原因，帖子标题与剩余未读数作为补充信息展示，不再只显示帖子标题。

## [0.7.0] - 2026-11-17

### 新增

- **评论徽章助手**：在 2libra.com 帖子详情页与帖子弹窗的评论框上方显示字数、预计发评金币与最优徽章，支持一键佩戴 / 摘下。
  - 识别固定扣费与按比例减免两类徽章，同类多枚一起比较，优先按实际佩戴的徽章计价。
  - 潘多拉事件优先：徽章锁定、固定费用、字数门槛、小表情等约束会覆盖徽章建议。
  - 持有「走个面」时提供活跃度加成的佩戴 / 摘下开关。
  - 佩戴走 `POST /v1/me/badges/:badgeId/equip`，摘下走 `DELETE`，均带 `Idempotency-Key`；佩戴不消耗金币。
  - 设置页新增开关，默认开启；未登录或权限不足时不注入状态栏，也不请求相关接口。
- **帖子金币池**：帖子详情页展示金币池剩余金币，并区分「进行中 / 已领完 / 已结束 / 已过期」。
  - 同时兼容文档中的 `extra.reward_pool` 与线上实际返回的顶层 `reward_pool`。
  - 新增纯函数 `lib/reward-pool.ts` 并补充单元测试。

### 变更

- 节点树改为一次 `GET /v1/nodes` 拉取完整两级结构，不再按父节点逐个补拉子节点；缓存版本升至 3，旧缓存自动失效。
- README 精简为面向用户的功能说明，去掉开发过程记录。

## [0.6.1] - 2026-11-14

### 新增

- 未登录状态下的账号入口增加注册链接。
- 补充 MIT License。
- 新增 GitHub Release 工作流，推送 `v*` 标签时自动构建并上传 Chrome / Firefox 压缩包。
- 上架 [Firefox Add-ons（AMO）](https://addons.mozilla.org/zh-CN/firefox/addon/t2-web-extension/)，README 增加直接安装入口。

### 变更

- 调整 `zip` 脚本，构建商店版本与本地版本分开。

## [0.6.0] - 2026-11-14

### 新增

- **系统桌面通知**：收到新消息时弹出系统通知，成串到达会合并；可在设置页关闭。
- 原生通知支持 Firefox（`browser.notifications`），并保留 Chromium 下的实现。
- 登录前即可从账号入口进入 2Libra 注册，附带邀请码。

### 修复

- 通知点击目标在 Service Worker 重启后仍能命中对应消息。
- Firefox 下只对扩展自身来源移除 `Origin` 头，避免影响其它请求。
- 最新评论样式调整：强调回复正文、弱化作者关系，默认展示完整内容。

## [0.5.0] - 2026-11-14

### 新增

- **我的视图**：关注流、收藏、书签、我的帖子、我的合集，登录后固定在一级 Tab「我的」下。
- **帖子详情**：完整正文、类型、分区、作者与发布时间，支持收藏 / 取消收藏。
- **消息中心**：实时未读角标、全部 / 未读 / 回复 / 提及 / 表态 / 打赏分段筛选，支持单条与全部已读。
- **设置页**：账号、节点配置与外观集中在一个独立标签页，改动即时保存。
- 节点视图配置：内置榜单显隐 / 排序，可添加全站、父节点或具体子节点。
- 最新评论榜与社区讨论榜。
- 合规声明：内容署名、开发者声明与权限最小化说明。

### 变更

- 统一将「通知」改称「消息」，与站点保持一致。
- 未读数改由 SSE 推送驱动，去掉轮询；请求统一排队限速。
- 精简不必要的宿主权限与未读接口请求。

[0.5.0]: https://github.com/vhxubo/t2-web-extension/releases/tag/v0.5.0
[0.6.0]: https://github.com/vhxubo/t2-web-extension/releases/tag/v0.6.0
[0.6.1]: https://github.com/vhxubo/t2-web-extension/releases/tag/v0.6.1
[0.7.0]: https://github.com/vhxubo/t2-web-extension/releases/tag/v0.7.0
[0.7.1]: https://github.com/vhxubo/t2-web-extension/releases/tag/v0.7.1
[0.7.2]: https://github.com/vhxubo/t2-web-extension/releases/tag/v0.7.2
