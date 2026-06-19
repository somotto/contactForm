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
  const tbody = document.getElementById('submissions-body');

  try {
    const { data: submissions, errors } = await client.models.Submission.list();

    loadingMsg.style.display = 'none';

    if (errors) {
      console.error(errors);
      showError('Failed to load submissions.');
      return;
    }

    if (!submissions || submissions.length === 0) {
      emptyMsg.style.display = 'block';
      return;
    }

    submissions
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
      .forEach((s) => {
        const row = document.createElement('tr');
        const submittedDate = s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—';
        row.innerHTML = `
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.email)}</td>
          <td>${escapeHtml(s.phone)}</td>
          <td class="${s.consent ? 'consent-yes' : 'consent-no'}">${s.consent ? 'Yes' : 'No'}</td>
          <td>${submittedDate}</td>
        `;
        tbody.appendChild(row);
      });

    table.style.display = 'table';
  } catch (err) {
    console.error(err);
    loadingMsg.style.display = 'none';
    showError('Failed to load submissions.');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}