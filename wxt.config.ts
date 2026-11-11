import { createHash } from 'node:crypto';
import { defineConfig, type UserManifest } from 'wxt';
import { AUTHOR } from './lib/config';

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

/** Firefox 的附加组件 ID，正式签名后保持不变；临时载入也建议用同一个值。 */
const FIREFOX_EXTENSION_ID = 't2-web-extension@vhxubo.dev';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => {
    const manifest: UserManifest = {
      name: 'T2 Web Extension',
      description:
        '在弹窗与新标签页里浏览帖子榜单：四列看板展示首页、今日热议、近期热议，生活与工作维度同列上下分割，可设置默认榜单。',
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
    return {
      ...manifest,
      ...(USE_PINNED_KEY ? { key: PINNED_KEY } : {}),
      author: { email: AUTHOR.email },
    } as unknown as UserManifest;
  },
});
