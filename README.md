# T2 Web Extension

> 作者：vhxubo · [vhxubo@gmail.com](mailto:vhxubo@gmail.com)

T2 Web Extension 让你在工具栏弹窗里快速扫一眼帖子，或者在新标签页里把关注的榜单和节点铺成可配置的看板。
弹窗最多放 6 个 Tab，仪表盘不限数量；每个视图都能单独控制显隐、拖动排序，并随时添加全站、父节点或具体子节点。

基于 [开放 API v1](https://r2.2libra.com/openapi/v1/index.md)，只读。

## 功能

- **弹窗（方案 C）**：🍃「T2 Web Extension」Header + 可配置视图 Tab（最多 6 个）+ 单行标题列表 + 底部固定 Dock。每个 Tab 可以是内置榜单、全站最新、某个父节点（含全部子节点）或某个具体子节点；标题单行截断，回复数用等宽数字固定在右侧，点帖子在新标签页打开原帖。
- **底部 Dock**：`🔥 回到顶部`（回到当前列表顶部）、`📊 数据仪表盘`（打开完整页面；登录后有未读通知时显示小红点）、`⚙️ 设置`（在新标签页打开独立设置页）。
- **完整页面**：可配置卡片按可用宽度自动铺列，数量不限；每张卡片独立滚动、独立刷新，也可以一次刷新全部。顶栏铃铛打开通知中心。
- **最新评论**：默认新增的 `💬 最新评论` 视图读取 `GET /v1/comments/latest`，用专门的评论行展示「谁回复了谁、回复正文、被引用的父评论、所属节点与原帖」。点正文跳到站点的这条回复（`?commentId=`，跨页自动带 `p=`；嵌套回复走 `/post-flat/` 精确定位），点底部的帖子标题跳到原帖。评论正文里的 `:code:` 表情会用 `/v1/emojis` 的映射渲染成图片。
- **搜索**：弹窗 Header 与完整页面顶栏都提供搜索入口（`Ctrl / ⌘ K`），打开搜索弹窗后可切换帖子 / 用户 / 节点 / 标签，登录后还可搜索自己的收藏。关键词至少 2 个字符，输入停顿 350ms 才发请求，结果在页面内缓存 5 分钟；搜索接口单独限流（匿名 5 次/分、登录 20 次/分），所以只展示第一页，额度用完时会显示等待时间。
- **设置页**：账号、节点配置（含弹窗默认进入）与外观全部收进一个独立标签页，并注册为扩展的选项页（`options_ui`）；改动即时保存，不需要「保存」按钮。
- **节点配置**：设置页里新增「节点配置」。现有视图（默认是八个内置榜单）都能分别开关「弹窗」与「仪表盘」；默认 8 个内置榜单全部进仪表盘，前 6 个进弹窗，工作 / 生活默认只在仪表盘；拖动左侧手柄或上下箭头调整顺序；「添加节点」会弹出一个选择弹窗，可按名称 / slug 筛选全站、父节点（含全部子节点）和具体子节点。弹窗硬上限 6 个 Tab，仪表盘不限；设置里会实时显示两边各放了多少个。父节点用 `parent_slug` 查询，子节点用 `node_id` 查询。
- **8 个内置榜单**：首页（全站按价值排序）、今日热议（24h）、近期热议（7d）、新发表（最新帖子流）、最新评论（全站评论时间线）、社区讨论（论坛节点）、工作维度、生活维度。它们只是默认配置，可以隐藏、排序，也可以被自定义节点 Tab 替代。
- **默认进入**：在独立设置页的「节点配置」卡片底部设置，选择弹窗打开时先显示哪个视图；候选是「弹窗」开关打开的视图。在弹窗里切换 Tab 只影响当次浏览，不会改写默认值，也不会影响下次打开。列表每页条数固定：内置榜单沿用各自配置（首页 / 社区讨论 50 条，工作 / 生活 20 条，最新评论 20 条，热议 / 新发表走接口默认 50 条）；自定义节点视图每页 50 条。
- **未读通知**：登录后读取 `GET /v1/me/notifications/unread-count`，在工具栏扩展图标、弹窗 Dock 的「数据仪表盘」和仪表盘顶栏铃铛三处显示同一状态；通知中心展示最近 30 条。扩展图标角标由后台 `alarms` 每分钟抓取一次，弹窗关闭也会更新；页面可见时另外每 60 秒刷新一次。
- **登录**：OAuth 授权码 + PKCE（公开客户端，无 `client_secret`），令牌过期自动刷新（单飞），401 自动重试一次。登录成功后立即解析当前用户资料：`GET /v1/me/summary` 只用来取身份，**缺头像时**再用公开的 `GET /v1/users/:username` 补齐（不需要额外 scope），结果写入 `storage.local`，退出登录一并清除。
- **外观**：设置页的「外观」支持 `☀️ 浅色 / 🌙 深色 / 💻 跟随系统`，选择保存在 `chrome.storage.local` 的 `t2:settings`，弹窗、仪表盘与设置页共用同一份偏好。弹窗 Header 另外提供 `☀️ / 🌙` 按钮一键切换浅色 / 深色；当前为「跟随系统」时会提示实际主题，想恢复跟随系统回到设置页即可。选「跟随系统」时会监听 `prefers-color-scheme`，系统切换后所有已打开页面实时跟着变。
- **视觉**：所有页面共用同一套 CSS 变量主题（`--bg-base` / `--bg-card` / `--text-main` / `--primary` 等），由 `<html class="dark">` 切换深色令牌。无衬线字体、等宽数字、键盘可操作、`prefers-reduced-motion` 生效。

## 节点配置模式

一个「视图」是弹窗里的一个 Tab，也是仪表盘上的一张卡片。配置只保存视图 id 与展示位置，名称在运行时从 `/v1/nodes` 解析：

| 视图 id | 来源 | 查询 |
| --- | --- | --- |
| `board:<id>` | 八个内置榜单 | 见下方「榜单与接口映射」 |
| `section:all` | 全站（所有节点）最新 | `GET /v1/topics?page=&limit=` |
| `section:p:<slug>` | 父节点（含全部子节点） | `GET /v1/topics?page=&limit=&parent_slug=<slug>` |
| `section:n:<slug>` | 具体子节点 | `GET /v1/topics?page=&limit=&node_id=<uuid>` |

设置存储在 `local:t2:settings` 的 `views` 数组里，数组顺序就是展示顺序：

```ts
interface ViewPreference {
  id: string;        // board:home / section:p:work / section:n:frontend
  popup: boolean;    // 是否出现在弹窗 Tab（最多 6 个）
  dashboard: boolean; // 是否出现在仪表盘（不限）
}
```

- **分别显隐**：弹窗和仪表盘各有一个开关。两个都关掉就是完全隐藏；关掉某一项不会删除顺序和配置。
- **排序**：拖动行手柄，或用行尾的上下箭头；键盘也能操作。
- **添加**：内置榜单始终在配置里，只能隐藏不能删除；`全站` / 父节点 / 子节点是追加项，可以随时移除。父节点条目读取它下面的全部子节点，子节点条目只读取该节点。
- **上限**：弹窗 Tab 在设置层限制为 6 个（第 7 个的「弹窗」开关会被禁用），读取侧还会再截断一次，防止手工改存储后溢出；仪表盘不设上限。
- **节点失效**：节点被下线或改名后，配置仍保留。设置里会标「未找到」，卡片 / Tab 会提示到节点配置里移除。
- **恢复默认**：一键回到八个内置榜单全部展示的初始状态。旧版本的 `board` / `section` 设置会自动迁移为 `board:<id>`，不需要重新配置；升级时还会把「最新评论」补进旧配置（弹窗已满则只加到仪表盘），之后你主动移除不会再被加回来。
- **节点树**：`/v1/nodes` 只返回顶层节点，扩展会再按 `?parent=<slug>` 拉取每个父节点的子节点（4 个并发），合并后缓存 10 分钟；旧版本缓存没有子节点，会自动失效重拉。

## 开发

```bash
bun install        # 或 npm install
bun run dev        # 开发模式，产物在 .output/chrome-mv3-dev
bun run build      # 生产构建（Chrome），产物在 .output/chrome-mv3
bun run compile    # tsc 类型检查
```

## 多浏览器构建

两个目标都从同一份源码构建，区别只在 manifest 的浏览器适配（MV3 / MV2、署名格式、action 字段）：

| 浏览器 | 构建命令 | 产物目录 | 打包命令 | 安装方式 |
| --- | --- | --- | --- | --- |
| Chrome / Chromium 系（Edge、Brave、360、QQ） | `bun run build:chrome` | `.output/chrome-mv3` | `bun run zip:chrome` | `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序；Edge 用 `edge://extensions` 加载同一个包 |
| Firefox | `bun run build:firefox` | `.output/firefox-mv2` | `bun run zip:firefox` | `about:debugging#/runtime/this-firefox` → 临时载入附加组件；正式安装需签名 |

> **当前发布状态：只有 Chrome 实测过。** Firefox 目标只验证到「能构建、manifest 能生成」，
> 还没在真实 Firefox 里加载过，弹窗、新标签页、登录回调和角标都未验证。
> 另外 Firefox 的 manifest 目前是 MV2，并且沿用了 Chromium 专属的
> `minimum_chrome_version` 与 `declarativeNetRequestWithHostAccess` 权限；正式提交 AMO 前
> 需要按 Firefox 的权限模型单独适配，不要直接把 `.output/firefox-mv2` 当作可发布产物。

一次构建 / 打包全部目标（Firefox 部分同上，未实测）：

```bash
bun run build:all   # chrome + firefox
bun run zip:all     # 两个 zip，输出在 .output/
```

Chromium 系（含 Edge）共用同一个 MV3 包，不再单独产出 Edge 包。Firefox 的 `zip` 会额外生成源码包（AMO 审核需要）。Firefox 需在 `wxt.config.ts` 里配置
`browser_specific_settings.gecko.id` 才能获得稳定 ID 并正式签名安装；临时载入不受影响。
Safari 需要 macOS 上的 Safari 转换工具，当前不提供构建。

加载未打包扩展：Chrome 打开 `chrome://extensions` → 打开「开发者模式」→「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3` 目录。
Firefox 可用 `bun run dev:firefox`。

### 本地加载（不发布）

扩展 ID 已经用 manifest 的 `key` 固定住（见「登录配置 → 扩展 ID」），所以**解压到哪个目录、版本号改不改都不影响**，
不用再守着某个固定路径。

```bash
bun run build     # 产物在 .output/chrome-mv3
```

然后到 `chrome://extensions` 点该扩展的「重新加载」即可。以后发版、换目录、换机器，都只重复这一步，
2libra 的设置一次登记、长期有效。

## 登录配置（OAuth）

扩展是「无服务端」形态，所以必须申请**公开客户端**，扩展里不会、也不应该出现 `client_secret`。

`client_id` 是应用级配置，由开发者在源码里填写，**不向用户暴露**：

1. 打开站点 → 设置 → OAuth 应用，新建应用。
2. 客户端形态选「无服务端（公开客户端）」。
3. 回调地址填 **`https://lbjdmldgngjjdpgadblpgneglbmgblfd.chromiumapp.org/cb`**，**必须完全一致**（逐字符，区分大小写，结尾没有斜杠）。
   这个 ID 由 manifest 里的 `key` 钉死，见下面的「扩展 ID」。
4. 权限勾选 `read`、`profile` 与 `read:me`（`read:me` 只用于未读通知角标与通知列表）。
5. 审核通过后，把 `client_id` 填到 [`lib/config.ts`](lib/config.ts) 的 `OAUTH_CLIENT_ID`，再重新构建。

### 扩展 ID 已固定为 `lbjdmldgngjjdpgadblpgneglbmgblfd`

Chromium 的 manifest 里写了 `key`（**公钥**，可公开，不是 `client_secret`），ID 由它推导：
`sha256(公钥 DER)` 取前 16 字节，每个十六进制位映射成 `a`–`p` 的一个字母。因此：

| 操作 | ID |
| --- | --- |
| 换解压目录、换机器、改版本号 | 不变 |
| `bun run build` / `bun run zip` / 重新加载 | 不变 |
| 用 `.keys/t2-dev.pem` 打 .crx | 不变（同一把钥匙） |
| 更换 `wxt.config.ts` 里的 `PINNED_KEY` | 变 —— 此时必须同步改站点回调 |

- 站点里的回调只需填一次：`https://lbjdmldgngjjdpgadblpgneglbmgblfd.chromiumapp.org/cb`。
- [`wxt.config.ts`](wxt.config.ts) 在构建期会校验「公钥算出来的 ID == `PINNED_EXTENSION_ID`」，不一致就直接报错，
  避免换错钥匙后要等到登录才发现回调地址对不上。
- 私钥 `.keys/t2-dev.pem` 建议备份：只做解压加载用不到它，但打 .crx（或上传自带 key 的包）必须用它，
  否则产出的 ID 会和这里不一致；丢了只能重新生成密钥对，ID 与回调地址要跟着换一次。
- Firefox 不用 `key`，靠 `browser_specific_settings.gecko.id`（`t2-web-extension@vhxubo.dev`）。它的
  `identity.getRedirectURL('cb')` 是 `https://<uuid>.extensions.allizom.org/cb`，与 Chrome 不是同一个地址，
  要在 Firefox 里调登录得单独登记一条。
- 核对（5 秒）：打开扩展的仪表盘或设置页 → 右键「检查」→ 控制台运行 `chrome.identity.getRedirectURL('cb')`，
  必须正好等于上面那条回调地址。

> `OAUTH_CLIENT_ID` 留空时扩展仍可匿名使用，登录按钮会被禁用。

授权流程在**独立设置页**里执行：`browser.identity.launchWebAuthFlow` 打开的授权窗口会让弹窗失焦关闭，所以弹窗里的「设置 / 登录」会先打开设置页，再在那一页完成授权。

令牌存放在 `storage.local`（扩展上下文，网页脚本读不到）。设置页只保留登录 / 退出，不提供任何 client_id、回调地址或手动令牌的配置入口。

## 未读通知

登录后扩展会读取两个只读端点：

| 用途 | 端点 | scope |
| --- | --- | --- |
| 工具栏角标 / Dock / 铃铛上的未读数 | `GET /v1/me/notifications/unread-count` | `read:me` |
| 通知中心列表 | `GET /v1/me/notifications?page=1&limit=30` | `read:me` |

- 弹窗 Dock 的「数据仪表盘」与完整页面顶栏铃铛共享同一份未读数；页面可见时每 60 秒轮询一次，弹窗关闭后自动停止。
- 工具栏图标右下角的数字角标由后台 service worker 维护：`browser.alarms` 每分钟抓一次未读数（与接口文档建议的 60 秒一致），用 `action.setBadgeText` **直接显示真实个数**，底色与界面小红点一致（`#c4554b`）、文字白色。未读为 0 时不显示角标。登录 / 退出 / 令牌刷新会立即触发一次，不必等下一轮；浏览器重启或扩展更新后会自动重建定时器。
- 未读数请求失败时：未登录、令牌缺少 `read:me`、`401` / `403` 会**静默隐藏**图标角标与界面小红点；断网或 `429` 等临时故障保留上一次的角标，不影响榜单浏览。在通知中心里会显示可操作的重试 / 重新授权提示。
- 通知列表的字段名是 `list`（不是 `items`）。扩展只展示通知类型、来源用户和时间，不猜测 `payload` 的内部结构。
- **标记已读仍需到站点内完成**：`/api/v1/*` 的跨域策略只放行 `GET` / `HEAD` / `OPTIONS`，扩展发不了 `POST /v1/me/notifications/read`。
- 本次改动把授权 scope 从 `read profile` 扩到 `read profile read:me`；旧令牌需要重新授权一次才会出现通知角标。同时新增了 `alarms` 权限，升级后需要在 `chrome://extensions` 重新加载一次扩展。

## 榜单与接口映射

| 榜单 | 接口 |
| --- | --- |
| 首页 | `GET /v1/topics?page=1&limit=50&parent_slug=All&sort=value`（全站按价值排序） |
| 今日热议 | `GET /v1/topics/hot`（全部用默认值：page 1、limit 50、period 24h） |
| 近期热议 | `GET /v1/topics/hot?period=7d`（只传非默认的 period；limit 用默认 50） |
| 新发表 | `GET /v1/topics/latest`（page / limit 都用默认值：第 1 页、50 条/页） |
| 最新评论 | `GET /v1/comments/latest?limit=20`（列表字段是 `items`；该端点只取最近 N 条，page 实际被忽略，所以不提供「加载更多」） |
| 社区讨论 | `GET /v1/topics?page=1&limit=50&node_id=eb3e8ec7-6b0f-43bf-956f-7a18ca23396a`（论坛 / 社区讨论节点） |
| 工作 | `GET /v1/topics?dimensions=work`（page / limit 必填；sort 默认 latest，不再传） |
| 生活 | `GET /v1/topics?dimensions=life`（page / limit 必填；sort 默认 latest，不再传） |

内置榜单之外的「全站 / 父节点 / 子节点」视图统一走 `GET /v1/topics`：`page` / `limit` 必填，`sort` 默认 `latest`；父节点传 `parent_slug`，子节点传 `node_id`。仪表盘与弹窗共用同一套查询，区别只在展示数量。

## 搜索

弹窗 Header 与完整页面顶栏的放大镜（`Ctrl / ⌘ K`）打开同一个搜索弹窗，调用 [`GET /v1/search`](https://r2.2libra.com/openapi/v1/api-read.md#搜索)：

| 类型 | `type` | 结果 |
| --- | --- | --- |
| 帖子 | `posts` | 分页对象（字段 `posts`），扩展只展示第一页 |
| 用户 | `users` | 数组 |
| 节点 | `nodes` | 数组；子节点链接到 `/node/<parent>/<slug>` |
| 标签 | `tags` | 数组；链接到 `/tag/<name>` |
| 收藏 | `favorites` | 数组，需要登录 |

- 关键词 2～100 个字符；输入停顿 350ms 才发请求，按 Enter 立即搜索，切换类型会重新搜索。
- 请求结果在页面内缓存 5 分钟；同一类型 / 关键词不会重复消耗配额。
- 搜索额度用完后显示等待秒数，倒计时结束自动重试；服务端返回 `429` 时按 `retry_after` 处理。
- 搜索只读，不写数据；结果在新标签页打开原帖、用户主页、节点页或标签页。

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
`alarms`（每分钟抓取未读数以更新图标角标）、`declarativeNetRequestWithHostAccess`
（上面的请求头规则），host 权限为服务端域名与头像 CDN 域名。

## 数据、缓存与限流

- 列表按页加载（内置榜单沿用各自条数，自定义节点视图每页 50 条）；完整页面每张卡片底部有「加载更多」，翻页结果按 `short_id` / 评论 `id` 去重（接口不承诺不重不漏）。
- 最新评论是一次快照：`/v1/comments/latest` 的 `page` 实际被忽略（传 `page=2` 仍返回同一批），因此只展示最近 20 条，卡片底部显示「仅展示最近 N 条」而不提供「加载更多」。
- 评论正文按站点约定拼接回复链接：顶层楼层用 `/post/<节点>/<短 id>?commentId=<评论 id>&p=<floor/30 向上取整>`；`floor` 为 null 的嵌套回复改用 `/post-flat/...`，按 `flat_floor` 分页。站点每页 30 条评论，页码只在 >1 时才带上。
- 表情映射来自 `GET /v1/emojis`（匿名请求），缓存在 `local:t2:emojis` 7 天；接口失败时退回旧缓存，没有缓存则保留 `:code:` 原文，不影响列表加载。
- 请求参数优先用文档默认值：有默认值的参数不传（热议与新发表的 `page`、`limit`，24h 的 `period`，工作/生活的 `sort`，搜索的 `page`、`limit`）；`/v1/topics` 的 `page`、`limit` 是必填；首页另外显式传 `parent_slug=All&sort=value`，社区讨论显式传 `node_id`。
- 当前用户资料（含头像）缓存在 `local:t2:profile`：精简快照没带头像时直接复用缓存里的头像，省掉一次公开资料请求；刷新失败时也还能显示上次的头像与昵称。退出登录会清掉缓存。
- 遇到 `429 rate_limited` 会展示 `retry_after`；`401` 先刷新令牌再重试一次；`403 insufficient_scope` 会引导重新授权。
- 只读：服务端的跨域策略不允许浏览器应用直接写数据，发帖/评论必须经自己的服务端，所以本扩展没有写操作。

## 项目结构

```
entrypoints/
  background.ts   跨域请求规则 + 未读通知图标角标的定时抓取
  popup/          弹窗页面（Header + 可配置视图 Tab + 单行列表 + 底部固定 Dock）
  dashboard/      完整页面（可配置卡片看板 + 通知中心）
  options/        独立设置页（同时是扩展的 options_ui）
lib/
  api.ts          信封解析、401 刷新重试、错误类型
  auth.ts         PKCE、授权、刷新（单飞）、退出
  storage.ts      令牌 / 设置 / 节点缓存的 storage 定义
  theme.ts        主题偏好解析、<html> 类名切换、系统深浅色监听
  viewIds.ts      视图 id、默认配置、6 个弹窗 Tab 上限
  views.ts        视图解析（名称 / 图标 / 查询）、节点候选列表
  feed.ts         内置榜单与节点视图的取数与归一化、去重
  comments.ts     最新评论的取数、帖子 / 回复链接、正文摘要
  emojis.ts       表情短码 → 图片地址（内存 + storage 缓存）
  notifications.ts 未读通知数 / 通知列表（只读）
  search.ts       全站搜索的类型、结果归一化与站点链接
  profile.ts      用户资料与头像字段归一化、分层取数（快照 → 缓存 → 公开资料）
  nodes.ts        节点树加载（含子节点并发拉取）、分组与查找
  section.ts      分区的 key、标签、接口参数
  errors.ts       错误 → 用户可读文案
components/       共用组件（视图 Tab / 卡片、节点配置、设置面板、搜索弹窗、列表行、评论行、通知中心…）
hooks/            useFeed / useNodes / useEmojis / useSearch / useSession / useSettings / useTheme / useUnreadNotifications
styles/           设计令牌与基础样式
```

## 已知边界

- 登录依赖开发者已经申请并通过审核的 OAuth 应用（`lib/config.ts` 里的 `OAUTH_CLIENT_ID`）；未配置时所有内容仍可匿名浏览，登录按钮禁用。
- 通知角标依赖授权时勾选 `read:me`；应用审核未开通该 scope 时，角标与通知中心会提示重新授权。
- 扩展不能标记通知已读，也不能在扩展内完成写操作；请到站点内处理。
- 搜索接口单独限流（匿名 5 次/分、登录 20 次/分），扩展只展示第一页；需要查看更多结果时请到站点内搜索。
- 节点视图依赖 `/v1/nodes`。首次打开会额外请求每个顶层节点的子节点（4 个并发），之后缓存 10 分钟；接口失败时回退旧缓存，缓存里没有的节点会标「未找到」。
- 帖子列表仍然只展示标题与元信息，不渲染正文；只有「最新评论」会展示评论正文（纯文本 + 表情图片），并且不会把 HTML 直接注入页面。
- 评论永久链接依赖站点的 `?commentId=` 查询参数与每页 30 条的楼层分页；如果站点改版调整了评论分页规则，跳转页码可能需要在 `lib/comments.ts` 的 `SITE_COMMENT_PAGE_SIZE` 同步更新。
