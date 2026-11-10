# T2 Web Extension

T2 Web Extension 让你在工具栏弹窗里快速扫一眼帖子，或者在新标签页里把四个榜单铺成四列看板。
完整页面同屏展示全部榜单，并且可以设置「默认榜单」和「每页条数」。

基于 [开放 API v1](https://r2.2libra.com/openapi/v1/index.md)，只读。

## 功能

- **弹窗（方案 C）**：🍃「社区热榜」Header + 榜单 Tab + 单行标题列表 + 底部固定 Dock。Tab 依次是最新 / 今日热议 / 近期热议 / 价值榜，展示当前榜单前 20 条（只看全站）；标题单行截断，回复数用等宽数字固定在右侧，点帖子在新标签页打开原帖。
- **底部 Dock**：`🔥 快捷热榜`（回到当前列表顶部）、`📊 数据仪表盘`（打开完整页面；登录后有未读通知时显示小红点）、`⚙️ 设置`（打开完整页面的设置弹窗）。
- **完整页面**：四个看板四列并排展示，不用切标签、一屏看全；每张卡片独立滚动、独立刷新，也可以一次刷新全部。顶栏铃铛打开通知中心。
- **4 个榜单**：新发表（弹窗里显示为「最新」）、今日热议（24h）、近期热议（7d）、价值榜。
- **默认视图**：弹窗里的榜单 Tab 会保存为默认榜单；每页条数在完整页面的设置弹窗里修改（默认榜单只影响弹窗）。
- **未读通知**：登录后读取 `GET /v1/me/notifications/unread-count`，在弹窗 Dock 的「数据仪表盘」上显示陶土红小圆点，仪表盘顶栏铃铛显示同一状态；通知中心展示最近 30 条。预览窗口可见时每 60 秒刷新一次，关闭即停止。
- **登录**：OAuth 授权码 + PKCE（公开客户端，无 `client_secret`），令牌过期自动刷新（单飞），401 自动重试一次。
- **视觉**：弹窗固定为清新素净的暖白纸面（不随系统深色模式变化）；完整页面跟随系统浅色 / 深色。无衬线字体、等宽数字、键盘可操作、`prefers-reduced-motion` 生效。

## 开发

```bash
bun install        # 或 npm install
bun run dev        # 开发模式，产物在 .output/chrome-mv3-dev
bun run build      # 生产构建，产物在 .output/chrome-mv3
bun run compile    # tsc 类型检查
```

加载未打包扩展：Chrome 打开 `chrome://extensions` → 打开「开发者模式」→「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3` 目录。
Firefox 可用 `bun run dev:firefox`。

## 登录配置（OAuth）

扩展是「无服务端」形态，所以必须申请**公开客户端**，扩展里不会、也不应该出现 `client_secret`。

`client_id` 是应用级配置，由开发者在源码里填写，**不向用户暴露**：

1. 打开站点 → 设置 → OAuth 应用，新建应用。
2. 客户端形态选「无服务端（公开客户端）」。
3. 回调地址填 `https://<扩展 ID>.chromiumapp.org/cb`（即 `browser.identity.getRedirectURL('cb')` 的返回值；扩展 ID 可在 `chrome://extensions` 查看），**必须完全一致**。
4. 权限勾选 `read`、`profile` 与 `read:me`（`read:me` 只用于未读通知角标与通知列表）。
5. 审核通过后，把 `client_id` 填到 [`lib/config.ts`](lib/config.ts) 的 `OAUTH_CLIENT_ID`，再重新构建。

> 开发模式下扩展 ID 可能随安装方式变化，回调地址也会跟着变。换机器或重装后记得同步站点里的回调地址。
> `OAUTH_CLIENT_ID` 留空时扩展仍可匿名使用，登录按钮会被禁用。

授权流程在**完整页面**里执行：`browser.identity.launchWebAuthFlow` 打开的授权窗口会让弹窗失焦关闭，所以弹窗里的「登录」会先打开新标签页，再在那一页完成授权。

令牌存放在 `storage.local`（扩展上下文，网页脚本读不到）。设置弹窗只保留登录 / 退出，不提供任何 client_id、回调地址或手动令牌的配置入口。

## 未读通知

登录后扩展会读取两个只读端点：

| 用途 | 端点 | scope |
| --- | --- | --- |
| Dock / 铃铛上的未读数 | `GET /v1/me/notifications/unread-count` | `read:me` |
| 通知中心列表 | `GET /v1/me/notifications?page=1&limit=30` | `read:me` |

- 弹窗 Dock 的「数据仪表盘」与完整页面顶栏铃铛共享同一份未读数；页面可见时每 60 秒轮询一次，弹窗关闭后自动停止。
- 未读数请求失败（未登录、令牌缺少 `read:me`、网络异常）时**静默隐藏小红点**，不影响榜单浏览；在通知中心里会显示可操作的重试 / 重新授权提示。
- 通知列表的字段名是 `list`（不是 `items`）。扩展只展示通知类型、来源用户和时间，不猜测 `payload` 的内部结构。
- **标记已读仍需到站点内完成**：`/api/v1/*` 的跨域策略只放行 `GET` / `HEAD` / `OPTIONS`，扩展发不了 `POST /v1/me/notifications/read`。
- 本次改动把授权 scope 从 `read profile` 扩到 `read profile read:me`；旧令牌需要重新授权一次才会出现通知角标。

## 榜单与接口映射

| 榜单 | 接口 |
| --- | --- |
| 新发表 | 全站 `GET /v1/topics/latest` |
| 今日热议 | `GET /v1/topics/hot?period=24h` |
| 近期热议 | `GET /v1/topics/hot?period=7d` |
| 价值榜 | `GET /v1/topics?sort=value` |

完整页面不再提供分区切换，所有卡片都按全站展示。

## 跨域说明（为什么需要 declarativeNetRequest）

服务端的 `/api/*` 对 `Origin` 做白名单，只放行它自己站点的来源；未知来源会直接返回
`500 {"code":"internal_error","m":"Not allowed by CORS"}`。扩展页面发起的请求同样会带上
`Origin: chrome-extension://<扩展 ID>`，因此会被拒绝。

扩展的做法是：用一条 **动态 DNR 规则**，在「本扩展自己发往 API 的请求」上移除
浏览器自动附加的 `Origin` 头，让请求表现得像 `curl` 这样的普通客户端。

- 规则条件带 `initiatorDomains: [扩展 ID]`，**不会**影响站点页面自身的请求，也不影响其它网站。
- CORS 不是鉴权：读接口本来就是公开的，登录后的令牌仍然按标准的 `Authorization: Bearer` 传递。
- 规则在扩展启动 / 安装时安装一次（幂等）。如果安装失败，控制台会有
  `[T2] 跨域请求规则安装失败` 的警告。

扩展的权限：`storage`（保存设置与令牌）、`identity`（OAuth 授权窗口）、
`declarativeNetRequestWithHostAccess`（上面的请求头规则），host 权限为
服务端域名与头像 CDN 域名。

## 数据、缓存与限流

- 列表按页加载（20/30/50 条）；完整页面每张榜单卡片底部有「加载更多」，翻页结果按 `short_id` 去重（接口不承诺不重不漏）。
- 遇到 `429 rate_limited` 会展示 `retry_after`；`401` 先刷新令牌再重试一次；`403 insufficient_scope` 会引导重新授权。
- 只读：服务端的跨域策略不允许浏览器应用直接写数据，发帖/评论必须经自己的服务端，所以本扩展没有写操作。

## 项目结构

```
entrypoints/
  popup/          弹窗页面（Header + 榜单 Tab + 单行列表 + 底部固定 Dock）
  dashboard/      完整页面（四列看板 + 通知中心 + 设置）
lib/
  api.ts          信封解析、401 刷新重试、错误类型
  auth.ts         PKCE、授权、刷新（单飞）、退出
  storage.ts      令牌 / 设置 / 节点缓存的 storage 定义
  feed.ts         四个榜单的取数与归一化、去重
  notifications.ts 未读通知数 / 通知列表（只读）
  nodes.ts        节点树加载与分组
  section.ts      分区的 key、标签、接口参数
  errors.ts       错误 → 用户可读文案
components/       共用组件（榜单卡片、列表行、通知中心、设置弹窗…）
hooks/            useFeed / useNodes / useSession / useSettings / useUnreadNotifications
styles/           设计令牌与基础样式
```

## 已知边界

- 登录依赖开发者已经申请并通过审核的 OAuth 应用（`lib/config.ts` 里的 `OAUTH_CLIENT_ID`）；未配置时所有内容仍可匿名浏览，登录按钮禁用。
- 通知角标依赖授权时勾选 `read:me`；应用审核未开通该 scope 时，角标与通知中心会提示重新授权。
- 扩展不能标记通知已读，也不能在扩展内完成写操作；请到站点内处理。
- 帖子内容用 `:code:` 短码表示表情；本扩展只展示标题与元信息，不渲染正文，因此没有引入 `/v1/emojis`。
