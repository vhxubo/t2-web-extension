import { createHash } from 'node:crypto';
import { defineConfig, type UserManifest } from 'wxt';
import {
  AUTHOR,
  FIREFOX_EXTENSION_ID,
  FIREFOX_REDIRECT_HASH,
  FIREFOX_REDIRECT_URI,
} from './lib/config';

/** Firefox 的 author 是「姓名 <邮箱>」字符串，Chromium 系则是 { email } 对象。 */
const AUTHOR_LABEL = `${AUTHOR.name} <${AUTHOR.email}>`;

/**
 * 是否在 Chromium 的 manifest 里写死公钥（`key`），把扩展 ID 钉成固定的。
 *
 * 已开启：ID 恒为 lbjdmldgngjjdpgadblpgneglbmgblfd，与解压目录、机器、版本号、
 * 打包方式（解压加载 / .crx / 商店）都无关。站点里的回调地址只需登记一次：
 * https://lbjdmldgngjjdpgadblpgneglbmgblfd.chromiumapp.org/cb
 *
 * 关掉它会退回「ID 由加载目录的绝对路径推导」，换目录就等于换 ID。
 * 私钥在 .keys/t2-dev.pem（已 gitignore），打 .crx 时必须用它，才能和这里的 ID 对上。
 */
const USE_PINNED_KEY = true;

/**
 * 商店上架包（Chrome Web Store / Edge Add-ons）必须**不带** `key`：
 * Edge 的校验直接报 `The manifest shouldn't contain the key field.`，
 * Chrome 商店也由自己管理条目的公钥。用 `bun run zip:store` 触发，
 * 走 keyless 分支并单独输出到 `.output/store/`，不覆盖本地开发用的包。
 *
 * 代价：商店条目的 ID 由商店生成，不等于 `PINNED_EXTENSION_ID`，
 * 回调地址要按商店给出的 ID 再登记一条，详见 README「商店上架包」。
 */
const STORE_BUILD = process.env.T2_STORE_BUILD === '1';

const PINNED_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtHNZsfczB1eLZDcTlZRCTLBM2WxNAV8mi+odr80YLIb90S4T2gawnZsshXJ0MlUzXm8WU/yMJ5zKiGUvVyyZPGoo6dFaHH5uZx/gfV6iTf0roM7mhOrDejqJgEx3EaSK6MxicZohNgC/y0aVLaiHJy7yrU7l8iMx53/B6dv3MTpOMHz6E6qu6vhjwe+c6L8+y4UP1l5UfGpGynQX+0ynyev11aMFiRtNgIkO53wUarg9bhJsqP2opnyy692eKFVj5Xuw0lKBduqr28mtVB48OENEybKkEf8PlkFmiKQbfXJs8MaL1a8gy/NiuFtRWraisu7PZyAGrjrb4iIqGzwG6wIDAQAB';

/** `PINNED_KEY` 对应的扩展 ID；换密钥时必须同步改这里，以及站点里的回调地址。 */
const PINNED_EXTENSION_ID = 'lbjdmldgngjjdpgadblpgneglbmgblfd';

/**
 * Chrome 的算法：sha256(公钥 DER) 取前 16 字节，每个十六进制位映射成 a–p 的一个字母。
 * 拿它把「文档里写的 ID」和「真正会生效的 ID」绑定，万一换错了钥匙，构建直接失败，
 * 而不是等到登录时才发现回调地址对不上。
 */
function idFromPinnedKey(base64Key: string): string {
  const digest = createHash('sha256').update(Buffer.from(base64Key, 'base64')).digest();
  let id = '';
  for (const byte of digest.subarray(0, 16)) {
    id += String.fromCharCode(97 + (byte >> 4)) + String.fromCharCode(97 + (byte & 0x0f));
  }
  return id;
}

if (USE_PINNED_KEY && idFromPinnedKey(PINNED_KEY) !== PINNED_EXTENSION_ID) {
  throw new Error(
    `[T2] manifest key 与约定的扩展 ID 不一致：算出 ${idFromPinnedKey(PINNED_KEY)}，` +
      `期望 ${PINNED_EXTENSION_ID}。换密钥后必须同步更新 2libra 的回调地址与 README。`,
  );
}

/**
 * Firefox 的 `identity.getRedirectURL('cb')` 由 gecko id 的 SHA-1 推导（见 lib/config.ts）。
 * 这里把「ID」和「站点里登记的回调」也钉死：改了 ID 却忘了改回调，构建直接失败，
 * 而不是等登录时才发现跳到了一个没登记的地址。
 */
function sha1Hex(value: string): string {
  return createHash('sha1').update(value, 'utf8').digest('hex');
}

if (sha1Hex(FIREFOX_EXTENSION_ID) !== FIREFOX_REDIRECT_HASH) {
  throw new Error(
    `[T2] Firefox 附加组件 ID 与登记的回调地址不一致：算出来是 ` +
      `https://${sha1Hex(FIREFOX_EXTENSION_ID)}.extensions.allizom.org/cb，` +
      `期望 ${FIREFOX_REDIRECT_URI}。改 FIREFOX_EXTENSION_ID 后必须同步更新 ` +
      `FIREFOX_REDIRECT_HASH 与 2libra 的 OAuth 回调登记。`,
  );
}

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => {
    const manifest: UserManifest = {
      name: 'T2 Web Extension',
      description:
        '在弹窗与新标签页里浏览帖子：弹窗最多 6 个可配置节点 Tab，仪表盘卡片不限数量；支持显隐、拖动排序，读取全站、父节点或具体节点。',
      permissions: ['storage', 'identity', 'alarms', 'declarativeNetRequestWithHostAccess'],
      minimum_chrome_version: '101',
      host_permissions: ['https://2libra.com/*', 'https://r2.2libra.com/*'],
      action: {
        default_title: 'T2 Web Extension',
        // 显式声明工具栏图标，未读数角标会画在它的右下角。
        default_icon: {
          16: 'icon/16.png',
          32: 'icon/32.png',
          48: 'icon/48.png',
          96: 'icon/96.png',
          128: 'icon/128.png',
        },
      },
    };

    if (browser === 'firefox') {
      // Firefox 用字符串 author 署名，并补充 developer 字段（AMO 会展示）。
      return {
        ...manifest,
        author: AUTHOR_LABEL,
        developer: { name: AUTHOR.name },
        browser_specific_settings: {
          gecko: {
            id: FIREFOX_EXTENSION_ID,
            // AMO 要求新扩展显式声明数据收集情况；本扩展只读浏览，不上报任何数据。
            data_collection_permissions: { required: ['none'] },
          },
        },
      } as unknown as UserManifest;
    }

    // Chromium 系（Chrome / Edge 等）：author 已被官方标记为废弃，保留以兼容旧版。
    const chromium = {
      ...manifest,
      author: { email: AUTHOR.email },
      // 商店上架包不能带 key，否则 Edge 校验直接失败；本地/自托管包才写死 ID。
      ...(USE_PINNED_KEY && !STORE_BUILD ? { key: PINNED_KEY } : {}),
    } as unknown as UserManifest;
    return chromium;
  },
  // 商店包单独放一个目录，避免和本地开发包互相覆盖、混淆上传对象。
  ...(STORE_BUILD
    ? {
        outDir: '.output/store',
        zip: {
          artifactTemplate: '{{name}}-{{packageVersion}}-{{browser}}-store{{modeSuffix}}.zip',
        },
      }
    : {}),
});
