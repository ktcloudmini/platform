const express = require('express');
const os = require('os'); // 호스트명 가져오려고 추가함
const app = express();
const port = 8080;

// 1. 기본 경로: 인스턴스 ID(호스트명) 출력
app.get('/', (req, res) => {
  res.send(`<h1>Instance ID/Hostname: ${os.hostname()}</h1>`);
});

// 2. 헬스체크: 서버 상태 확인용
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// 3. 부하 유도: CPU 점유율을 5초 동안 강제로 높임
app.get('/work', (req, res) => {
  const start = Date.now();
  // 5초 동안 무의미한 연산 반복해서 CPU 갈구기
  while (Date.now() - start < 5000) {
    Math.random() * Math.random();
  }
  res.send('CPU Load Simulation Done');
});

// 4. 프로세스 강제 종료: 호출 즉시 서버 꺼짐
app.get('/kill', (req, res) => {
  res.send('Server process is being killed...');
  setTimeout(() => {
    process.exit(1); // 1초 뒤에 프로세스 강제 종료
  }, 1000);
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
