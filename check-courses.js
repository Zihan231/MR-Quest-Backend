const http = require('http');
const options = { hostname: 'localhost', port: 3000, path: '/courses', method: 'GET' };
http.get(options, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Raw (first 600):', d.substring(0, 600));
  });
}).on('error', e => console.error(e.message));
