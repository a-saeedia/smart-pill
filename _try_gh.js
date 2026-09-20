const { execSync } = require('child_process');

async function main() {
  // Try npx gh
  try {
    const r = execSync('"C:/Users/User/tools/node/npx" gh repo edit --visibility public a-saeedia/smart-pill', {
      shell: 'cmd.exe',
      timeout: 20000,
      encoding: 'utf8'
    });
    console.log('SUCCESS via npx gh:', r);
    return;
  } catch (e) {
    console.log('npx gh failed:', e.message.substring(0, 300));
  }

  // Try direct API call via Node.js https
  try {
    const https = require('https');
    const data = JSON.stringify({ private: false });
    const req = https.request({
      hostname: 'api.github.com',
      path: '/repos/a-saeedia/smart-pill',
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'User-Agent': 'smart-pill-agent'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('API Status:', res.statusCode);
        console.log('API Body:', body.substring(0, 500));
      });
    });
    req.on('error', (e) => console.log('API error:', e.message));
    req.write(data);
    req.end();
  } catch (e) {
    console.log('API call failed:', e.message);
  }
}

main();
