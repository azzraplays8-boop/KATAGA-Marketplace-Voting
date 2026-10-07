// KATAGA Admin Dashboard logic
const loginSection = document.getElementById('loginSection');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const searchBox = document.getElementById('searchBox');
const exportBtn = document.getElementById('exportBtn');
const memberSearchBox = document.getElementById('memberSearchBox');

let resultsData = null;
let memberData = null;
let memberFilter = 'all';

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: document.getElementById('password').value })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      document.getElementById('password').value = '';
      showDashboard();
    } else {
      loginError.textContent = data.error || 'Login failed.';
      loginError.hidden = false;
    }
  } catch {
    loginError.textContent = 'Could not reach the server.';
    loginError.hidden = false;
  }
});

logoutBtn.addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  dashboard.hidden = true;
  logoutBtn.hidden = true;
  loginSection.hidden = false;
});

async function showDashboard() {
  loginSection.hidden = true;
  dashboard.hidden = false;
  logoutBtn.hidden = false;
  await Promise.all([loadResults(), loadMemberStatus()]);
}

// ---------- Member Voting Status (admin-only) ----------
async function loadMemberStatus() {
  try {
    const res = await fetch('/api/admin/members');
    if (res.status === 401) {
      dashboard.hidden = true;
      logoutBtn.hidden = true;
      loginSection.hidden = false;
      return;
    }
    memberData = await res.json();
    renderMembers();
  } catch {
    // keep the rest of the dashboard usable if this section fails
  }
}

function memberStatusBadge(status) {
  if (status === 'voted') return '<span class="badge badge-voted">✅ Voted</span>';
  if (status === 'needs_review') return '<span class="badge badge-review">⚠️ Needs Review</span>';
  return '<span class="badge badge-pending">⏳ Not Yet Voted</span>';
}

function renderMembers() {
  if (!memberData) return;
  const { totalMembers, voted, notVoted, needsReview, participationRate, members, unmatchedSubmissions } = memberData;

  document.getElementById('statTotalMembers').textContent = totalMembers;
  document.getElementById('statVotedMembers').textContent = voted;
  document.getElementById('statNotVotedMembers').textContent = notVoted;
  document.getElementById('statReviewMembers').textContent = needsReview;
  document.getElementById('statParticipation').textContent = participationRate + '%';

  // unmatched submissions
  const uBody = document.getElementById('unmatchedBody');
  uBody.innerHTML = '';
  document.getElementById('unmatchedCount').textContent = unmatchedSubmissions.length;
  document.getElementById('noUnmatched').hidden = unmatchedSubmissions.length !== 0;
  unmatchedSubmissions.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(u.submittedName)}</td>
      <td>${escapeHtml(u.submittedAt)}</td>
      <td>${u.possibleMatches && u.possibleMatches.length ? escapeHtml(u.possibleMatches.join('; ')) : '<em>none — insufficient information</em>'}</td>`;
    uBody.appendChild(tr);
  });

  renderMembersTable();
}

function renderMembersTable() {
  if (!memberData) return;
  const q = memberSearchBox.value.trim().toLowerCase();
  const body = document.getElementById('membersBody');
  body.innerHTML = '';

  const order = { not_voted: 0, needs_review: 1, voted: 2 };
  let rows = memberData.members.filter(m =>
    (memberFilter === 'all' || m.status === memberFilter) &&
    (!q || m.name.toLowerCase().includes(q))
  );
  rows = rows.slice().sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));

  document.getElementById('noMemberMatch').hidden = rows.length !== 0;

  rows.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${memberStatusBadge(m.status)}</td>
      <td class="member-name">${escapeHtml(m.name)}</td>
      <td>${m.submittedName ? escapeHtml(m.submittedName) : '<span class="muted-dash">—</span>'}</td>
      <td>${m.submittedAt ? escapeHtml(m.submittedAt) : '<span class="muted-dash">—</span>'}</td>`;
    body.appendChild(tr);
  });
}

memberSearchBox.addEventListener('input', renderMembersTable);

document.querySelectorAll('.btn-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    memberFilter = btn.dataset.filter;
    document.querySelectorAll('.btn-filter').forEach(b => b.classList.toggle('active', b === btn));
    renderMembersTable();
  });
});

async function loadResults() {
  try {
    const res = await fetch('/api/admin/results');
    if (res.status === 401) {
      dashboard.hidden = true;
      logoutBtn.hidden = true;
      loginSection.hidden = false;
      return;
    }
    resultsData = await res.json();
    render();
  } catch {
    alert('Could not load results.');
  }
}

function render() {
  if (!resultsData) return;
  const { totalRespondents, totalVotes, results, respondents } = resultsData;

  document.getElementById('statRespondents').textContent = totalRespondents;
  document.getElementById('statVotes').textContent = totalVotes;

  const top2 = results.filter(r => r.votes > 0).slice(0, 2).map(r => `${r.name} (${r.votes})`);
  document.getElementById('statTop2').textContent = top2.length ? top2.join(' · ') : 'No votes yet';

  // ranking bars
  const max = Math.max(1, ...results.map(r => r.votes));
  const listEl = document.getElementById('resultsList');
  listEl.innerHTML = '';
  results.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'result-row' + (i < 2 && r.votes > 0 ? ' top' : '');
    row.innerHTML = `
      <span class="rank">${i + 1}</span>
      <span class="name">${escapeHtml(r.name)}</span>
      <span class="votes">${r.votes} vote${r.votes === 1 ? '' : 's'}</span>
      <span class="pct">${r.percentage}%</span>
      <div class="bar-track"><div class="bar-fill${i < 2 && r.votes > 0 ? ' top-fill' : ''}" style="width:${(r.votes / max) * 100}%"></div></div>`;
    listEl.appendChild(row);
  });

  renderTable();
}

function renderTable() {
  if (!resultsData) return;
  const q = searchBox.value.trim().toLowerCase();
  const body = document.getElementById('respondentsBody');
  body.innerHTML = '';
  const rows = resultsData.respondents.filter(r => !q || r.full_name.toLowerCase().includes(q));
  document.getElementById('respondentCount').textContent = rows.length;
  document.getElementById('noMatch').hidden = rows.length !== 0 || !q;

  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${escapeHtml(r.full_name)}</td>
      <td>${escapeHtml(r.choice1)}</td>
      <td>${escapeHtml(r.choice2)}</td>
      <td>${escapeHtml(r.submitted_at)}</td>
      <td><button class="btn btn-danger" data-id="${r.id}">Delete</button></td>`;
      tr.querySelector('button').addEventListener('click', () => deleteRespondent(r, tr));
      body.appendChild(tr);
      });
    }

    function deleteRespondent(r, tr) {
      if (!confirm(`Delete the response from "${r.full_name}"?\n\nThis will permanently remove their vote from the database. This action cannot be undone.`)) return;
      fetch(`/api/admin/respondent/${r.id}`, { method: 'DELETE' })
        .then(res => {
          if (res.ok) {
            tr.remove();
            loadResults();
            loadMemberStatus();
          } else {
        alert('Failed to delete the response.');
      }
    })
    .catch(() => alert('Could not reach the server.'));
}

searchBox.addEventListener('input', renderTable);

exportBtn.addEventListener('click', () => {
  window.location.href = '/api/admin/export.csv';
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// check session on load
fetch('/api/admin/results')
  .then(res => { if (res.ok) showDashboard(); })
  .catch(() => { });
