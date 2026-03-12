#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yaml = require('js-yaml');

const CUSTOM_YAML_PATH = path.join(__dirname, 'custom.yaml');

// 获取命令行参数
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('请提供要添加的域名后缀，例如: pe example.com');
  process.exit(0);
}

// 格式化日期为 YYYY-MM-DD HH:mm:ss
function formatDate(date) {
  const pad = n => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function main() {
  // 1. 读取 custom.yaml
  let fileContent;
  try {
    fileContent = fs.readFileSync(CUSTOM_YAML_PATH, 'utf8');
  } catch (err) {
    console.error(`无法读取文件 ${CUSTOM_YAML_PATH}: ${err.message}`);
    process.exit(1);
  }

  // 2. 分离头部注释和 payload 内容
  // 假设 payload 以 "payload:" 开头
  const splitRegex = /^(payload:)/m;
  const match = fileContent.match(splitRegex);

  if (!match) {
    console.error('无法在 custom.yaml 中找到 payload 字段');
    process.exit(1);
  }

  const headerPart = fileContent.substring(0, match.index);
  const payloadPart = fileContent.substring(match.index);

  let doc;
  try {
    doc = yaml.load(payloadPart);
  } catch (err) {
    console.error('无法解析 YAML payload:', err.message);
    process.exit(1);
  }

  if (!doc.payload) {
    doc.payload = [];
  }

  // 3. 添加新的域名规则
  const newRules = args.map(domain => `DOMAIN-SUFFIX,${domain}`);
  const existingRules = new Set(doc.payload);
  let addedCount = 0;

  newRules.forEach(rule => {
    if (!existingRules.has(rule)) {
      doc.payload.push(rule);
      addedCount++;
    }
  });

  if (addedCount === 0) {
    console.log('未添加任何新规则 (可能已存在)。');
  } else {
    console.log(`添加了 ${addedCount} 条新规则。`);
  }

  // 4. 更新头部统计信息
  const rules = doc.payload;
  const stats = {
    domain: rules.filter(r => r.startsWith('DOMAIN,')).length,
    domainKeyword: rules.filter(r => r.startsWith('DOMAIN-KEYWORD,')).length,
    domainSuffix: rules.filter(r => r.startsWith('DOMAIN-SUFFIX,')).length,
    total: rules.length
  };

  let newHeader = headerPart;
  
  const updateStat = (key, value) => {
    const regex = new RegExp(`^# ${key}:.*`, 'm');
    if (regex.test(newHeader)) {
      newHeader = newHeader.replace(regex, `# ${key}: ${value}`);
    }
  };

  updateStat('UPDATED', formatDate(new Date()));
  updateStat('DOMAIN', stats.domain);
  updateStat('DOMAIN-KEYWORD', stats.domainKeyword);
  updateStat('DOMAIN-SUFFIX', stats.domainSuffix);
  updateStat('TOTAL', stats.total);

  // 5. 写入文件
  // 使用 lineWidth: -1 防止长行被自动换行
  const newPayloadYaml = yaml.dump(doc, { lineWidth: -1 });
  const newContent = newHeader + newPayloadYaml;

  fs.writeFileSync(CUSTOM_YAML_PATH, newContent, 'utf8');
  console.log('custom.yaml 已更新。');

  // 6. 提交到 Git
  try {
    console.log('正在提交并推送更新...');
    // 添加文件
    execSync(`git add ${CUSTOM_YAML_PATH}`, { stdio: 'inherit' });
    // 提交更改
    execSync('git commit -m "feat: update custom rules via script"', { stdio: 'inherit' });
    // 推送到远程
    execSync('git push', { stdio: 'inherit' });
    console.log('成功推送到远程仓库。');
  } catch (err) {
    console.error('Git 操作失败:', err.message);
    process.exit(1);
  }
}

main();