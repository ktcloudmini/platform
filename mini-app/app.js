const express = require('express');
const os = require('os');
const { spawn } = require('child_process');

const app = express();
const port = 8080;

let isAlive = true;

app.get('/', (req, res) => {
  if (!isAlive) {
    return res.status(500).send(`<h1>CRITICAL ERROR: Service on ${os.hostname()} is BROKEN!</h1>`);
  }
  res.send(`<h1>Instance ID/Hostname: ${os.hostname()}</h1>`);
});

app.get('/health', (req, res) => {
  if (!isAlive) return res.status(500).send('Unhealthy (Zombie Mode)');
  res.status(200).send('OK');
});

function spawnCpuBurn(sec) {
  const s = Math.max(1, Math.min(sec, 300));
  const code = `
    const end = Date.now() + ${s} * 1000;
    while (Date.now() < end) { Math.sqrt(Math.random()); }
  `;
  const child = spawn(process.execPath, ['-e', code], { detached: true, stdio: 'ignore' });
  child.unref();
}

app.get('/work', (req, res) => {
  const sec = parseInt(req.query.sec ?? '5', 10) || 5;
  spawnCpuBurn(sec);
  res.send(`CPU Load Simulation Started for ${sec}s`);
});

app.get('/kill', (req, res) => {
  isAlive = false;
  res.send('Instance entering ZOMBIE mode...');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`App listening at http://0.0.0.0:${port}`);
});
