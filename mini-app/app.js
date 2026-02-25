const express = require('express');
const os = require('os');
const { spawn } = require('child_process');
const client = require('prom-client'); //  추가: Prometheus metrics

const app = express();
const port = 8080;

let isAlive = true;

//  추가: 기본 시스템/프로세스 메트릭 수집
client.collectDefaultMetrics();

//  추가: HTTP 요청 수 / 지연시간 메트릭
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
});

//  추가: 라우트 라벨 안정적으로 잡기(라우터 밖에서도 req.path 사용)
app.use((req, res, next) => {
  res.locals.routePath = req.path;
  next();
});

//  추가: 모든 요청에 대해 Counter/Histogram 기록
app.use((req, res, next) => {
  const end = httpRequestDurationSeconds.startTimer();
  res.on('finish', () => {
    const route = req.route?.path ?? res.locals.routePath ?? 'other';
    const labels = { method: req.method, route, status: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    end(labels);
  });
  next();
});

app.get('/', (req, res) => {
  if (!isAlive) {
    return res
      .status(500)
      .send(`<h1>CRITICAL ERROR: Service on ${os.hostname()} is BROKEN!</h1>`);
  }
  // 현실적인 load test 위한 연산 추가
  let dummy = 0;
  for (let i = 0; i < 100000; i++) {
    dummy += Math.random();
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
  const child = spawn(process.execPath, ['-e', code], {
    detached: true,
    stdio: 'ignore',
  });
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

//  추가: Prometheus가 긁어갈 엔드포인트 (/metrics)
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', client.register.contentType);
    res.end(await client.register.metrics());
  } catch (err) {
    res.status(500).end(err?.message ?? 'metrics error');
  }
});

// (선택) 강제로 500 발생시키는 라우트(5xx 테스트용)
app.get('/fail', (req, res) => {
  res.status(500).send('forced 500');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`App listening at http://0.0.0.0:${port}`);
});
