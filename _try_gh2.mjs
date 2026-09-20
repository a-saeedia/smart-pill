import { execSync } from 'child_process';

async function main() {
  // Try npx gh without shell specification
  try {
    const r = execSync('"C:/Users/User/tools/node/npx" gh repo edit --visibility public a-saeedia/smart-pill', {
      timeout: 20000,
      encoding: 'utf8'
    });
    console.log('SUCCESS via npx gh:', r);
    return;
  } catch (e) {
    console.log('npx gh failed:', e.message.substring(0, 500));
  }

  // Try installing gh via npm
  try {
    const r = execSync('"C:/Users/User/tools/node/npm" install -g gh-cli', {
      timeout: 30000,
      encoding: 'utf8'
    });
    console.log('npm gh-cli installed:', r);
  } catch (e) {
    console.log('npm gh-cli failed:', e.message.substring(0, 300));
  }
}

main();
