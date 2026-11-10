# 2Libra 帖子浏览

一个 2Libra 的浏览器扩展：在工具栏弹窗里快速扫一眼帖子，或者在新标签页里完整浏览。
支持全部榜单、全部分区切换，并且可以设置「默认榜单」和「默认分区」。

基于 [2Libra 开放 API v1](https://r2.2libra.com/openapi/v1/index.md)，只读。

## 功能

- **弹窗**：登录状态、默认榜单/分区快捷切换、当前视图的前 5 条帖子。点帖子会在新标签页打开 2Libra 原帖。
- **完整页面**：点击弹窗底部的「在新标签页打开发帖列表」或工具栏右键打开；左侧分区树、顶部榜单标签、无限滚动。
- **5 个榜单**：新发表、今日热议（24h）、近期热议（7d）、价值榜、评分榜。
- **全部分区**：从 `GET /v1/nodes` 拉取完整节点树，按工作 / 生活 / 特别分组，顶层分区与子分区都能选；移动端折叠为下拉框。
- **默认视图**：弹窗里的榜单/分区下拉框就是默认值编辑器；完整页面会从默认视图开始，设置弹窗里也能改。
- **登录**：2Libra OAuth 授权码 + PKCE（公开客户端，无 `client_secret`），令牌过期自动刷新（单飞），401 自动重试一次。
- 浅色 / 深色主题、键盘可操作、`prefers-reduced-motion` 生效。

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

1. 打开 2Libra → 设置 → OAuth 应用，新建应用。
2. 客户端形态选「无服务端（公开客户端）」。
3. 回调地址：点开扩展 → 设置 → 授权应用，复制「回调地址」（形如 `https://<扩展 ID>.chromiumapp.org/cb`），原样填进 2Libra。**必须完全一致**。
4. 权限勾选 `read` 与 `profile`。
5. 审核通过后，把 `client_id` 填进扩展设置 → 回到「账号」点「登录 2Libra」。

> 开发模式下扩展 ID 可能随安装方式变化，回调地址也会跟着变。换机器或重装后记得同步 2Libra 里的回调地址。

授权流程在**完整页面**里执行：`browser.identity.launchWebAuthFlow` 打开的授权窗口会让弹窗失焦关闭，所以弹窗里的「登录」会先打开新标签页，再在那一页完成授权。

令牌存放在 `storage.local`（扩展上下文，网页脚本读不到），支持手动填入 access token 作为调试后备。

## 榜单与接口映射

| 榜单 | 接口 | 支持分区筛选 |
| --- | --- | --- |
| 新发表 | 全站 `GET /v1/topics/latest`；选区时 `GET /v1/topics?sort=latest` | ✅ |
| 今日热议 | `GET /v1/topics/hot?period=24h` | ❌ |
| 近期热议 | `GET /v1/topics/hot?period=7d` | ❌ |
| 价值榜 | `GET /v1/topics?sort=value` | ✅ |
| 评分榜 | `GET /v1/scores`（匿名读取） | ❌ |

分区筛选：顶层分区用 `parent_slug`，子分区用 `node_id`（节点 uuid）。热点榜和评分榜的接口本身不接受分区参数，所以：
- 选着具体分区时去点这两个榜单，会明确切回全站（并给一条提示）；
- 反过来，在热点榜上选分区，会自动切到「新发表」并提示原因。

## 跨域说明（为什么需要 declarativeNetRequest）

2Libra 的 `/api/*` 对 `Origin` 做白名单，只放行它自己站点的来源；未知来源会直接返回
`500 {"code":"internal_error","m":"Not allowed by CORS"}`。扩展页面发起的请求同样会带上
`Origin: chrome-extension://<扩展 ID>`，因此会被拒绝。

扩展的做法是：用一条 **动态 DNR 规则**，在「本扩展自己发往 `2libra.com/api` 的请求」上移除
浏览器自动附加的 `Origin` 头，让请求表现得像 `curl` 这样的普通客户端。

- 规则条件带 `initiatorDomains: [扩展 ID]`，**不会**影响 2libra.com 页面自身的请求，也不影响其它网站。
- CORS 不是鉴权：读接口本来就是公开的，登录后的令牌仍然按标准的 `Authorization: Bearer` 传递。
- 规则在扩展启动 / 安装时安装一次（幂等）。如果安装失败，控制台会有
  `[2Libra] 跨域请求规则安装失败` 的警告。

扩展的权限：`storage`（保存设置与令牌）、`identity`（OAuth 授权窗口）、
`declarativeNetRequestWithHostAccess`（上面的请求头规则），host 权限为
`https://2libra.com/*` 与 `https://r2.2libra.com/*`（头像）。

## 数据、缓存与限流

- 节点列表缓存 10 分钟，可在设置里手动清除；请求失败时退回旧缓存。
- 列表按页加载（20/30/50 条），触底自动加载，翻页结果按 `short_id` 去重（接口不承诺不重不漏）。
- 遇到 `429 rate_limited` 会展示 `retry_after`；`401` 先刷新令牌再重试一次；`403 insufficient_scope` 会引导重新授权。
- 只读：2Libra 的跨域策略不允许浏览器应用直接写数据，发帖/评论必须经自己的服务端，所以本扩展没有写操作。

## 项目结构

```
entrypoints/
  popup/          弹窗页面（默认视图 + 前 5 条）
  dashboard/      完整页面（分区树 + 榜单 + 无限滚动 + 设置）
lib/
  api.ts          信封解析、401 刷新重试、错误类型
  auth.ts         PKCE、授权、刷新（单飞）、退出
  storage.ts      令牌 / 设置 / 节点缓存的 storage 定义
  feed.ts         五个榜单的取数与归一化、去重
  nodes.ts        节点树加载与分组
  section.ts      分区的 key、标签、接口参数
  errors.ts       错误 → 用户可读文案
components/       共用组件（分区栏、榜单标签、列表行、设置弹窗…）
hooks/            useFeed / useNodes / useSession / useSettings
styles/           设计令牌与基础样式
```

## 已知边界

- 登录依赖你已经申请并通过审核的 2Libra OAuth 应用；没配置 `client_id` 时所有内容仍可匿名浏览。
- 热点榜/评分榜不支持分区，这是接口能力限制，界面里已经明确提示。
- 评分榜条目只有「评分对象 + 分类 + 短评」，2Libra 该接口不返回帖子标题。
- 帖子内容用 `:code:` 短码表示表情；本扩展只展示标题与元信息，不渲染正文，因此没有引入 `/v1/emojis`。
