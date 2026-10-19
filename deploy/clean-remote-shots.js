// 一次性清理脚本：删除远端首部署误传的 _shots 截图垃圾文件
// 用法：node deploy/clean-remote-shots.js [--dry-run]
const { Client } = require('ssh2');
const path = require('path');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const dryRun = process.argv.includes('--dry-run');
const conn = new Client();

function exec(cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => out += d).on('close', () => resolve(out.trim()));
      stream.stderr.on('data', () => {});
    });
  });
}

conn.on('ready', async () => {
  try {
    const before = await exec(`find ${config.remoteDir} -name '_shots*' | wc -l`);
    console.log(`删除前 _shots 文件/目录数: ${before}`);
    console.log('样本（前 3 个）:');
    console.log(await exec(`find ${config.remoteDir} -name '_shots*' | head -3`));
    if (dryRun) {
      console.log('[dry-run] 未执行删除');
    } else {
      await exec(`find ${config.remoteDir} -name '_shots*' -exec rm -rf {} +`);
      const after = await exec(`find ${config.remoteDir} -name '_shots*' | wc -l`);
      console.log(`删除后 _shots 数量: ${after}`);
    }
  } catch (e) {
    console.error('失败:', e.message);
    process.exitCode = 1;
  }
  conn.end();
}).on('error', e => {
  console.error('连接失败:', e.message);
  process.exitCode = 1;
}).connect({
  host: config.host,
  port: config.port,
  username: config.username,
  password: config.password,
});
