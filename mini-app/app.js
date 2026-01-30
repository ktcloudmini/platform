const express = require('express');
const app = express();
const port = 8080;

app.get('/', (req, res) => {
  res.send('<h1>Success! Dockerized and Auto Mini Web Server V2 is Running!</h1>');
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
