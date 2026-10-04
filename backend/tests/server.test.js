/**
 * Starts the real server.js process on a free port and calls the health API.
 */
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      })
      .on('error', reject);
  });
}

function startServer(env) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    // Point at an unreachable database so the test never touches a real one.
    env: { ...process.env, DB_HOST: '127.0.0.1', DB_PORT: '1', ...env },
  });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const onData = (chunk) => {
      output += chunk;
      const match = output.match(/on port (\d+)/);
      if (match) resolve(Number(match[1]));
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => reject(new Error(`server exited with code ${code}: ${output}`)));
  });
  return { child, ready, output: () => output };
}

describe('server.js', () => {
  it('starts, logs startup and serves the health API', async () => {
    const server = startServer({ NODE_ENV: 'development', PORT: '0' });
    try {
      const port = await server.ready;
      const res = await get(`http://127.0.0.1:${port}/api/v1/health`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, message: 'API is running', version: 'v1' });
      expect(server.output()).toMatch(/Server running in development mode/);
    } finally {
      server.child.kill();
    }
  }, 20000);

  it('refuses to start in production with an unsafe configuration', async () => {
    const server = startServer({ NODE_ENV: 'production', PORT: '0', CORS_ORIGIN: '*' });
    await expect(server.ready).rejects.toThrow(/exited with code 1[\s\S]*CORS_ORIGIN must not be "\*"/);
  }, 20000);
});
