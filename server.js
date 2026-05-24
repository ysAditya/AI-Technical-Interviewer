#!/usr/bin/env node
/**
 * Alex — AI Technical Interviewer · Local Server
 *
 * Usage:
 *   node server.js YOUR_ANTHROPIC_API_KEY [model] [port]
 *
 * Models (optional, default: claude-sonnet-4-6):
 *   claude-opus-4-6         → most capable, slower
 *   claude-sonnet-4-6       → fast + smart (recommended)
 *   claude-haiku-4-5-20251001 → fastest, cheapest
 *
 * Examples:
 *   node server.js sk-ant-xxxx
 *   node server.js sk-ant-xxxx claude-opus-4-6
 *   node server.js sk-ant-xxxx claude-sonnet-4-6 8080
 */

'use strict';

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Args ─────────────────────────────────────────────────────
const API_KEY = process.argv[2];
const MODEL   = process.argv[3] || 'claude-sonnet-4-6';
const PORT    = parseInt(process.argv[4], 10) || 3000;

if (!API_KEY || API_KEY.startsWith('--')) {
  console.log(`
╔══════════════════════════════════════════════════════╗
║       Alex — AI Technical Interviewer                ║
╚══════════════════════════════════════════════════════╝

  Usage:  node server.js YOUR_ANTHROPIC_API_KEY [model] [port]

  Models:
    claude-sonnet-4-6         (default — fast & smart)
    claude-opus-4-6           (most capable)
    claude-haiku-4-5-20251001 (fastest, cheapest)

  Example:
    node server.js sk-ant-api03-xxx
    node server.js sk-ant-xxx claude-opus-4-6 8080
`);
  process.exit(1);
}

const HTML_PATH = path.join(__dirname, 'alex-interviewer.html');

// ── Helpers ───────────────────────────────────────────────────
function jsonResp(res, statusCode, obj) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function withBody(req, cb) {
  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', () => {
    try { cb(JSON.parse(body)); }
    catch (e) { cb(null, e); }
  });
}

// ── Server ────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // CORS — allow all origins (localhost only anyway)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const pathname = req.url.split('?')[0];

  // ── GET / → serve HTML ───────────────────────────────────
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    try {
      const html = fs.readFileSync(HTML_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(
        'Could not find alex-interviewer.html\n' +
        'Make sure server.js and alex-interviewer.html are in the same folder.\n' +
        'Looked at: ' + HTML_PATH
      );
    }
    return;
  }

  // ── GET /api/ping → health check (HTML uses this to detect server mode) ──
  if (req.method === 'GET' && pathname === '/api/ping') {
    jsonResp(res, 200, { ok: true, model: MODEL });
    return;
  }

  // ── POST /api/chat → proxy to Anthropic ─────────────────
  if (req.method === 'POST' && pathname === '/api/chat') {
    withBody(req, (data, parseErr) => {
      if (parseErr || !data) {
        jsonResp(res, 400, { error: { message: 'Invalid JSON body' } });
        return;
      }

      const payload = JSON.stringify({
        model:      data.model || MODEL,
        system:     data.system     || '',
        messages:   data.messages   || [],
        max_tokens: data.max_tokens || 600
      });

      const options = {
        hostname: 'api.anthropic.com',
        path:     '/v1/messages',
        method:   'POST',
        headers: {
          'x-api-key':         API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
          'content-length':    Buffer.byteLength(payload)
        }
      };

      const apiReq = https.request(options, apiRes => {
        let result = '';
        apiRes.on('data', c => (result += c));
        apiRes.on('end', () => {
          res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(result);
        });
      });

      apiReq.on('error', e => {
        console.error('[proxy error]', e.message);
        jsonResp(res, 502, { error: { message: 'Upstream error: ' + e.message } });
      });

      apiReq.write(payload);
      apiReq.end();
    });
    return;
  }

  // ── 404 ─────────────────────────────────────────────────
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found: ' + req.url);
});

server.listen(PORT, '127.0.0.1', () => {
  const line = '═'.repeat(54);
  console.log(`
╔${line}╗
║       🎙️  Alex — AI Technical Interviewer              ║
╠${line}╣
║  Model  : ${MODEL.padEnd(42)} ║
║  Key    : ${(API_KEY.slice(0, 20) + '…').padEnd(42)} ║
║  URL    : http://localhost:${String(PORT).padEnd(25)}       ║
╚${line}╝

  ➜  Open this in Chrome or Edge:
     http://localhost:${PORT}

  Press Ctrl+C to stop.
`);
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n❌  Port ${PORT} is already in use. Try a different port:\n   node server.js YOUR_KEY ${MODEL} ${PORT + 1}\n`);
  } else {
    console.error('\n❌  Server error:', e.message);
  }
  process.exit(1);
});
