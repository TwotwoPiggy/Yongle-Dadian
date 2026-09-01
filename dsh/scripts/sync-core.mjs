/**
 * sync-core.mjs — 将永乐大典核心引擎同步进 dsh 组合包(lib/),实现自包含分发
 * 源(权威): 仓库 scripts/core/*.js + scripts/{yongle-config,yongle-embed,yongle-agent-api,yongle-request}.js
 * 目标:     dsh/lib/core/*.js + dsh/lib/yongle-*.js
 * 用途:     pnpm pack / npm publish / git 安装(prepare)前运行,保证包内引擎与仓库一致
 *
 * 运行: node dsh/scripts/sync-core.mjs
 */
import { cpSync, mkdirSync, readdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dshDir = join(repoRoot, 'dsh');
const srcCore = join(repoRoot, 'scripts', 'core');
const srcScripts = join(repoRoot, 'scripts');
const libCore = join(dshDir, 'lib', 'core');
const libRoot = join(dshDir, 'lib');

// lib/ 明确为 CommonJS:外层 dsh/package.json 是 type:module,必须用嵌套 package.json 隔离
writeFileSync(join(libRoot, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');

const CORE_FILES = readdirSync(srcCore).filter((f) => f.endsWith('.js'));
const EXTRA_FILES = ['yongle-config.js', 'yongle-embed.js', 'yongle-agent-api.js', 'yongle-request.js'];

mkdirSync(libCore, { recursive: true });
let copied = 0;
for (const f of CORE_FILES) {
  cpSync(join(srcCore, f), join(libCore, f));
  copied++;
}
for (const f of EXTRA_FILES) {
  const src = join(srcScripts, f);
  if (!existsSync(src)) throw new Error(`missing source file: ${src}`);
  cpSync(src, join(libRoot, f));
  copied++;
}

// 自检:相对 require 只允许 lib/core 内部(./)或 lib/ 同级(../yongle-*)
// 裸包名与 Node 内置模块由 node_modules 解析,不检查
let bad = 0;
for (const f of readdirSync(libCore).filter((x) => x.endsWith('.js'))) {
  const content = readFileSync(join(libCore, f), 'utf8');
  for (const m of content.matchAll(/require\((['"])([^'"]+)\1\)/g)) {
    const spec = m[2];
    if (!spec.startsWith('.')) continue; // 裸包名 / 内置模块
    if (spec.startsWith('./') || spec.startsWith('../yongle-')) continue;
    console.error(`[sync-core] ${f}: unresolvable relative require "${spec}"`);
    bad++;
  }
}
if (bad > 0) throw new Error(`sync-core self-check failed with ${bad} bad requires`);

console.log(`[sync-core] synced ${copied} files to dsh/lib (core: ${CORE_FILES.length}, extra: ${EXTRA_FILES.length})`);
