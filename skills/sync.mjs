#!/usr/bin/env node
/**
 * skills/<name> → .trae/skills/<name> 同步器
 *
 * 为什么需要：skills/ 是可移植真源，.trae/skills/ 是 Trae 自动发现的副本。
 * 两份内容必须一致，本脚本负责复制与校验，避免手改一处后长期漂移。
 *
 * 用法：
 *   node skills/sync.mjs                # 同步全部 skill
 *   node skills/sync.mjs hotspot-intel  # 只同步指定 skill
 *   node skills/sync.mjs --check        # 只比对，不一致时退出码 1
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..');
const SOURCE_ROOT = HERE;
const TARGET_ROOT = path.join(PROJECT_ROOT, '.trae', 'skills');

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const names = argv.filter((item) => !item.startsWith('--'));

const listSkills = () =>
  readdirSync(SOURCE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(path.join(SOURCE_ROOT, name, 'SKILL.md')));

const walk = (dir, base = dir) => {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, base));
    else files.push(path.relative(base, full));
  }
  return files.sort();
};

const skills = names.length ? names : listSkills();
if (!skills.length) {
  console.error('没有找到任何 skill（需要包含 SKILL.md）');
  process.exit(1);
}

let drifted = 0;

for (const name of skills) {
  const source = path.join(SOURCE_ROOT, name);
  const target = path.join(TARGET_ROOT, name);
  if (!existsSync(source)) {
    console.error(`✗ 源目录不存在：${path.relative(PROJECT_ROOT, source)}`);
    drifted += 1;
    continue;
  }

  const files = walk(source);
  const targetFiles = existsSync(target) ? walk(target) : [];

  const missing = files.filter((file) => !targetFiles.includes(file));
  const extra = targetFiles.filter((file) => !files.includes(file));
  const changed = files.filter((file) => {
    if (missing.includes(file)) return false;
    const a = readFileSync(path.join(source, file));
    const b = readFileSync(path.join(target, file));
    return !a.equals(b);
  });

  if (checkOnly) {
    if (missing.length || extra.length || changed.length) {
      drifted += 1;
      console.log(`✗ ${name} 未同步`);
      for (const file of missing) console.log(`   缺少：${file}`);
      for (const file of extra) console.log(`   多余：${file}`);
      for (const file of changed) console.log(`   有差异：${file}`);
    } else {
      console.log(`✓ ${name} 一致（${files.length} 个文件）`);
    }
    continue;
  }

  mkdirSync(target, { recursive: true });
  for (const file of extra) rmSync(path.join(target, file), { force: true });
  for (const file of files) {
    const destination = path.join(target, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(source, file), destination);
  }
  console.log(
    `✓ ${name} 已同步（${files.length} 个文件${changed.length ? `，更新 ${changed.length}` : ''}${missing.length ? `，新增 ${missing.length}` : ''}${extra.length ? `，删除 ${extra.length}` : ''}）`,
  );
}

if (checkOnly && drifted) {
  console.error(`\n有 ${drifted} 个 skill 未同步，执行 node skills/sync.mjs 修复。`);
  process.exit(1);
}

console.log(`\n目标目录：${path.relative(PROJECT_ROOT, TARGET_ROOT)}`);
