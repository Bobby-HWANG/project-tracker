/* ══════════════════════════════════════════════════════════
   INTOPS FMS 품질팀 업무현황  –  app.js
   ══════════════════════════════════════════════════════════ */

// ── 상태 ────────────────────────────────────────────────────
const state = {
  models:      [],
  activeModel: null,   // { id, name, color, ... }
  activeTab:   'milestone',
  view:        'welcome',  // 'welcome' | 'dashboard' | 'model'
  memoTimer:   null,
};

const COLORS = [
  '#3B82F6','#8B5CF6','#10B981','#F59E0B',
  '#EF4444','#14B8A6','#F97316','#EC4899',
  '#6366F1','#84CC16',
];

const STATUS_LABELS = {
  pending:     '대기중',
  in_progress: '진행중',
  completed:   '완료',
  delayed:     '지연',
};
const STATUS_DOT = {
  pending:     '#94a3b8',
  in_progress: '#3b82f6',
  completed:   '#10b981',
  delayed:     '#ef4444',
};

// ── API ──────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
const GET  = path       => api('GET',    path);
const POST = (path, b)  => api('POST',   path, b);
const PUT  = (path, b)  => api('PUT',    path, b);
const DEL  = path       => api('DELETE', path);

// ── Toast ────────────────────────────────────────────────────
function toast(msg, type = '') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>${msg}`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

// ── Modal ────────────────────────────────────────────────────
function openModal(title, bodyHTML, footerHTML) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML   = bodyHTML;
  document.getElementById('modal-footer').innerHTML = footerHTML;
  document.getElementById('modal-backdrop').classList.remove('hidden');
  // 모든 textarea에 OCR 자동 부착
  setTimeout(autoAttachOcrInModal, 0);
}
function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
}

// ── Sidebar ──────────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('model-list');
  list.innerHTML = '';

  const monitoring = state.models.filter(m => m.category === 'monitoring').sort((a,b)=>a.order-b.order);
  const models     = state.models.filter(m => m.category !== 'monitoring').sort((a,b)=>a.order-b.order);

  const isMemo = state.view === 'dashboard' && state._sidebarMemo;

  // 모델 아이템 생성
  const renderItem = m => {
    const div = document.createElement('div');
    div.className = 'model-item' + (state.activeModel?.id === m.id ? ' active' : '');
    div.innerHTML = `
      <div class="model-dot" style="background:${m.color}"></div>
      <span class="model-name">${m.name}</span>
    `;
    div.addEventListener('click', () => selectModel(m.id));
    list.appendChild(div);
  };

  // ── 카테고리 헤더 (클릭 → 대시보드 해당 섹션으로 이동) ──
  const makeHeader = (cls, icon, label, onClick) => {
    const btn = document.createElement('button');
    btn.className = `sb-group-label ${cls}`;
    btn.innerHTML = `${icon} ${label}<span class="sb-arrow">›</span>`;
    btn.addEventListener('click', onClick);
    list.appendChild(btn);
  };

  // ── 1. 상시 모니터링 ──
  if (monitoring.length) {
    makeHeader('monitoring', '📡', '상시 모니터링', () => {
      state._sidebarMemo = false;
      loadDashboard().then(() => scrollDashSection('monitoring'));
    });
    monitoring.forEach(renderItem);
  }

  // ── 2. 주요 모델 이벤트 현황 ──
  if (models.length) {
    makeHeader('model', '📦', '주요 모델 이벤트 현황', () => {
      state._sidebarMemo = false;
      loadDashboard().then(() => scrollDashSection('model'));
    });
    models.forEach(renderItem);
  }

  // ── 3. 메모장 (공용 게시판) ──
  const memoBtn = document.createElement('button');
  memoBtn.className = 'sb-group-label memo' + (isMemo ? ' active' : '');
  memoBtn.innerHTML = `📝 메모장 <span style="font-size:11px;opacity:.7">(공용 게시판)</span><span class="sb-arrow">›</span>`;
  memoBtn.addEventListener('click', () => {
    state._sidebarMemo = true;
    loadDashboard().then(() => scrollDashSection('memo'));
    renderSidebar();
  });
  list.appendChild(memoBtn);
}

// 대시보드 내 특정 섹션으로 스크롤
function scrollDashSection(category) {
  const grid = document.getElementById('dashboard-grid');
  if (!grid) return;
  const sec = grid.querySelector(`.dash-section.${category}`);
  if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Views ────────────────────────────────────────────────────
function showView(name) {
  state.view = name;
  ['welcome','dashboard','model'].forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== name);
  });

  // 사이드바 버튼 활성화
  const btnDash = document.getElementById('btn-dashboard');
  if (btnDash) btnDash.classList.toggle('active', name === 'dashboard');

  // 대시보드를 떠나면 자동 갱신 타이머 중단
  if (name !== 'dashboard') stopDashRefresh();

  // 스크롤 맨 위로 (가독성)
  const main = document.getElementById('main');
  if (main) main.scrollTop = 0;
  window.scrollTo(0, 0);
}

// ── Dashboard ────────────────────────────────────────────────
let _dashRefreshTimer = null;

function stopDashRefresh() {
  if (_dashRefreshTimer) { clearInterval(_dashRefreshTimer); _dashRefreshTimer = null; }
}

function startDashRefresh() {
  stopDashRefresh();
  _dashRefreshTimer = setInterval(() => {
    if (state.view === 'dashboard') refreshDashboard();
  }, 5000); // 5초마다 자동 갱신 (다른 사용자/탭 변경 즉각 반영)
}

async function refreshDashboard() {
  if (state.view !== 'dashboard') return;
  try {
    const data = await GET('/api/dashboard');
    const wrap = document.getElementById('dashboard-grid');
    if (!wrap) return;
    renderDashboardData(wrap, data);
  } catch (err) {
    // silent
  }
}

// 데이터 변경 직후 호출 — 대시보드에 있으면 즉시 갱신, 다음 진입 시 무조건 신규 fetch (loadDashboard가 항상 fresh)
async function notifyDataChanged() {
  if (state.view === 'dashboard') {
    await refreshDashboard();
  }
}

async function loadDashboard() {
  state.activeModel = null;
  startDashRefresh();
  showView('dashboard');
  renderSidebar();

  // 진입 즉시 이전 데이터 클리어 (stale 깜빡임 방지)
  const wrap = document.getElementById('dashboard-grid');
  // 기존 카드는 일단 흐리게 처리만 → 새 데이터로 즉시 교체 (전체 깜빡임 회피)
  wrap.style.opacity = '0.5';

  const data = await GET('/api/dashboard');
  renderDashboardData(wrap, data);
  wrap.style.opacity = '';
}

function renderDashboardData(wrap, data) {
  // 메모장은 절대 DOM에서 떼지 않음 (포커스/커서 보존)
  // 카드 섹션과 empty-state만 제거 후 메모 앞에 다시 삽입
  const memo = wrap.querySelector('.dash-section.memo');

  // 메모 외 모든 자식 제거 (메모는 그대로 둠)
  Array.from(wrap.children).forEach(c => {
    if (c !== memo) c.remove();
  });

  const insertBeforeMemo = (sec) => {
    if (memo) wrap.insertBefore(sec, memo);
    else wrap.appendChild(sec);
  };

  if (!data.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="empty-icon">📂</div>등록된 모델이 없습니다';
    insertBeforeMemo(empty);
  } else {
    // 카테고리별로 분류 + 정렬
    const monitoring = data.filter(m => m.category === 'monitoring').sort((a,b)=>a.order-b.order);
    const models     = data.filter(m => m.category !== 'monitoring').sort((a,b)=>a.order-b.order);

    if (monitoring.length) {
      const sec = makeDashSection('monitoring', '📡 상시 모니터링', monitoring);
      insertBeforeMemo(sec);
      enableDashCardDrag(sec);
    }
    if (models.length) {
      const sec = makeDashSection('model', '📦 주요 모델 이벤트 현황', models);
      insertBeforeMemo(sec);
      enableDashCardDrag(sec);
    }
  }

  // 메모장 — 최초에만 생성
  if (!memo) {
    wrap.appendChild(makeDashMemoSection());
  }
  // 이미 존재하면 절대 건드리지 않음 (입력 중 끊김 방지)
}

// 게시글 목록만 새로 페치하되, 진행 중인 모든 input 값을 보존
async function loadDashMemoPostsKeepInputs(sec) {
  const postsEl = sec.querySelector('#memo-posts');
  if (!postsEl) return;

  // 현재 입력 중인 값 백업 (포지션 기반 키)
  const snapshot = {};
  postsEl.querySelectorAll('input').forEach(inp => {
    if (!inp.value) return;
    const post = inp.closest('.memo-post');
    const reply = inp.closest('.memo-reply-form');
    let key = null;
    if (reply) {
      key = `r_${post?.dataset?.pid}_${reply.dataset.pid}_${[...inp.classList].join('-')}`;
    } else {
      key = `c_${post?.dataset?.pid}_${[...inp.classList].join('-')}`;
    }
    snapshot[key] = inp.value;
  });

  // 게시글 새로 그리기
  await loadDashMemoPosts(sec);

  // 값 복원
  postsEl.querySelectorAll('input').forEach(inp => {
    const post = inp.closest('.memo-post');
    const reply = inp.closest('.memo-reply-form');
    let key = null;
    if (reply) {
      key = `r_${post?.dataset?.pid}_${reply.dataset.pid}_${[...inp.classList].join('-')}`;
    } else {
      key = `c_${post?.dataset?.pid}_${[...inp.classList].join('-')}`;
    }
    if (snapshot[key]) inp.value = snapshot[key];
  });
}

// ── 대시보드 공용 메모장 섹션 ─────────────────────────────────
function makeDashMemoSection() {
  const collapsed = isSectionCollapsed('memo');
  const sec = document.createElement('div');
  sec.className = `dash-section memo${collapsed ? ' collapsed' : ''}`;
  const myName = getCommenterName();

  sec.innerHTML = `
    <div class="dash-section-header">
      <h2 class="dash-section-title">📝 메모장 (공용 게시판)</h2>
      <span class="dash-section-count" id="dash-memo-count">로딩...</span>
      <button class="dash-section-toggle" type="button"
              title="${collapsed ? '펼치기' : '접기'}"
              aria-expanded="${!collapsed}">
        <span class="toggle-icon">${collapsed ? '＋' : '−'}</span>
      </button>
    </div>
    <div class="dash-memo-body">
      <!-- 새 글 작성 — 한 줄 (작성자 / 내용 / 저장) -->
      <div class="memo-new-post memo-new-post-row">
        <input class="memo-author-input" id="memo-author"
               placeholder="작성자" value="${escHtml(myName)}" maxlength="40">
        <input class="memo-content-input" id="memo-content"
               placeholder="공지·회의록·아이디어를 자유롭게 작성 (Enter로 저장)" maxlength="2000">
        <button class="btn-primary memo-save-btn" id="memo-save-btn">💾 저장</button>
      </div>

      <!-- 게시글 목록 -->
      <div class="memo-posts" id="memo-posts">
        <div style="text-align:center;padding:20px;color:#94a3b8">불러오는 중...</div>
      </div>
    </div>
  `;

  // 토글
  sec.querySelector('.dash-section-toggle').addEventListener('click', e => {
    e.stopPropagation();
    const nowCollapsed = !sec.classList.contains('collapsed');
    sec.classList.toggle('collapsed', nowCollapsed);
    setSectionCollapsed('memo', nowCollapsed);
    const ic = sec.querySelector('.toggle-icon');
    ic.textContent = nowCollapsed ? '＋' : '−';
  });

  // 저장 버튼
  const authorEl  = sec.querySelector('#memo-author');
  const contentEl = sec.querySelector('#memo-content');
  const saveBtn   = sec.querySelector('#memo-save-btn');

  const submitPost = async () => {
    const author  = authorEl.value.trim();
    const content = contentEl.value.trim();
    if (!author)  { toast('작성자 이름을 입력하세요', 'error'); authorEl.focus(); return; }
    if (!content) { toast('내용을 입력하세요', 'error'); contentEl.focus(); return; }
    setCommenterName(author);
    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';
    try {
      await POST('/api/dashboard-posts', { author, content });
      contentEl.value = '';
      toast('저장되었습니다', 'success');
      await loadDashMemoPosts(sec);
    } catch (err) {
      toast(err.message || '저장 실패', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 저장';
    }
  };
  saveBtn.addEventListener('click', submitPost);
  // Enter 키로 저장 (입력 input이므로 단순 Enter)
  contentEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitPost();
    }
  });
  authorEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      contentEl.focus();
    }
  });

  // 초기 로드
  loadDashMemoPosts(sec);

  // 이벤트 위임 (게시글/댓글/대댓글)
  attachDashMemoHandlers(sec);

  return sec;
}

async function loadDashMemoPosts(sec) {
  const postsEl = sec.querySelector('#memo-posts');
  const countEl = sec.querySelector('#dash-memo-count');
  try {
    const posts = await GET('/api/dashboard-posts');
    countEl.textContent = `${posts.length}개 글`;
    if (!posts.length) {
      postsEl.innerHTML = `<div class="memo-empty">아직 게시글이 없습니다. 첫 글을 남겨보세요!</div>`;
      return;
    }
    // 모든 글의 댓글 한 번에 페치
    await batchFetchComments(posts.map(p => ({ type: 'dpost', id: p.id })));
    postsEl.innerHTML = posts.map(p => buildDashPostHTML(p)).join('');
  } catch (err) {
    postsEl.innerHTML = `<div class="memo-empty">불러오기 실패</div>`;
  }
}

function buildDashPostHTML(post) {
  const comments = _commentsCache[`dpost_${post.id}`] || [];
  const topLevel = comments.filter(c => !c.parent_comment_id);
  const replyMap = {};
  comments.forEach(c => {
    if (c.parent_comment_id) {
      if (!replyMap[c.parent_comment_id]) replyMap[c.parent_comment_id] = [];
      replyMap[c.parent_comment_id].push(c);
    }
  });

  // 한 줄 레이아웃: [내용 ────] [작성자] [시간] [✕] [답글]
  const renderComment = (c, isReply = false) => {
    const replies = replyMap[c.id] || [];
    return `
      <div class="memo-cmt${isReply ? ' memo-cmt-reply' : ''}" data-cid="${c.id}">
        <span class="memo-cmt-body">${escHtml(c.content)}</span>
        <a class="memo-author-link" data-author="${escHtml(c.author)}" title="이 작성자 보기">${escHtml(c.author)}</a>
        <span class="memo-time">${fmtDateTime(c.created_at)}</span>
        ${isReply ? '' : `<button class="memo-reply-toggle" data-action="reply-toggle" data-pid="${c.id}" title="답글">↪</button>`}
        <button class="memo-cmt-del" data-action="del-dcmt" data-id="${c.id}" title="삭제">✕</button>
      </div>
      ${isReply ? '' : `
        <div class="memo-reply-form" data-pid="${c.id}" style="display:none">
          <input class="memo-reply-text" placeholder="↪ 답글 내용" maxlength="500">
          <input class="memo-reply-name" placeholder="작성자" value="${escHtml(getCommenterName())}" maxlength="40">
          <button class="memo-reply-submit" data-action="submit-reply" data-pid="${c.id}" data-postid="${post.id}">등록</button>
        </div>
        ${replies.length ? `<div class="memo-replies">${replies.map(r => renderComment(r, true)).join('')}</div>` : ''}
      `}
    `;
  };

  return `
    <div class="memo-post" data-pid="${post.id}">
      <div class="memo-post-row">
        <span class="memo-post-body">${escHtml(post.content)}</span>
        <a class="memo-author-link memo-author-main" data-author="${escHtml(post.author)}" title="이 작성자 보기">👤 ${escHtml(post.author)}</a>
        <span class="memo-time">${fmtDateTime(post.created_at)}</span>
        <button class="memo-post-del" data-action="del-dpost" data-id="${post.id}" title="삭제">✕</button>
      </div>
      <div class="memo-post-cmts">
        ${topLevel.length === 0
          ? '<div class="memo-no-cmt">댓글 없음</div>'
          : topLevel.map(c => renderComment(c, false)).join('')
        }
        <div class="memo-add-cmt">
          <input class="memo-cmt-text" placeholder="💬 댓글 내용" maxlength="500">
          <input class="memo-cmt-name" placeholder="작성자" value="${escHtml(getCommenterName())}" maxlength="40">
          <button class="memo-cmt-submit" data-action="submit-cmt" data-postid="${post.id}">등록</button>
        </div>
      </div>
    </div>
  `;
}

function attachDashMemoHandlers(sec) {
  sec.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action) {
      // 작성자 이름 클릭 → 강조
      const authorLink = e.target.closest('.memo-author-link');
      if (authorLink) {
        const name = authorLink.dataset.author;
        highlightAuthorPosts(sec, name);
      }
      return;
    }

    // 게시글 삭제
    if (action === 'del-dpost') {
      if (!confirm('이 게시글과 모든 댓글을 삭제할까요?')) return;
      await DEL(`/api/dashboard-posts/${e.target.dataset.id}`);
      toast('삭제되었습니다');
      await loadDashMemoPosts(sec);
      return;
    }

    // 댓글/답글 삭제
    if (action === 'del-dcmt') {
      if (!confirm('이 댓글을 삭제할까요?')) return;
      await DEL(`/api/comments/${e.target.dataset.id}`);
      toast('삭제되었습니다');
      await loadDashMemoPosts(sec);
      return;
    }

    // 답글 토글
    if (action === 'reply-toggle') {
      const pid = e.target.dataset.pid;
      const form = sec.querySelector(`.memo-reply-form[data-pid="${pid}"]`);
      if (form) form.style.display = form.style.display === 'none' ? 'flex' : 'none';
      return;
    }

    // 댓글 등록
    if (action === 'submit-cmt') {
      const postId = e.target.dataset.postid;
      const postEl = e.target.closest('.memo-post');
      const nameEl = postEl.querySelector('.memo-cmt-name');
      const textEl = postEl.querySelector('.memo-cmt-text');
      await postDashComment(sec, postId, nameEl, textEl, null);
      return;
    }

    // 답글 등록
    if (action === 'submit-reply') {
      const postId = e.target.dataset.postid;
      const parentId = e.target.dataset.pid;
      const form = e.target.closest('.memo-reply-form');
      const nameEl = form.querySelector('.memo-reply-name');
      const textEl = form.querySelector('.memo-reply-text');
      await postDashComment(sec, postId, nameEl, textEl, parentId);
      return;
    }
  });

  // Enter 키로 댓글/답글 등록
  sec.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const tgt = e.target;
    if (tgt.classList?.contains('memo-cmt-text') || tgt.classList?.contains('memo-cmt-name')) {
      e.preventDefault();
      const postEl = tgt.closest('.memo-post');
      const postId = postEl.dataset.pid;
      const nameEl = postEl.querySelector('.memo-cmt-name');
      const textEl = postEl.querySelector('.memo-cmt-text');
      await postDashComment(sec, postId, nameEl, textEl, null);
    } else if (tgt.classList?.contains('memo-reply-text') || tgt.classList?.contains('memo-reply-name')) {
      e.preventDefault();
      const form = tgt.closest('.memo-reply-form');
      const parentId = form.dataset.pid;
      const postId = form.querySelector('.memo-reply-submit').dataset.postid;
      const nameEl = form.querySelector('.memo-reply-name');
      const textEl = form.querySelector('.memo-reply-text');
      await postDashComment(sec, postId, nameEl, textEl, parentId);
    }
  });
}

async function postDashComment(sec, postId, nameEl, textEl, parentId) {
  const author = (nameEl?.value || '').trim();
  const content = (textEl?.value || '').trim();
  if (!author)  { toast('이름을 입력하세요', 'error'); nameEl?.focus(); return; }
  if (!content) { toast('내용을 입력하세요', 'error'); textEl?.focus(); return; }
  setCommenterName(author);
  try {
    const payload = { author, content };
    if (parentId) payload.parent_comment_id = Number(parentId);
    await POST(`/api/comments/dpost/${postId}`, payload);
    toast('등록되었습니다', 'success');
    await loadDashMemoPosts(sec);
  } catch (err) {
    toast(err.message || '등록 실패', 'error');
  }
}

function highlightAuthorPosts(sec, name) {
  // 같은 작성자의 글/댓글에 노란 강조 + 3초 후 사라짐
  sec.querySelectorAll('.memo-author-link').forEach(el => {
    const container = el.closest('.memo-post, .memo-cmt');
    if (!container) return;
    if (el.dataset.author === name) container.classList.add('memo-highlight');
    else container.classList.remove('memo-highlight');
  });
  toast(`'${name}' 님의 글/댓글을 강조했습니다`, 'success');
  setTimeout(() => {
    sec.querySelectorAll('.memo-highlight').forEach(el => el.classList.remove('memo-highlight'));
  }, 4000);
}

function isSectionCollapsed(category) {
  try { return localStorage.getItem(`dash-collapsed-${category}`) === '1'; }
  catch { return false; }
}
function setSectionCollapsed(category, val) {
  try { localStorage.setItem(`dash-collapsed-${category}`, val ? '1' : '0'); }
  catch {}
}

function makeDashSection(category, title, list) {
  const sec = document.createElement('div');
  const collapsed = isSectionCollapsed(category);
  sec.className = `dash-section ${category}${collapsed ? ' collapsed' : ''}`;
  sec.innerHTML = `
    <div class="dash-section-header">
      <h2 class="dash-section-title">${title}</h2>
      <span class="dash-section-count">${list.length}개 항목</span>
      <button class="dash-section-toggle" type="button" title="${collapsed ? '펼치기' : '접기'}" aria-expanded="${!collapsed}">
        <span class="toggle-icon">${collapsed ? '＋' : '−'}</span>
      </button>
    </div>
    <div class="dash-section-grid"></div>
  `;
  const grid = sec.querySelector('.dash-section-grid');

  // 컬럼 동적 생성
  // - 모니터링: 항목 수만큼 가로 + 추가 셀 (1줄)
  // - 모델: 4열 카드 + 우측에 세로로 긴 추가 셀
  const n = list.length;
  if (category === 'monitoring') {
    grid.style.gridTemplateColumns = n > 0
      ? `repeat(${n}, minmax(0, 1fr)) var(--add-w)`
      : 'var(--add-w)';
  } else {
    // 모델 — 4열 (8개면 위 4개 / 아래 4개) + 추가 셀 컬럼
    grid.style.gridTemplateColumns = `repeat(4, minmax(0, 1fr)) var(--add-w)`;
    grid.style.gridAutoRows = 'minmax(0, 1fr)';
  }

  list.forEach(m => grid.appendChild(makeDashCard(m)));

  const addCard = makeAddCard(category);
  if (category === 'model') {
    // 카드 우측에 세로로 길게 배치 (모든 행 커버)
    const rows = Math.max(1, Math.ceil(n / 4));
    addCard.style.gridColumn = '5';
    addCard.style.gridRow = `1 / span ${rows}`;
  }
  grid.appendChild(addCard);

  // 토글 버튼
  const toggleBtn = sec.querySelector('.dash-section-toggle');
  toggleBtn.addEventListener('click', e => {
    e.stopPropagation();
    const nowCollapsed = !sec.classList.contains('collapsed');
    sec.classList.toggle('collapsed', nowCollapsed);
    setSectionCollapsed(category, nowCollapsed);
    toggleBtn.querySelector('.toggle-icon').textContent = nowCollapsed ? '＋' : '−';
    toggleBtn.title = nowCollapsed ? '펼치기' : '접기';
    toggleBtn.setAttribute('aria-expanded', String(!nowCollapsed));
  });

  return sec;
}

function makeAddCard(category) {
  const card = document.createElement('div');
  card.className = 'dashboard-card add-card';
  card.dataset.addCategory = category;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', '항목 추가');
  card.innerHTML = `
    <div class="add-card-icon">＋</div>
    <div class="add-card-label">추가</div>
  `;
  const open = () => openAddModelModal(category);
  card.addEventListener('click', e => {
    if (window._dashDragJustHappened) return;
    e.preventDefault();
    e.stopPropagation();
    open();
  });
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  return card;
}

function makeDashCard(m) {
  const card = document.createElement('div');
  card.className = 'dashboard-card';
  card.style.borderTopColor = m.color;

  if (m.category === 'monitoring') {
    // 모니터링: 일정 진행률 중심
    const msPct = m.milestone_total ? Math.round(m.milestone_done / m.milestone_total * 100) : 0;
    const inProgress = m.milestone_total - m.milestone_done - m.milestone_delayed;
    card.innerHTML = `
      <div class="dc-header">
        <div class="dc-dot" style="background:${m.color}"></div>
        <div class="dc-name">${m.name}</div>
      </div>
      <div class="dc-stats">
        <div class="dc-stat">
          <div class="dc-stat-val" style="color:${m.color}">${m.milestone_total}</div>
          <div class="dc-stat-label">전체 의뢰건</div>
        </div>
        <div class="dc-stat">
          <div class="dc-stat-val" style="color:#10b981">${m.milestone_done}</div>
          <div class="dc-stat-label">완료</div>
        </div>
      </div>
      <div class="dc-prog-label">진행률 ${msPct}%</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${msPct}%;background:${m.color}"></div>
      </div>
      ${m.milestone_delayed ? `<div class="dc-delayed">⚠ 지연 ${m.milestone_delayed}건</div>` : ''}
    `;
  } else {
    // 모델: 일정 + 체크리스트 + 클레임 (3열)
    const clPct = m.checklist_total ? Math.round(m.checklist_done / m.checklist_total * 100) : 0;
    const clmTotal = m.claim_total || 0;
    const clmOpen  = m.claim_open  || 0;
    const clmDone  = m.claim_done  || 0;
    const clmDelay = m.claim_delayed || 0;
    card.innerHTML = `
      <div class="dc-header">
        <div class="dc-dot" style="background:${m.color}"></div>
        <div class="dc-name">${m.name}</div>
      </div>
      <div class="dc-stats dc-stats-3">
        <div class="dc-stat">
          <div class="dc-stat-val">${m.milestone_done}/${m.milestone_total}</div>
          <div class="dc-stat-label">일정</div>
        </div>
        <div class="dc-stat">
          <div class="dc-stat-val">${m.checklist_done}/${m.checklist_total}</div>
          <div class="dc-stat-label">체크</div>
        </div>
        <div class="dc-stat ${clmOpen ? 'has-open' : ''}">
          <div class="dc-stat-val" style="${clmOpen ? 'color:#ef4444' : ''}">${clmDone}/${clmTotal}</div>
          <div class="dc-stat-label">클레임${clmOpen ? ' ('+clmOpen+' 미해결)' : ''}</div>
        </div>
      </div>
      <div class="dc-prog-label">체크리스트 진행률 ${clPct}%</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${clPct}%;background:${m.color}"></div>
      </div>
      ${(m.milestone_delayed || clmDelay) ? `
        <div class="dc-delayed-row">
          ${m.milestone_delayed ? `<span class="dc-delayed">⚠ 일정 ${m.milestone_delayed}</span>` : '<span></span>'}
          ${clmDelay ? `<span class="dc-delayed">🚨 클레임 ${clmDelay}</span>` : '<span></span>'}
        </div>
      ` : ''}
    `;
  }

  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${m.name} 상세 보기`);
  card.dataset.modelId = m.id;
  card.dataset.category = m.category || 'model';
  card.addEventListener('click', (e) => {
    // 드래그 직후의 클릭은 무시
    if (window._dashDragJustHappened) return;
    e.preventDefault();
    e.stopPropagation();
    selectModel(m.id);
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectModel(m.id);
    }
  });
  return card;
}

// ── 대시보드 카드 드래그-앤-드롭 (섹션 내 순서 변경) ──────────
function enableDashCardDrag(section) {
  const grid = section.querySelector('.dash-section-grid');
  if (!grid) return;
  const category = section.classList.contains('monitoring') ? 'monitoring' : 'model';

  const LONG_PRESS_MS = 2000; // 2초 홀드 후 드래그 활성화

  let dragEl = null, placeholder = null, pid = null;
  let startX = 0, startY = 0, offsetX = 0, offsetY = 0;
  let dragging = false;   // 실제 드래그 이동 중
  let dragReady = false;  // 2초 홀드 완료 → 드래그 가능 상태
  let longPressTimer = null;

  function cancelLongPress() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (dragEl) {
      dragEl.classList.remove('drag-pending');
      dragEl.style.removeProperty('--lp-duration');
    }
    dragReady = false;
  }

  function cleanup(card) {
    cancelLongPress();
    try { if (pid != null) card.releasePointerCapture(pid); } catch {}
    grid.removeEventListener('pointermove', onMove);
    grid.removeEventListener('pointerup',   onUp);
    grid.removeEventListener('pointercancel', onUp);
    dragEl = null; placeholder = null; pid = null;
    dragging = false; dragReady = false;
  }

  function startDragMotion(ev) {
    // dragReady 상태에서 처음 움직일 때 드래그 시작
    dragging = true;
    const rect = dragEl.getBoundingClientRect();
    offsetX = startX - rect.left;
    offsetY = startY - rect.top;

    placeholder = document.createElement('div');
    placeholder.className = 'dash-card-placeholder';
    placeholder.style.cssText = `width:${rect.width}px;height:${rect.height}px;`;
    dragEl.parentNode.insertBefore(placeholder, dragEl);

    dragEl.classList.add('dragging');
    dragEl.style.position    = 'fixed';
    dragEl.style.zIndex      = '9999';
    dragEl.style.width       = rect.width  + 'px';
    dragEl.style.height      = rect.height + 'px';
    dragEl.style.left        = rect.left   + 'px';
    dragEl.style.top         = rect.top    + 'px';
    dragEl.style.pointerEvents = 'none';
    dragEl.style.cursor      = 'grabbing';
    try { dragEl.setPointerCapture(pid); } catch {}
  }

  function onMove(ev) {
    if (!dragEl) return;

    if (!dragReady) {
      // 2초 전 10px 이상 이동 → 롱프레스 취소 (스크롤 의도)
      const dx = Math.abs(ev.clientX - startX);
      const dy = Math.abs(ev.clientY - startY);
      if (dx > 10 || dy > 10) {
        const card = dragEl;
        cleanup(card);
      }
      return;
    }

    // dragReady 상태에서 처음 이동 시 드래그 시작
    if (!dragging) {
      const dx = Math.abs(ev.clientX - startX);
      const dy = Math.abs(ev.clientY - startY);
      if (dx < 3 && dy < 3) return;
      startDragMotion(ev);
    }

    // 드래그 중 위치 업데이트
    dragEl.style.left = (ev.clientX - offsetX) + 'px';
    dragEl.style.top  = (ev.clientY - offsetY) + 'px';

    // placeholder 위치 계산
    const others  = [...grid.querySelectorAll('.dashboard-card:not(.dragging):not(.add-card)')];
    const addCard = grid.querySelector('.add-card');
    let inserted  = false;
    for (const c of others) {
      const rc  = c.getBoundingClientRect();
      const midX = rc.left + rc.width  / 2;
      const midY = rc.top  + rc.height / 2;
      if (Math.abs(ev.clientY - midY) < rc.height / 2) {
        if (ev.clientX < midX) { grid.insertBefore(placeholder, c); inserted = true; break; }
      } else if (ev.clientY < midY) {
        grid.insertBefore(placeholder, c); inserted = true; break;
      }
    }
    if (!inserted) {
      if (addCard) grid.insertBefore(placeholder, addCard);
      else grid.appendChild(placeholder);
    }
  }

  async function onUp(ev) {
    if (!dragEl) return;
    const card = dragEl;

    if (!dragging) {
      // 드래그 없이 손을 뗌 (단순 클릭 또는 롱프레스만 하고 이동 없음)
      cleanup(card);
      return;
    }

    // 드래그 종료 - 위치 확정
    placeholder.parentNode.insertBefore(card, placeholder);
    placeholder.remove();
    card.classList.remove('dragging');
    card.style.cssText = '';

    window._dashDragJustHappened = true;
    setTimeout(() => { window._dashDragJustHappened = false; }, 100);

    const ids = [...grid.querySelectorAll('.dashboard-card:not(.add-card)')]
      .map(c => Number(c.dataset.modelId))
      .filter(n => Number.isFinite(n));

    cleanup(card);

    try {
      await POST('/api/models/reorder', { category, ids });
      toast('순서가 변경되었습니다', 'success');
      state.models = await GET('/api/models');
    } catch {
      toast('순서 저장 실패', 'error');
    }
  }

  grid.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    const card = e.target.closest('.dashboard-card');
    if (!card || card.classList.contains('add-card')) return;

    pid    = e.pointerId;
    dragEl = card;
    startX = e.clientX;
    startY = e.clientY;
    dragging  = false;
    dragReady = false;

    // CSS 링 애니메이션 시작 (2초 duration)
    card.style.setProperty('--lp-duration', LONG_PRESS_MS + 'ms');
    card.classList.add('drag-pending');

    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      dragReady = true;
      card.classList.remove('drag-pending');
      card.classList.add('drag-ready');
      if (navigator.vibrate) navigator.vibrate(40); // 모바일 진동 피드백
      setTimeout(() => card.classList.remove('drag-ready'), 400);
    }, LONG_PRESS_MS);

    grid.addEventListener('pointermove',  onMove);
    grid.addEventListener('pointerup',    onUp);
    grid.addEventListener('pointercancel', onUp);
  });
}

// ── Select Model ─────────────────────────────────────────────
async function selectModel(id) {
  const m = state.models.find(x => x.id === id);
  if (!m) return;
  state.activeModel = m;
  state.activeTab   = 'milestone';
  renderSidebar();
  showView('model');
  closeSidebar();

  // 헤더
  document.getElementById('hdr-dot').style.background = m.color;
  document.getElementById('hdr-title').textContent    = m.name;
  document.getElementById('mobile-badge').style.background = m.color;

  // 카테고리별 탭 표시 제어 (모니터링은 체크시트/Claim 숨김)
  const hideForMon = (m.category === 'monitoring') ? 'none' : '';
  const checklistTab = document.querySelector('.tab[data-tab="checklist"]');
  if (checklistTab) checklistTab.style.display = hideForMon;
  const claimTab = document.querySelector('.tab[data-tab="claim"]');
  if (claimTab) claimTab.style.display = hideForMon;

  // 탭 초기화
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'milestone'));
  await loadTab('milestone');
}

// ── Tab Switching ────────────────────────────────────────────
async function loadTab(tab) {
  // 모니터링 카테고리는 체크시트/claim 비활성화 → 일정표로 리다이렉트
  if ((tab === 'checklist' || tab === 'claim') && state.activeModel?.category === 'monitoring') {
    tab = 'milestone';
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'milestone'));
  }

  state.activeTab = tab;
  const body = document.getElementById('tab-body');
  body.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8">불러오는 중...</div>';

  // 메모·설정 탭은 filterbar 불필요 → 비움
  const filterbar = document.getElementById('tab-filterbar');
  if (tab === 'memo' || tab === 'settings') {
    if (filterbar) filterbar.innerHTML = '';
  }

  if (tab === 'milestone') await renderMilestone(body);
  if (tab === 'checklist') await renderChecklist(body);
  if (tab === 'claim')     await renderClaim(body);
  if (tab === 'memo')      await renderMemo(body);
  if (tab === 'settings')  await renderSettings(body);
}

// ── ① 일정표 (Milestone) ─────────────────────────────────────
async function renderMilestone(body) {
  const mid    = state.activeModel.id;
  const items  = await GET(`/api/models/${mid}/milestones`);
  const subs   = []; // 더 이상 그룹 분류 안함

  // 댓글 일괄 페치
  await batchFetchComments(items.map(it => ({ type: 'milestone', id: it.id })));

  const total   = items.length;
  const done    = items.filter(x => x.status === 'completed').length;
  const inProg  = items.filter(x => x.status === 'in_progress').length;
  const delayed = items.filter(x => x.status === 'delayed').length;

  const today = new Date().toISOString().slice(0,10);

  // ── 3번째 행: 필터바를 page-header 안 tab-filterbar에 렌더 ──
  const filterbar = document.getElementById('tab-filterbar');
  filterbar.innerHTML = `
    <div class="milestone-toolbar">
      <div class="milestone-summary">
        <button class="ms-pill total active" data-filter="all">전체 ${total}</button>
        <button class="ms-pill done"         data-filter="completed">✓ 완료 ${done}</button>
        <button class="ms-pill prog"         data-filter="in_progress">◎ 진행중 ${inProg}</button>
        <button class="ms-pill delayed"      data-filter="delayed">⚠ 지연 ${delayed}</button>
      </div>
      <button class="btn-primary" id="btn-add-ms">＋ 일정 추가</button>
    </div>
  `;

  body.innerHTML = `<div id="ms-list"></div>`;

  const msList = document.getElementById('ms-list');
  if (!total) {
    msList.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div>일정을 추가해 진행 상황을 관리하세요</div>`;
  } else {
    items.forEach(it => {
      const el = makeMsItem(it, today);
      el.dataset.status = it.status;
      msList.appendChild(el);
    });
  }

  // 필터 버튼 클릭 핸들러 (filterbar 안)
  filterbar.querySelectorAll('.ms-pill[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      filterbar.querySelectorAll('.ms-pill[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyMsFilter(msList, btn.dataset.filter, total);
    });
  });

  filterbar.querySelector('#btn-add-ms').addEventListener('click', () => openMsModal(null, []));
  refreshCommentCounts();
  attachInlineCommentsHandler(document.getElementById('tab-body'));
}

function makeMsItem(it, today) {
  const div = document.createElement('div');
  div.className = 'milestone-item';

  // 기간형이면 종료일로 지연 판정, 단일형이면 due_date로 판정
  const compareDate = it.due_date_end || it.due_date;
  const overdue = compareDate && compareDate < today && it.status !== 'completed';

  // 날짜 표시 문자열
  let dateStr = '';
  if (it.due_date_end) {
    dateStr = `📆 ${it.due_date} ~ ${it.due_date_end}`;
  } else if (it.due_date) {
    dateStr = `📅 ${it.due_date}`;
  }

  const cmts = _commentsCache[`milestone_${it.id}`] || [];
  div.innerHTML = `
    <div class="ms-status-dot" style="background:${STATUS_DOT[it.status]}"></div>
    <div class="ms-body">
      <div class="ms-title-row">
        <span class="ms-title">${escHtml(it.title)}</span>
        ${it.author ? `<span class="ms-author">👤 ${escHtml(it.author)}</span>` : ''}
      </div>
      ${it.description ? `<div class="ms-desc">${escHtml(it.description)}</div>` : ''}
      <div class="ms-meta">
        ${dateStr ? `<div class="ms-date ${overdue ? 'overdue':''}">${dateStr}${overdue ? ' 지연':''}</div>` : ''}
        <span class="status-badge status-${it.status}">${STATUS_LABELS[it.status]}</span>
      </div>
      ${it.note ? `<div class="ms-note">📝 ${escHtml(it.note)}</div>` : ''}
      ${buildInlineCommentsHTML('milestone', it.id, cmts)}
    </div>
    <div class="ms-actions">
      <button class="btn-xs" data-action="edit-ms" data-id="${it.id}" title="편집">✎</button>
      <button class="btn-xs danger" data-action="del-ms" data-id="${it.id}" title="삭제">✕</button>
    </div>
  `;
  return div;
}

document.getElementById('tab-body').addEventListener('click', async e => {
  // 댓글 버튼은 자식 span(.cmt-count) 클릭이 부모로 위임되도록 closest 사용
  const actBtn = e.target.closest('[data-action]');
  const action = actBtn ? actBtn.dataset.action : null;
  if (!action) return;
  const id = Number(actBtn.dataset.id);
  const mid = state.activeModel?.id;

  // ── 댓글 모달 열기 ──
  if (action === 'cmt-ms')    return openCommentsModal('milestone', id, actBtn.dataset.title);
  if (action === 'cmt-check') return openCommentsModal('checklist', id, actBtn.dataset.title);
  if (action === 'cmt-clm')   return openCommentsModal('claim',     id, actBtn.dataset.title);

  if (action === 'edit-ms') {
    const items = await GET(`/api/models/${mid}/milestones`);
    openMsModal(items.find(x => x.id === id), []);
  }
  if (action === 'del-ms') {
    if (!confirm('일정을 삭제할까요?')) return;
    await DEL(`/api/milestones/${id}`);
    toast('삭제되었습니다', 'success');
    await loadTab('milestone');
    notifyDataChanged();
  }
  if (action === 'del-check') {
    if (!confirm('항목을 삭제할까요?')) return;
    await DEL(`/api/checklist/${id}`);
    toast('삭제되었습니다', 'success');
    await loadTab('checklist');
    notifyDataChanged();
  }
  if (action === 'edit-check') {
    const items = await GET(`/api/models/${mid}/checklist`);
    openCheckModal(items.find(x => x.id === id));
  }
  if (action === 'del-clm') {
    if (!confirm('이 클레임을 삭제할까요?')) return;
    await DEL(`/api/claims/${id}`);
    toast('삭제되었습니다', 'success');
    await loadTab('claim');
    notifyDataChanged();
  }
  if (action === 'edit-clm') {
    const items = await GET(`/api/models/${mid}/claims`);
    openClaimModal(items.find(x => x.id === id));
  }
});

function openMsModal(item, subs) {
  const myName = getCommenterName();
  const body = `
    <div class="form-group">
      <label class="form-label">작성자 <span style="color:#ef4444">*</span></label>
      <input class="form-input" id="ms-author"
             value="${escHtml(item?.author || myName)}"
             placeholder="이름 입력" maxlength="40">
    </div>
    <div class="form-group">
      <label class="form-label">제목 *</label>
      <input class="form-input" id="ms-title" value="${escHtml(item?.title || '')}" placeholder="제목 입력">
    </div>
    <div class="form-group">
      <label class="form-label">설명</label>
      <textarea class="form-textarea" id="ms-desc" placeholder="상세 내용">${escHtml(item?.description || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">목표일</label>
      <div class="date-mode-toggle" id="ms-date-mode">
        <button type="button" class="dm-btn ${item?.due_date_end ? '' : 'active'}" data-mode="single">📅 특정일</button>
        <button type="button" class="dm-btn ${item?.due_date_end ? 'active' : ''}" data-mode="range">📆 기간</button>
      </div>
      <div class="date-inputs" id="ms-date-single" style="${item?.due_date_end ? 'display:none' : ''}">
        <input class="form-input" type="date" id="ms-date" value="${item?.due_date || ''}">
      </div>
      <div class="date-inputs date-range" id="ms-date-range" style="${item?.due_date_end ? '' : 'display:none'}">
        <input class="form-input" type="date" id="ms-date-start" value="${item?.due_date || ''}">
        <span class="date-tilde">~</span>
        <input class="form-input" type="date" id="ms-date-end" value="${item?.due_date_end || ''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">상태</label>
      <select class="form-select" id="ms-status">
        ${Object.entries(STATUS_LABELS).map(([k,v]) =>
          `<option value="${k}" ${item?.status === k ? 'selected':''}>${v}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">비고 (메모)</label>
      <textarea class="form-textarea" id="ms-note" placeholder="추가 메모, 참고사항 등">${item?.note || ''}</textarea>
    </div>
  `;

  const footer = `
    <button class="btn-secondary" id="modal-cancel">취소</button>
    <button class="btn-primary" id="modal-confirm">${item ? '수정' : '추가'}</button>
  `;
  openModal(item ? '일정 수정' : '일정 추가', body, footer);

  // 단일/기간 토글
  let dateMode = item?.due_date_end ? 'range' : 'single';
  document.getElementById('ms-date-mode').addEventListener('click', e => {
    const btn = e.target.closest('.dm-btn');
    if (!btn) return;
    dateMode = btn.dataset.mode;
    document.querySelectorAll('#ms-date-mode .dm-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === dateMode));
    document.getElementById('ms-date-single').style.display = dateMode === 'single' ? '' : 'none';
    document.getElementById('ms-date-range').style.display  = dateMode === 'range'  ? '' : 'none';
  });

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', async () => {
    const author = document.getElementById('ms-author').value.trim();
    const title  = document.getElementById('ms-title').value.trim();
    if (!author) { toast('작성자 이름을 입력하세요', 'error'); document.getElementById('ms-author').focus(); return; }
    if (!title)  { toast('제목을 입력하세요', 'error'); return; }

    setCommenterName(author); // 다음번에도 자동 입력

    let due_date, due_date_end;
    if (dateMode === 'range') {
      due_date     = document.getElementById('ms-date-start').value || null;
      due_date_end = document.getElementById('ms-date-end').value   || null;
      if (due_date && due_date_end && due_date > due_date_end) {
        toast('종료일은 시작일 이후여야 합니다', 'error');
        return;
      }
    } else {
      due_date     = document.getElementById('ms-date').value || null;
      due_date_end = null;
    }

    const payload = {
      author,
      title,
      description: document.getElementById('ms-desc').value.trim(),
      note:        document.getElementById('ms-note').value.trim(),
      due_date,
      due_date_end,
      status:      document.getElementById('ms-status').value,
    };
    if (item) {
      await PUT(`/api/milestones/${item.id}`, payload);
      toast('수정되었습니다', 'success');
    } else {
      await POST(`/api/models/${state.activeModel.id}/milestones`, payload);
      toast('추가되었습니다', 'success');
    }
    closeModal();
    await loadTab('milestone');
    notifyDataChanged();
  });
}

// 일정표 필터 적용
function applyMsFilter(msList, filter, total) {
  let visible = 0;
  [...msList.children].forEach(el => {
    if (el.classList.contains('empty-state')) return;
    const show = filter === 'all' || el.dataset.status === filter;
    el.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  // 빈 결과 처리
  let emptyEl = msList.querySelector('.ms-filter-empty');
  if (visible === 0 && total > 0) {
    if (!emptyEl) {
      emptyEl = document.createElement('div');
      emptyEl.className = 'empty-state ms-filter-empty';
    }
    const labelMap = { all:'전체', completed:'완료', in_progress:'진행중', delayed:'지연' };
    emptyEl.innerHTML = `<div class="empty-icon">🔍</div>${labelMap[filter] || filter} 항목이 없습니다`;
    msList.appendChild(emptyEl);
  } else if (emptyEl) {
    emptyEl.remove();
  }
}

// 테이블(체크시트/Claim) 필터 적용
function applyTableFilter(tbody, filter, colSpan) {
  let visible = 0;
  const rows = [...tbody.querySelectorAll('tr[data-status]')];
  rows.forEach(tr => {
    // 댓글 sub-row는 data-parent-status로 연결
    const show = filter === 'all' || tr.dataset.status === filter;
    tr.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  // 댓글 행은 부모 행과 동일하게 처리
  [...tbody.querySelectorAll('tr.cl-cmt-row')].forEach(cmtTr => {
    const prev = cmtTr.previousElementSibling;
    if (prev) cmtTr.style.display = prev.style.display;
  });
  // 빈 결과 처리
  let emptyRow = tbody.querySelector('.table-filter-empty');
  if (visible === 0 && rows.length > 0) {
    if (!emptyRow) {
      emptyRow = document.createElement('tr');
      emptyRow.className = 'table-filter-empty';
      emptyRow.innerHTML = `<td colspan="${colSpan}" class="empty-state" style="padding:30px"><div class="empty-icon">🔍</div>해당 항목이 없습니다</td>`;
    }
    tbody.appendChild(emptyRow);
  } else if (emptyRow) {
    emptyRow.remove();
  }
}

// ── ② 체크시트 ───────────────────────────────────────────────
async function renderChecklist(body) {
  const mid   = state.activeModel.id;
  const items = await GET(`/api/models/${mid}/checklist`);

  // 댓글 일괄 페치
  await batchFetchComments(items.map(it => ({ type: 'checklist', id: it.id })));

  const total   = items.length;
  const done    = items.filter(x => x.status === 'completed').length;
  const pct     = total ? Math.round(done / total * 100) : 0;
  const color   = state.activeModel.color;
  const today   = new Date().toISOString().slice(0,10);

  const inProg  = items.filter(x => x.status === 'in_progress').length;
  const delayed = items.filter(x => x.status === 'delayed').length;

  // ── 3번째 행: 요약+필터를 page-header 안 tab-filterbar에 렌더 ──
  const filterbar = document.getElementById('tab-filterbar');
  filterbar.innerHTML = `
    <div class="checklist-overall">
      <div class="checklist-overall-row">
        <div class="overall-pct">${pct}%</div>
        <div class="overall-bar-wrap">
          <div class="overall-bar-bg">
            <div class="overall-bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <div class="overall-sub">${done} / ${total} 완료</div>
        </div>
        <div class="table-filter-bar">
          <button class="ms-pill total active" data-filter="all">전체 ${total}</button>
          <button class="ms-pill done"         data-filter="completed">✓ 완료 ${done}</button>
          <button class="ms-pill prog"         data-filter="in_progress">◎ 진행중 ${inProg}</button>
          <button class="ms-pill delayed"      data-filter="delayed">⚠ 지연 ${delayed}</button>
        </div>
      </div>
    </div>
  `;

  body.innerHTML = `
    <div class="cl-table-wrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th style="width:48px">NO</th>
            <th style="width:18%">대제목</th>
            <th style="min-width:200px">세부 진행사항</th>
            <th style="width:160px">목표일</th>
            <th style="width:100px">상태</th>
            <th style="min-width:160px">비고 (메모)</th>
            <th style="width:60px"></th>
          </tr>
        </thead>
        <tbody id="cl-tbody"></tbody>
      </table>
    </div>
    <div style="margin-top:14px">
      <button class="btn-primary" id="btn-add-cl">＋ 항목 추가</button>
    </div>
  `;

  const tbody = document.getElementById('cl-tbody');
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state" style="padding:30px"><div class="empty-icon">📋</div>항목이 없습니다</td></tr>`;
  } else {
    items.forEach(it => {
      const frag = makeClRow(it, today);
      // DocumentFragment에서 첫 번째 tr (data row)에 status 추가
      const firstTr = frag.firstElementChild;
      if (firstTr) firstTr.dataset.status = it.status;
      tbody.appendChild(frag);
    });
  }

  // 필터 버튼 핸들러 (filterbar 안)
  filterbar.querySelectorAll('.ms-pill[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      filterbar.querySelectorAll('.ms-pill[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyTableFilter(tbody, btn.dataset.filter, 7);
    });
  });

  document.getElementById('btn-add-cl').addEventListener('click', () => openCheckModal(null));
  refreshCommentCounts();
  attachInlineCommentsHandler(document.getElementById('tab-body'));
}

function makeClRow(it, today) {
  const frag = document.createDocumentFragment();
  const tr = document.createElement('tr');
  tr.className = 'cl-row';
  if (it.status === 'completed') tr.classList.add('row-done');
  const overdue = it.due_date && it.due_date < today && it.status !== 'completed';

  tr.innerHTML = `
    <td class="cl-no">${it.no}</td>
    <td class="cl-ttl">${escHtml(it.title) || '-'}</td>
    <td class="cl-detail">${escHtml(it.detail) || '<span style="color:#cbd5e1">-</span>'}</td>
    <td class="cl-date ${overdue ? 'overdue':''}">${it.due_date ? '📅 '+it.due_date+(overdue?' ⚠':'') : '-'}</td>
    <td><span class="status-badge status-${it.status}">${STATUS_LABELS[it.status]||it.status}</span></td>
    <td class="cl-note">${escHtml(it.note) || '<span style="color:#cbd5e1">-</span>'}</td>
    <td class="cl-acts">
      <button class="btn-xs" data-action="edit-check" data-id="${it.id}" title="편집">✎</button>
      <button class="btn-xs danger" data-action="del-check" data-id="${it.id}" title="삭제">✕</button>
    </td>
  `;
  frag.appendChild(tr);

  // 댓글 인라인 sub-row
  const cmts = _commentsCache[`checklist_${it.id}`] || [];
  const cmtTr = document.createElement('tr');
  cmtTr.className = 'cl-cmt-row';
  cmtTr.innerHTML = `<td colspan="7" class="cl-cmt-cell">${buildInlineCommentsHTML('checklist', it.id, cmts)}</td>`;
  frag.appendChild(cmtTr);
  return frag;
}

function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;')
    .replace(/\n/g,'<br>');
}

// ══════════════════════════════════════════════════════════
// 댓글 (Comments)
// ══════════════════════════════════════════════════════════
const COMMENTER_KEY = 'pt_commenter_name';
function getCommenterName() { return localStorage.getItem(COMMENTER_KEY) || ''; }
function setCommenterName(n) { localStorage.setItem(COMMENTER_KEY, n); }

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 인라인 댓글 블록 HTML 생성
function buildInlineCommentsHTML(type, itemId, comments) {
  const name = getCommenterName();
  const list = (comments || []).map(c => `
    <div class="inline-cmt" data-cid="${c.id}">
      <div class="inline-cmt-head">
        <span class="inline-cmt-author">${escHtml(c.author)}</span>
        <span class="inline-cmt-time">${fmtDateTime(c.created_at)}</span>
        <button class="inline-cmt-del" data-cmt-del="${c.id}" title="삭제">✕</button>
      </div>
      <div class="inline-cmt-content">${escHtml(c.content)}</div>
    </div>
  `).join('');

  return `
    <div class="inline-comments" data-cmt-type="${type}" data-cmt-id="${itemId}">
      ${list ? `<div class="inline-cmt-list">${list}</div>` : ''}
      <div class="inline-cmt-form">
        <input class="inline-cmt-name" placeholder="이름" value="${escHtml(name)}" maxlength="40">
        <input class="inline-cmt-text" placeholder="💬 댓글 추가 (Enter로 등록)" maxlength="500">
        <button class="inline-cmt-add" type="button">등록</button>
      </div>
    </div>
  `;
}

// 댓글 데이터 일괄 페치
let _commentsCache = {};
async function batchFetchComments(items) {
  if (!items.length) return {};
  try {
    const r = await fetch('/api/comments/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    const data = await r.json();
    _commentsCache = data;
    return data;
  } catch { return {}; }
}

// 인라인 댓글 영역 이벤트 핸들러 (위임)
function attachInlineCommentsHandler(rootEl) {
  if (rootEl._cmtHandlerAttached) return;
  rootEl._cmtHandlerAttached = true;

  rootEl.addEventListener('click', async (e) => {
    // 삭제
    const delBtn = e.target.closest('.inline-cmt-del');
    if (delBtn) {
      e.preventDefault();
      e.stopPropagation();
      const id = delBtn.dataset.cmtDel;
      if (!confirm('댓글을 삭제할까요?')) return;
      await DEL(`/api/comments/${id}`);
      toast('삭제되었습니다');
      const cmtBlock = delBtn.closest('.inline-comments');
      await refreshInlineCommentsBlock(cmtBlock);
      return;
    }

    // 등록
    const addBtn = e.target.closest('.inline-cmt-add');
    if (addBtn) {
      e.preventDefault();
      e.stopPropagation();
      const block = addBtn.closest('.inline-comments');
      await submitInlineComment(block);
    }
  });

  rootEl.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const inputEl = e.target;
    if (!inputEl.classList) return;
    if (!inputEl.classList.contains('inline-cmt-text') && !inputEl.classList.contains('inline-cmt-name')) return;
    e.preventDefault();
    e.stopPropagation();
    const block = inputEl.closest('.inline-comments');
    await submitInlineComment(block);
  });
}

async function submitInlineComment(block) {
  const type = block.dataset.cmtType;
  const id   = block.dataset.cmtId;
  const nameEl    = block.querySelector('.inline-cmt-name');
  const contentEl = block.querySelector('.inline-cmt-text');
  const author  = (nameEl?.value || '').trim();
  const content = (contentEl?.value || '').trim();
  if (!author)  { toast('이름을 입력하세요', 'error'); nameEl?.focus(); return; }
  if (!content) { toast('내용을 입력하세요', 'error'); contentEl?.focus(); return; }
  setCommenterName(author);
  try {
    await POST(`/api/comments/${type}/${id}`, { author, content });
    contentEl.value = '';
    toast('등록되었습니다', 'success');
    await refreshInlineCommentsBlock(block);
  } catch (err) {
    toast(err.message || '등록 실패', 'error');
  }
}

async function refreshInlineCommentsBlock(block) {
  const type = block.dataset.cmtType;
  const id   = block.dataset.cmtId;
  const comments = await GET(`/api/comments/${type}/${id}`);
  // 입력란 값 보존
  const curName    = block.querySelector('.inline-cmt-name')?.value;
  const curContent = block.querySelector('.inline-cmt-text')?.value;
  block.outerHTML = buildInlineCommentsHTML(type, Number(id), comments);
  // 새 노드에 입력값 복원 (선택)
  // 동일 부모 안의 동일 위치에 새로 들어간 노드를 다시 찾아 값 채우기는 생략
}

// 현재 탭 안의 모든 .cmt-count 요소에 댓글 수를 업데이트
async function refreshCommentCounts() {
  const els = document.querySelectorAll('.cmt-count[data-cmt-key]');
  if (!els.length) return;
  const items = [];
  els.forEach(el => {
    const [type, id] = el.dataset.cmtKey.split('_');
    items.push({ type, id: Number(id) });
  });
  const counts = await fetchCommentCounts(items);
  els.forEach(el => {
    const c = counts[el.dataset.cmtKey] || 0;
    el.textContent = c;
    el.parentElement.classList.toggle('has-comments', c > 0);
  });
}

// 댓글 변경 이벤트 수신 → 카운트 갱신
document.addEventListener('comments-updated', () => refreshCommentCounts());

async function fetchCommentCounts(items) {
  if (!items.length) return {};
  try {
    const r = await fetch('/api/comments/counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    return await r.json();
  } catch { return {}; }
}

async function openCommentsModal(type, itemId, itemTitle) {
  const typeLabel = { milestone: '일정', checklist: '체크시트', claim: '클레임' }[type] || type;
  openModal(`💬 댓글 - ${typeLabel}: ${itemTitle || ''}`, `
    <div class="comments-list" id="cmt-list">
      <div style="text-align:center;padding:20px;color:#94a3b8">불러오는 중...</div>
    </div>

    <div class="cmt-input-wrap">
      <div class="cmt-input-title">✍ 새 댓글 작성</div>
      <div class="form-group">
        <label class="form-label" for="cmt-author">작성자 이름 <span style="color:#ef4444">*</span></label>
        <input class="form-input" id="cmt-author"
               value="${escHtml(getCommenterName())}"
               placeholder="예: 황인학 / 품질팀 김OO"
               autocomplete="name"
               style="font-weight:700">
      </div>
      <div class="form-group" style="margin-bottom:4px">
        <label class="form-label" for="cmt-content">댓글 내용 <span style="color:#ef4444">*</span></label>
        <textarea class="form-textarea" id="cmt-content"
                  placeholder="의견·검토사항·진행상태 등 자유롭게 작성하세요&#10;Ctrl+Enter로 빠른 등록 가능"
                  rows="4"></textarea>
      </div>
    </div>
  `, `
    <button class="btn-secondary" id="modal-cancel">닫기</button>
    <button class="btn-primary" id="cmt-submit">💬 등록</button>
  `);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  async function reload() {
    const list = await GET(`/api/comments/${type}/${itemId}`);
    const listEl = document.getElementById('cmt-list');
    if (!list.length) {
      listEl.innerHTML = `<div class="cmt-empty">아직 댓글이 없습니다. 첫 의견을 남겨보세요!</div>`;
    } else {
      listEl.innerHTML = list.map(c => `
        <div class="comment-item" data-cid="${c.id}">
          <div class="comment-head">
            <span class="comment-author">${escHtml(c.author)}</span>
            <span class="comment-time">${fmtDateTime(c.created_at)}</span>
            <button class="comment-del" data-cmt-del="${c.id}" title="삭제">✕</button>
          </div>
          <div class="comment-content">${escHtml(c.content)}</div>
        </div>
      `).join('');
    }
    // 모달 외부에서 카운트 즉시 반영 위해
    document.dispatchEvent(new CustomEvent('comments-updated', { detail: { type, itemId } }));
  }

  document.getElementById('cmt-list').addEventListener('click', async e => {
    const delId = e.target.dataset.cmtDel;
    if (!delId) return;
    if (!confirm('이 댓글을 삭제할까요?')) return;
    await DEL(`/api/comments/${delId}`);
    toast('삭제되었습니다');
    await reload();
  });

  async function submit() {
    const author = document.getElementById('cmt-author').value.trim();
    const content = document.getElementById('cmt-content').value.trim();
    if (!author) { toast('작성자 이름을 입력하세요', 'error'); return; }
    if (!content) { toast('댓글 내용을 입력하세요', 'error'); return; }
    setCommenterName(author);
    try {
      await POST(`/api/comments/${type}/${itemId}`, { author, content });
      document.getElementById('cmt-content').value = '';
      toast('등록되었습니다', 'success');
      await reload();
    } catch (err) {
      toast(err.message || '등록 실패', 'error');
    }
  }
  document.getElementById('cmt-submit').addEventListener('click', submit);
  // Ctrl+Enter 단축키
  document.getElementById('cmt-content').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  });

  await reload();
}

// ══════════════════════════════════════════════════════════
// 이미지 OCR (Tesseract.js)
// ══════════════════════════════════════════════════════════

// 텍스트영역에 이미지 OCR 기능 부착 (붙여넣기/드롭/버튼)
function attachOcrToTextarea(textarea, opts = {}) {
  if (!textarea) return;
  const placeholderOriginal = textarea.placeholder || '';
  textarea.placeholder = (placeholderOriginal ? placeholderOriginal + '\n\n' : '') +
    '💡 이미지를 붙여넣거나(Ctrl+V) 드래그하면 문자 인식되어 자동 입력됩니다.';

  // 붙여넣기 — 이미지 클립보드 처리
  textarea.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        await runOcrIntoTextarea(textarea, blob);
        return;
      }
    }
  });

  // 드래그-앤-드롭 — 이미지 파일 처리
  textarea.addEventListener('dragover', (e) => {
    e.preventDefault();
    textarea.classList.add('drag-over');
  });
  textarea.addEventListener('dragleave', () => textarea.classList.remove('drag-over'));
  textarea.addEventListener('drop', async (e) => {
    e.preventDefault();
    textarea.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await runOcrIntoTextarea(textarea, file);
    }
  });
}

async function runOcrIntoTextarea(textarea, blob) {
  if (typeof Tesseract === 'undefined') {
    toast('OCR 라이브러리 로딩 중... 잠시 후 다시 시도하세요', 'error');
    return;
  }

  // 진행률 표시용 오버레이
  const wrap = textarea.parentElement;
  let overlay = wrap.querySelector('.ocr-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'ocr-overlay';
    overlay.innerHTML = `
      <div class="ocr-spinner"></div>
      <div class="ocr-msg">이미지 분석 중... <span class="ocr-pct">0%</span></div>
    `;
    wrap.style.position = 'relative';
    wrap.appendChild(overlay);
  }
  overlay.classList.add('show');
  const pctEl = overlay.querySelector('.ocr-pct');
  const msgEl = overlay.querySelector('.ocr-msg');

  try {
    const url = URL.createObjectURL(blob);
    const result = await Tesseract.recognize(url, 'kor+eng', {
      logger: (m) => {
        if (m.status === 'loading tesseract core' || m.status === 'initializing tesseract' || m.status === 'initialized tesseract')
          msgEl.firstChild.nodeValue = 'OCR 엔진 초기화 중... ';
        else if (m.status === 'loading language traineddata' || m.status === 'loaded language traineddata')
          msgEl.firstChild.nodeValue = '한글 인식 모델 로딩 중... ';
        else if (m.status === 'initializing api')
          msgEl.firstChild.nodeValue = 'API 초기화 중... ';
        else if (m.status === 'recognizing text')
          msgEl.firstChild.nodeValue = '문자 인식 중... ';
        if (typeof m.progress === 'number') pctEl.textContent = Math.round(m.progress * 100) + '%';
      },
    });
    URL.revokeObjectURL(url);

    let text = (result?.data?.text || '').trim();
    if (!text) {
      toast('이미지에서 텍스트를 찾지 못했습니다', 'error');
      return;
    }
    // 줄 정리
    text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');

    // 커서 위치에 삽입 (기존 텍스트 보존)
    const start = textarea.selectionStart ?? textarea.value.length;
    const end   = textarea.selectionEnd   ?? textarea.value.length;
    const before = textarea.value.slice(0, start);
    const after  = textarea.value.slice(end);
    const sep = before && !before.endsWith('\n') ? '\n' : '';
    textarea.value = before + sep + text + after;

    // input 이벤트 발생 (자동저장 등 트리거)
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    toast('문자 인식 완료', 'success');
  } catch (err) {
    console.error('OCR error', err);
    toast('OCR 실패: ' + (err.message || err), 'error');
  } finally {
    overlay.classList.remove('show');
  }
}

// 모달이 열린 직후 모든 textarea에 OCR 자동 부착
function autoAttachOcrInModal() {
  const body = document.getElementById('modal-body');
  if (!body) return;
  body.querySelectorAll('textarea').forEach(t => {
    if (!t.dataset.ocrAttached) {
      attachOcrToTextarea(t);
      t.dataset.ocrAttached = '1';
    }
  });
}

function openCheckModal(item) {
  const body = `
    <div class="form-group">
      <label class="form-label">대제목 *</label>
      <input class="form-input" id="cl-title" value="${escHtml(item?.title || '')}" placeholder="대제목 입력">
    </div>
    <div class="form-group">
      <label class="form-label">세부 진행사항</label>
      <textarea class="form-textarea" id="cl-detail" placeholder="진행 내용 / 작업 사항">${escHtml(item?.detail || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">목표일</label>
      <input class="form-input" type="date" id="cl-date" value="${item?.due_date || ''}">
    </div>
    <div class="form-group">
      <label class="form-label">상태</label>
      <select class="form-select" id="cl-status">
        ${Object.entries(STATUS_LABELS).map(([k,v]) =>
          `<option value="${k}" ${item?.status === k ? 'selected':''}>${v}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">비고 (메모)</label>
      <textarea class="form-textarea" id="cl-note" placeholder="추가 메모, 참고사항 등">${escHtml(item?.note || '')}</textarea>
    </div>
  `;
  const footer = `
    <button class="btn-secondary" id="modal-cancel">취소</button>
    <button class="btn-primary" id="modal-confirm">${item ? '수정' : '추가'}</button>
  `;
  openModal(item ? '항목 수정' : '항목 추가', body, footer);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', async () => {
    const title = document.getElementById('cl-title').value.trim();
    if (!title) { toast('대제목을 입력하세요', 'error'); return; }
    const payload = {
      title,
      detail:   document.getElementById('cl-detail').value.trim(),
      due_date: document.getElementById('cl-date').value || null,
      status:   document.getElementById('cl-status').value,
      note:     document.getElementById('cl-note').value.trim(),
    };
    if (item) {
      await PUT(`/api/checklist/${item.id}`, payload);
      toast('수정되었습니다', 'success');
    } else {
      await POST(`/api/models/${state.activeModel.id}/checklist`, payload);
      toast('추가되었습니다', 'success');
    }
    closeModal();
    await loadTab('checklist');
    notifyDataChanged();
  });
}

// ── ③ 고객 Claim 현황 ─────────────────────────────────────────
async function renderClaim(body) {
  const mid    = state.activeModel.id;
  const items  = await GET(`/api/models/${mid}/claims`);

  // 댓글 일괄 페치
  await batchFetchComments(items.map(it => ({ type: 'claim', id: it.id })));

  const total  = items.length;
  const done   = items.filter(x => x.status === 'completed').length;
  const today  = new Date().toISOString().slice(0,10);

  const inProg  = items.filter(x => x.status === 'in_progress').length;
  const delayed = items.filter(x => x.status === 'delayed').length;
  const pct     = total ? Math.round(done/total*100) : 0;

  // ── 3번째 행: 요약+필터를 page-header 안 tab-filterbar에 렌더 ──
  const filterbar = document.getElementById('tab-filterbar');
  filterbar.innerHTML = `
    <div class="checklist-overall">
      <div class="checklist-overall-title">고객 Claim 처리 현황</div>
      <div class="checklist-overall-row">
        <div class="overall-pct">${pct}%</div>
        <div class="overall-bar-wrap">
          <div class="overall-bar-bg">
            <div class="overall-bar-fill" style="width:${pct}%;background:${state.activeModel.color}"></div>
          </div>
          <div class="overall-sub">${done} / ${total} 완료</div>
        </div>
        <div class="table-filter-bar">
          <button class="ms-pill total active" data-filter="all">전체 ${total}</button>
          <button class="ms-pill done"         data-filter="completed">✓ 완료 ${done}</button>
          <button class="ms-pill prog"         data-filter="in_progress">◎ 진행중 ${inProg}</button>
          <button class="ms-pill delayed"      data-filter="delayed">⚠ 지연 ${delayed}</button>
        </div>
      </div>
    </div>
  `;

  body.innerHTML = `
    <div class="cl-table-wrap">
      <table class="cl-table">
        <thead>
          <tr>
            <th style="width:48px">NO</th>
            <th style="width:14%">고객사</th>
            <th style="min-width:200px">클레임 내용</th>
            <th style="width:120px">발생일</th>
            <th style="min-width:160px">조치 사항</th>
            <th style="width:100px">상태</th>
            <th style="min-width:140px">비고</th>
            <th style="width:60px"></th>
          </tr>
        </thead>
        <tbody id="clm-tbody"></tbody>
      </table>
    </div>
    <div style="margin-top:14px">
      <button class="btn-primary" id="btn-add-clm">＋ Claim 추가</button>
    </div>
  `;

  const tbody = document.getElementById('clm-tbody');
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state" style="padding:30px"><div class="empty-icon">📋</div>등록된 클레임이 없습니다</td></tr>`;
  } else {
    items.forEach(it => {
      const frag = makeClmRow(it, today);
      // DocumentFragment에서 첫 번째 tr (data row)에 status 추가
      const firstTr = frag.firstElementChild;
      if (firstTr) firstTr.dataset.status = it.status;
      tbody.appendChild(frag);
    });
  }

  // 필터 버튼 핸들러 (filterbar 안)
  filterbar.querySelectorAll('.ms-pill[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      filterbar.querySelectorAll('.ms-pill[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyTableFilter(tbody, btn.dataset.filter, 8);
    });
  });

  document.getElementById('btn-add-clm').addEventListener('click', () => openClaimModal(null));
  refreshCommentCounts();
  attachInlineCommentsHandler(document.getElementById('tab-body'));
}

function makeClmRow(it, today) {
  const frag = document.createDocumentFragment();
  const tr = document.createElement('tr');
  tr.className = 'cl-row';
  if (it.status === 'completed') tr.classList.add('row-done');
  const overdue = it.occurred_date && it.occurred_date < today && it.status !== 'completed';
  tr.innerHTML = `
    <td class="cl-no">${it.no}</td>
    <td class="cl-ttl">${escHtml(it.customer) || '-'}</td>
    <td class="cl-detail">${escHtml(it.content) || '<span style="color:#cbd5e1">-</span>'}</td>
    <td class="cl-date ${overdue ? 'overdue':''}">${it.occurred_date ? '📅 '+it.occurred_date : '-'}</td>
    <td class="cl-detail">${escHtml(it.action) || '<span style="color:#cbd5e1">-</span>'}</td>
    <td><span class="status-badge status-${it.status}">${STATUS_LABELS[it.status]||it.status}</span></td>
    <td class="cl-note">${escHtml(it.note) || '<span style="color:#cbd5e1">-</span>'}</td>
    <td class="cl-acts">
      <button class="btn-xs" data-action="edit-clm" data-id="${it.id}" title="편집">✎</button>
      <button class="btn-xs danger" data-action="del-clm" data-id="${it.id}" title="삭제">✕</button>
    </td>
  `;
  frag.appendChild(tr);

  // 댓글 인라인 sub-row
  const cmts = _commentsCache[`claim_${it.id}`] || [];
  const cmtTr = document.createElement('tr');
  cmtTr.className = 'cl-cmt-row';
  cmtTr.innerHTML = `<td colspan="8" class="cl-cmt-cell">${buildInlineCommentsHTML('claim', it.id, cmts)}</td>`;
  frag.appendChild(cmtTr);
  return frag;
}

function openClaimModal(item) {
  const body = `
    <div class="form-group">
      <label class="form-label">고객사 *</label>
      <input class="form-input" id="clm-customer" value="${escHtml(item?.customer || '')}" placeholder="예: 삼성전자">
    </div>
    <div class="form-group">
      <label class="form-label">클레임 내용</label>
      <textarea class="form-textarea" id="clm-content" placeholder="클레임 상세 내용">${escHtml(item?.content || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">발생일</label>
      <input class="form-input" type="date" id="clm-date" value="${item?.occurred_date || ''}">
    </div>
    <div class="form-group">
      <label class="form-label">조치 사항</label>
      <textarea class="form-textarea" id="clm-action" placeholder="대응/조치 사항">${escHtml(item?.action || '')}</textarea>
    </div>
    <div class="form-group">
      <label class="form-label">상태</label>
      <select class="form-select" id="clm-status">
        ${Object.entries(STATUS_LABELS).map(([k,v]) =>
          `<option value="${k}" ${item?.status === k ? 'selected':''}>${v}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">비고</label>
      <textarea class="form-textarea" id="clm-note" placeholder="추가 메모, 참고사항">${escHtml(item?.note || '')}</textarea>
    </div>
  `;
  const footer = `
    <button class="btn-secondary" id="modal-cancel">취소</button>
    <button class="btn-primary" id="modal-confirm">${item ? '수정' : '추가'}</button>
  `;
  openModal(item ? '고객 Claim 수정' : '고객 Claim 추가', body, footer);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', async () => {
    const customer = document.getElementById('clm-customer').value.trim();
    if (!customer) { toast('고객사를 입력하세요', 'error'); return; }
    const payload = {
      customer,
      content:       document.getElementById('clm-content').value.trim(),
      occurred_date: document.getElementById('clm-date').value || null,
      action:        document.getElementById('clm-action').value.trim(),
      status:        document.getElementById('clm-status').value,
      note:          document.getElementById('clm-note').value.trim(),
    };
    if (item) {
      await PUT(`/api/claims/${item.id}`, payload);
      toast('수정되었습니다', 'success');
    } else {
      await POST(`/api/models/${state.activeModel.id}/claims`, payload);
      toast('추가되었습니다', 'success');
    }
    closeModal();
    await loadTab('claim');
    notifyDataChanged();
  });
}

// ── ④ 메모장 ─────────────────────────────────────────────────
async function renderMemo(body) {
  const mid  = state.activeModel.id;
  const memo = await GET(`/api/models/${mid}/memo`);

  const upd = memo.updated_at
    ? `마지막 저장: ${memo.updated_at.slice(0,16).replace('T',' ')}`
    : '';

  body.innerHTML = `
    <div class="memo-wrap">
      <div class="memo-toolbar">
        <div class="memo-toolbar-left">
          <span class="memo-title">📝 메모장</span>
          <span class="memo-save-status" id="memo-status">${upd}</span>
        </div>
        <button class="btn-primary" id="btn-save-memo" style="padding:6px 14px;font-size:13px">저장</button>
      </div>
      <textarea class="memo-textarea" id="memo-ta" placeholder="자유롭게 메모하세요...&#10;&#10;회의록, 이슈, 참고사항 등을 기록하세요.">${memo.content || ''}</textarea>
    </div>
  `;

  const ta     = document.getElementById('memo-ta');
  const status = document.getElementById('memo-status');

  const save = async () => {
    status.textContent = '저장 중...';
    status.className   = 'memo-save-status saving';
    await PUT(`/api/models/${mid}/memo`, { content: ta.value });
    const now = new Date().toLocaleString('ko-KR', { hour12: false }).slice(0,-3);
    status.textContent = `마지막 저장: ${now}`;
    status.className   = 'memo-save-status saved';
  };

  // 자동 저장 (2초 디바운스)
  ta.addEventListener('input', () => {
    clearTimeout(state.memoTimer);
    status.textContent = '입력 중...';
    status.className   = 'memo-save-status';
    state.memoTimer = setTimeout(save, 2000);
  });

  document.getElementById('btn-save-memo').addEventListener('click', save);

  // 메모장 textarea에 OCR 부착
  attachOcrToTextarea(ta);
}

// ── ④ 설정 ────────────────────────────────────────────────────
async function renderSettings(body) {
  const mid  = state.activeModel.id;
  const m    = state.activeModel;
  const subs = await GET(`/api/models/${mid}/sub-items`);

  body.innerHTML = `
    <div style="max-width:500px">

      <div class="settings-section">
        <div class="settings-label">모델 이름</div>
        <div class="form-group">
          <input class="form-input" id="set-name" value="${m.name}">
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-label">색상</div>
        <div class="color-picker-row" id="color-picker">
          ${COLORS.map(c => `
            <div class="color-opt ${m.color === c ? 'selected' : ''}"
                 style="background:${c}" data-color="${c}"></div>
          `).join('')}
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-label">세부 단계 관리 <span style="font-weight:400;color:#94a3b8;font-size:11px;margin-left:6px">드래그하여 순서 변경</span></div>
        <div class="sub-item-list" id="sub-item-list">
          ${subs.map(s => `
            <div class="sub-item-row" data-sid="${s.id}">
              <span class="drag-handle" title="드래그하여 순서 변경">⋮⋮</span>
              <input class="sub-item-name form-input" value="${s.name}" data-sid="${s.id}">
              <button class="btn-xs" data-action="save-sub" data-id="${s.id}" title="저장">✓</button>
              <button class="btn-xs danger" data-action="del-sub" data-id="${s.id}" title="삭제">✕</button>
            </div>
          `).join('')}
        </div>
        <button class="sub-item-add" id="btn-add-sub" style="margin-top:8px;width:100%">＋ 단계 추가</button>
      </div>

      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-primary" id="btn-save-model-settings">변경사항 저장</button>
      </div>
    </div>
  `;

  // 색상 선택
  let selectedColor = m.color;
  document.getElementById('color-picker').addEventListener('click', e => {
    const opt = e.target.closest('.color-opt');
    if (!opt) return;
    selectedColor = opt.dataset.color;
    document.querySelectorAll('.color-opt').forEach(o => o.classList.toggle('selected', o.dataset.color === selectedColor));
  });

  // 단계 저장/삭제
  document.getElementById('sub-item-list').addEventListener('click', async e => {
    const action = e.target.dataset.action;
    const id     = Number(e.target.dataset.id);
    if (action === 'save-sub') {
      const input = document.querySelector(`input.sub-item-name[data-sid="${id}"]`);
      await PUT(`/api/sub-items/${id}`, { name: input.value.trim() });
      toast('저장되었습니다', 'success');
    }
    if (action === 'del-sub') {
      if (!confirm('단계를 삭제하면 연결된 일정/체크시트 항목의 단계 분류가 해제됩니다.')) return;
      await DEL(`/api/sub-items/${id}`);
      await renderSettings(body);
    }
  });

  // 단계 추가
  document.getElementById('btn-add-sub').addEventListener('click', async () => {
    const name = prompt('새 단계 이름을 입력하세요');
    if (!name?.trim()) return;
    await POST(`/api/models/${mid}/sub-items`, { name: name.trim() });
    toast('추가되었습니다', 'success');
    await renderSettings(body);
  });

  // 드래그-앤-드롭 (마우스/터치 통합 - Pointer Events)
  enableSubItemDragDrop(document.getElementById('sub-item-list'), mid);

  // 모델 저장
  document.getElementById('btn-save-model-settings').addEventListener('click', async () => {
    const name = document.getElementById('set-name').value.trim();
    if (!name) { toast('이름을 입력하세요', 'error'); return; }
    const updated = await PUT(`/api/models/${mid}`, { name, color: selectedColor });
    state.activeModel = updated;
    state.models = state.models.map(x => x.id === mid ? updated : x);
    renderSidebar();
    document.getElementById('hdr-dot').style.background  = updated.color;
    document.getElementById('hdr-title').textContent     = updated.name;
    const mb = document.getElementById('mobile-badge');
    if (mb) mb.style.background = updated.color;
    toast('저장되었습니다', 'success');
    // 대시보드 즉시 갱신 (state.view !== 'dashboard'이라도 다음 진입 시 fresh fetch)
    notifyDataChanged();
  });
}

// ── 세부 단계 드래그-앤-드롭 ─────────────────────────────────
function enableSubItemDragDrop(container, modelId) {
  let dragEl = null;
  let placeholder = null;
  let pointerId = null;
  let offsetY = 0;

  container.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    const row = handle.closest('.sub-item-row');
    if (!row) return;

    e.preventDefault();
    pointerId = e.pointerId;
    dragEl = row;
    const rect = row.getBoundingClientRect();
    offsetY = e.clientY - rect.top;

    // 플레이스홀더 (자리 유지)
    placeholder = document.createElement('div');
    placeholder.className = 'sub-item-placeholder';
    placeholder.style.height = rect.height + 'px';
    row.parentNode.insertBefore(placeholder, row);

    // 드래그 시작
    row.classList.add('dragging');
    row.style.position = 'fixed';
    row.style.zIndex = '9999';
    row.style.width = rect.width + 'px';
    row.style.left = rect.left + 'px';
    row.style.top = rect.top + 'px';
    row.style.pointerEvents = 'none';

    handle.setPointerCapture(pointerId);

    const onMove = ev => {
      if (!dragEl) return;
      dragEl.style.top = (ev.clientY - offsetY) + 'px';

      // 다른 행 위로 호버 시 placeholder 위치 변경
      const rows = [...container.querySelectorAll('.sub-item-row:not(.dragging)')];
      let inserted = false;
      for (const r of rows) {
        const rect = r.getBoundingClientRect();
        if (ev.clientY < rect.top + rect.height / 2) {
          container.insertBefore(placeholder, r);
          inserted = true;
          break;
        }
      }
      if (!inserted) container.appendChild(placeholder);
    };

    const onUp = async () => {
      if (!dragEl) return;
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);

      // 위치 확정: placeholder 자리에 dragEl 삽입
      placeholder.parentNode.insertBefore(dragEl, placeholder);
      placeholder.remove();
      dragEl.classList.remove('dragging');
      dragEl.style.cssText = '';

      // 새 순서 → 서버 저장
      const ids = [...container.querySelectorAll('.sub-item-row')].map(r => Number(r.dataset.sid));
      try {
        await POST(`/api/models/${modelId}/sub-items/reorder`, { ids });
        toast('순서가 변경되었습니다', 'success');
      } catch (err) {
        toast('순서 저장 실패', 'error');
      }

      dragEl = null;
      placeholder = null;
      pointerId = null;
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });
}

// ── 모델 추가 Modal ──────────────────────────────────────────
function openAddModelModal(defaultCategory = 'model') {
  const title = defaultCategory === 'monitoring' ? '📡 상시 모니터링 항목 추가' : '📦 주요 모델 이벤트 추가';
  const body = `
    <div class="form-group">
      <label class="form-label">분류</label>
      <select class="form-select" id="new-model-cat">
        <option value="model"      ${defaultCategory==='model'      ? 'selected':''}>📦 주요 모델 이벤트 현황</option>
        <option value="monitoring" ${defaultCategory==='monitoring' ? 'selected':''}>📡 상시 모니터링</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">이름 *</label>
      <input class="form-input" id="new-model-name" placeholder="예: X-BLE Shoulder">
    </div>
    <div class="form-group">
      <label class="form-label">색상</label>
      <div class="color-picker-row" id="new-color-picker">
        ${COLORS.map((c, i) => `
          <div class="color-opt ${i === 0 ? 'selected' : ''}"
               style="background:${c}" data-color="${c}"></div>
        `).join('')}
      </div>
    </div>
  `;
  const footer = `
    <button class="btn-secondary" id="modal-cancel">취소</button>
    <button class="btn-primary" id="modal-confirm">추가</button>
  `;
  openModal(title, body, footer);

  let selectedColor = COLORS[0];
  document.getElementById('new-color-picker').addEventListener('click', e => {
    const opt = e.target.closest('.color-opt');
    if (!opt) return;
    selectedColor = opt.dataset.color;
    document.querySelectorAll('#new-color-picker .color-opt').forEach(o =>
      o.classList.toggle('selected', o.dataset.color === selectedColor)
    );
  });

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', async () => {
    const name = document.getElementById('new-model-name').value.trim();
    if (!name) { toast('이름을 입력하세요', 'error'); return; }
    const category = document.getElementById('new-model-cat').value;
    const newModel = await POST('/api/models', { name, color: selectedColor, category });
    state.models.push(newModel);
    renderSidebar();
    closeModal();
    toast(`${name} 추가되었습니다`, 'success');
    await selectModel(newModel.id);
  });
}

// ── 모델 삭제 ─────────────────────────────────────────────────
async function deleteActiveModel() {
  const m = state.activeModel;
  if (!m) return;
  if (!confirm(`"${m.name}" 모델을 삭제하시겠습니까?\n\n모든 일정, 체크시트, 메모가 함께 삭제됩니다.`)) return;
  await DEL(`/api/models/${m.id}`);
  state.models = state.models.filter(x => x.id !== m.id);
  state.activeModel = null;
  renderSidebar();
  showView('welcome');
  notifyDataChanged();
  toast(`${m.name} 삭제되었습니다`);
}

// ── 사이드바 토글 ─────────────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('overlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
  document.body.style.overflow = '';
}

// ── 초기화 ────────────────────────────────────────────────────
async function init() {
  state.models = await GET('/api/models');
  renderSidebar();
  showView('welcome');

  // 이벤트
  document.getElementById('btn-dashboard').addEventListener('click', loadDashboard);
  document.getElementById('btn-goto-dashboard').addEventListener('click', loadDashboard);
  document.getElementById('btn-add-model').addEventListener('click', () => {
    closeSidebar();
    openAddModelModal();
  });
  document.getElementById('btn-edit-model').addEventListener('click', () => {
    if (state.activeModel) {
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'settings'));
      loadTab('settings');
    }
  });
  document.getElementById('btn-delete-model').addEventListener('click', deleteActiveModel);
  // 로고 클릭 → 대시보드로 이동
  const goDashboard = () => loadDashboard();
  document.getElementById('logo-btn')?.addEventListener('click', goDashboard);
  document.getElementById('mobile-logo-btn')?.addEventListener('click', goDashboard);

  document.getElementById('sidebar-toggle').addEventListener('click', openSidebar);
  document.getElementById('close-sidebar').addEventListener('click', closeSidebar);
  document.getElementById('overlay').addEventListener('click', closeSidebar);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-backdrop').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-backdrop')) closeModal();
  });

  document.getElementById('tabs').addEventListener('click', e => {
    const tab = e.target.dataset.tab;
    if (!tab) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    loadTab(tab);
  });

  // 모델이 있으면 대시보드로
  if (state.models.length) loadDashboard();
}

// 윈도우 포커스 / 가시성 변경 시 대시보드면 자동 새로고침
window.addEventListener('focus', () => {
  if (state.view === 'dashboard') refreshDashboard();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.view === 'dashboard') refreshDashboard();
});

// 우측 상단 시계 + 인쇄
function startClock() {
  const update = () => {
    const el = document.getElementById('top-clock');
    if (!el) return;
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    el.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  update();
  setInterval(update, 1000);
}
function attachPrintHandler() {
  document.getElementById('btn-print')?.addEventListener('click', () => window.print());
}

// 눈 보호 모드 토글
function attachThemeToggle() {
  const btn = document.getElementById('btn-theme');
  if (!btn) return;
  const icon = btn.querySelector('.theme-icon');
  const apply = (on) => {
    document.body.classList.toggle('eye-care', on);
    if (icon) icon.textContent = on ? '☀' : '🌙';
    btn.title = on ? '밝은 모드로 전환' : '눈 보호 모드 (어둡고 부드럽게)';
  };
  // 초기 상태 로드
  apply(localStorage.getItem('eye-care') === '1');
  btn.addEventListener('click', () => {
    const next = !document.body.classList.contains('eye-care');
    apply(next);
    localStorage.setItem('eye-care', next ? '1' : '0');
    toast(next ? '🌙 눈 보호 모드 활성' : '☀ 밝은 모드', 'success');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  startClock();
  attachPrintHandler();
  attachThemeToggle();
  await init();
});
