#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yaml = require('js-yaml');

const CUSTOM_YAML_PATH = path.join(__dirname, 'custom.yaml');

// 格式化日期为 YYYY-MM-DD HH:mm:ss
function formatDate(date) {
  const pad = n => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// 解析参数，支持空格和逗号分隔
function parseDomains(args) {
  return args.flatMap(arg => arg.split(',')).filter(Boolean);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('用法:');
    console.log('  添加域名: pe [add] domain1.com,domain2.com');
    console.log('  移除域名: pe remove/rm domain1.com,domain2.com');
    process.exit(0);
  }

  let command = 'add';
  let domainArgs = args;

  if (args[0] === 'remove' || args[0] === 'rm') {
    command = 'remove';
    domainArgs = args.slice(1);
  } else if (args[0] === 'add') {
    command = 'add';
    domainArgs = args.slice(1);
  }

  const targetDomains = parseDomains(domainArgs);

  if (targetDomains.length === 0) {
    console.log('请指定域名后缀。');
    process.exit(1);
  }

  // 1. 读取 custom.yaml
  let fileContent;
  try {
    fileContent = fs.readFileSync(CUSTOM_YAML_PATH, 'utf8');
  } catch (err) {
    console.error(`无法读取文件 ${CUSTOM_YAML_PATH}: ${err.message}`);
    process.exit(1);
  }

  // 2. 分离头部注释和 payload 内容
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

  // 3. 执行添加或移除操作
  let changedCount = 0;
  const targetRules = targetDomains.map(d => `DOMAIN-SUFFIX,${d}`);

  if (command === 'add') {
    const existingRules = new Set(doc.payload);
    targetRules.forEach(rule => {
      if (!existingRules.has(rule)) {
        doc.payload.push(rule);
        changedCount++;
        console.log(`+ 添加: ${rule}`);
      } else {
        console.log(`= 跳过 (已存在): ${rule}`);
      }
    });
  } else if (command === 'remove') {
    const originalLength = doc.payload.length;
    const targetsToRemove = new Set(targetRules);
    
    doc.payload = doc.payload.filter(rule => {
      if (targetsToRemove.has(rule)) {
        console.log(`- 移除: ${rule}`);
        return false;
      }
      return true;
    });
    
    changedCount = originalLength - doc.payload.length;
  }

  if (changedCount === 0) {
    console.log('未发生任何变更。');
    return;
  }

  console.log(`总计变更: ${changedCount} 条规则。`);

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
  const newPayloadYaml = yaml.dump(doc, { lineWidth: -1 });
  const newContent = newHeader + newPayloadYaml;

  fs.writeFileSync(CUSTOM_YAML_PATH, newContent, 'utf8');
  console.log('custom.yaml 已更新。');

  // 6. 提交到 Git
  try {
    console.log('正在提交并推送更新...');
    execSync(`git add ${CUSTOM_YAML_PATH}`, { stdio: 'inherit' });
    
    const commitMsg = command === 'add' 
      ? `feat: add ${changedCount} rules via script` 
      : `chore: remove ${changedCount} rules via script`;
      
    execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });
    execSync('git push', { stdio: 'inherit' });
    console.log('成功推送到远程仓库。');
  } catch (err) {
    console.error('Git 操作失败:', err.message);
    process.exit(1);
  }
}

main();