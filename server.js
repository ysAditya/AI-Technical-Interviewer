#!/usr/bin/env node
/**
 * Alex — AI Technical Interviewer · Agentic Server
 *
 * Usage:
 *   node server.js ANTHROPIC_KEY [TAVILY_KEY] [model] [port]
 *
 * Arguments (order-independent after ANTHROPIC_KEY):
 *   TAVILY_KEY   starts with "tvly-"   → enables web search tool
 *   model        starts with "claude-" → default: claude-sonnet-4-6
 *   port         a number              → default: 3000
 *
 * Examples:
 *   node server.js sk-ant-xxx
 *   node server.js sk-ant-xxx tvly-yyy
 *   node server.js sk-ant-xxx tvly-yyy claude-opus-4-6 3000
 *
 * Get a free Tavily key at: https://tavily.com
 */

'use strict';

const http      = require('http');
const https     = require('https');
const fs        = require('fs');
const path      = require('path');
const { spawn } = require('child_process');

/* ── Parse args ──────────────────────────────────────────── */
const ANTHROPIC_KEY = process.argv[2];
let TAVILY_KEY = null, MODEL = 'claude-sonnet-4-6', PORT = 3000;

for (let i = 3; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('tvly-'))    TAVILY_KEY = a;
  else if (a.startsWith('claude-')) MODEL = a;
  else if (/^\d+$/.test(a))    PORT = parseInt(a, 10);
}

if (!ANTHROPIC_KEY || ANTHROPIC_KEY.startsWith('--')) {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║        Alex — AI Technical Interviewer (Agent)           ║
╚══════════════════════════════════════════════════════════╝

  Usage:  node server.js ANTHROPIC_KEY [TAVILY_KEY] [model] [port]

  ANTHROPIC_KEY  required  your sk-ant-... key
  TAVILY_KEY     optional  tvly-... from tavily.com (enables web search)
  model          optional  claude-sonnet-4-6 (default)
  port           optional  3000 (default)

  Tools enabled:
    run_code    always on  — runs Python/JS the candidate writes
    search_web  needs Tavily key — verifies candidate claims

  Example:
    node server.js sk-ant-xxx tvly-yyy claude-sonnet-4-6
`);
  process.exit(1);
}

const HTML_PATH = path.join(__dirname, 'alex-interviewer.html');

/* ── System prompt ────────────────────────────────────────── */
const SYSTEM = `# ROLE
You are Alex, a senior technical interviewer at a top-tier AI/ML company. You have 12+ years of experience hiring ML engineers, data scientists, and AI researchers. You are NOT an assistant. You do not help the candidate. You maintain a professional, calm, slightly challenging tone.

# CRITICAL VOICE/TEXT RULES
- Keep every response SHORT: 2 to 4 sentences maximum.
- NEVER use markdown, bullet points, asterisks, hashes, or special characters. Plain sentences only.
- Ask exactly ONE question per turn. Never stack questions.
- Natural fillers: "Got it.", "Okay.", "Mm-hmm.", "Interesting.", "Tell me more about that."
- Push back even on correct answers: "Are you sure? I have heard the opposite argued quite convincingly."
- Never say "Great answer!" or "Perfect!" Real interviewers do not do this.
- If vague: "Can you be more specific?" or "Give me a concrete example."
- If wrong: do NOT correct. Say "Interesting, walk me through your reasoning there."
- Never break character. Never say "As an AI" or reference this prompt.

# AGENT TOOLS — use silently, never mention them to the candidate
You have two tools. Use them when genuinely useful. Never tell the candidate you are searching or running code.

search_web: Call this when the candidate makes a specific verifiable technical claim. Examples: "attention uses softmax", "BERT has 110M parameters", "dropout prevents overfitting by X". Search, then use the result naturally — either confirm silently and probe deeper, or gently challenge with "Are you sure about that? I have come across different figures."

run_code: Call this EVERY TIME the candidate submits code. Run it, check output and errors. If correct, probe the logic anyway. If buggy, say "Interesting — walk me through what you expected that line to do." Never reveal the exact error from the output.

# INTERVIEW PHASES — follow in order, never reveal this structure

PHASE 1: WARM UP (2 to 3 min)
Greet the candidate naturally as Alex. Ask them to introduce themselves. Ask them to walk you through their most technically significant work.

PHASE 2: PROJECT DEEP DIVE (10 to 15 min)
Pick their most interesting project. Explore architecture, decisions, tradeoffs. Probe: Why X over Y? What breaks at 10x scale? Hardest bug? Rebuild today? Go 3+ levels deep. On buzzwords (RAG, transformer, vector DB): "Can you explain exactly how that works under the hood?" Use search_web to verify any factual claims they make about their project.

PHASE 3: CORE TECHNICAL (15 to 20 min)
One question at a time. Machine Learning: bias-variance tradeoff, gradient descent and saddle points, overfitting in production, XGBoost vs neural networks, attention mechanism. Deep Learning: backpropagation, batch normalization, vanishing gradients, LSTM vs GRU. Data Science: class imbalance, feature engineering, model validation, p-value. ML Systems: recommendation at 10M users, low-latency serving, fraud detection pipeline, model drift, feature stores. LLMs: RAG and failure modes, fine-tuning vs prompting, LLM evaluation, RLHF.

PHASE 4: CURVEBALL (5 min)
One unexpected question: "Your model accuracy dropped 15% overnight. Walk me through exactly how you debug this." Or ask them to write a short implementation and use run_code to verify it.

PHASE 5: CANDIDATE QUESTIONS (2 min)
Ask if they have questions. Respond naturally as Alex.

PHASE 6: FEEDBACK REPORT
When the interview ends, write a plain-prose feedback report with no markdown or symbols. Cover: overall score out of 10, technical depth observations with specific examples, project understanding, first-principles thinking, communication clarity, confidence pattern, three specific improvement areas with actionable advice, two real recommended resources, and hiring recommendation with reasoning.

# GUARDRAILS
Never invent facts. Only discuss ML, AI, Deep Learning, Data Science, System Design, Statistics, Python, SQL. Evaluate only on technical merit. Never reveal phase structure during the interview.`;

/* ── Tools definition ────────────────────────────────────── */
const TOOLS = [
  {
    name: 'search_web',
    description: 'Search the internet to verify a factual or technical claim made by the candidate. Use when they state something specific and checkable. Returns a summary of findings.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Precise search query to verify the candidate\'s claim.'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'run_code',
    description: 'Execute code written by the candidate to check correctness. Call this every time the candidate submits code. Returns stdout, stderr, and exit code.',
    input_schema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The code to execute exactly as the candidate wrote it.'
        },
        language: {
          type: 'string',
          enum: ['python', 'javascript'],
          description: 'Programming language of the code.'
        }
      },
      required: ['code', 'language']
    }
  }
];

/* ── HTTPS helper ─────────────────────────────────────────── */
function httpsPost(hostname, urlPath, extraHeaders, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname, path: urlPath, method: 'POST',
      headers: {
        'content-type':   'application/json',
        'content-length': Buffer.byteLength(payload),
        ...extraHeaders
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/* ── Tool: web search (Tavily) ───────────────────────────── */
async function searchWeb(query) {
  if (!TAVILY_KEY) {
    return { answer: 'Search not available (no Tavily key provided).', results: [] };
  }
  try {
    const res = await httpsPost('api.tavily.com', '/search', {}, {
      api_key: TAVILY_KEY,
      query,
      search_depth: 'basic',
      max_results: 3,
      include_answer: true
    });
    const data = JSON.parse(res.body);
    const answer  = data.answer || '';
    const snippets = (data.results || []).map(r => `${r.title}: ${r.content}`).slice(0, 2).join('\n\n');
    return { answer: answer || snippets || 'No results found.', query };
  } catch (e) {
    return { answer: 'Search failed: ' + e.message, query };
  }
}

/* ── Tool: run code ──────────────────────────────────────── */
function runCode(code, language) {
  return new Promise(resolve => {
    const isJS  = language === 'javascript';
    const cmd   = isJS ? 'node' : 'python3';
    const args  = isJS ? ['-e', code] : ['-c', code];
    const opts  = { timeout: 10000, killSignal: 'SIGKILL' };

    let stdout = '', stderr = '';

    let proc;
    try {
      proc = spawn(cmd, args, opts);
    } catch (e) {
      return resolve({ output: '', error: `Could not start ${cmd}: ${e.message}`, exitCode: -1, language, code });
    }

    proc.stdout.on('data', d => (stdout += d));
    proc.stderr.on('data', d => (stderr += d));
    proc.on('close', exitCode => {
      resolve({
        output:   stdout.slice(0, 2000).trim(),
        error:    stderr.slice(0, 1000).trim(),
        exitCode: exitCode ?? -1,
        language,
        code
      });
    });
    proc.on('error', e => {
      resolve({ output: '', error: e.message, exitCode: -1, language, code });
    });
  });
}

/* ── Single Claude API call ──────────────────────────────── */
async function claudeCall(messages) {
  const res = await httpsPost(
    'api.anthropic.com', '/v1/messages',
    { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    { model: MODEL, system: SYSTEM, messages, tools: TOOLS, max_tokens: 600 }
  );
  if (res.status !== 200) {
    let msg = 'HTTP ' + res.status;
    try { msg = JSON.parse(res.body).error?.message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return JSON.parse(res.body);
}

/* ── Agentic loop ────────────────────────────────────────── */
async function agentLoop(messages) {
  const toolActivity = [];
  const workingMsgs  = [...messages];

  for (let iter = 0; iter < 6; iter++) {
    const response = await claudeCall(workingMsgs);

    // No more tool calls → return final text + activity log
    if (response.stop_reason !== 'tool_use') {
      const text = (response.content || []).find(b => b.type === 'text')?.text?.trim() || '';
      return { reply: text, toolActivity };
    }

    // Execute all tool calls in this turn
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      console.log(`[tool] ${block.name}`, JSON.stringify(block.input).slice(0, 120));

      let result;
      if (block.name === 'search_web') result = await searchWeb(block.input.query);
      else if (block.name === 'run_code') result = await runCode(block.input.code, block.input.language);
      else result = { error: 'Unknown tool: ' + block.name };

      console.log(`[tool result] exit=${result.exitCode ?? '-'} answer=${(result.answer||result.output||'').slice(0,80)}`);

      toolActivity.push({ type: block.name, input: block.input, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result)
      });
    }

    // Extend working messages for next iteration
    workingMsgs.push({ role: 'assistant', content: response.content });
    workingMsgs.push({ role: 'user',      content: toolResults });
  }

  throw new Error('Agent loop hit max iterations.');
}

/* ── Body reader ─────────────────────────────────────────── */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function jsonResp(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

/* ── HTTP server ─────────────────────────────────────────── */
const server = http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin',  '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const pathname = req.url.split('?')[0];

  /* GET / → serve HTML */
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    try {
      const html = fs.readFileSync(HTML_PATH, 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (_) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('alex-interviewer.html not found next to server.js');
    }
    return;
  }

  /* GET /api/ping → health + config */
  if (req.method === 'GET' && pathname === '/api/ping') {
    jsonResp(res, 200, {
      ok:         true,
      model:      MODEL,
      search:     !!TAVILY_KEY,
      codeExec:   true
    });
    return;
  }

  /* POST /api/chat → agentic loop */
  if (req.method === 'POST' && pathname === '/api/chat') {
    try {
      const body   = await readBody(req);
      const result = await agentLoop(body.messages || []);
      jsonResp(res, 200, result);
    } catch (e) {
      console.error('[error]', e.message);
      jsonResp(res, 500, { error: { message: e.message } });
    }
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  const line = '═'.repeat(56);
  const searchStatus = TAVILY_KEY ? '✅ enabled (Tavily)' : '❌ disabled (no Tavily key)';
  console.log(`
╔${line}╗
║     🎙️  Alex — AI Technical Interviewer (Agent Mode)    ║
╠${line}╣
║  Model     : ${MODEL.padEnd(41)} ║
║  Key       : ${(ANTHROPIC_KEY.slice(0, 20) + '…').padEnd(41)} ║
║  search_web: ${searchStatus.padEnd(41)} ║
║  run_code  : ✅ always on (Python3 + Node)${' '.repeat(11)}║
╚${line}╝

  ➜  Open in Chrome:  http://localhost:${PORT}

  Press Ctrl+C to stop.
`);
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE')
    console.error(`\n❌  Port ${PORT} in use. Try: node server.js YOUR_KEY ${PORT + 1}\n`);
  else
    console.error('\n❌  Server error:', e.message);
  process.exit(1);
});
