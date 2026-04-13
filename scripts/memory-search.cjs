#!/usr/bin/env node
// Run with: node --experimental-sqlite memory-search.cjs [options]
/**
 * Claudex Memory Search — Vector RAG System
 * 
 * A semantic search system for Claude Code autonomous agents.
 * Indexes markdown memory files and session transcripts into a SQLite
 * database with hybrid (vector + FTS) search.
 * 
 * Supports multiple embedding providers:
 *   1. OpenAI (best quality, ~$0.02/mo) — requires OPENAI_API_KEY
 *   2. Ollama (local, free) — requires Ollama running with an embedding model
 *   3. TF-IDF (zero-dependency fallback) — pure Node.js, no API, no installs
 * 
 * Auto-detects: OpenAI if key set → Ollama if running → TF-IDF fallback.
 * Override with CLAUDEX_EMBEDDING_PROVIDER=openai|ollama|tfidf
 * 
 * Usage:
 *   node --experimental-sqlite memory-search.cjs --search "query"
 *   node --experimental-sqlite memory-search.cjs --index
 *   node --experimental-sqlite memory-search.cjs --index --incremental
 *   node --experimental-sqlite memory-search.cjs --stats
 *   node --experimental-sqlite memory-search.cjs --provider    # show active provider
 * 
 * Environment:
 *   OPENAI_API_KEY              Required for OpenAI embeddings
 *   CLAUDEX_EMBEDDING_PROVIDER  Force provider: openai | ollama | tfidf
 *   CLAUDEX_EMBEDDING_MODEL     Override model (default per provider)
 *   CLAUDEX_OLLAMA_URL          Ollama API URL (default: http://localhost:11434)
 *   CLAUDEX_OLLAMA_MODEL        Ollama model (default: nomic-embed-text)
 *   CLAUDEX_MEMORY_DB           Override database path
 *   CLAUDEX_WORKSPACE           Override workspace path
 *   CLAUDEX_RAG_CONFIG          Override rag-config.json path
 */

'use strict';

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Configuration ──────────────────────────────────────────────────────────

const HOME = process.env.HOME || '/home/ajans';
const WORKSPACE = process.env.CLAUDEX_WORKSPACE || path.join(HOME, '.claude-agent');
const DB_PATH = process.env.CLAUDEX_MEMORY_DB || path.join(WORKSPACE, 'data', 'memory.sqlite');
const RAG_CONFIG_PATH = process.env.CLAUDEX_RAG_CONFIG || path.join(WORKSPACE, 'data', 'rag-config.json');

// Provider config
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OLLAMA_URL = process.env.CLAUDEX_OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.CLAUDEX_OLLAMA_MODEL || 'nomic-embed-text';
const OPENAI_MODEL = process.env.CLAUDEX_EMBEDDING_MODEL || 'text-embedding-3-small';

// Session transcript location (Claude Code stores these here)
const CLAUDE_PROJECTS_DIR = path.join(HOME, '.claude', 'projects');
const CLAUDE_AGENT_PROJECT = '-home-ajans--claude-agent';

// Load cross-agent dirs from config or use defaults
function loadCrossAgentDirs() {
  try {
    if (fs.existsSync(RAG_CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(RAG_CONFIG_PATH, 'utf-8'));
      if (cfg.crossAgentDirs && typeof cfg.crossAgentDirs === 'object') {
        // Resolve ~ in paths
        const resolved = {};
        for (const [k, v] of Object.entries(cfg.crossAgentDirs)) {
          resolved[k] = v.replace(/^~/, HOME);
        }
        return resolved;
      }
    }
  } catch {}
  // Defaults (for this installation)
  return {
    'kite':  path.join(HOME, '.openclaw', 'workspace'),
    'poe':   path.join(HOME, '.openclaw-poe', 'workspace'),
    'argus': path.join(HOME, '.openclaw-argus', 'workspace'),
  };
}
const CROSS_AGENT_DIRS = loadCrossAgentDirs();

// Chunking
const CHUNK_MIN_CHARS = 100;
const CHUNK_MAX_CHARS = 1500;
const CHUNK_TARGET_CHARS = 800;

// Search
const DEFAULT_LIMIT = 8;
const VECTOR_WEIGHT = 0.7;
const FTS_WEIGHT = 0.3;
const RECENCY_HALF_LIFE_DAYS = 60;

// API rate limiting
const EMBEDDING_BATCH_SIZE = 20;
const EMBEDDING_DELAY_MS = 250;

// ─── Embedding Provider Detection ───────────────────────────────────────────

let _detectedProvider = null;
let _providerLabel = null;

async function detectProvider() {
  if (_detectedProvider) return _detectedProvider;

  const forced = process.env.CLAUDEX_EMBEDDING_PROVIDER;
  if (forced) {
    const p = forced.toLowerCase().trim();
    if (['openai', 'ollama', 'tfidf'].includes(p)) {
      _detectedProvider = p;
      _providerLabel = `${p} (forced via CLAUDEX_EMBEDDING_PROVIDER)`;
      return p;
    }
  }

  // Auto-detect chain: OpenAI → Ollama → TF-IDF
  if (OPENAI_API_KEY) {
    _detectedProvider = 'openai';
    _providerLabel = `openai (${OPENAI_MODEL})`;
    return 'openai';
  }

  // Check if Ollama is running
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      const data = await resp.json();
      const models = (data.models || []).map(m => m.name.split(':')[0]);
      if (models.includes(OLLAMA_MODEL) || models.includes(OLLAMA_MODEL.split(':')[0])) {
        _detectedProvider = 'ollama';
        _providerLabel = `ollama (${OLLAMA_MODEL} @ ${OLLAMA_URL})`;
        return 'ollama';
      }
      // Ollama running but model not pulled
      console.error(`  ⚠️  Ollama running but '${OLLAMA_MODEL}' not found. Available: ${models.join(', ')}`);
      console.error(`     Pull it: ollama pull ${OLLAMA_MODEL}`);
    }
  } catch {
    // Ollama not running — fall through
  }

  _detectedProvider = 'tfidf';
  _providerLabel = 'tfidf (zero-dependency fallback)';
  return 'tfidf';
}

function getProviderModelKey() {
  if (_detectedProvider === 'openai') return `openai:${OPENAI_MODEL}`;
  if (_detectedProvider === 'ollama') return `ollama:${OLLAMA_MODEL}`;
  return 'tfidf:v1';
}

// ─── Database ───────────────────────────────────────────────────────────────

function initDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = normal');
  db.exec('PRAGMA cache_size = -64000');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'memory',
      agent TEXT NOT NULL DEFAULT 'claudex',
      hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL,
      indexed_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'memory',
      agent TEXT NOT NULL DEFAULT 'claudex',
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding TEXT,
      embedding_provider TEXT,
      hash TEXT NOT NULL,
      file_mtime INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    
    CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);
    CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);
    CREATE INDEX IF NOT EXISTS idx_chunks_agent ON chunks(agent);
  `);
  
  // FTS5 table
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      chunk_id UNINDEXED,
      text,
      tokenize='porter unicode61'
    );
  `);
  
  // Embedding cache — now includes provider
  db.exec(`
    CREATE TABLE IF NOT EXISTS embedding_cache (
      text_hash TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Migration: add embedding_provider column if missing
  try {
    db.exec("SELECT embedding_provider FROM chunks LIMIT 0");
  } catch {
    try { db.exec("ALTER TABLE chunks ADD COLUMN embedding_provider TEXT"); } catch {}
  }
  
  db.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '3')");
  
  return db;
}

// ─── Chunking ───────────────────────────────────────────────────────────────

function chunkMarkdown(content) {
  const lines = content.split('\n');
  const chunks = [];
  let currentChunk = [];
  let currentHeader = '';
  let chunkStartLine = 1;
  
  function flushChunk() {
    if (currentChunk.length === 0) return;
    const text = currentChunk.join('\n').trim();
    if (text.length >= CHUNK_MIN_CHARS) {
      chunks.push({
        text: currentHeader && !text.startsWith(currentHeader)
          ? `${currentHeader}\n\n${text}` : text,
        startLine: chunkStartLine,
        endLine: chunkStartLine + currentChunk.length - 1,
      });
    }
    currentChunk = [];
    chunkStartLine = -1;
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    
    if (headerMatch) {
      flushChunk();
      if (headerMatch[1].length <= 2) currentHeader = line;
      currentChunk.push(line);
      if (chunkStartLine === -1) chunkStartLine = lineNum;
      continue;
    }
    
    const currentText = currentChunk.join('\n');
    if (currentText.length > CHUNK_MAX_CHARS && line.trim() === '') {
      flushChunk();
      continue;
    }
    if (currentText.length > CHUNK_MAX_CHARS * 1.5) {
      flushChunk();
    }
    
    currentChunk.push(line);
    if (chunkStartLine === -1) chunkStartLine = lineNum;
  }
  
  flushChunk();
  return chunks;
}

function chunkSession(content) {
  const chunks = [];
  const lines = content.split('\n').filter(l => l.trim());
  let currentMessages = [];
  let messageCount = 0;
  let chunkStartLine = 1;
  
  for (let i = 0; i < lines.length; i++) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    
    if (entry.type !== 'user' && entry.type !== 'assistant') continue;
    const msg = entry.message;
    if (!msg || !msg.content) continue;
    
    let text = '';
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
    }
    
    if (!text || text.length < 20) continue;
    if (text.startsWith('<tool_result>') || text.startsWith('<command-message>')) continue;
    if (text.startsWith('<') || text.startsWith('```tool_code')) continue;
    
    const role = entry.type === 'user' ? 'Human' : 'Assistant';
    const ts = (entry.timestamp || '').substring(0, 10);
    const truncated = text.length > 2000 ? text.substring(0, 2000) + '...[truncated]' : text;
    
    currentMessages.push(`[${role}${ts ? ' ' + ts : ''}]: ${truncated}`);
    messageCount++;
    
    const chunkText = currentMessages.join('\n\n');
    if (messageCount >= 5 || chunkText.length > CHUNK_TARGET_CHARS) {
      if (chunkText.length >= CHUNK_MIN_CHARS) {
        chunks.push({ text: chunkText, startLine: chunkStartLine, endLine: i + 1 });
      }
      currentMessages = currentMessages.slice(-1);
      messageCount = 1;
      chunkStartLine = i + 1;
    }
  }
  
  if (currentMessages.length > 0) {
    const chunkText = currentMessages.join('\n\n');
    if (chunkText.length >= CHUNK_MIN_CHARS) {
      chunks.push({ text: chunkText, startLine: chunkStartLine, endLine: lines.length });
    }
  }
  
  return chunks;
}

// ─── Embedding Providers ────────────────────────────────────────────────────

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// --- OpenAI ---

async function getEmbeddingsOpenAI(texts, db) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  
  const modelKey = getProviderModelKey();
  const results = new Array(texts.length);
  const uncached = [];
  
  const getCache = db.prepare('SELECT embedding FROM embedding_cache WHERE text_hash = ? AND model = ?');
  for (let i = 0; i < texts.length; i++) {
    const hash = sha256(texts[i]).substring(0, 32);
    const cached = getCache.get(hash, modelKey);
    if (cached) {
      results[i] = JSON.parse(cached.embedding);
    } else {
      uncached.push(i);
    }
  }
  
  if (uncached.length === 0) return results;
  
  const insertCache = db.prepare(
    'INSERT OR REPLACE INTO embedding_cache (text_hash, model, embedding) VALUES (?, ?, ?)'
  );
  
  for (let b = 0; b < uncached.length; b += EMBEDDING_BATCH_SIZE) {
    const batchIndices = uncached.slice(b, b + EMBEDDING_BATCH_SIZE);
    const batchTexts = batchIndices.map(i => texts[i]);
    
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: OPENAI_MODEL, input: batchTexts }),
    });
    
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`OpenAI ${resp.status}: ${err.substring(0, 200)}`);
    }
    
    const data = await resp.json();
    
    for (let j = 0; j < data.data.length; j++) {
      const embedding = data.data[j].embedding;
      const idx = batchIndices[j];
      results[idx] = embedding;
      
      const hash = sha256(batchTexts[j]).substring(0, 32);
      insertCache.run(hash, modelKey, JSON.stringify(embedding));
    }
    
    if (b + EMBEDDING_BATCH_SIZE < uncached.length) {
      await new Promise(r => setTimeout(r, EMBEDDING_DELAY_MS));
    }
  }
  
  return results;
}

// --- Ollama ---

async function getEmbeddingsOllama(texts, db) {
  const modelKey = getProviderModelKey();
  const results = new Array(texts.length);
  const uncached = [];
  
  const getCache = db.prepare('SELECT embedding FROM embedding_cache WHERE text_hash = ? AND model = ?');
  for (let i = 0; i < texts.length; i++) {
    const hash = sha256(texts[i]).substring(0, 32);
    const cached = getCache.get(hash, modelKey);
    if (cached) {
      results[i] = JSON.parse(cached.embedding);
    } else {
      uncached.push(i);
    }
  }
  
  if (uncached.length === 0) return results;
  
  const insertCache = db.prepare(
    'INSERT OR REPLACE INTO embedding_cache (text_hash, model, embedding) VALUES (?, ?, ?)'
  );
  
  // Ollama embeds one at a time (no batch API)
  for (const idx of uncached) {
    const resp = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt: texts[idx] }),
    });
    
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Ollama ${resp.status}: ${err.substring(0, 200)}`);
    }
    
    const data = await resp.json();
    const embedding = data.embedding;
    results[idx] = embedding;
    
    const hash = sha256(texts[idx]).substring(0, 32);
    insertCache.run(hash, modelKey, JSON.stringify(embedding));
  }
  
  return results;
}

// --- TF-IDF (zero-dependency fallback) ---

// Global document frequency map, built during indexing
let _idfMap = null;
let _vocabSize = 0;
const TFIDF_DIM = 512; // Fixed dimension for compatibility

function buildIDF(allTexts) {
  const df = new Map();
  const N = allTexts.length;
  
  for (const text of allTexts) {
    const words = new Set(tokenize(text));
    for (const w of words) {
      df.set(w, (df.get(w) || 0) + 1);
    }
  }
  
  // Compute IDF: log(N / df)
  const idf = new Map();
  for (const [word, count] of df) {
    idf.set(word, Math.log(N / count));
  }
  
  _idfMap = idf;
  _vocabSize = idf.size;
  return idf;
}

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && w.length < 30);
}

function tfidfVector(text, idf) {
  const words = tokenize(text);
  const tf = new Map();
  for (const w of words) {
    tf.set(w, (tf.get(w) || 0) + 1);
  }
  
  // Build sparse vector, then hash to fixed dimension
  const vec = new Float64Array(TFIDF_DIM);
  
  for (const [word, count] of tf) {
    const idfVal = idf.get(word) || 0;
    if (idfVal === 0) continue;
    const tfidf = (count / words.length) * idfVal;
    
    // Hash word to fixed dimension (feature hashing / hashing trick)
    const h = simpleHash(word) % TFIDF_DIM;
    // Use sign hash to reduce collisions
    const sign = (simpleHash(word + '_sign') % 2 === 0) ? 1 : -1;
    vec[h] += sign * tfidf;
  }
  
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  }
  
  return Array.from(vec);
}

function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

async function getEmbeddingsTFIDF(texts, db) {
  const modelKey = getProviderModelKey();
  const results = new Array(texts.length);
  const uncached = [];
  
  const getCache = db.prepare('SELECT embedding FROM embedding_cache WHERE text_hash = ? AND model = ?');
  for (let i = 0; i < texts.length; i++) {
    const hash = sha256(texts[i]).substring(0, 32);
    const cached = getCache.get(hash, modelKey);
    if (cached) {
      results[i] = JSON.parse(cached.embedding);
    } else {
      uncached.push(i);
    }
  }
  
  if (uncached.length === 0) return results;
  
  // Build IDF from existing chunks + new texts if not built yet
  if (!_idfMap) {
    try {
      const existing = db.prepare('SELECT text FROM chunks').all().map(r => r.text);
      buildIDF([...existing, ...texts]);
    } catch {
      buildIDF(texts);
    }
  }
  
  const insertCache = db.prepare(
    'INSERT OR REPLACE INTO embedding_cache (text_hash, model, embedding) VALUES (?, ?, ?)'
  );
  
  for (const idx of uncached) {
    const embedding = tfidfVector(texts[idx], _idfMap);
    results[idx] = embedding;
    
    const hash = sha256(texts[idx]).substring(0, 32);
    insertCache.run(hash, modelKey, JSON.stringify(embedding));
  }
  
  return results;
}

// --- Provider dispatch ---

async function getEmbeddings(texts, db) {
  const provider = await detectProvider();
  switch (provider) {
    case 'openai': return getEmbeddingsOpenAI(texts, db);
    case 'ollama': return getEmbeddingsOllama(texts, db);
    case 'tfidf':  return getEmbeddingsTFIDF(texts, db);
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}

// ─── Vector Math ────────────────────────────────────────────────────────────

function cosine(a, b) {
  if (a.length !== b.length) {
    // Dimension mismatch (e.g., provider changed) — return 0
    return 0;
  }
  let dot = 0, nA = 0, nB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    nA += a[i] * a[i];
    nB += b[i] * b[i];
  }
  const d = Math.sqrt(nA) * Math.sqrt(nB);
  return d === 0 ? 0 : dot / d;
}

// ─── File Discovery ─────────────────────────────────────────────────────────

function discoverFiles() {
  const files = [];
  
  // 1. Claudex workspace memory
  const claudeMd = path.join(WORKSPACE, 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) {
    files.push({ path: claudeMd, source: 'memory', agent: 'claudex' });
  }
  
  const memDir = path.join(WORKSPACE, 'memory');
  if (fs.existsSync(memDir)) {
    for (const f of readdirSafe(memDir)) {
      if (f.endsWith('.md')) {
        files.push({ path: path.join(memDir, f), source: 'memory', agent: 'claudex' });
      }
    }
  }
  
  // 2. Claude Code session transcripts
  const sessDir = path.join(CLAUDE_PROJECTS_DIR, CLAUDE_AGENT_PROJECT);
  if (fs.existsSync(sessDir)) {
    for (const f of readdirSafe(sessDir)) {
      if (!f.endsWith('.jsonl')) continue;
      const fp = path.join(sessDir, f);
      try {
        const stat = fs.statSync(fp);
        if (stat.size > 10240) {
          files.push({ path: fp, source: 'session', agent: 'claudex' });
        }
      } catch {}
    }
  }
  
  // 3. Cross-agent memory
  for (const [agent, wsDir] of Object.entries(CROSS_AGENT_DIRS)) {
    if (!fs.existsSync(wsDir)) continue;
    
    const agentMem = path.join(wsDir, 'MEMORY.md');
    if (fs.existsSync(agentMem)) {
      files.push({ path: agentMem, source: 'cross-agent', agent });
    }
    
    const agentMemDir = path.join(wsDir, 'memory');
    if (fs.existsSync(agentMemDir)) {
      for (const f of readdirSafe(agentMemDir)) {
        if (f.endsWith('.md')) {
          files.push({ path: path.join(agentMemDir, f), source: 'cross-agent', agent });
        }
      }
    }
  }
  
  return files;
}

function readdirSafe(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

// ─── Indexing ───────────────────────────────────────────────────────────────

async function indexFiles(db, incremental = true) {
  const provider = await detectProvider();
  const providerKey = getProviderModelKey();
  console.error(`  Provider: ${_providerLabel}`);
  
  const files = discoverFiles();
  
  const getFile = db.prepare('SELECT hash FROM files WHERE path = ?');
  const upsertFile = db.prepare(
    'INSERT OR REPLACE INTO files (path, source, agent, hash, mtime, size, indexed_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())'
  );
  const deleteChunks = db.prepare('DELETE FROM chunks WHERE path = ?');
  const deleteFts = db.prepare('DELETE FROM chunks_fts WHERE chunk_id IN (SELECT id FROM chunks WHERE path = ?)');
  const insertChunk = db.prepare(
    'INSERT INTO chunks (id, path, source, agent, start_line, end_line, text, embedding, embedding_provider, hash, file_mtime, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())'
  );
  const insertFts = db.prepare(
    'INSERT INTO chunks_fts (chunk_id, text) VALUES (?, ?)'
  );
  
  let stats = { indexed: 0, skipped: 0, chunks: 0, embeddings: 0, errors: 0 };
  
  for (const file of files) {
    let stat;
    try { stat = fs.statSync(file.path); } catch { continue; }
    
    let content;
    try { content = fs.readFileSync(file.path, 'utf-8'); } catch { continue; }
    
    const hash = sha256(content).substring(0, 16);
    
    if (incremental) {
      const existing = getFile.get(file.path);
      if (existing && existing.hash === hash) { stats.skipped++; continue; }
    }
    
    const isSession = file.source === 'session';
    const chunks = isSession ? chunkSession(content) : chunkMarkdown(content);
    if (chunks.length === 0) { stats.skipped++; continue; }
    
    let embeddings;
    try {
      embeddings = await getEmbeddings(chunks.map(c => c.text), db);
      stats.embeddings += chunks.length;
    } catch (err) {
      console.error(`  ⚠️  ${path.basename(file.path)}: ${err.message}`);
      stats.errors++;
      continue;
    }
    
    try { deleteFts.run(file.path); } catch {}
    deleteChunks.run(file.path);
    upsertFile.run(file.path, file.source, file.agent, hash, Math.floor(stat.mtimeMs / 1000), stat.size);
    
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const chunkId = sha256(`${file.path}:${c.startLine}:${c.endLine}:${hash}`).substring(0, 16);
      
      insertChunk.run(
        chunkId, file.path, file.source, file.agent,
        c.startLine, c.endLine, c.text,
        JSON.stringify(embeddings[i]),
        providerKey,
        hash, Math.floor(stat.mtimeMs / 1000)
      );
      
      insertFts.run(chunkId, c.text);
    }
    
    stats.indexed++;
    stats.chunks += chunks.length;
    
    const label = file.source === 'cross-agent' ? `[${file.agent}]` : `[${file.source}]`;
    console.error(`  ✓ ${label} ${path.basename(file.path)} → ${chunks.length} chunks`);
  }
  
  stats.totalFiles = files.length;
  return stats;
}

// ─── Search ─────────────────────────────────────────────────────────────────

async function search(db, query, opts = {}) {
  const { limit = DEFAULT_LIMIT, source = null, agent = null } = opts;
  
  const provider = await detectProvider();
  const providerKey = getProviderModelKey();
  
  const [queryEmb] = await getEmbeddings([query], db);
  
  // Get chunks — prefer same provider, but include all (cosine handles dimension mismatch)
  let sql = 'SELECT id, path, source, agent, start_line, end_line, text, embedding, embedding_provider, file_mtime FROM chunks WHERE embedding IS NOT NULL';
  const params = [];
  if (source) { sql += ' AND source = ?'; params.push(source); }
  if (agent) { sql += ' AND agent = ?'; params.push(agent); }
  
  const rows = db.prepare(sql).all(...params);
  
  // FTS scores
  const ftsScores = new Map();
  try {
    const words = query.split(/\s+/).filter(w => w.length > 2).map(w => `"${w.replace(/"/g, '')}"`);
    if (words.length > 0) {
      const ftsQ = words.join(' OR ');
      let ftsSql = 'SELECT chunk_id, rank FROM chunks_fts WHERE chunks_fts MATCH ?';
      const ftsRows = db.prepare(ftsSql).all(ftsQ);
      if (ftsRows.length > 0) {
        const minR = Math.min(...ftsRows.map(r => r.rank));
        const maxR = Math.max(...ftsRows.map(r => r.rank));
        const range = maxR - minR || 1;
        for (const r of ftsRows) {
          ftsScores.set(r.chunk_id, Math.abs((r.rank - maxR) / range));
        }
      }
    }
  } catch {}
  
  const now = Date.now() / 1000;
  const scored = rows.map(row => {
    const emb = JSON.parse(row.embedding);
    
    // Skip chunks from different providers (dimension mismatch → 0 cosine)
    const sameProvider = row.embedding_provider === providerKey || !row.embedding_provider;
    const vecScore = sameProvider ? cosine(queryEmb, emb) : 0;
    const ftsScore = ftsScores.get(row.id) || 0;
    
    // If vector score is 0 (wrong provider), lean heavier on FTS
    let score;
    if (vecScore === 0 && ftsScore > 0) {
      score = ftsScore; // FTS only
    } else {
      score = VECTOR_WEIGHT * vecScore + FTS_WEIGHT * ftsScore;
    }
    
    const ageDays = Math.max(0, (now - row.file_mtime) / 86400);
    const decay = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
    score *= decay;
    
    const displayPath = row.path.startsWith(HOME) ? '~' + row.path.substring(HOME.length) : row.path;
    
    return {
      path: displayPath,
      source: row.source,
      agent: row.agent,
      startLine: row.start_line,
      endLine: row.end_line,
      score: Math.round(score * 1000) / 1000,
      vectorScore: Math.round(vecScore * 1000) / 1000,
      ftsScore: Math.round(ftsScore * 1000) / 1000,
      recency: Math.round(decay * 1000) / 1000,
      snippet: row.text.substring(0, 500),
    };
  });
  
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// ─── Stats ──────────────────────────────────────────────────────────────────

function getStats(db) {
  const total = db.prepare('SELECT COUNT(*) as c FROM chunks').get().c;
  const totalFiles = db.prepare('SELECT COUNT(*) as c FROM files').get().c;
  const cached = db.prepare('SELECT COUNT(*) as c FROM embedding_cache').get().c;
  const bySource = db.prepare('SELECT source, COUNT(*) as c, SUM(LENGTH(text)) as bytes FROM chunks GROUP BY source').all();
  const byAgent = db.prepare('SELECT agent, COUNT(*) as c FROM chunks GROUP BY agent').all();
  const byProvider = db.prepare('SELECT embedding_provider, COUNT(*) as c FROM chunks WHERE embedding_provider IS NOT NULL GROUP BY embedding_provider').all();
  const recent = db.prepare(
    'SELECT path, source, agent, indexed_at FROM files ORDER BY indexed_at DESC LIMIT 10'
  ).all();
  
  return { total, totalFiles, cached, bySource, byAgent, byProvider, recent };
}

// ─── Config Management ──────────────────────────────────────────────────────

function initConfig() {
  if (fs.existsSync(RAG_CONFIG_PATH)) return;
  
  const defaultConfig = {
    _comment: "Claudex RAG configuration. Edit crossAgentDirs to add/remove agents.",
    crossAgentDirs: {
      kite:  "~/.openclaw/workspace",
      poe:   "~/.openclaw-poe/workspace",
      argus: "~/.openclaw-argus/workspace",
    }
  };
  
  fs.mkdirSync(path.dirname(RAG_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(RAG_CONFIG_PATH, JSON.stringify(defaultConfig, null, 2) + '\n');
}

// ─── CLI ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const flag = f => args.includes(f);
  const arg = f => { const i = args.indexOf(f); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
  
  if (args.length === 0 || flag('--help')) {
    console.log(`
Claudex Memory Search — Vector RAG System

Commands:
  --search "query"       Semantic search across all memories
  --index                Full reindex all sources
  --index --incremental  Reindex only changed files
  --stats                Show index statistics
  --provider             Show active embedding provider
  --init-config          Create default rag-config.json

Options:
  --limit N           Max results (default: ${DEFAULT_LIMIT})
  --source TYPE       Filter: memory | session | cross-agent
  --agent NAME        Filter: claudex | kite | poe | argus
  --json              JSON output
  --quiet             Minimal output

Embedding Providers (auto-detected):
  1. OpenAI   — set OPENAI_API_KEY (best quality, ~$0.02/mo)
  2. Ollama   — run Ollama + 'ollama pull nomic-embed-text' (free, local)
  3. TF-IDF   — zero-dependency fallback (no API, no installs)

Override: CLAUDEX_EMBEDDING_PROVIDER=openai|ollama|tfidf

Environment:
  OPENAI_API_KEY              OpenAI embedding API key
  CLAUDEX_EMBEDDING_PROVIDER  Force provider
  CLAUDEX_OLLAMA_URL          Ollama URL (default: http://localhost:11434)
  CLAUDEX_OLLAMA_MODEL        Ollama model (default: nomic-embed-text)
  CLAUDEX_MEMORY_DB           Override database path
  CLAUDEX_WORKSPACE           Override workspace path
  CLAUDEX_RAG_CONFIG          Override rag-config.json path
`);
    return;
  }
  
  // Init config if needed
  if (flag('--init-config')) {
    initConfig();
    console.log(`✅ Config written to ${RAG_CONFIG_PATH}`);
    return;
  }
  
  // Show provider
  if (flag('--provider')) {
    await detectProvider();
    console.log(`Provider: ${_providerLabel}`);
    return;
  }
  
  const db = initDb(DB_PATH);
  
  try {
    if (flag('--index')) {
      const inc = flag('--incremental');
      console.error(`🔍 ${inc ? 'Incremental' : 'Full'} indexing...`);
      if (!inc) {
        db.exec('DELETE FROM chunks_fts');
        db.exec('DELETE FROM chunks');
        db.exec('DELETE FROM files');
      }
      const s = await indexFiles(db, inc);
      console.error(`\n✅ Done: ${s.indexed} indexed, ${s.skipped} skipped, ${s.errors} errors`);
      console.error(`   ${s.chunks} chunks, ${s.embeddings} embeddings, ${s.totalFiles} files found`);
      return;
    }
    
    if (flag('--stats')) {
      const s = getStats(db);
      if (flag('--json')) { console.log(JSON.stringify(s, null, 2)); return; }
      console.log(`\n📊 Claudex Memory Search`);
      console.log(`   Chunks: ${s.total} | Files: ${s.totalFiles} | Cached embeddings: ${s.cached}`);
      console.log(`\n   By source:`);
      for (const r of s.bySource) console.log(`     ${r.source}: ${r.c} chunks (${(r.bytes / 1024).toFixed(1)} KB)`);
      console.log(`   By agent:`);
      for (const r of s.byAgent) console.log(`     ${r.agent}: ${r.c} chunks`);
      if (s.byProvider.length > 0) {
        console.log(`   By provider:`);
        for (const r of s.byProvider) console.log(`     ${r.embedding_provider}: ${r.c} chunks`);
      }
      console.log(`\n   Recent:`);
      for (const r of s.recent) {
        const p = path.basename(r.path);
        const d = new Date(r.indexed_at * 1000).toISOString().substring(0, 16);
        console.log(`     [${d}] ${r.agent}/${r.source}: ${p}`);
      }
      return;
    }
    
    const query = arg('--search');
    if (query) {
      const results = await search(db, query, {
        limit: parseInt(arg('--limit') || DEFAULT_LIMIT),
        source: arg('--source'),
        agent: arg('--agent'),
      });
      
      if (flag('--json')) { console.log(JSON.stringify(results, null, 2)); return; }
      
      if (!flag('--quiet')) {
        await detectProvider();
        console.log(`\n🔍 "${query}" — ${results.length} results (${_detectedProvider})\n`);
      }
      
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const src = r.source === 'cross-agent' ? r.agent : r.source;
        console.log(`${i + 1}. [${src}] ${path.basename(r.path)}#L${r.startLine}-L${r.endLine} (${r.score})`);
        if (!flag('--quiet')) {
          const snip = r.snippet.split('\n').slice(0, 6).map(l => `   ${l}`).join('\n');
          console.log(snip);
          console.log(`   ─ vec:${r.vectorScore} fts:${r.ftsScore} recency:${r.recency}\n`);
        }
      }
      if (results.length === 0) console.log('   No results.');
      return;
    }
    
    console.error('No action. Use --search, --index, or --stats.');
  } finally {
    db.close();
  }
}

main().catch(err => {
  console.error(`❌ ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
