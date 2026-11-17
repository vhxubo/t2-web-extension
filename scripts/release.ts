/**
 * 一键打出所有「最终上架文件」到 releases/。
 *
 * 用法：bun run release
 *
 * releases/ 里的每个 zip 都是对应商店直接上传的产物，不夹带中间构建目录：
 *   t2-chrome-store-<version>.zip  → Chrome Web Store / Edge Add-ons（keyless，无 manifest.key）
 *   t2-firefox-<version>.zip       → Firefox Add-ons（AMO）
 *   t2-sources-<version>.zip       → AMO 要求的源码包
 *
 * 中间产物仍留在 .output/，由 .gitignore 排除；releases/ 每次运行前会被清空，
 * 所以这个文件夹里的内容永远等于「当前版本要上传的东西」。
 */
import { spawn } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outputRoot = path.join(root, '.output');
const releasesDir = path.join(root, 'releases');

/** WXT 把 zip 放在 .output 及其子目录（商店包在 .output/store），递归找出来。 */
async function listZips(dir: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await listZips(full)));
    else if (entry.name.endsWith('.zip')) found.push(full);
  }
  return found;
}

function pick(
  files: string[],
  test: (name: string) => boolean,
  label: string,
): string {
  const matches = files.filter((f) => test(path.basename(f)));
  if (matches.length !== 1) {
    throw new Error(
      `[release] 期望找到 1 个${label}，实际 ${matches.length} 个：\n  ` +
        (matches.join('\n  ') || '(无)'),
    );
  }
  return matches[0]!;
}

function run(args: string[], env: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('bunx', args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`[release] 命令失败（退出码 ${code}）：bunx ${args.join(' ')}`));
    });
  });
}

const { version } = JSON.parse(
  await readFile(path.join(root, 'package.json'), 'utf8'),
) as { version: string };

console.log(`\n[T2] 构建上架包 v${version} → releases/\n`);

await rm(releasesDir, { recursive: true, force: true });
await mkdir(releasesDir, { recursive: true });

// 1) Chrome Web Store / Edge Add-ons：必须 keyless
await run(['wxt', 'zip', '-b', 'chrome'], { T2_STORE_BUILD: '1' });

// 2) Firefox AMO：普通包 + 源码包
await run(['wxt', 'zip', '-b', 'firefox']);

const zips = await listZips(outputRoot);
const v = `-${version}`;

const artifacts: Array<[string, string]> = [
  [
    pick(
      zips,
      (n) => n.includes(v) && n.includes('-chrome-store') && n.endsWith('.zip'),
      'Chrome/Edge 商店包',
    ),
    `t2-chrome-store-${version}.zip`,
  ],
  [
    pick(
      zips,
      (n) =>
        n.includes(v) &&
        n.includes('-firefox') &&
        !n.includes('-sources') &&
        n.endsWith('.zip'),
      'Firefox 附加组件包',
    ),
    `t2-firefox-${version}.zip`,
  ],
  [
    pick(
      zips,
      (n) => n.includes(v) && n.includes('-sources') && n.endsWith('.zip'),
      'Firefox 源码包',
    ),
    `t2-sources-${version}.zip`,
  ],
];

for (const [src, name] of artifacts) {
  await copyFile(src, path.join(releasesDir, name));
  console.log(`  ✓ ${name}`);
}

console.log(
  `\n[T2] 完成：releases/ 里的 ${artifacts.length} 个 zip 即为最终上传文件。\n`,
);
