import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { signIn, getCurrentUser, signOut } from 'aws-amplify/auth';
import outputs from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(outputs);
const client = generateClient({ authMode: 'userPool' });

const loginCard = document.getElementById('login-card');
const dashboardCard = document.getElementById('dashboard-card');
const logoutBtn = document.getElementById('logout-btn');
const loginBtn = document.getElementById('login-btn');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');

let allSubmissions = [];
let allEvents = [];

// Check if already logged in on page load
try {
  await getCurrentUser();
  showDashboard();
} catch {
  // not logged in, show login form
}

loginBtn.addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  errorMsg.style.display = 'none';

  if (!email || !password) {
    showError('Please enter both email and password.');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in…';

  try {
    const result = await signIn({ username: email, password });

    if (result.isSignedIn) {
      showDashboard();
    } else {
      showError('Additional sign-in step required. Please contact the administrator.');
    }
  } catch (err) {
    console.error(err);
    showError('Incorrect email or password.');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Log in';
  }
});

logoutBtn.addEventListener('click', async () => {
  await signOut();
  location.reload();
});

function showError(message) {
  errorText.textContent = message;
  errorMsg.style.display = 'block';
}

async function showDashboard() {
  loginCard.style.display = 'none';
  dashboardCard.style.display = 'block';
  logoutBtn.style.display = 'inline-block';

  const loadingMsg = document.getElementById('loading-msg');
  const emptyMsg = document.getElementById('empty-msg');
  const table = document.getElementById('submissions-table');

  try {
    const [eventsResult, submissionsResult] = await Promise.all([
      client.models.Event.list(),
      client.models.Submission.list(),
    ]);

    if (eventsResult.errors || submissionsResult.errors) {
      console.error(eventsResult.errors, submissionsResult.errors);
      showError('Failed to load dashboard data.');
      return;
    }

    allEvents = eventsResult.data || [];
    allSubmissions = submissionsResult.data || [];

    loadingMsg.style.display = 'none';

    renderEventFilter();

    if (allSubmissions.length === 0) {
      emptyMsg.style.display = 'block';
      return;
    }

    renderTable(allSubmissions);
    table.style.display = 'table';
  } catch (err) {
    console.error(err);
    loadingMsg.style.display = 'none';
    showError('Failed to load dashboard data.');
  }
}

function renderEventFilter() {
  const filterContainer = document.getElementById('event-filter-container');
  if (!filterContainer) return;

  const eventMap = new Map(allEvents.map(e => [e.id, e.name]));

  filterContainer.innerHTML = `
    <label for="event-filter" style="font-size: 12px; font-weight: 500; color: #666; margin-right: 8px;">Filter by event:</label>
    <select id="event-filter" style="padding: 6px 10px; border-radius: 4px; border: 1px solid #c7c9cf; font-size: 13px;">
      <option value="">All events</option>
      ${allEvents.map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('')}
    </select>
  `;

  document.getElementById('event-filter').addEventListener('change', (e) => {
    const eventId = e.target.value;
    const filtered = eventId
      ? allSubmissions.filter(s => s.eventId === eventId)
      : allSubmissions;
    renderTable(filtered);
  });
}

function renderTable(submissions) {
  const tbody = document.getElementById('submissions-body');
  const table = document.getElementById('submissions-table');
  const emptyMsg = document.getElementById('empty-msg');

  tbody.innerHTML = '';

  if (submissions.length === 0) {
    table.style.display = 'none';
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';
  table.style.display = 'table';

  const eventMap = new Map(allEvents.map(e => [e.id, e.name]));

  submissions
    .slice()
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    .forEach((s) => {
      const row = document.createElement('tr');
      const submittedDate = s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—';
      const eventName = eventMap.get(s.eventId) || '—';
      row.innerHTML = `
        <td>${escapeHtml(eventName)}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.email)}</td>
        <td>${escapeHtml(s.phone)}</td>
        <td class="${s.consent ? 'consent-yes' : 'consent-no'}">${s.consent ? 'Yes' : 'No'}</td>
        <td>${submittedDate}</td>
      `;
      tbody.appendChild(row);
    });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}