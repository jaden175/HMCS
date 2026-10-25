#!/usr/bin/env node
// 用 app-builder-lib 自己的翻译逻辑重建 0-messages.nsh / 1-messages.nsh，
// 以便在 makensis 崩溃后手工复现 pass-2 编译。
const path = require('path');
const fs = require('fs');
const yaml = require(path.join(__dirname, '..', 'node_modules', 'js-yaml'));
const { LangConfigurator, computeCustomMessageTranslations } = require(path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'out', 'targets', 'nsis', 'nsisLang.js'));
const { nsisTemplatesDir } = require(path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'out', 'targets', 'nsis', 'nsisUtil.js'));

const outDir = process.argv[2];
if (!outDir || !nsisTemplatesDir) { console.error('usage: node rebuild-messages.js <outdir>'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const langConfigurator = new LangConfigurator({});
// 保持与默认构建一致：非多语言安装器（unicode 默认 true，multiLanguageInstaller 默认 true？）
// LangConfigurator 默认行为与 electron-builder 默认选项一致即可
for (const [idx, name] of [['0', 'messages.yml'], ['1', 'assistedMessages.yml']]) {
  const data = yaml.load(fs.readFileSync(path.join(nsisTemplatesDir, name), 'utf8'));
  const instructions = computeCustomMessageTranslations(data, langConfigurator).join('\n');
  fs.writeFileSync(path.join(outDir, `${idx}-messages.nsh`), instructions + '\n');
  console.log(`${idx}-messages.nsh: ${instructions.split('\n').length} strings`);
}
