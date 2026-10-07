// KATAGA Marketplace Name Voting — voting page logic
const MAX_CHOICES = 2;
let names = [];
let selected = new Set();

const optionsEl = document.getElementById('options');
const counterEl = document.getElementById('counter');
const form = document.getElementById('voteForm');
const nameInput = document.getElementById('fullName');
const formError = document.getElementById('formError');
const submitBtn = document.getElementById('submitBtn');
const clearBtn = document.getElementById('clearBtn');
const confirmModal = document.getElementById('confirmModal');
const confirmList = document.getElementById('confirmList');
const cancelBtn = document.getElementById('cancelBtn');
const confirmBtn = document.getElementById('confirmBtn');
const successModal = document.getElementById('successModal');
const successMsg = document.getElementById('successMsg');
const closeSuccessBtn = document.getElementById('closeSuccessBtn');

// Defensive init: success/confirm modals MUST start hidden on every page load.
// They are only shown later, after a successful POST /api/vote response.
successModal.hidden = true;
confirmModal.hidden = true;

function showError(msg) {
  formError.textContent = msg;
  formError.hidden = false;
}
function clearError() {
  formError.hidden = true;
}

async function loadNames() {
  try {
    const res = await fetch('/api/names');
    const data = await res.json();
    names = data.names;
    renderOptions();
  } catch {
    optionsEl.innerHTML = '<p class="error-msg">Could not load the name options. Please refresh the page.</p>';
  }
}

function renderOptions() {
  optionsEl.innerHTML = '';
  names.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-card';
    btn.setAttribute('role', 'checkbox');
    btn.setAttribute('aria-checked', 'false');
    btn.innerHTML = `<span class="num">${i + 1}.</span><br>${escapeHtml(name)}<span class="tick">✔</span>`;
    btn.addEventListener('click', () => toggle(name, btn));
    btn.dataset.name = name;
    optionsEl.appendChild(btn);
  });
  refreshUI();
}

function toggle(name, btn) {
  clearError();
  if (selected.has(name)) {
    selected.delete(name);
    btn.classList.remove('selected');
    btn.setAttribute('aria-checked', 'false');
  } else if (selected.size < MAX_CHOICES) {
    selected.add(name);
    btn.classList.add('selected');
    btn.setAttribute('aria-checked', 'true');
  } else {
    showError(`You can only select TWO (2) names. Tap a selected name to change it.`);
    return;
  }
  refreshUI();
}

function refreshUI() {
  const count = selected.size;
  counterEl.textContent = `Selected: ${count}/${MAX_CHOICES}`;
  counterEl.classList.toggle('full', count === MAX_CHOICES);

  // disable unselected cards when 2 are chosen
  document.querySelectorAll('.option-card').forEach(card => {
    const isSel = selected.has(card.dataset.name);
    card.classList.toggle('disabled', count === MAX_CHOICES && !isSel);
  });

  const ready = count === MAX_CHOICES && nameInput.value.trim().length >= 2;
  submitBtn.disabled = !ready;
  clearBtn.disabled = count === 0;
}

nameInput.addEventListener('input', () => {
  clearError();
  refreshUI();
});

clearBtn.addEventListener('click', () => {
  selected.clear();
  document.querySelectorAll('.option-card').forEach(c => {
    c.classList.remove('selected');
    c.setAttribute('aria-checked', 'false');
  });
  clearError();
  refreshUI();
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  clearError();

  const fullName = nameInput.value.trim().replace(/\s+/g, ' ');
  // Client-side convenience check (server enforces this authoritatively).
  const meaningful = fullName.toLowerCase().replace(/\./g, ' ').split(/\s+/)
    .filter(w => w.length >= 2 && !['de','del','dela','da','di','du','los','las','san','santa','sto','sta','jr','sr','ii','iii','iv'].includes(w));
  if (meaningful.length < 2) {
    showError('Please enter your full name (first name and last name).');
    nameInput.focus();
    return;
  }
  if (selected.size !== MAX_CHOICES) {
    showError('Please select exactly TWO (2) names before submitting.');
    return;
  }

  // Confirmation modal
  confirmList.innerHTML =
    `<li>1. ${escapeHtml([...selected][0])}</li>
     <li>2. ${escapeHtml([...selected][1])}</li>
     <li>Voter: ${escapeHtml(fullName)}</li>`;
  confirmModal.hidden = false;
  confirmBtn.focus();
});

cancelBtn.addEventListener('click', closeModal);
confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) closeModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !confirmModal.hidden) closeModal();
});

function closeModal() {
  confirmModal.hidden = true;
}

confirmBtn.addEventListener('click', async () => {
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Submitting…';
  try {
    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: nameInput.value.trim().replace(/\s+/g, ' '),
        choices: [...selected]
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      closeModal();
      successMsg.textContent = data.message || 'Thank you for voting!';
      successModal.hidden = false;
    } else {
      closeModal();
      showError(data.error || 'Something went wrong. Please try again.');
    }
  } catch {
    closeModal();
    showError('Could not reach the server. Please check your connection and try again.');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Yes, Submit Vote';
  }
});

closeSuccessBtn.addEventListener('click', () => {
  successModal.hidden = true;
  // reset the form so a new voter at the same device can vote
  selected.clear();
  nameInput.value = '';
  document.querySelectorAll('.option-card').forEach(c => {
    c.classList.remove('selected');
    c.setAttribute('aria-checked', 'false');
  });
  refreshUI();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

loadNames();
