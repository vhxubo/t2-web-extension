# T2 Web Extension

> 作者：vhxubo · [vhxubo@gmail.com](mailto:vhxubo@gmail.com)

T2 Web Extension 让你在工具栏弹窗里快速扫一眼帖子，或者在新标签页里把关注的榜单和节点铺成可配置的看板。
弹窗最多放 6 个 Tab，仪表盘不限数量；每个视图都能单独控制显隐、拖动排序，并随时添加全站、父节点或具体子节点。

基于 [开放 API v1](https://r2.2libra.com/openapi/v1/index.md)，以只读浏览为主；写操作仅限消息已读（单条 / 全部）与帖子收藏。

## 合规（[第三方应用接入说明](https://r2.2libra.com/openapi/v1/terms.md)）

| 条款 | 落实方式 |
| --- | --- |
| 权限最小化（二·一.3） | 仅申请 `read` / `profile` / `read:me` / `interact`，与功能一一对应；不申请 `write:*`、`write:economy`、`upload` |
| 公开客户端，无 secret（四·1） | 授权码 + PKCE，代码中不存在 `client_secret` |
| 令牌不入日志（四·2） | 仅记录 `redirect_uri` 与回调路径（去掉 query），不打印令牌 |
| 内容保留署名与原链（二·一.1、附录） | 列表每行展示作者、标题链到原帖；列表底部固定「内容来自 2Libra 用户…原文链接」声明 |
| 开发者声明（三·1） | 设置页账号区与页脚常驻「本应用由 vhxubo 独立开发运营，与 2Libra 无隶属或合作关系」 |
| 撤销授权（四·5） | 收到 401/403 即清除本地令牌；退出登录清令牌与资料缓存 |
| 配额与自动化（五） | 全局并发/间隔限流 + 429 冷却；仅用户驱动读写，不批量抓取、不刷量 |
| 不镜像、不训练 AI（二·一.1） | 仅做展示型摘要，不落库、不提供全量导出 |

## 功能

- **弹窗（方案 C）**：未登录时 Header 是 🍃「T2 Web Extension」+ 右侧快捷图标（消息 / 搜索 / 刷新 / 深浅色 / 账号）；登录后标题位置换成一级 Tab `帖子 | 我的`，图标栏原样保留。二级 Filter Bar 跟着一级 Tab 换：`帖子` 是原来的可配置视图（首页 / 今日热议 / 近期热议 / 新发表 / 最新评论 / 社区讨论，最多 6 个）；`我的` 固定 5 个系统视图（关注流 / 收藏 / 书签 / 我的帖子 / 我的合集）。标题单行截断，回复数用等宽数字固定在右侧，点帖子在新标签页打开原帖。
- **帖子详情（二级页）**：弹窗每行末尾的箭头进入独立详情页（`关注流` 除外，直接把取回的条目平铺展示——有正文、表情表态与打赏信息时一并显示，不进二级），展示完整标题、类型、分区、作者、发布时间、浏览量与正文（markdown 安全渲染，支持标题 / 列表 / 引用 / 代码 / 图片 / 链接 / 表情）。「返回列表」或 `Esc` 回到原来的滚动位置。详情不请求评论，底部「到原帖看评论」直达站点原帖；登录后可在详情页直接收藏 / 取消收藏，未登录或旧令牌缺少 `interact` scope 时会引导重新授权。
- **底部 Dock**：`🔥 回到顶部`（回到当前列表顶部）、`📊 数据仪表盘`（打开完整页面；登录后有未读消息时显示小红点）、`⚙️ 设置`（在新标签页打开独立设置页）。
- **完整页面**：可配置卡片按可用宽度自动铺列，数量不限；每张卡片独立滚动、独立刷新，也可以一次刷新全部。顶栏铃铛打开消息中心。
- **最新评论**：默认新增的 `💬 最新评论` 视图读取 `GET /v1/comments/latest`，用专门的评论行展示「谁回复了谁、回复正文、被引用的父评论、所属节点与原帖」。点正文跳到站点的这条回复（`?commentId=`，跨页自动带 `p=`；嵌套回复走 `/post-flat/` 精确定位），点底部的帖子标题跳到原帖。评论正文里的 `:code:` 表情会用 `/v1/emojis` 的映射渲染成图片。
- **搜索**：弹窗 Header 与完整页面顶栏都提供搜索入口（`Ctrl / ⌘ K`），打开搜索弹窗后可切换帖子 / 用户 / 节点 / 标签，登录后还可搜索自己的收藏。关键词至少 2 个字符，输入停顿 350ms 才发请求，结果在页面内缓存 5 分钟；搜索接口单独限流（匿名 5 次/分、登录 20 次/分），所以只展示第一页，额度用完时会显示等待时间。
- **设置页**：账号、节点配置（含弹窗默认进入）与外观全部收进一个独立标签页，并注册为扩展的选项页（`options_ui`）；改动即时保存，不需要「保存」按钮。
- **节点配置**：设置页里新增「节点配置」。现有视图（默认是八个内置榜单）都能分别开关「弹窗」与「仪表盘」；默认 8 个内置榜单全部进仪表盘，前 6 个进弹窗，工作 / 生活默认只在仪表盘；拖动左侧手柄或上下箭头调整顺序；「添加节点」会弹出一个选择弹窗，可按名称 / slug 筛选全站、父节点（含全部子节点）和具体子节点。弹窗硬上限 6 个 Tab，仪表盘不限；设置里会实时显示两边各放了多少个。父节点用 `parent_slug` 查询，子节点用 `node_id` 查询。
- **8 个内置榜单**：首页（全站按价值排序）、今日热议（24h）、近期热议（7d）、新发表（最新帖子流）、最新评论（全站评论时间线）、社区讨论（论坛节点）、工作维度、生活维度。它们只是默认配置，可以隐藏、排序，也可以被自定义节点 Tab 替代。
- **默认进入**：在独立设置页的「节点配置」卡片底部设置，选择弹窗打开时先显示哪个视图；候选是「弹窗」开关打开的视图。在弹窗里切换 Tab 只影响当次浏览，不会改写默认值，也不会影响下次打开。列表每页条数固定：内置榜单沿用各自配置（首页 / 社区讨论 50 条，工作 / 生活 20 条，最新评论 20 条，热议 / 新发表走接口默认 50 条）；自定义节点视图每页 50 条。
- **未读消息**：登录后由后台接一条 SSE 长连接（`GET /v1/me/notifications/stream`）接收 `notification_update`，帧里带了未读数就直接用、没带才补拉一次；工具栏扩展图标、弹窗 Dock 的「数据仪表盘」和仪表盘顶栏铃铛三处共享同一份状态并即时更新。长连接正常由后台持有；后台没就绪时页面会等 2 秒再自己连一条 SSE 兜底，所以小红点是事件驱动、秒级更新，不依赖 service worker 是否存活。不再定时轮询；两条长连接都没就绪时只靠页面自己的 SSE 兜底，切回页面 / 窗口重新聚焦时校准一次。仪表盘消息中心展示最近 50 条，弹窗右上角铃铛（搜索左侧，数字角标直接显示未读数）可打开独立的消息预览，不占榜单 Tab；两处都会跟随新事件和切回页面静默刷新。两处都有「全部 / 未读 / 回复 / 提及 / 表态 / 打赏」分段筛选，切换后按 `type` / `unread_only` 重新拉取，不只是过滤已加载的一页。消息列表的未读条目右侧有「已读」按钮，调用 `POST /v1/me/notifications/read` 并带 `{ id: [id] }`；「全部已读」调用同一个端点、不带 body 同步到站点，并立即刷新小红点与工具栏角标。消息行本身不置灰；置灰用在榜单 / 搜索里的新闻条目——点开后整行置灰，记录保存在本地。
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
| `builtin:me_follows` | 关注流 | `GET /v1/me/follows/timeline?page=&limit=`（`items`） |
| `builtin:me_favorites` | 收藏 | `GET /v1/me/favorites?page=&limit=`（`posts`） |
| `builtin:me_bookmarks` | 书签 | `GET /v1/me/bookmarks?page=&limit=`（`items`） |
| `builtin:me_topics` | 我的帖子 | `GET /v1/me/topics`（不分页） |
| `builtin:me_collections` | 我的合集 | `GET /v1/me/collections`（不分页） |

设置存储在 `local:t2:settings` 的 `views` 数组里，数组顺序就是展示顺序：

```ts
interface ViewPreference {
  id: string;        // board:home / section:p:work / section:n:frontend
  popup: boolean;    // 是否出现在弹窗 Tab（最多 6 个）
  dashboard: boolean; // 是否出现在仪表盘（不限）
}
```

- **「我的」是系统视图**：`builtin:me_*` 不写进 `views` 配置，也不占弹窗 6 个 Tab 的名额；登录后固定出现在一级 Tab「我的」下，退出登录自动回到「帖子」。字段名差异（`posts` / `items` / 直接数组）与包装形态在 [`lib/me.ts`](lib/me.ts) 里统一收敛。
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
bun run test       # SSE 帧解析与长连接重连的单元测试（Bun）
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

### 商店上架包（Chrome Web Store / Edge Add-ons）

两个商店都**不接受 manifest 里的 `key` 字段**，Edge 的校验会直接报
`The manifest shouldn't contain the key field.`。所以上架要用 keyless 包，和本地开发用的包分开打：

```bash
bun run zip:store   # → .output/store/t2-web-extension-<version>-chrome-store.zip
```

- 同一个包可以同时上传 Chrome Web Store 和 Edge Add-ons，两者都由商店生成条目 ID。
- 产物单独放在 `.output/store/`，不会覆盖 `.output/` 下带 `key` 的本地开发包。
- 需要本地先验一遍 keyless 包时用 `bun run build:store`，解压目录是 `.output/store/chrome-mv3`。

> **商店包的扩展 ID 是商店分配的**，不等于本地钉死的 `lbjdmldgngjjdpgadblpgneglbmgblfd`，
> 于是运行时回调地址变成 `https://<商店分配的 ID>.chromiumapp.org/cb`：
>
> 1. 上传后在商店后台确认条目的扩展 ID（Edge 在 Partner Center，Chrome 在开发者面板）；
> 2. 到 2libra 设置 → OAuth 应用里补登记这条回调（一个应用可登记多条，共用同一个 `client_id`）；
> 3. 想让本地解压加载与商店版共用同一个 ID（同一份 `storage`、同一条回调），把商店后台给出的公钥回填到
>    `wxt.config.ts` 的 `PINNED_KEY`、同步 `PINNED_EXTENSION_ID`，再 `bun run build:chrome`；
>    上架包仍必须用 `zip:store` 打（带 key 会再次被拒）。

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
   这个 ID 由 manifest 里的 `key` 钉死，见下面的「扩展 ID」。Firefox 是另一条地址，见下面「Firefox 的回调地址」；
   两条都登记在**同一个应用**下（一个应用可以填多条重定向 URI，`client_id` 共用），不要为 Firefox 另开应用。
4. 权限勾选 `read`、`profile`、`read:me` 与 `interact`（`read:me` 只用于未读消息角标与消息列表，`interact` 只用于帖子收藏）。
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
- 核对（5 秒）：在 Chrome 打开扩展的仪表盘或设置页 → 右键「检查」→ 控制台运行
  `chrome.identity.getRedirectURL('cb')`，必须正好等于上面那条回调地址。

### Firefox 的回调地址

Firefox 不用 manifest 的 `key`，改用 `browser_specific_settings.gecko.id`（`t2-web-extension@vhxubo.com`）。
它的 `identity.getRedirectURL('cb')` 不是随机 UUID：Firefox 把 **gecko id** 做 SHA-1，再拼到
`extensions.allizom.org` 上（`https://<sha1(extension.id)>.extensions.allizom.org/<path>`）。所以只要 id 不变：

```
https://1e3dfcf6f6cd76246e686cabdf2e53df06ab002f.extensions.allizom.org/cb
```

- 临时载入（about:debugging）、重启浏览器、重新载入附加组件、换机器、换 profile，这条地址都不变；
  临时附加组件本身会在重启后消失，重新载入后回调 URL 还是这一条。
- 改 [`lib/config.ts`](lib/config.ts) 里的 `FIREFOX_EXTENSION_ID`（`wxt.config.ts` 从这里读）会换掉这条地址，
  必须同步改同文件的 `FIREFOX_REDIRECT_HASH` 和站点登记；ID 是开发者自选的字符串（形如邮箱即可，
  AMO 只校验全局唯一、不验证域名归属），选了以后正式签名就不要再改。
- 和 Chromium 共用同一个 OAuth 应用 / `client_id`，只是多登记一条重定向 URI。
- 核对：Firefox 打开 `about:debugging#/runtime/this-firefox` → 本扩展的「检查」→ 控制台运行
  `browser.identity.getRedirectURL('cb')`，返回值必须与站点里登记的那条一字不差。
- 两道自检，保证「跳的确实是这条」：构建期 `wxt.config.ts` 会断言
  `sha1(FIREFOX_EXTENSION_ID) == FIREFOX_REDIRECT_HASH`（改 ID 忘改回调直接构建失败）；
  登录前 [`lib/auth.ts`](lib/auth.ts) 再把运行时地址与 `FIREFOX_REDIRECT_URI` 逐字比一次，
  不一致就报错、不打开授权窗口。控制台会打印 `[T2] OAuth redirect_uri:`（发起时）和
  `[T2] OAuth callback:`（回调后实际落到的地址），可直接对照。
- 若站点表单不接受 `*.allizom.org` 这个主机（正常 https 表单不会拦），Firefox 还允许 loopback 回调
  `http://127.0.0.1/mozoauth2/<sha1>`；那需要改 [`lib/auth.ts`](lib/auth.ts) 的 `getRedirectUri()` 为 Firefox 返回该地址。

> `OAUTH_CLIENT_ID` 留空时扩展仍可匿名使用，登录按钮会被禁用。

授权流程在**独立设置页**里执行：`browser.identity.launchWebAuthFlow` 打开的授权窗口会让弹窗失焦关闭，所以弹窗里的「设置 / 登录」会先打开设置页，再在那一页完成授权。

令牌存放在 `storage.local`（扩展上下文，网页脚本读不到）。设置页只保留登录 / 退出，不提供任何 client_id、回调地址或手动令牌的配置入口。

## 未读消息

消息的读接口与「全部已读」走开放 API，单条已读沿用站点消息接口，并配合 SSE 长连接（`GET /v1/me/notifications/stream`，scope 都是 `read:me`；正常情况下只有后台一条，后台不可用时页面自己兜底一条）：

| 用途 | 端点 |
| --- | --- |
| 实时提醒 | `GET /v1/me/notifications/stream`（`text/event-stream`） |
| 工具栏角标 / Dock / 铃铛上的未读数（仅帧里没带时补拉） | `GET /v1/me/notifications/unread-count` |
| 消息中心列表 | `GET /v1/me/notifications?page=1&limit=50`（筛选另带 `type=` / `unread_only=true`） |
| 单条 / 批量标记已读 | `POST /v1/me/notifications/read`（body `{ id: [消息 id, …] }`，最多 100 条） |
| 全部标记已读 | `POST /v1/me/notifications/read`（不带 body，返回 `{ ok: true }`） |

- **正常情况下长连接由后台 service worker 独占**：弹窗和仪表盘只接收广播，避免多个页面各开一条。后台没就绪（service worker 被回收 / 建连失败）时，页面会等 2 秒后自己连一条 SSE 兜底；`localStorage` 把页面侧的建连间隔限制在 10 秒，配合页面侧退避，避免撞上「同一用户最多 10 条并发、每分钟最多建连 6 次」的限制。
- 浏览器 `EventSource` 不能设置 `Authorization`，而端点只认请求头，所以用 `fetch()` 读流：实现见 [`lib/notification-stream.ts`](lib/notification-stream.ts)，增量帧解析见 [`lib/sse.ts`](lib/sse.ts)。
- 收到 `ready` 表示握手成功；之后的 `notification_update` 只代表「有新消息」，事件里没有正文。**如果帧里带了 `unread_count` / `count`，扩展直接采用，不再请求 `unread-count`**；只有帧里没带时才补拉一次（连续事件合并成 300ms 内一次），写角标并广播给页面；消息中心打开时会顺带静默刷新列表。
- `reconnect` 是服务端 15 分钟寿命或令牌将过期时的正常节奏，不是错误：带刷新后的令牌重连。异常断线按 5s → 10s → 20s → 40s → 60s 退避，`429` 优先按 `retry_after` 等待。
- 连接 45 秒没有收到任何字节（心跳是 25 秒一次）就主动断开重连；`401` 先刷新令牌重试一次，刷新失败清掉登录态；`403`（缺 `read:me`）停止重连并隐藏角标，等重新授权。
- **不再定时轮询未读数**：`browser.alarms` 只做长连接保活——service worker 被浏览器回收后由它唤醒并重建 SSE，不发未读数请求。页面打开时先问一次后台状态，回复里带已知未读数就直接用，省掉一次 `unread-count`；后台没有时才自己补拉。此外只有握手 / 事件帧没带 `unread_count` 时会补拉，以及登录、退出、令牌刷新后的校准。站内读掉消息不会产生 `notification_update`，所以页面重新可见或窗口重新获得焦点时会校准一次并把结果回报给后台，保证切回扩展页面时小红点已经是最新值。
- 工具栏图标右下角的数字角标由后台维护：用 `action.setBadgeText` **直接显示真实个数**，底色与界面小红点一致（`#c4554b`）、文字白色。未读为 0 时不显示角标。登录 / 退出 / 令牌刷新会立即触发一次；浏览器重启或扩展更新后会自动重建保活定时器。
- 未读数请求失败时：未登录、令牌缺少 `read:me`、`401` / `403` 会**静默隐藏**图标角标与界面小红点；断网或 `429` 等临时故障保留上一次的角标，不影响榜单浏览。在消息中心里会显示可操作的重试 / 重新授权提示。
- 消息列表的字段名是 `list`（不是 `items`）。展示层从 `payload` 中读取回复 / 提及的 `commentText`、`postTitle`、`commentLevel`、`target`，表态的 `reactionType` / `reactions` / `relations`（按 emoji 分组显示表态 username），打赏的 `amount` / `rewardType`，以及系统消息、内容检定、徽章、升级等字段（映射见 [`lib/notification-view.ts`](lib/notification-view.ts)）。匿名回复用 `alias_name` / `alias_avatar_url`，帖子链接优先用 `path`，其次用 `postNodeSlug` + `postShortId` 拼详情页；无法识别的字段一律忽略并退回「一条新消息」。
- **分段筛选复用现有参数**：消息中心与弹窗预览都提供「全部 / 未读 / 回复 / 提及 / 表态 / 打赏」。`全部` 不传类型，`未读` 传 `unread_only=true`，其余分别映射到站点消息中心同名的 `type`：`reply` / `mention` / `reaction` / `get_reward`。服务端一次只接受一个 `type`，而「回复提及」是独立类型（`reply_mention`），所以它仍只在「全部」里出现，不并入「回复」或「提及」。分段切换会中止上一页请求并按新参数重拉，`total` 与「还有 N 条」跟着分段变化；「未读」下点单条已读会立即把该条移出列表并把总数减一。
- 消息内容只随列表请求临时展示，不写入 storage；`notification_update` 事件本身仍然不带正文，页面收到后再拉列表。
- **单条「已读」会调用接口**：未读消息右侧的「已读」按钮调用 `POST /v1/me/notifications/read`，body `{ id: [id] }`（字段名是 `id`，不是 `ids`；服务端会静默丢弃未知字段，写错等于把全部通知标为已读）。成功后该条不再显示未读按钮，并刷新未读数；失败时底部显示「操作失败」。
- **「全部已读」会写服务端**：`POST /v1/me/notifications/read`（不带 body）使用 `read:me` scope，成功返回 `{ ok: true }`；前端立即把当前列表全部置读，并调用未读数刷新，把工具栏角标与界面小红点归零。
- 消息行本身**不置灰**；单条 / 全部已读的结果只表现为未读按钮消失。
- 写请求只有消息单条 / 全部已读与帖子收藏；`apiPost` / `apiDelete` 复用同一套信封解析、401 刷新重试和 DNR 去 `Origin` 规则（见 [`lib/api.ts`](lib/api.ts)）。
- 授权 scope 是 `read profile read:me interact`；旧令牌需要重新授权一次才会出现消息角标、才能收藏帖子（设置页账号卡片提供「重新授权」）。SSE 复用同一套 `declarativeNetRequest` 规则（移除 `Origin` 头），没有新增权限。

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

## 帖子详情与收藏

弹窗列表每行末尾的箭头进入二级详情页，而不是在列表里内联展开，这样正文有完整宽度和高度。

| 用途 | 端点 |
| --- | --- |
| 帖子详情 | `GET /v1/topics/:short_id`（标题、正文 markdown、类型、节点、作者、发布时间、浏览量、附言；带令牌时含 `favorited`） |
| 收藏 | `POST /v1/topics/:short_id/favorite`（需要 `interact` scope，无请求体） |
| 取消收藏 | `DELETE /v1/topics/:short_id/favorite` |

- **不请求评论**：详情页只拉正文和元信息，评论区始终到原帖看；底部的「到原帖看评论」带当前评论数，直接打开站点帖子。
- **类型与分区**：线上普通帖的 `type` 是 `default`（文档写的 `normal` 也兼容），两者都属于普通帖、不显示类型标签；只有 `anonymous` / `moment` 等特殊类型标「匿名 / 动态」，未知类型原样展示。分区链接到 `/node/<slug>`（有父节点时 `/node/<parent>/<slug>`）。
- **正文渲染**：`content` 是 markdown，扩展用 [`components/TopicMarkdown.tsx`](components/TopicMarkdown.tsx) 解析成 React 节点，支持标题、段落、列表、引用、围栏代码、行内代码、链接、图片、粗体 / 斜体 / 删除线与裸链接；HTML 不会注入页面。正文里的 `:code:` 表情沿用 `/v1/emojis` 映射。
- **返回与滚动**：进入详情前记住列表 `scrollTop`，返回列表或按 `Esc` 时恢复；详情自身从顶部开始，Header 的刷新按钮在详情页刷新的是详情。
- **收藏状态**：按钮读取详情返回的 `favorited`；重复收藏 / 取消收藏收到 `409` 时按目标状态处理。未登录点收藏会打开设置页登录；旧令牌缺少 `interact` 时显示「重新授权」。
- **已读**：从行尾进入详情也记为已读，返回列表后该行置灰，与其他条目一致。

## 跨域说明（为什么需要 declarativeNetRequest）

服务端的 `/api/*` 对 `Origin` 做白名单，只放行它自己站点的来源；未知来源会直接返回
`500 {"code":"internal_error","m":"Not allowed by CORS"}`。扩展页面发起的请求同样会带上
`Origin: chrome-extension://<扩展 ID>`，因此会被拒绝。

扩展的做法是：用一条 **动态 DNR 规则**，在「本扩展自己发往 API 的请求」上移除
浏览器自动附加的 `Origin` 头，让请求表现得像 `curl` 这样的普通客户端。

- 规则条件带 `initiatorDomains: [扩展 ID]`，**不会**影响站点页面自身的请求，也不影响其它网站。
- CORS 不是鉴权：读接口本来就是公开的，登录后的令牌仍然按标准的 `Authorization: Bearer` 传递；写请求的权限由令牌 / scope 控制。
- 消息已读、收藏 / 取消收藏这类写请求也走这条规则；写权限仍由令牌和 scope 控制，DNR 只处理浏览器的 `Origin` 头。
- 规则在扩展启动 / 安装时安装一次（幂等）。如果安装失败，控制台会有
  `[T2] 跨域请求规则安装失败` 的警告。

扩展的权限：`storage`（保存设置与令牌）、`identity`（OAuth 授权窗口）、
`alarms`（service worker 回收后唤醒并重建消息长连接）、`declarativeNetRequestWithHostAccess`
（上面的请求头规则），host 权限只有服务端域名。头像 CDN 走 `<img>`、文档链接走标签页，
都不需要 host 权限，因此不再申请。

## 数据、缓存与限流

- 列表按页加载（内置榜单沿用各自条数，自定义节点视图每页 50 条）；完整页面每张卡片底部有「加载更多」，翻页结果按 `short_id` / 评论 `id` 去重（接口不承诺不重不漏）。
- 新闻列表的已读记录保存在 `local:t2:read-items`：只存 `topic:<short_id>` / `comment:<id>` 与点击时间，保留最近 30 天、最多 3000 条，不含标题或正文；点开后整行置灰，悬停 / 键盘聚焦时恢复。
- 帖子详情在进入二级页时按需拉取一次，不请求评论、不写入 storage；重新进入或点刷新会重新拉取，收藏状态以服务端返回为准。
- 最新评论是一次快照：`/v1/comments/latest` 的 `page` 实际被忽略（传 `page=2` 仍返回同一批），因此只展示最近 20 条，卡片底部显示「仅展示最近 N 条」而不提供「加载更多」。
- 评论正文按站点约定拼接回复链接：顶层楼层用 `/post/<节点>/<短 id>?commentId=<评论 id>&p=<floor/30 向上取整>`；`floor` 为 null 的嵌套回复改用 `/post-flat/...`，按 `flat_floor` 分页。站点每页 30 条评论，页码只在 >1 时才带上。
- 表情映射来自 `GET /v1/emojis`（匿名请求），缓存在 `local:t2:emojis` 7 天；接口失败时退回旧缓存，没有缓存则保留 `:code:` 原文，不影响列表加载。
- 请求参数优先用文档默认值：有默认值的参数不传（热议与新发表的 `page`、`limit`，24h 的 `period`，工作/生活的 `sort`，搜索的 `page`、`limit`）；`/v1/topics` 的 `page`、`limit` 是必填；首页另外显式传 `parent_slug=All&sort=value`，社区讨论显式传 `node_id`。
- 当前用户资料（含头像）缓存在 `local:t2:profile`：精简快照没带头像时直接复用缓存里的头像，省掉一次公开资料请求；刷新失败时也还能显示上次的头像与昵称。退出登录会清掉缓存。
- 所有开放 API 请求统一经 [`lib/rate-limit.ts`](lib/rate-limit.ts) 排队：最多 4 个并发、相邻请求至少间隔 120ms；遇到 `429` 进入冷却（优先按 `retry_after`），冷却期内不再发请求。
- 公开榜单与最新评论改为匿名读取：令牌桶只有 600 次/小时（≈10 次/分），匿名是 60 次/分，列表也不需要令牌个性化的字段。
- 遇到 `429 rate_limited` 会展示 `retry_after`；`401` 先刷新令牌再重试一次；`403 insufficient_scope` 会引导重新授权。
- 写操作：消息已读（单条 / 批量带 `{ id: [...] }`、全部不带 body，都走 `POST /v1/me/notifications/read`）与帖子收藏（`POST /v1/topics/:short_id/favorite` / `DELETE` 同一路径）；发帖 / 评论等其它写操作仍必须经应用自己的服务端，扩展不提供。

## 项目结构

```
entrypoints/
  background.ts   跨域请求规则 + 消息 SSE 长连接 + 未读角标与页面广播 + 系统桌面通知
  popup/          弹窗页面（Header + 可配置视图 Tab + 单行列表 + 消息预览 + 底部固定 Dock）
  dashboard/      完整页面（可配置卡片看板 + 消息中心）
  options/        独立设置页（同时是扩展的 options_ui）
lib/
  api.ts          信封解析、401 刷新重试、错误类型
  auth.ts         PKCE、授权、刷新（单飞）、退出
  storage.ts      令牌 / 设置 / 节点缓存的 storage 定义
  theme.ts        主题偏好解析、<html> 类名切换、系统深浅色监听
  viewIds.ts      视图 id、默认配置、6 个弹窗 Tab 上限
  me.ts           「我的」5 个内置视图、/v1/me/* 响应归一化与取数
  views.ts        视图解析（名称 / 图标 / 查询）、节点候选列表
  feed.ts         内置榜单与节点视图的取数与归一化、去重
  topics.ts       帖子详情取数、类型标签与收藏 / 取消收藏
  comments.ts     最新评论的取数、帖子 / 回复链接、正文摘要
  emojis.ts       表情短码 → 图片地址（内存 + storage 缓存）
  notifications.ts 未读消息数 / 消息列表 / 单条与全部标记已读
  notification-view.ts 消息 payload → 操作、正文、目标链接与附加信息
  notification-filter.ts 消息分段筛选与 type / unread_only 参数映射
  notification-stream.ts 消息 SSE 长连接（fetch 读流、刷新令牌、退避重连）
  sse.ts          text/event-stream 增量帧解析
  messages.ts     后台 ↔ 页面的消息广播协议
  search.ts       全站搜索的类型、结果归一化与站点链接
  profile.ts      用户资料与头像字段归一化、分层取数（快照 → 缓存 → 公开资料）
  nodes.ts        节点树加载（含子节点并发拉取）、分组与查找
  section.ts      分区的 key、标签、接口参数
  errors.ts       错误 → 用户可读文案
components/       共用组件（视图 Tab / 卡片、节点配置、设置面板、搜索弹窗、列表行、帖子详情、markdown 正文、评论行、消息中心、已读上下文…）
hooks/            useFeed / useNodes / useEmojis / useSearch / useSession / useSettings / useTheme / useUnreadNotifications / useNotifications / useReadItems
lib/*.test.ts     SSE 帧解析、消息字段映射与分段参数映射的单元测试（bun test）
styles/           设计令牌与基础样式
```

## 已知边界

- 登录依赖开发者已经申请并通过审核的 OAuth 应用（`lib/config.ts` 里的 `OAUTH_CLIENT_ID`）；未配置时所有内容仍可匿名浏览，登录按钮禁用。
- 消息角标依赖授权时勾选 `read:me`；应用审核未开通该 scope 时，角标与消息中心会提示重新授权。
- 消息长连接优先由后台 service worker 维持；被浏览器回收后，下一轮 `alarms` 会唤醒它并重建连接（每分钟一次，只是保活、不拉未读数，仍在文档的建连限额内）。后台连续 75 秒没有任何广播时，页面会先问一次状态，确认断开后自己连一条 SSE 兜底。
- 单条 / 批量消息已读与全部已读都走开放 API `POST /v1/me/notifications/read`：带 `{ id: [...] }` 只标记指定通知（单次最多 100 条，空数组会返回 400，扩展不会发送空数组），不带 body 才是全部已读；任一请求失败时消息中心 / 弹窗底部都会提示。其它写操作仍请到站点内处理。
- 系统桌面通知（manifest 的 `notifications` 权限）：SSE 收到的每条 `notification_update` 都会弹一条系统通知（成串到达时 1 秒内合并为一条），正文取自最新一条未读消息；可在设置里关闭。点击通知按消息类型跳转——回复 / 提及直达评论地址，表态打开原文，没有可定位内容则进入消息界面。
- 搜索接口单独限流（匿名 5 次/分、登录 20 次/分），扩展只展示第一页；需要查看更多结果时请到站点内搜索。
- 节点视图依赖 `/v1/nodes`。首次打开会额外请求每个顶层节点的子节点（4 个并发），之后缓存 10 分钟；接口失败时回退旧缓存，缓存里没有的节点会标「未找到」。
- 列表只展示标题与元信息；正文只在弹窗的二级详情页按需拉取并渲染成 React 节点，不会把 HTML 直接注入页面。「最新评论」展示的是评论文本 + 表情图片，同样不解析 HTML。
- 评论永久链接依赖站点的 `?commentId=` 查询参数与每页 30 条的楼层分页；如果站点改版调整了评论分页规则，跳转页码可能需要在 `lib/comments.ts` 的 `SITE_COMMENT_PAGE_SIZE` 同步更新。
