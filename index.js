#!/usr/bin/env node
const fs = require('fs');
const CONFIG_PATH = '/Users/hal/projects/clashrules/config.yaml'
const GITHUB_TOKEN = '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'
const GIST_ID = '493b1e462e2944922f85f74f8a1028e2'

const urls = process.argv.slice(2)

if (urls.length!==0) {
  updateRulesAndAppendToLocal(urls)
} else {
  fetchRulesAndAppendToLocal()
}

async function fetchRules () {
  const { files } = await fetch(`https://api.github.com/gists/${GIST_ID}`)
    .then(res => res.json())
  return files['clashrules.yaml'].content
}

function appendRulesToLocal (rules) {
  fs.readFile(CONFIG_PATH, 'utf8', (err, data) => {
    if (err) throw err;

    let modifiedContent
    const contents = data.split('# custom');
    if (contents.length!==3) {
      const lines = data.split('\n');
      lines.splice(-2, 0, `# custom\n${rules}\n# custom`);
  
      modifiedContent = lines.join('\n');
    } else {
      modifiedContent = contents[0]+`# custom\n${rules}\n# custom`+contents[2]
    }
    fs.writeFile(CONFIG_PATH, modifiedContent, 'utf8', (err) => {
      if (err) throw err;
      console.log('Content added successfully!');
    });
  });
}

async function fetchRulesAndAppendToLocal () {
  const rules = await fetchRules()
  console.log(rules)
  appendRulesToLocal(rules)
}

async function updateRulesAndAppendToLocal (urls) {
  const rules = await fetchRules()
  const appendedRules = urls.map(url => `- DOMAIN-SUFFIX,${url},Proxy`).join('\n')
  const newRules = rules+'\n'+appendedRules
  console.log(newRules)
  await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: {
        'clashrules.yaml': {
          content: newRules
        },
      },
    }),
  })
  appendRulesToLocal(newRules)
}
