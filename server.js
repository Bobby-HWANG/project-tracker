/* ══════════════════════════════════════════════════════════
   INTOPS FMS 품질팀 업무현황  –  Node.js + JSON 파일 저장
   네이티브 의존성 없음 (express만 사용)
   ══════════════════════════════════════════════════════════ */

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ════════════════════════════════════════════════════════════
//  전역 에러 핸들러 — 어떤 오류도 프로세스를 죽이지 않음
// ════════════════════════════════════════════════════════════
process.on('uncaughtException', (err, origin) => {
  console.error(`[CRITICAL] uncaughtException (${origin}):`, err.message);
  console.error(err.stack);
  // 프로세스를 종료하지 않고 계속 실행 → 강제 꺼짐 방지
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] unhandledRejection:', reason);
  // 프로세스를 종료하지 않고 계속 실행 → 강제 꺼짐 방지
});

const app = express();

// ════════════════════════════════════════════════════════════
//  PostgreSQL 백엔드 (Railway 내장 DB)
//  DATABASE_URL 환경변수가 있으면 자동 사용 (Railway가 자동 주입)
//  없으면 기존 파일 방식으로 폴백 (로컬 개발)
// ════════════════════════════════════════════════════════════
const PG_URL = process.env.DATABASE_URL || '';
const PG_ENABLED = !!PG_URL;
let pgPool = null;
if (PG_ENABLED) {
  try {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: PG_URL,
      ssl: PG_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    });
    console.log('[PG] ✓ PostgreSQL backend enabled');
  } catch (e) {
    console.error('[PG] init failed, falling back to file:', e.message);
  }
}

async function pgInit() {
  if (!pgPool) return;
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS kv (
      k TEXT PRIMARY KEY,
      v JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}
async function pgLoad() {
  if (!pgPool) return null;
  const r = await pgPool.query(`SELECT v FROM kv WHERE k='main'`);
  return r.rows[0] ? r.rows[0].v : null;
}
async function pgSave(obj) {
  if (!pgPool) return;
  await pgPool.query(
    `INSERT INTO kv (k, v, updated_at) VALUES ('main', $1::jsonb, NOW())
     ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = NOW()`,
    [JSON.stringify(obj)]
  );
}

// ── 영구 저장 경로 (Railway/클라우드 볼륨 지원) ──
// 환경변수 DATA_FILE이 있으면 그 경로 사용 (Railway Volume 마운트 경로)
// 없으면 프로젝트 폴더의 data.json 사용 (로컬 개발)
const DEFAULT_DB_FILE = path.join(__dirname, 'data.json');
const DB_FILE = process.env.DATA_FILE || DEFAULT_DB_FILE;
const PERSISTENT = !!process.env.DATA_FILE;
console.log(`[DB] Using file: ${DB_FILE}`);
if (!PERSISTENT) {
  console.warn('╔══════════════════════════════════════════════════════════╗');
  console.warn('║  ⚠  WARNING: DATA_FILE env var NOT set                   ║');
  console.warn('║  Data will be LOST on container restart (Railway sleep)  ║');
  console.warn('║  → Set DATA_FILE=/data/data.json + mount Volume at /data ║');
  console.warn('╚══════════════════════════════════════════════════════════╝');
} else {
  console.log(`[DB] ✓ Persistent storage enabled (${DB_FILE})`);
}

// ── DB Helpers ──────────────────────────────────────────────
const defaultDB = () => ({
  models: [
    { id:1, name:'X-BLE Shoulder', color:'#8B5CF6', order:0, category:'model' },
    { id:2, name:'SEC S26',        color:'#A855F7', order:1, category:'model' },
    { id:3, name:'BR',             color:'#10B981', order:2, category:'model' },
    { id:4, name:'프리뉴',         color:'#F59E0B', order:3, category:'model' },
    { id:5, name:'WI 로보틱스',    color:'#EF4444', order:4, category:'model' },
    { id:6, name:'모빌린트 NPU',   color:'#EC4899', order:5, category:'model' },
  ],
  subItems: {
    1:[{id:101,modelId:1,name:'기획',order:0},{id:102,modelId:1,name:'설계/개발',order:1},{id:103,modelId:1,name:'검증',order:2},{id:104,modelId:1,name:'양산준비',order:3},{id:105,modelId:1,name:'완료',order:4}],
    2:[{id:201,modelId:2,name:'기획',order:0},{id:202,modelId:2,name:'설계/개발',order:1},{id:203,modelId:2,name:'검증',order:2},{id:204,modelId:2,name:'양산준비',order:3},{id:205,modelId:2,name:'완료',order:4}],
    3:[{id:301,modelId:3,name:'기획',order:0},{id:302,modelId:3,name:'설계/개발',order:1},{id:303,modelId:3,name:'검증',order:2},{id:304,modelId:3,name:'양산준비',order:3},{id:305,modelId:3,name:'완료',order:4}],
    4:[{id:401,modelId:4,name:'기획',order:0},{id:402,modelId:4,name:'설계/개발',order:1},{id:403,modelId:4,name:'검증',order:2},{id:404,modelId:4,name:'양산준비',order:3},{id:405,modelId:4,name:'완료',order:4}],
    5:[{id:501,modelId:5,name:'기획',order:0},{id:502,modelId:5,name:'설계/개발',order:1},{id:503,modelId:5,name:'검증',order:2},{id:504,modelId:5,name:'양산준비',order:3},{id:505,modelId:5,name:'완료',order:4}],
    6:[{id:601,modelId:6,name:'기획',order:0},{id:602,modelId:6,name:'설계/개발',order:1},{id:603,modelId:6,name:'검증',order:2},{id:604,modelId:6,name:'양산준비',order:3},{id:605,modelId:6,name:'완료',order:4}],
  },
  milestones: {1:[],2:[],3:[],4:[],5:[],6:[]},
  checklists: {1:[],2:[],3:[],4:[],5:[],6:[]},
  claims:     {1:[],2:[],3:[],4:[],5:[],6:[]},
  memos: {1:'',2:'',3:'',4:'',5:'',6:''},
  schedules: [],
  nextId: 10000,
});

let DB;
function loadLocal() {
  try {
    if (fs.existsSync(DB_FILE)) {
      DB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      console.log(`[DB] Loaded from ${DB_FILE}`);
      return true;
    } else if (DB_FILE !== DEFAULT_DB_FILE && fs.existsSync(DEFAULT_DB_FILE)) {
      const seed = fs.readFileSync(DEFAULT_DB_FILE, 'utf8');
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DB_FILE, seed, 'utf8');
      DB = JSON.parse(seed);
      console.log(`[DB] Seeded from ${DEFAULT_DB_FILE} → ${DB_FILE}`);
      return true;
    }
  } catch (e) {
    console.error('DB 로컬 로드 오류:', e);
  }
  return false;
}

// (load는 loadLocal + restoreFromGist 조합으로 대체됨)
let _lastSaveLog = 0;
let _pgSaveTimer = null;
function schedulePgSave() {
  if (!pgPool) return;
  if (_pgSaveTimer) clearTimeout(_pgSaveTimer);
  _pgSaveTimer = setTimeout(async () => {
    try {
      await pgSave(DB);
      const now = Date.now();
      if (now - _lastSaveLog > 60000) {
        console.log(`[PG] ✓ saved to Postgres @ ${new Date().toISOString()}`);
        _lastSaveLog = now;
      }
    } catch (e) {
      console.error('[PG] save failed:', e.message);
    }
  }, 1500); // 1.5초 디바운스 — 연속 변경 합쳐서 1회 write
}

function save() {
  try {
    // 1) 로컬 파일에도 항상 기록 (디버깅·로컬 폴백용)
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2), 'utf8');
    // 2) Postgres에 영구 저장 (Railway 영구 보존의 핵심)
    schedulePgSave();
    // 3) Gist 백업 (있을 때만)
    scheduleGistBackup();
  } catch (e) {
    console.error('DB 저장 오류:', e);
  }
}

// ════════════════════════════════════════════════════════════
//  GitHub Gist 자동 백업 (Railway Volume 없이도 영구 보존)
//  필요한 환경변수:
//    GIST_ID       : 비공개 Gist의 ID
//    GITHUB_TOKEN  : repo/gist 권한 있는 Personal Access Token
//    (선택) GIST_FILENAME : 기본값 data.json
// ════════════════════════════════════════════════════════════
const GIST_ID       = process.env.GIST_ID || '';
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN || '';
const GIST_FILENAME = process.env.GIST_FILENAME || 'data.json';
const GIST_ENABLED  = !!(GIST_ID && GITHUB_TOKEN);

let _gistTimer = null;
let _gistInFlight = false;
let _gistPending = false;
const GIST_DEBOUNCE_MS = 30 * 1000; // 30초

function scheduleGistBackup() {
  if (!GIST_ENABLED) return;
  if (_gistTimer) clearTimeout(_gistTimer);
  _gistTimer = setTimeout(runGistBackup, GIST_DEBOUNCE_MS);
}

async function runGistBackup() {
  if (!GIST_ENABLED) return;
  if (_gistInFlight) { _gistPending = true; return; }
  _gistInFlight = true;
  try {
    const content = JSON.stringify(DB, null, 2);
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'intops-fms-tracker',
      },
      body: JSON.stringify({ files: { [GIST_FILENAME]: { content } } }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error(`[Gist] backup failed ${res.status}: ${txt.slice(0,200)}`);
    } else {
      console.log(`[Gist] ✓ backup uploaded (${(content.length/1024).toFixed(1)}KB) @ ${new Date().toISOString()}`);
    }
  } catch (e) {
    console.error('[Gist] backup error:', e.message);
  } finally {
    _gistInFlight = false;
    if (_gistPending) { _gistPending = false; scheduleGistBackup(); }
  }
}

async function restoreFromGist() {
  if (!GIST_ENABLED) return null;
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'intops-fms-tracker',
      },
    });
    if (!res.ok) {
      console.error(`[Gist] restore HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    const file = json.files && json.files[GIST_FILENAME];
    if (!file) { console.warn(`[Gist] file ${GIST_FILENAME} not found in gist`); return null; }
    let content = file.content;
    // truncated 처리 (>1MB)
    if (file.truncated && file.raw_url) {
      const r2 = await fetch(file.raw_url, { headers: { 'User-Agent': 'intops-fms-tracker' } });
      content = await r2.text();
    }
    return JSON.parse(content);
  } catch (e) {
    console.error('[Gist] restore error:', e.message);
    return null;
  }
}
const nextId = () => { DB.nextId = (DB.nextId||10000)+1; return DB.nextId; };

// 초기 부팅: 일단 로컬로 채우고, 비동기로 Postgres/Gist에서 최신본 덮어씀
loadLocal() || (DB = defaultDB());

// ── Migration: 기존 data.json 호환 + 모니터링 항목 추가 ──────
function migrate() {
  let changed = false;

  // 1) 기존 모델에 category 없으면 'model'로 설정
  (DB.models || []).forEach(m => {
    if (!m.category) { m.category = 'model'; changed = true; }
  });

  // 2) 상시 모니터링 3개 항목 - 없으면 추가
  const monitoringDefaults = [
    { name: '치수 측정 의뢰 현황 및 진행사항', color: '#0EA5E9' },
    { name: '신뢰성 시험 의뢰 및 진행 사항',    color: '#06B6D4' },
    { name: '환경 유해물질 관련 진행사항',      color: '#3B82F6' },
  ];
  const monitoringPhases = ['의뢰 접수', '진행 중', '결과 확인', '조치/회신', '완료'];

  monitoringDefaults.forEach((mon, idx) => {
    const exists = (DB.models||[]).some(m => m.name === mon.name);
    if (exists) return;
    const id = nextId();
    DB.models.push({
      id, name: mon.name, color: mon.color,
      order: idx, category: 'monitoring',
    });
    DB.subItems[id]   = monitoringPhases.map((p,i) => ({
      id: nextId(), modelId: id, name: p, order: i,
    }));
    DB.milestones[id] = [];
    DB.checklists[id] = [];
    DB.claims[id]     = [];
    DB.memos[id]      = '';
    changed = true;
  });

  // 3) schedules 배열 초기화
  if (!Array.isArray(DB.schedules)) { DB.schedules = []; changed = true; }

  // 5) files 컬렉션 초기화
  if (!DB.files) { DB.files = {}; changed = true; }

  // 6) 인증심사 / AUDIT 하위 모델 자동 생성
  // 7) SEC 외관 한도 컨펌 현황 > LIST 하위 모델 자동 생성
  const secListDefaults = [
    { name: 'Q8 CAM DECO',   color: '#F59E0B', category: 'sec_list' },
    { name: 'Q8 FRONT DECO', color: '#EF4444', category: 'sec_list' },
  ];
  secListDefaults.forEach((def, idx) => {
    const exists = (DB.models||[]).some(m => m.name === def.name);
    if (exists) return;
    const id = nextId();
    DB.models.push({ id, name: def.name, color: def.color, order: idx, category: def.category });
    DB.subItems[id]   = [];
    DB.milestones[id] = [];
    DB.checklists[id] = [];
    DB.claims[id]     = [];
    DB.memos[id]      = '';
    DB.files[id]      = [];
    changed = true;
  });

  const auditDefaults = [
    // audit_cert — 인증심사 일정
    {
      name: 'ISO13485 (INTOPS : 6/15~19)', color: '#14B8A6', category: 'audit_cert',
      milestones: [{ title: 'ISO13485 인증심사', description: 'INTOPS', dueDate: '2026-06-15', dueDateEnd: '2026-06-19', status: 'pending' }],
    },
    {
      name: 'ISO13485 (OBM : 7/24~7/27)', color: '#0EA5E9', category: 'audit_cert',
      milestones: [{ title: 'ISO13485 인증심사', description: 'OBM', dueDate: '2026-07-24', dueDateEnd: '2026-07-27', status: 'pending' }],
    },
    // audit_process — AUDIT 일정
    {
      name: '용산 JG1 공정감사 (6/2)', color: '#F59E0B', category: 'audit_process',
      milestones: [{ title: '용산 JG1 공정감사', dueDate: '2026-06-02', status: 'pending' }],
    },
  ];
  auditDefaults.forEach((def, idx) => {
    const exists = (DB.models||[]).some(m => m.name === def.name);
    if (exists) return;
    const id = nextId();
    DB.models.push({ id, name: def.name, color: def.color, order: idx, category: def.category });
    DB.subItems[id]   = [];
    DB.milestones[id] = (def.milestones || []).map(ms => ({
      id: nextId(),
      author: null,
      title: ms.title,
      description: ms.description || '',
      note: '',
      subItemId: null,
      dueDate: ms.dueDate || null,
      dueDateEnd: ms.dueDateEnd || null,
      status: ms.status || 'pending',
    }));
    DB.checklists[id] = [];
    DB.claims[id]     = [];
    DB.memos[id]      = '';
    changed = true;
  });

  // 4) '일정 점검' 이름을 포함한 모델 → category를 'schedule'로 강제 변환
  (DB.models || []).forEach(m => {
    if (m.category !== 'schedule' && m.name && m.name.replace(/\s/g,'').includes('일정점검')) {
      m.category = 'schedule';
      changed = true;
      console.log(`[migrate] ${m.name} → category: schedule`);
    }
  });

  if (changed) save();
}
migrate();

// ── 중복 정리: 키워드로 매칭되는 모델은 1개만 남기고 monitoring으로 통합 ──
function cleanupDuplicates() {
  const keywords = [
    { kw: ['치수', '측정'],  canonical: '치수 측정 의뢰 현황 및 진행사항', color: '#0EA5E9' },
    { kw: ['신뢰성', '시험'], canonical: '신뢰성 시험 의뢰 및 진행 사항',    color: '#06B6D4' },
    { kw: ['환경', '유해'],  canonical: '환경 유해물질 관련 진행사항',     color: '#3B82F6' },
  ];

  // 데이터 양 (데이터가 많은 것을 우선 보존)
  const dataSize = (m) =>
    (DB.milestones[m.id]?.length || 0) +
    (DB.checklists[m.id]?.length || 0) +
    ((DB.memos[m.id] || '').length);

  let changed = false;
  keywords.forEach(({ kw, canonical, color }, idx) => {
    const matches = (DB.models || []).filter(m => kw.every(k => m.name.includes(k)));
    if (matches.length === 0) return;

    matches.sort((a, b) => dataSize(b) - dataSize(a));
    const keep = matches[0];
    const remove = matches.slice(1);

    // 유지할 항목 정규화
    if (keep.name !== canonical || keep.category !== 'monitoring' ||
        keep.color !== color    || keep.order !== idx) {
      keep.name     = canonical;
      keep.category = 'monitoring';
      keep.color    = color;
      keep.order    = idx;
      changed = true;
    }

    // 나머지 제거
    remove.forEach(m => {
      DB.models = DB.models.filter(x => x.id !== m.id);
      delete DB.subItems[m.id];
      delete DB.milestones[m.id];
      delete DB.checklists[m.id];
      delete DB.claims[m.id];
      delete DB.memos[m.id];
      changed = true;
    });
  });

  // model 카테고리 항목들의 order 재정렬 (구멍 메우기)
  const models = (DB.models || []).filter(m => m.category === 'model').sort((a,b)=>a.order-b.order);
  models.forEach((m, i) => { if (m.order !== i) { m.order = i; changed = true; } });

  if (changed) save();
}
cleanupDuplicates();

// ── claims 키 자동 생성 (모델별 빈 배열 보장) ──
(function ensureClaims(){
  if (!DB.claims) DB.claims = {};
  let changed = false;
  (DB.models||[]).forEach(m => {
    if (!Array.isArray(DB.claims[m.id])) { DB.claims[m.id] = []; changed = true; }
  });
  if (changed) save();
})();

// ── comments 키 자동 생성 (`${type}_${itemId}` => 배열) ──
(function ensureComments(){
  if (!DB.comments) { DB.comments = {}; save(); }
})();

// ── 대시보드 공용 메모장 ─────────────────────────────────────
(function ensureDashboardMemo(){
  if (typeof DB.dashboardMemo === 'undefined') {
    DB.dashboardMemo = '';
    DB.dashboardMemoUpdatedAt = null;
    DB.dashboardMemoUpdatedBy = null;
    save();
  }
})();

// ══════════════════════════════════════════════════════════
// 인증/사용자 관리 (Authentication)
// ══════════════════════════════════════════════════════════

function hashPw(pw, salt) {
  return crypto.scryptSync(pw, salt, 64).toString('hex');
}

function bootstrapAdmin() {
  if (!DB.users)    DB.users = [];
  if (!DB.sessions) DB.sessions = [];
  if (DB.users.some(u => u.role === 'admin')) return;
  const salt = crypto.randomBytes(16).toString('hex');
  DB.users.push({
    id: nextId(),
    email: 'admin@intops.com',
    name: '관리자',
    dept: 'INTOPS',
    phone: '',
    password_hash: hashPw('admin1234', salt),
    salt,
    role: 'admin',
    status: 'approved',
    created_at: new Date().toISOString(),
    last_login: null,
  });
  save();
  console.log('\n┌──────────────────────────────────────────────┐');
  console.log('│  🔐 초기 관리자 계정 생성됨                  │');
  console.log('│  Email   : admin@intops.com                  │');
  console.log('│  Password: admin1234                         │');
  console.log('│  ⚠ 첫 로그인 후 비밀번호를 변경하세요         │');
  console.log('└──────────────────────────────────────────────┘');
}
bootstrapAdmin();

// ── Middleware (인증/API 라우트 정의 전에 반드시 등록) ──────
app.use(express.json({ limit: '5mb' }));

// JSON 파싱 오류 처리 (malformed body → 400, 프로세스 종료 없음)
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '잘못된 요청 형식입니다' });
  }
  next(err);
});

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false, maxAge: 0 }));

// ── 안전한 라우트 래퍼: 어떤 에러도 next(err)로 전달 ──────────
function sr(fn) {
  return (req, res, next) => {
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === 'function') {
        result.catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
}

// 쿠키 파서 (의존성 없는 경량 구현)
function parseCookies(req) {
  const list = {};
  const h = req.headers.cookie;
  if (!h) return list;
  h.split(';').forEach(c => {
    const idx = c.indexOf('=');
    if (idx < 0) return;
    list[c.slice(0,idx).trim()] = decodeURIComponent(c.slice(idx+1).trim());
  });
  return list;
}
function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie',
    `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7*24*60*60}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function cleanupSessions() {
  const now = Date.now();
  DB.sessions = (DB.sessions||[]).filter(s => new Date(s.expires_at).getTime() > now);
}

// ── 로그인 제거됨: 모든 요청에 기본 사용자 자동 부여 ──
app.use((req, res, next) => {
  req.user = { id: 0, name: '관리자', email: 'admin@intops.com', dept: 'INTOPS', role: 'admin' };
  next();
});


// 작성/수정자 메타데이터 헬퍼
const nowISO = () => new Date().toISOString();
const stampCreate = (req) => ({
  created_by:      req.user.id,
  created_by_name: req.user.name,
  created_at:      nowISO(),
  updated_by:      req.user.id,
  updated_by_name: req.user.name,
  updated_at:      nowISO(),
});
const stampUpdate = (req) => ({
  updated_by:      req.user.id,
  updated_by_name: req.user.name,
  updated_at:      nowISO(),
});

app.get('/api/models', (_, res) => {
  res.json([...(DB.models||[])].sort((a,b)=>a.order-b.order));
});

app.post('/api/models', (req, res) => {
  const { name, color = '#3B82F6', category = 'model' } = req.body;
  if (!DB.models) DB.models = [];
  const maxO = DB.models.filter(x=>x.category===category).reduce((m,x)=>Math.max(m,x.order??0),-1);
  const id = nextId();
  DB.models.push({ id, name, color, order: maxO+1, category, ...stampCreate(req) });
  DB.subItems[id] = [
    {id:nextId(),modelId:id,name:'기획',order:0},
    {id:nextId(),modelId:id,name:'설계/개발',order:1},
    {id:nextId(),modelId:id,name:'검증',order:2},
    {id:nextId(),modelId:id,name:'양산준비',order:3},
    {id:nextId(),modelId:id,name:'완료',order:4},
  ];
  DB.milestones[id] = [];
  DB.checklists[id] = [];
  DB.claims[id]     = [];
  DB.memos[id] = '';
  save();
  res.json(DB.models.find(x=>x.id===id));
});

app.put('/api/models/:id', (req, res) => {
  const id = Number(req.params.id);
  const idx = DB.models.findIndex(x=>x.id===id);
  if (idx < 0) return res.status(404).json({error:'not found'});
  DB.models[idx] = {
    ...DB.models[idx],
    name: req.body.name,
    color: req.body.color,
    ...(req.body.category ? { category: req.body.category } : {}),
    ...stampUpdate(req),
  };
  save();
  res.json(DB.models[idx]);
});

app.delete('/api/models/:id', (req, res) => {
  const id = Number(req.params.id);
  DB.models = (DB.models||[]).filter(x=>x.id!==id);
  delete DB.subItems[id];
  delete DB.milestones[id];
  delete DB.checklists[id];
  delete DB.claims[id];
  delete DB.memos[id];
  save();
  res.json({ok:true});
});

// 모델 순서 변경 (같은 카테고리 내에서만)
app.post('/api/models/reorder', (req, res) => {
  const { category, ids } = req.body;
  if (!category || !Array.isArray(ids))
    return res.status(400).json({ error: 'invalid request' });
  ids.forEach((rawId, idx) => {
    const id = Number(rawId);
    const m = (DB.models||[]).find(x => x.id === id && x.category === category);
    if (m) m.order = idx;
  });
  save();
  res.json({ ok: true });
});

// ── Sub-items ───────────────────────────────────────────────
app.get('/api/models/:id/sub-items', (req, res) => {
  const id = Number(req.params.id);
  res.json([...(DB.subItems[id]||[])].sort((a,b)=>a.order-b.order));
});

app.post('/api/models/:id/sub-items', (req, res) => {
  const id = Number(req.params.id);
  if (!DB.subItems[id]) DB.subItems[id] = [];
  const maxO = (DB.subItems[id]||[]).reduce((m,x)=>Math.max(m,x.order??0),-1);
  const sub = { id:nextId(), modelId:id, name:req.body.name, order:maxO+1 };
  DB.subItems[id].push(sub);
  save();
  res.json(sub);
});

app.put('/api/sub-items/:id', (req, res) => {
  const id = Number(req.params.id);
  for (const mid in DB.subItems) {
    const idx = DB.subItems[mid].findIndex(x=>x.id===id);
    if (idx >= 0) {
      DB.subItems[mid][idx].name = req.body.name;
      save();
      return res.json(DB.subItems[mid][idx]);
    }
  }
  res.status(404).json({error:'not found'});
});

app.delete('/api/sub-items/:id', (req, res) => {
  const id = Number(req.params.id);
  for (const mid in DB.subItems) {
    DB.subItems[mid] = DB.subItems[mid].filter(x=>x.id!==id);
  }
  save();
  res.json({ok:true});
});

// 순서 변경: body.ids = [새 순서대로의 sub-item ID 배열]
app.post('/api/models/:id/sub-items/reorder', (req, res) => {
  const id  = Number(req.params.id);
  const ids = (req.body.ids || []).map(Number);
  if (!DB.subItems[id]) return res.status(404).json({error:'not found'});
  ids.forEach((subId, idx) => {
    const sub = DB.subItems[id].find(x => x.id === subId);
    if (sub) sub.order = idx;
  });
  DB.subItems[id].sort((a,b)=>a.order-b.order);
  save();
  res.json(DB.subItems[id]);
});

// ── Milestones ──────────────────────────────────────────────
app.get('/api/models/:id/milestones', (req, res) => {
  const id = Number(req.params.id);
  const subs = DB.subItems[id]||[];
  const items = (DB.milestones[id]||[]).map(it => ({
    id: it.id,
    author: it.author || null,
    title: it.title,
    description: it.description,
    note: it.note || '',
    sub_item_id: it.subItemId,
    due_date: it.dueDate,
    due_date_end: it.dueDateEnd || null,
    date_type: it.dueDateEnd ? 'range' : 'single',
    status: it.status,
    sub_item_name: subs.find(s=>s.id===Number(it.subItemId))?.name || null,
    request_count: it.requestCount ?? null,
    ok_count:      it.okCount      ?? null,
    ng_count:      it.ngCount      ?? null,
  })).sort((a,b)=>{
    if(!a.due_date) return 1;
    if(!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });
  res.json(items);
});

app.post('/api/models/:id/milestones', (req, res) => {
  const id = Number(req.params.id);
  if (!DB.milestones[id]) DB.milestones[id] = [];
  const item = {
    id: nextId(),
    author: req.body.author || null,
    title: req.body.title,
    description: req.body.description || '',
    note: req.body.note || '',
    subItemId: req.body.sub_item_id ? Number(req.body.sub_item_id) : null,
    dueDate: req.body.due_date || null,
    dueDateEnd: req.body.due_date_end || null,
    status: req.body.status || 'pending',
    requestCount: req.body.request_count != null ? Number(req.body.request_count) : null,
    okCount:      req.body.ok_count      != null ? Number(req.body.ok_count)      : null,
    ngCount:      req.body.ng_count      != null ? Number(req.body.ng_count)      : null,
  };
  DB.milestones[id].push(item);
  save();
  res.json(item);
});

app.put('/api/milestones/:id', (req, res) => {
  const id = Number(req.params.id);
  for (const mid in DB.milestones) {
    const idx = DB.milestones[mid].findIndex(x=>x.id===id);
    if (idx >= 0) {
      const cur = DB.milestones[mid][idx];
      DB.milestones[mid][idx] = {
        ...cur,
        author: req.body.author !== undefined ? req.body.author : cur.author,
        title: req.body.title,
        description: req.body.description || '',
        note: req.body.note || '',
        subItemId: req.body.sub_item_id ? Number(req.body.sub_item_id) : null,
        dueDate: req.body.due_date || null,
        dueDateEnd: req.body.due_date_end || null,
        status: req.body.status,
        requestCount: req.body.request_count != null ? Number(req.body.request_count) : (cur.requestCount ?? null),
        okCount:      req.body.ok_count      != null ? Number(req.body.ok_count)      : (cur.okCount      ?? null),
        ngCount:      req.body.ng_count      != null ? Number(req.body.ng_count)      : (cur.ngCount      ?? null),
      };
      save();
      return res.json(DB.milestones[mid][idx]);
    }
  }
  res.status(404).json({error:'not found'});
});

app.delete('/api/milestones/:id', (req, res) => {
  const id = Number(req.params.id);
  for (const mid in DB.milestones) {
    DB.milestones[mid] = DB.milestones[mid].filter(x=>x.id!==id);
  }
  save();
  res.json({ok:true});
});

// ── Checklist (테이블형: NO/대제목/세부진행/목표일/상태/비고) ─
app.get('/api/models/:id/checklist', (req, res) => {
  const id = Number(req.params.id);
  const items = (DB.checklists[id]||[]).map((it, idx) => ({
    id:           it.id,
    no:           idx + 1,
    author:       it.author || null,
    title:        it.title || '',
    detail:       it.detail || '',
    due_date:     it.dueDate || null,
    due_date_end: it.dueDateEnd || null,
    status:       it.status || 'pending',
    note:         it.note || '',
    checked:      it.status === 'completed' ? 1 : 0,  // 호환
    order:        it.order ?? idx,
  })).sort((a,b)=>a.order-b.order);
  res.json(items);
});

app.post('/api/models/:id/checklist', (req, res) => {
  const id = Number(req.params.id);
  if (!DB.checklists[id]) DB.checklists[id] = [];
  const maxO = (DB.checklists[id]||[]).reduce((m,x)=>Math.max(m,x.order??0),-1);
  const item = {
    id: nextId(),
    author:     req.body.author       || null,
    title:      req.body.title        || '',
    detail:     req.body.detail       || '',
    dueDate:    req.body.due_date     || null,
    dueDateEnd: req.body.due_date_end || null,
    status:     req.body.status       || 'pending',
    note:       req.body.note         || '',
    order:      maxO + 1,
  };
  DB.checklists[id].push(item);
  save();
  res.json(item);
});

app.put('/api/checklist/:id', (req, res) => {
  const id = Number(req.params.id);
  for (const mid in DB.checklists) {
    const idx = DB.checklists[mid].findIndex(x=>x.id===id);
    if (idx >= 0) {
      const cur = DB.checklists[mid][idx];
      DB.checklists[mid][idx] = {
        ...cur,
        author:     req.body.author       !== undefined ? req.body.author       : cur.author,
        title:      req.body.title        !== undefined ? req.body.title        : cur.title,
        detail:     req.body.detail       !== undefined ? req.body.detail       : cur.detail,
        dueDate:    req.body.due_date     !== undefined ? req.body.due_date     : cur.dueDate,
        dueDateEnd: req.body.due_date_end !== undefined ? req.body.due_date_end : cur.dueDateEnd,
        status:     req.body.status       !== undefined ? req.body.status       : cur.status,
        note:       req.body.note         !== undefined ? req.body.note         : cur.note,
      };
      save();
      return res.json(DB.checklists[mid][idx]);
    }
  }
  res.status(404).json({error:'not found'});
});

app.delete('/api/checklist/:id', (req, res) => {
  const id = Number(req.params.id);
  for (const mid in DB.checklists) {
    DB.checklists[mid] = DB.checklists[mid].filter(x=>x.id!==id);
  }
  save();
  res.json({ok:true});
});

// ── Claims (고객 Claim 현황) ─────────────────────────────────
app.get('/api/models/:id/claims', (req, res) => {
  const id = Number(req.params.id);
  const today = new Date().toISOString().slice(0,10);
  let dirty = false;

  // 개선일정 종료일이 지났고 완료 아닌 항목 → 자동 지연 분류
  (DB.claims[id]||[]).forEach(it => {
    const impEnd = it.improvementEnd || null;
    if (impEnd && impEnd < today && it.status !== 'completed' && it.status !== 'delayed') {
      it.status = 'delayed';
      dirty = true;
    }
  });
  if (dirty) save();

  const items = (DB.claims[id]||[]).map((it, idx) => ({
    id:                  it.id,
    no:                  idx + 1,
    author:              it.author            || null,
    customer:            it.customer          || '',
    content:             it.content           || '',
    occurred_date:       it.occurredDate      || null,
    occurred_date_end:   it.occurredDateEnd   || null,
    action:              it.action            || '',
    improvement_start:   it.improvementStart  || null,
    improvement_end:     it.improvementEnd    || null,
    status:              it.status            || 'pending',
    note:                it.note              || '',
    order:               it.order             ?? idx,
  })).sort((a,b)=>a.order-b.order);
  res.json(items);
});

app.post('/api/models/:id/claims', (req, res) => {
  const id = Number(req.params.id);
  if (!DB.claims[id]) DB.claims[id] = [];
  const maxO = (DB.claims[id]||[]).reduce((m,x)=>Math.max(m,x.order??0),-1);
  const item = {
    id: nextId(),
    author:           req.body.author             || null,
    customer:         req.body.customer           || '',
    content:          req.body.content            || '',
    occurredDate:     req.body.occurred_date      || null,
    occurredDateEnd:  req.body.occurred_date_end  || null,
    action:           req.body.action             || '',
    improvementStart: req.body.improvement_start  || null,
    improvementEnd:   req.body.improvement_end    || null,
    status:           req.body.status             || 'pending',
    note:             req.body.note               || '',
    order:            maxO + 1,
    ...stampCreate(req),
  };
  DB.claims[id].push(item);
  save();
  res.json(item);
});

app.put('/api/claims/:id', (req, res) => {
  const id = Number(req.params.id);
  for (const mid in DB.claims) {
    const idx = DB.claims[mid].findIndex(x=>x.id===id);
    if (idx >= 0) {
      const cur = DB.claims[mid][idx];
      DB.claims[mid][idx] = {
        ...cur,
        author:           req.body.author             !== undefined ? req.body.author             : cur.author,
        customer:         req.body.customer           !== undefined ? req.body.customer           : cur.customer,
        content:          req.body.content            !== undefined ? req.body.content            : cur.content,
        occurredDate:     req.body.occurred_date      !== undefined ? req.body.occurred_date      : cur.occurredDate,
        occurredDateEnd:  req.body.occurred_date_end  !== undefined ? req.body.occurred_date_end  : cur.occurredDateEnd,
        action:           req.body.action             !== undefined ? req.body.action             : cur.action,
        improvementStart: req.body.improvement_start  !== undefined ? req.body.improvement_start  : cur.improvementStart,
        improvementEnd:   req.body.improvement_end    !== undefined ? req.body.improvement_end    : cur.improvementEnd,
        status:           req.body.status             !== undefined ? req.body.status             : cur.status,
        note:             req.body.note               !== undefined ? req.body.note               : cur.note,
        ...stampUpdate(req),
      };
      save();
      return res.json(DB.claims[mid][idx]);
    }
  }
  res.status(404).json({error:'not found'});
});

app.delete('/api/claims/:id', (req, res) => {
  const id = Number(req.params.id);
  for (const mid in DB.claims) {
    DB.claims[mid] = DB.claims[mid].filter(x=>x.id!==id);
  }
  save();
  res.json({ok:true});
});

// ── Comments (댓글) ──────────────────────────────────────────
// 키: `${type}_${itemId}` (예: "milestone_10042")
const ALLOWED_COMMENT_TYPES = ['milestone', 'checklist', 'claim', 'dpost'];

app.get('/api/comments/:type/:itemId', (req, res) => {
  const type = req.params.type;
  if (!ALLOWED_COMMENT_TYPES.includes(type)) return res.status(400).json({error:'invalid type'});
  const key = `${type}_${req.params.itemId}`;
  res.json((DB.comments[key] || []).slice().sort((a,b) => (a.created_at||'').localeCompare(b.created_at||'')));
});

app.post('/api/comments/:type/:itemId', (req, res) => {
  const type = req.params.type;
  if (!ALLOWED_COMMENT_TYPES.includes(type)) return res.status(400).json({error:'invalid type'});
  const key = `${type}_${req.params.itemId}`;
  const author = (req.body.author || '').trim();
  const content = (req.body.content || '').trim();
  if (!author)  return res.status(400).json({error:'작성자 이름이 필요합니다'});
  if (!content) return res.status(400).json({error:'내용을 입력해주세요'});
  if (!DB.comments[key]) DB.comments[key] = [];
  const comment = {
    id: nextId(),
    type,
    item_id: Number(req.params.itemId),
    parent_comment_id: req.body.parent_comment_id ? Number(req.body.parent_comment_id) : null,
    author,
    content,
    created_at: nowISO(),
  };
  DB.comments[key].push(comment);
  save();
  res.json(comment);
});

app.put('/api/comments/:id', (req, res) => {
  const id = Number(req.params.id);
  for (const key in DB.comments) {
    const idx = DB.comments[key].findIndex(c => c.id === id);
    if (idx >= 0) {
      const cur = DB.comments[key][idx];
      DB.comments[key][idx] = {
        ...cur,
        content: req.body.content ?? cur.content,
        updated_at: nowISO(),
      };
      save();
      return res.json(DB.comments[key][idx]);
    }
  }
  res.status(404).json({error:'not found'});
});

app.delete('/api/comments/:id', (req, res) => {
  const id = Number(req.params.id);
  let removed = false;
  for (const key in DB.comments) {
    const before = DB.comments[key].length;
    DB.comments[key] = DB.comments[key].filter(c => c.id !== id);
    if (DB.comments[key].length < before) removed = true;
  }
  if (removed) save();
  res.json({ ok: removed });
});

// 항목별 댓글 전체 일괄 조회 (인라인 노출용)
app.post('/api/comments/batch', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({error:'items array required'});
  const out = {};
  items.forEach(({ type, id }) => {
    if (!ALLOWED_COMMENT_TYPES.includes(type)) return;
    const key = `${type}_${id}`;
    out[key] = (DB.comments[key] || [])
      .slice()
      .sort((a,b) => (a.created_at||'').localeCompare(b.created_at||''));
  });
  res.json(out);
});

// 항목별 댓글 개수 일괄 조회 (성능)
app.post('/api/comments/counts', (req, res) => {
  const { items } = req.body; // [{type, id}, ...]
  if (!Array.isArray(items)) return res.status(400).json({error:'items array required'});
  const counts = {};
  items.forEach(({ type, id }) => {
    if (!ALLOWED_COMMENT_TYPES.includes(type)) return;
    const key = `${type}_${id}`;
    counts[key] = (DB.comments[key] || []).length;
  });
  res.json(counts);
});

// ── 대시보드 공용 메모장 ─────────────────────────────────────
app.get('/api/dashboard-memo', (_, res) => {
  res.json({
    content:    DB.dashboardMemo || '',
    updated_at: DB.dashboardMemoUpdatedAt || null,
    updated_by: DB.dashboardMemoUpdatedBy || null,
  });
});

app.put('/api/dashboard-memo', (req, res) => {
  DB.dashboardMemo = req.body.content || '';
  DB.dashboardMemoUpdatedAt = nowISO();
  DB.dashboardMemoUpdatedBy = req.user?.name || '관리자';
  save();
  res.json({ ok: true, updated_at: DB.dashboardMemoUpdatedAt, updated_by: DB.dashboardMemoUpdatedBy });
});

// ── 대시보드 게시글 (메모장 - 글 + 댓글 + 대댓글) ─────────────
(function ensureDashboardPosts(){
  if (!Array.isArray(DB.dashboardPosts)) {
    DB.dashboardPosts = [];
    save();
  }
})();

app.get('/api/dashboard-posts', (_, res) => {
  // 최신순 정렬
  const posts = (DB.dashboardPosts || []).slice().sort((a,b) => (b.created_at||'').localeCompare(a.created_at||''));
  res.json(posts);
});

app.post('/api/dashboard-posts', (req, res) => {
  const author  = (req.body.author || '').trim();
  const content = (req.body.content || '').trim();
  if (!author)  return res.status(400).json({error:'작성자 이름이 필요합니다'});
  if (!content) return res.status(400).json({error:'내용을 입력해주세요'});
  if (!Array.isArray(DB.dashboardPosts)) DB.dashboardPosts = [];
  const post = {
    id: nextId(),
    author,
    content,
    created_at: nowISO(),
  };
  DB.dashboardPosts.push(post);
  save();
  res.json(post);
});

app.put('/api/dashboard-posts/:id', (req, res) => {
  const id = Number(req.params.id);
  const idx = (DB.dashboardPosts || []).findIndex(p => p.id === id);
  if (idx < 0) return res.status(404).json({error:'not found'});
  const cur = DB.dashboardPosts[idx];
  DB.dashboardPosts[idx] = {
    ...cur,
    content: (req.body.content || '').trim() || cur.content,
    updated_at: nowISO(),
  };
  save();
  res.json(DB.dashboardPosts[idx]);
});

app.delete('/api/dashboard-posts/:id', (req, res) => {
  const id = Number(req.params.id);
  DB.dashboardPosts = (DB.dashboardPosts || []).filter(p => p.id !== id);
  // 연관 댓글도 삭제
  if (DB.comments) delete DB.comments[`dpost_${id}`];
  save();
  res.json({ ok: true });
});

// ── Memo ────────────────────────────────────────────────────
app.get('/api/models/:id/memo', (req, res) => {
  const id = Number(req.params.id);
  res.json({ content: DB.memos[id] || '', updated_at: DB.memoUpdatedAt?.[id] || null });
});

app.put('/api/models/:id/memo', (req, res) => {
  const id = Number(req.params.id);
  if (!DB.memos) DB.memos = {};
  if (!DB.memoUpdatedAt) DB.memoUpdatedAt = {};
  DB.memos[id] = req.body.content || '';
  DB.memoUpdatedAt[id] = new Date().toISOString();
  save();
  res.json({ok:true});
});

// ── Dashboard ───────────────────────────────────────────────
app.get('/api/dashboard', (_, res) => {
  const today = new Date().toISOString().slice(0,10);

  // 지연 판정: status가 명시적으로 'delayed' 거나, 목표일 지났는데 완료 안 된 경우
  const isDelayed = (it) => {
    if (it.status === 'delayed') return true;
    if (it.status === 'completed') return false;
    const cmpDate = it.dueDateEnd || it.dueDate;
    return !!(cmpDate && cmpDate < today);
  };
  const isDone = (it) => it.status === 'completed' || it.checked === true || it.checked === 1;

  // 클레임 지연: occurredDate가 지나도 완료 안 되었으면 지연
  const isClaimDelayed = (it) => {
    if (it.status === 'delayed') return true;
    if (it.status === 'completed') return false;
    return !!(it.occurredDate && it.occurredDate < today);
  };

  // 이달 일정 수 계산
  const nowY = new Date().getFullYear();
  const nowM = new Date().getMonth(); // 0-based
  const schedThisMonth = (DB.schedules || []).filter(s => {
    if (!s.startAt) return false;
    const d = new Date(s.startAt);
    return d.getFullYear() === nowY && d.getMonth() === nowM;
  }).length;
  const schedTotal = (DB.schedules || []).length;

  const summary = [...(DB.models||[])].sort((a,b)=>a.order-b.order).map(m => {
    const ms = DB.milestones[m.id]||[];
    const cl = DB.checklists[m.id]||[];
    const cm = DB.claims[m.id]||[];
    return {
      ...m,
      milestone_total:    ms.length,
      milestone_done:     ms.filter(isDone).length,
      milestone_delayed:  ms.filter(isDelayed).length,
      milestone_progress: ms.filter(x => x.status === 'in_progress').length,
      checklist_total:    cl.length,
      checklist_done:     cl.filter(isDone).length,
      checklist_delayed:  cl.filter(isDelayed).length,
      claim_total:        cm.length,
      claim_done:         cm.filter(isDone).length,
      claim_delayed:      cm.filter(isClaimDelayed).length,
      claim_open:         cm.filter(x => x.status !== 'completed').length,
    };
  });
  res.json({ models: summary, schedThisMonth, schedTotal });
});

// ── 파일 업로드 (Files) ──────────────────────────────────────
app.get('/api/models/:id/files', sr((req, res) => {
  const id = Number(req.params.id);
  if (!DB.files) DB.files = {};
  const list = (DB.files[id] || []).map(f => ({
    id: f.id, name: f.name, size: f.size, type: f.type, uploadedAt: f.uploadedAt,
    // data는 목록에서 제외 (용량 절약)
  }));
  res.json(list);
}));

app.post('/api/models/:id/files', sr((req, res) => {
  const id = Number(req.params.id);
  if (!DB.files) DB.files = {};
  if (!DB.files[id]) DB.files[id] = [];
  const { name, size, type, data } = req.body;
  if (!name || !data) return res.status(400).json({ error: 'name, data required' });
  const item = { id: nextId(), name, size: Number(size)||0, type: type||'', data, uploadedAt: new Date().toISOString() };
  DB.files[id].push(item);
  save();
  res.json({ id: item.id, name: item.name, size: item.size, type: item.type, uploadedAt: item.uploadedAt });
}));

app.get('/api/files/:id', sr((req, res) => {
  const id = Number(req.params.id);
  if (!DB.files) return res.status(404).json({ error: 'not found' });
  for (const mid in DB.files) {
    const f = (DB.files[mid] || []).find(x => x.id === id);
    if (f) {
      const buf = Buffer.from(f.data, 'base64');
      const encodedName = encodeURIComponent(f.name).replace(/'/g, "%27");
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
      res.setHeader('Content-Type', f.type || 'application/octet-stream');
      res.setHeader('Content-Length', buf.length);
      return res.send(buf);
    }
  }
  res.status(404).json({ error: 'not found' });
}));

app.delete('/api/files/:id', sr((req, res) => {
  const id = Number(req.params.id);
  if (!DB.files) return res.status(404).json({ error: 'not found' });
  for (const mid in DB.files) {
    const before = (DB.files[mid]||[]).length;
    DB.files[mid] = (DB.files[mid]||[]).filter(x => x.id !== id);
    if ((DB.files[mid]||[]).length < before) { save(); return res.json({ ok: true }); }
  }
  res.status(404).json({ error: 'not found' });
}));

// ── 주요 일정 점검 (Schedules) ───────────────────────────────
app.get('/api/schedules', (_, res) => {
  const list = (DB.schedules || []).slice().sort((a, b) => (a.startAt || '').localeCompare(b.startAt || ''));
  res.json(list);
});

app.post('/api/schedules', (req, res) => {
  if (!Array.isArray(DB.schedules)) DB.schedules = [];
  const { title, description, startAt, endAt, color, author } = req.body;
  if (!title)   return res.status(400).json({ error: '일정 제목이 필요합니다' });
  if (!startAt) return res.status(400).json({ error: '시작 일시가 필요합니다' });
  if (!endAt)   return res.status(400).json({ error: '종료 일시가 필요합니다' });
  if (endAt <= startAt) return res.status(400).json({ error: '종료 일시는 시작 일시 이후여야 합니다' });

  // 중복 검사 (신규 아이템과 겹치는 일정)
  const conflicts = (DB.schedules || []).filter(s => {
    if (s.startAt >= endAt || s.endAt <= startAt) return false; // no overlap
    return true;
  });

  const item = {
    id:          nextId(),
    title:       title.trim(),
    description: (description || '').trim(),
    startAt,
    endAt,
    color:       color || '#3B82F6',
    author:      (author || '').trim() || null,
    created_at:  nowISO(),
  };
  DB.schedules.push(item);
  save();
  res.json({ item, conflicts });
});

app.put('/api/schedules/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Array.isArray(DB.schedules)) return res.status(404).json({ error: 'not found' });
  const idx = DB.schedules.findIndex(s => s.id === id);
  if (idx < 0) return res.status(404).json({ error: 'not found' });

  const { title, description, startAt, endAt, color, author } = req.body;
  if (endAt && startAt && endAt <= startAt)
    return res.status(400).json({ error: '종료 일시는 시작 일시 이후여야 합니다' });

  const cur = DB.schedules[idx];
  const updated = {
    ...cur,
    title:       (title       ?? cur.title).trim(),
    description: (description ?? cur.description ?? '').trim(),
    startAt:     startAt  ?? cur.startAt,
    endAt:       endAt    ?? cur.endAt,
    color:       color    ?? cur.color,
    author:      author   !== undefined ? ((author||'').trim()||null) : cur.author,
    updated_at:  nowISO(),
  };

  // 중복 검사 (자기 자신 제외)
  const conflicts = DB.schedules.filter(s => {
    if (s.id === id) return false;
    if (s.startAt >= updated.endAt || s.endAt <= updated.startAt) return false;
    return true;
  });

  DB.schedules[idx] = updated;
  save();
  res.json({ item: updated, conflicts });
});

app.delete('/api/schedules/:id', (req, res) => {
  const id = Number(req.params.id);
  DB.schedules = (DB.schedules || []).filter(s => s.id !== id);
  save();
  res.json({ ok: true });
});

// ── Export / Import ─────────────────────────────────────────
app.get('/api/export', (_, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="tracker_${new Date().toISOString().slice(0,10)}.json"`);
  res.json(DB);
});

app.post('/api/import', (req, res) => {
  if (!req.body.models) return res.status(400).json({error:'invalid format'});
  DB = req.body;
  save();
  res.json({ok:true});
});

// ── Start ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

// 부팅 후 비동기 복원: Postgres(최우선) → Gist → 로컬 유지
(async () => {
  try {
    if (PG_ENABLED && pgPool) {
      await pgInit(); // 테이블 없으면 생성
      const fromPg = await pgLoad();
      if (fromPg) {
        DB = fromPg;
        console.log('[PG] ✓ Restored from Postgres (persistent)');
        // 로컬 파일에도 동기화
        try { fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2), 'utf8'); } catch(_) {}
        migrate();
        return; // Postgres 성공 → 끝
      } else {
        // Postgres 테이블은 있지만 데이터 없음 → 로컬 데이터를 PG에 초기 업로드
        console.log('[PG] empty DB, seeding from local...');
        await pgSave(DB);
        console.log('[PG] ✓ local data seeded to Postgres');
        return;
      }
    }
  } catch (e) {
    console.error('[PG] restore error:', e.message);
  }

  // Postgres 없거나 실패 → Gist 시도
  if (GIST_ENABLED) {
    const fromGist = await restoreFromGist();
    if (fromGist) {
      DB = fromGist;
      console.log(`[Gist] ✓ Restored from Gist (post-boot)`);
      try { fs.writeFileSync(DB_FILE, JSON.stringify(DB, null, 2), 'utf8'); } catch(_) {}
      migrate();
    }
  }
})();

// 종료 시 마지막 저장 보장 (디바운스 타이머 즉시 실행)
async function gracefulShutdown(sig) {
  console.log(`\n[shutdown] ${sig} received, flushing data...`);
  if (_pgSaveTimer) { clearTimeout(_pgSaveTimer); _pgSaveTimer = null; }
  if (_gistTimer)   { clearTimeout(_gistTimer);   _gistTimer   = null; }
  if (PG_ENABLED && pgPool) {
    try { await pgSave(DB); console.log('[PG] final save OK'); } catch(e) {}
  }
  if (GIST_ENABLED) {
    try { await runGistBackup(); } catch(e) {}
  }
  process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// ── Express 전역 에러 미들웨어 (반드시 모든 라우트 뒤에 위치) ──
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[API Error]', req.method, req.path, err.message || err);
  if (!res.headersSent) {
    res.status(500).json({ error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n┌──────────────────────────────────────────────┐');
  console.log('│   ✅  INTOPS FMS 품질팀 업무현황 서버 실행 중           │');
  console.log('├──────────────────────────────────────────────┤');
  console.log(`│   이 컴퓨터: http://localhost:${PORT}         │`);

  const ifaces = os.networkInterfaces();
  for (const name in ifaces) {
    for (const i of ifaces[name]) {
      if (i.family === 'IPv4' && !i.internal) {
        console.log(`│   네트워크 : http://${i.address}:${PORT}`.padEnd(47)+'│');
      }
    }
  }
  console.log('├──────────────────────────────────────────────┤');
  console.log('│   종료: Ctrl+C                               │');
  console.log('└──────────────────────────────────────────────┘\n');
});
