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

  if (monitoring.length) {
    const lbl = document.createElement('div');
    lbl.className = 'sb-group-label monitoring';
    lbl.textContent = '📡 상시 모니터링';
    list.appendChild(lbl);
    monitoring.forEach(renderItem);
  }
  if (models.length) {
    const lbl = document.createElement('div');
    lbl.className = 'sb-group-label model';
    lbl.textContent = '📦 주요 모델 이벤트 현황';
    list.appendChild(lbl);
    models.forEach(renderItem);
  }
}

// ── Views ────────────────────────────────────────────────────
function showView(name) {
  state.view = name;
  ['welcome','dashboard','model'].forEach(v =>
    document.getElementById(`view-${v}`).classList.toggle('hidden', v !== name)
  );

  // 사이드바 버튼 활성화
  document.getElementById('btn-dashboard').classList.toggle('active', name === 'dashboard');

  // 대시보드를 떠나면 자동 갱신 타이머 중단
  if (name !== 'dashboard') stopDashRefresh();
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
  wrap.innerHTML = '';

  if (!data.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">📂</div>등록된 모델이 없습니다</div>';
    return;
  }

  // 카테고리별로 분류 + 정렬
  const monitoring = data.filter(m => m.category === 'monitoring').sort((a,b)=>a.order-b.order);
  const models     = data.filter(m => m.category !== 'monitoring').sort((a,b)=>a.order-b.order);

  // 상시 모니터링 (상단 - 파란 음영)
  if (monitoring.length) {
    const sec = makeDashSection('monitoring', '📡 상시 모니터링', monitoring);
    wrap.appendChild(sec);
    enableDashCardDrag(sec);
  }
  // 모델별 진행 (중단 - 보라 음영)
  if (models.length) {
    const sec = makeDashSection('model', '📦 주요 모델 이벤트 현황', models);
    wrap.appendChild(sec);
    enableDashCardDrag(sec);
  }
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

  // 항목 개수에 맞게 컬럼 동적 생성
  const n = list.length;
  if (n > 0) {
    grid.style.gridTemplateColumns =
      `repeat(${n}, minmax(0, 1fr)) var(--add-w)`;
  } else {
    grid.style.gridTemplateColumns = 'var(--add-w)';
  }

  list.forEach(m => grid.appendChild(makeDashCard(m)));
  grid.appendChild(makeAddCard(category));

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
    // 모델: 일정 + 체크리스트
    const clPct = m.checklist_total ? Math.round(m.checklist_done / m.checklist_total * 100) : 0;
    card.innerHTML = `
      <div class="dc-header">
        <div class="dc-dot" style="background:${m.color}"></div>
        <div class="dc-name">${m.name}</div>
      </div>
      <div class="dc-stats">
        <div class="dc-stat">
          <div class="dc-stat-val">${m.milestone_done}/${m.milestone_total}</div>
          <div class="dc-stat-label">일정</div>
        </div>
        <div class="dc-stat">
          <div class="dc-stat-val">${m.checklist_done}/${m.checklist_total}</div>
          <div class="dc-stat-label">체크리스트</div>
        </div>
      </div>
      <div class="dc-prog-label">체크리스트 진행률 ${clPct}%</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${clPct}%;background:${m.color}"></div>
      </div>
      ${m.milestone_delayed ? `<div class="dc-delayed">⚠ 지연된 일정 ${m.milestone_delayed}건</div>` : ''}
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

  let dragEl = null, placeholder = null, pid = null;
  let startX = 0, startY = 0, offsetX = 0, offsetY = 0, dragging = false;

  grid.addEventListener('pointerdown', e => {
    // 좌클릭/터치만 처리
    if (e.button !== undefined && e.button !== 0) return;
    const card = e.target.closest('.dashboard-card');
    if (!card) return;
    // "추가" 셀은 드래그 대상이 아님
    if (card.classList.contains('add-card')) return;

    pid = e.pointerId;
    dragEl = card;
    startX = e.clientX;
    startY = e.clientY;
    dragging = false;

    const onMove = ev => {
      if (!dragging) {
        // 5px 이상 이동해야 드래그 시작
        const dx = Math.abs(ev.clientX - startX);
        const dy = Math.abs(ev.clientY - startY);
        if (dx < 5 && dy < 5) return;

        dragging = true;
        const rect = dragEl.getBoundingClientRect();
        offsetX = startX - rect.left;
        offsetY = startY - rect.top;

        placeholder = document.createElement('div');
        placeholder.className = 'dash-card-placeholder';
        placeholder.style.cssText = `width:${rect.width}px;height:${rect.height}px;`;
        dragEl.parentNode.insertBefore(placeholder, dragEl);

        dragEl.classList.add('dragging');
        dragEl.style.position = 'fixed';
        dragEl.style.zIndex = '9999';
        dragEl.style.width = rect.width + 'px';
        dragEl.style.height = rect.height + 'px';
        dragEl.style.left = rect.left + 'px';
        dragEl.style.top = rect.top + 'px';
        dragEl.style.pointerEvents = 'none';
        dragEl.style.cursor = 'grabbing';

        try { card.setPointerCapture(pid); } catch {}
      }

      // 드래그 중 위치 업데이트
      dragEl.style.left = (ev.clientX - offsetX) + 'px';
      dragEl.style.top  = (ev.clientY - offsetY) + 'px';

      // 같은 그리드 내에서만 placeholder 위치 변경 (추가 셀 제외)
      const others = [...grid.querySelectorAll('.dashboard-card:not(.dragging):not(.add-card)')];
      const addCard = grid.querySelector('.add-card');
      let inserted = false;
      for (const c of others) {
        const rc = c.getBoundingClientRect();
        const midX = rc.left + rc.width / 2;
        const midY = rc.top  + rc.height / 2;
        if (Math.abs(ev.clientY - midY) < rc.height / 2) {
          if (ev.clientX < midX) {
            grid.insertBefore(placeholder, c);
            inserted = true;
            break;
          }
        } else if (ev.clientY < midY) {
          grid.insertBefore(placeholder, c);
          inserted = true;
          break;
        }
      }
      // "추가" 셀 바로 앞에 삽입 (항상 마지막에 추가 셀 유지)
      if (!inserted) {
        if (addCard) grid.insertBefore(placeholder, addCard);
        else grid.appendChild(placeholder);
      }
    };

    const onUp = async ev => {
      try { card.releasePointerCapture(pid); } catch {}
      grid.removeEventListener('pointermove', onMove);
      grid.removeEventListener('pointerup', onUp);
      grid.removeEventListener('pointercancel', onUp);

      if (!dragging) {
        // 단순 클릭 - 정상 처리되도록 그냥 종료
        dragEl = null; pid = null;
        return;
      }

      // 드래그 종료 - 위치 확정
      placeholder.parentNode.insertBefore(dragEl, placeholder);
      placeholder.remove();
      dragEl.classList.remove('dragging');
      dragEl.style.cssText = '';

      // 클릭 이벤트가 직후에 발생하지 않도록 차단
      window._dashDragJustHappened = true;
      setTimeout(() => { window._dashDragJustHappened = false; }, 100);

      // 새 순서를 서버에 저장 ("추가" 셀 제외)
      const ids = [...grid.querySelectorAll('.dashboard-card:not(.add-card)')]
        .map(c => Number(c.dataset.modelId))
        .filter(n => Number.isFinite(n));
      try {
        await POST('/api/models/reorder', { category, ids });
        toast('순서가 변경되었습니다', 'success');
        state.models = await GET('/api/models');
      } catch (err) {
        toast('순서 저장 실패', 'error');
      }

      dragEl = null; placeholder = null; pid = null; dragging = false;
    };

    grid.addEventListener('pointermove', onMove);
    grid.addEventListener('pointerup', onUp);
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

  // 카테고리별 탭 표시 제어 (모니터링은 체크시트 숨김)
  const checklistTab = document.querySelector('.tab[data-tab="checklist"]');
  if (checklistTab) {
    checklistTab.style.display = (m.category === 'monitoring') ? 'none' : '';
  }

  // 탭 초기화
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'milestone'));
  await loadTab('milestone');
}

// ── Tab Switching ────────────────────────────────────────────
async function loadTab(tab) {
  // 모니터링 카테고리는 체크시트 비활성화 → 일정표로 리다이렉트
  if (tab === 'checklist' && state.activeModel?.category === 'monitoring') {
    tab = 'milestone';
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'milestone'));
  }

  state.activeTab = tab;
  const body = document.getElementById('tab-body');
  body.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8">불러오는 중...</div>';

  if (tab === 'milestone') await renderMilestone(body);
  if (tab === 'checklist') await renderChecklist(body);
  if (tab === 'memo')      await renderMemo(body);
  if (tab === 'settings')  await renderSettings(body);
}

// ── ① 일정표 (Milestone) ─────────────────────────────────────
async function renderMilestone(body) {
  const mid    = state.activeModel.id;
  const items  = await GET(`/api/models/${mid}/milestones`);
  const subs   = []; // 더 이상 그룹 분류 안함

  const total   = items.length;
  const done    = items.filter(x => x.status === 'completed').length;
  const inProg  = items.filter(x => x.status === 'in_progress').length;
  const delayed = items.filter(x => x.status === 'delayed').length;

  const today = new Date().toISOString().slice(0,10);

  body.innerHTML = `
    <div class="milestone-toolbar">
      <div class="milestone-summary">
        <div class="ms-pill total">  전체 ${total}</div>
        <div class="ms-pill done">  ✓ 완료 ${done}</div>
        <div class="ms-pill prog">  ◎ 진행중 ${inProg}</div>
        <div class="ms-pill delayed">⚠ 지연 ${delayed}</div>
      </div>
      <button class="btn-primary" id="btn-add-ms">＋ 일정 추가</button>
    </div>
    <div id="ms-list"></div>
  `;

  const msList = document.getElementById('ms-list');
  if (!total) {
    msList.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div>일정을 추가해 진행 상황을 관리하세요</div>`;
  } else {
    items.forEach(it => msList.appendChild(makeMsItem(it, today)));
  }

  document.getElementById('btn-add-ms').addEventListener('click', () => openMsModal(null, []));
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

  div.innerHTML = `
    <div class="ms-status-dot" style="background:${STATUS_DOT[it.status]}"></div>
    <div class="ms-body">
      <div class="ms-title">${it.title}</div>
      ${it.description ? `<div class="ms-desc">${it.description}</div>` : ''}
      <div class="ms-meta">
        ${dateStr ? `<div class="ms-date ${overdue ? 'overdue':''}">${dateStr}${overdue ? ' 지연':''}</div>` : ''}
        <span class="status-badge status-${it.status}">${STATUS_LABELS[it.status]}</span>
      </div>
      ${it.note ? `<div class="ms-note">📝 ${it.note}</div>` : ''}
    </div>
    <div class="ms-actions">
      <button class="btn-xs" data-action="edit-ms" data-id="${it.id}" title="편집">✎</button>
      <button class="btn-xs danger" data-action="del-ms" data-id="${it.id}" title="삭제">✕</button>
    </div>
  `;
  return div;
}

document.getElementById('tab-body').addEventListener('click', async e => {
  const action = e.target.dataset.action;
  if (!action) return;
  const id = Number(e.target.dataset.id);
  const mid = state.activeModel?.id;

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
});

function openMsModal(item, subs) {
  const body = `
    <div class="form-group">
      <label class="form-label">제목 *</label>
      <input class="form-input" id="ms-title" value="${item?.title || ''}" placeholder="제목 입력">
    </div>
    <div class="form-group">
      <label class="form-label">설명</label>
      <textarea class="form-textarea" id="ms-desc" placeholder="상세 내용">${item?.description || ''}</textarea>
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
    const title = document.getElementById('ms-title').value.trim();
    if (!title) { toast('제목을 입력하세요', 'error'); return; }

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

// ── ② 체크시트 ───────────────────────────────────────────────
async function renderChecklist(body) {
  const mid   = state.activeModel.id;
  const items = await GET(`/api/models/${mid}/checklist`);

  const total   = items.length;
  const done    = items.filter(x => x.status === 'completed').length;
  const pct     = total ? Math.round(done / total * 100) : 0;
  const color   = state.activeModel.color;
  const today   = new Date().toISOString().slice(0,10);

  body.innerHTML = `
    <div class="checklist-overall">
      <div class="checklist-overall-title">전체 진행률</div>
      <div class="checklist-overall-row">
        <div class="overall-pct">${pct}%</div>
        <div class="overall-bar-wrap">
          <div class="overall-bar-bg">
            <div class="overall-bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <div class="overall-sub">${done} / ${total} 완료</div>
        </div>
      </div>
    </div>
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
    items.forEach(it => tbody.appendChild(makeClRow(it, today)));
  }

  document.getElementById('btn-add-cl').addEventListener('click', () => openCheckModal(null));
}

function makeClRow(it, today) {
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
  return tr;
}

function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;')
    .replace(/\n/g,'<br>');
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

// ── ③ 메모장 ─────────────────────────────────────────────────
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
    document.getElementById('mobile-badge').style.background = updated.color;
    toast('저장되었습니다', 'success');
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

document.addEventListener('DOMContentLoaded', async () => {
  startClock();
  attachPrintHandler();
  await init();
});
