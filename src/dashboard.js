import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { signIn, getCurrentUser, signOut, fetchAuthSession, resetPassword, confirmResetPassword, deleteUser } from 'aws-amplify/auth';
import { uploadData, remove } from 'aws-amplify/storage';
import outputs from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(outputs);
const client = generateClient({ authMode: 'userPool' });

const loginCard = document.getElementById('login-card');
const dashboardCard = document.getElementById('dashboard-card');
const logoutBtn = document.getElementById('logout-btn');
const loginBtn = document.getElementById('login-btn');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');

const forgotPasswordCard = document.getElementById('forgot-password-card');
const forgotPasswordLink = document.getElementById('forgot-password-link');
const backToLoginLink = document.getElementById('back-to-login-link');
const forgotRequestForm = document.getElementById('forgot-request-form');
const forgotConfirmForm = document.getElementById('forgot-confirm-form');
const forgotSendBtn = document.getElementById('forgot-send-btn');
const forgotConfirmBtn = document.getElementById('forgot-confirm-btn');
const forgotErrorMsg = document.getElementById('forgot-error-msg');
const forgotErrorText = document.getElementById('forgot-error-text');
const forgotSuccessMsg = document.getElementById('forgot-success-msg');
const forgotSuccessText = document.getElementById('forgot-success-text');

let pendingResetEmail = '';

let allSubmissions = [];
let allEvents = [];
let currentVendorSub = '';
let currentVendorProfile = null;

try {
  await getCurrentUser();
  showDashboard();
} catch {
  // not logged in
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

forgotPasswordLink.addEventListener('click', () => {
  loginCard.style.display = 'none';
  forgotPasswordCard.style.display = 'block';
});

backToLoginLink.addEventListener('click', () => {
  forgotPasswordCard.style.display = 'none';
  forgotRequestForm.style.display = 'block';
  forgotConfirmForm.style.display = 'none';
  forgotErrorMsg.style.display = 'none';
  forgotSuccessMsg.style.display = 'none';
  loginCard.style.display = 'block';
});

forgotSendBtn.addEventListener('click', async () => {
  const email = document.getElementById('forgot-email').value.trim();
  forgotErrorMsg.style.display = 'none';

  if (!email) {
    showForgotError('Please enter your email address.');
    return;
  }

  forgotSendBtn.disabled = true;
  forgotSendBtn.textContent = 'Sending…';

  try {
    await resetPassword({ username: email });
    pendingResetEmail = email;
    forgotRequestForm.style.display = 'none';
    forgotConfirmForm.style.display = 'block';
  } catch (err) {
    console.error(err);
    showForgotError(err.message || 'Failed to send reset code. Please try again.');
  } finally {
    forgotSendBtn.disabled = false;
    forgotSendBtn.textContent = 'Send reset code';
  }
});

forgotConfirmBtn.addEventListener('click', async () => {
  const code = document.getElementById('forgot-code').value.trim();
  const newPassword = document.getElementById('forgot-new-password').value;
  forgotErrorMsg.style.display = 'none';

  if (!code || code.length !== 6) {
    showForgotError('Please enter the 6-digit code from your email.');
    return;
  }
  if (!newPassword || newPassword.length < 8) {
    showForgotError('Password must be at least 8 characters.');
    return;
  }

  forgotConfirmBtn.disabled = true;
  forgotConfirmBtn.textContent = 'Resetting…';

  try {
    await confirmResetPassword({ username: pendingResetEmail, confirmationCode: code, newPassword });
    forgotConfirmForm.style.display = 'none';
    forgotSuccessText.textContent = 'Password reset. You can now log in with your new password.';
    forgotSuccessMsg.style.display = 'block';
  } catch (err) {
    console.error(err);
    showForgotError(err.message || 'Failed to reset password. Please try again.');
  } finally {
    forgotConfirmBtn.disabled = false;
    forgotConfirmBtn.textContent = 'Reset password';
  }
});

function showForgotError(message) {
  forgotErrorText.textContent = message;
  forgotErrorMsg.style.display = 'block';
}

function showError(message) {
  errorText.textContent = message;
  errorMsg.style.display = 'block';
}

async function showDashboard() {
  loginCard.style.display = 'none';
  dashboardCard.style.display = 'block';
  logoutBtn.style.display = 'inline-block';

  // Complete vendor profile creation if pending from registration
  const pending = localStorage.getItem('pendingVendorProfile');
  if (pending) {
    try {
      const profile = JSON.parse(pending);

      // Upload logo now that the user is authenticated
      const pendingLogo = localStorage.getItem('pendingVendorLogo');
      if (pendingLogo) {
        const { data: dataUrl, type, ext } = JSON.parse(pendingLogo);
        // Use identityId (Identity Pool ID) — this is what {entity_id} maps to in storage rules
        const session = await fetchAuthSession();
        const identityId = session.identityId;
        const key = `logos/${identityId}/logo.${ext}`;
        // Decode base64 data URL → Uint8Array → Blob
        const base64 = dataUrl.split(',')[1];
        const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const blob = new Blob([binary], { type });
        await uploadData({ path: key, data: blob, options: { contentType: type } }).result;
        profile.logoKey = key;
        localStorage.removeItem('pendingVendorLogo');
      }

      const { errors } = await client.models.Vendor.create(profile);
      if (errors) {
        console.error('Vendor.create errors:', errors);
      } else {
        localStorage.removeItem('pendingVendorProfile');
      }
    } catch (err) {
      console.error('Failed to save vendor profile:', err);
    }
  }

  // Load vendor profile AFTER the pending profile has been flushed above
  await loadVendorProfile();

  try {
    const { userId } = await getCurrentUser();
    currentVendorSub = userId;
  } catch (err) {
    console.error('Failed to get current user:', err);
  }

  const loadingMsg = document.getElementById('loading-msg');
  const emptyMsg = document.getElementById('empty-msg');
  const table = document.getElementById('submissions-table');

  try {
    const [eventsResult, submissionsResult] = await Promise.all([
      client.models.Event.list({
        filter: {
          or: [
            { vendorId: { eq: currentVendorSub } },
            { vendorId: { attributeExists: false } },
          ]
        }
      }),
      client.models.Submission.list({
        filter: {
          or: [
            { vendorId: { eq: currentVendorSub } },
            { vendorId: { attributeExists: false } },
          ]
        }
      }),
    ]);

    if (eventsResult.errors || submissionsResult.errors) {
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

async function loadVendorProfile() {
  let companyName = null;

  try {
    const { data, errors } = await client.models.Vendor.list({
      authMode: 'userPool',
    });
    if (!errors && data && data.length > 0) {
      currentVendorProfile = data[0];
      companyName = data[0].companyName;
    }
  } catch (err) {
    console.error('Failed to load vendor profile from DB:', err);
  }

  // Fallback: read from localStorage if DB returned nothing
  if (!companyName) {
    const pending = localStorage.getItem('pendingVendorProfile');
    if (pending) {
      try {
        companyName = JSON.parse(pending).companyName || null;
      } catch { /* ignore */ }
    }
  }

  if (!companyName) return;

  const headerCompany = document.getElementById('header-company');
  const headerTitle = document.getElementById('header-title');
  if (headerCompany) headerCompany.textContent = companyName;
  if (headerTitle) headerTitle.textContent = `${companyName} dashboard`;
  document.title = `Dashboard — ${companyName}`;
}

function renderEventFilter() {
  const filterContainer = document.getElementById('event-filter-container');
  if (!filterContainer) return;

  // Unique events from submissions
  const uniqueEvents = [...new Map(
    allSubmissions
      .filter(s => s.eventId && s.eventName)
      .map(s => [s.eventId, { id: s.eventId, name: s.eventName, slug: s.eventSlug || null }])
  ).values()];

  // Include events with no submissions yet, using their stored slug
  allEvents.forEach(e => {
    if (!uniqueEvents.find(u => u.id === e.id)) {
      uniqueEvents.push({ id: e.id, name: e.name, slug: e.slug });
    }
  });

  const baseUrl = window.location.origin;

  filterContainer.innerHTML = `
    <label for="event-filter" style="font-size: 12px; font-weight: 500; color: #666; margin-right: 8px;">View Submissions by Event:</label>
    <select id="event-filter" style="padding: 6px 10px; border-radius: 4px; border: 1px solid #c7c9cf; font-size: 13px;">
      <option value="">All events</option>
      ${uniqueEvents.map(e => `<option value="${escapeHtml(e.name)}">${escapeHtml(e.name)}</option>`).join('')}
    </select>
    <div style="margin-top: 8px; font-size: 11px; color: #666;">
      Event form URLs (use these for QR codes):
      ${uniqueEvents.map(e => {
        const url = `${baseUrl}/e/${encodeURIComponent(e.slug)}`;
        return `
          <div style="margin-top: 4px;">
            <strong>${escapeHtml(e.name)}:</strong>
            <a href="${url}" target="_blank" style="color: #0C447C; word-break: break-all;">${url}</a>
          </div>
        `;
      }).join('')}
    </div>
  `;

  document.getElementById('event-filter').addEventListener('change', (ev) => {
    const name = ev.target.value;
    const filtered = name
      ? allSubmissions.filter(s => s.eventName === name)
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

  submissions
    .slice()
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    .forEach((s) => {
      const row = document.createElement('tr');
      const submittedDate = s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—';
      row.innerHTML = `
        <td>${escapeHtml(s.eventName || '—')}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.email)}</td>
        <td>${escapeHtml(s.phone)}</td>
        <td class="${s.consent ? 'consent-yes' : 'consent-no'}">${s.consent ? 'Yes' : 'No'}</td>
        <td>${submittedDate}</td>
      `;
      tbody.appendChild(row);
    });
}

document.addEventListener('DOMContentLoaded', () => {
  const addEventBtn = document.getElementById('add-event-btn');
  if (addEventBtn) addEventBtn.addEventListener('click', handleAddEvent);

  const deleteAccountBtn = document.getElementById('delete-account-btn');
  if (deleteAccountBtn) deleteAccountBtn.addEventListener('click', handleDeleteAccount);
});

async function handleDeleteAccount() {
  const msg = document.getElementById('delete-account-msg');
  const btn = document.getElementById('delete-account-btn');

  const confirmed = window.confirm(
    'This will permanently delete your account, all of your events, and all submissions. This cannot be undone. Continue?'
  );
  if (!confirmed) return;

  btn.disabled = true;
  btn.textContent = 'Deleting…';
  msg.style.display = 'none';

  try {
    const { data: submissions } = await client.models.Submission.list({
      filter: { vendorId: { eq: currentVendorSub } },
    });
    for (const submission of submissions || []) {
      await client.models.Submission.delete({ id: submission.id });
    }

    const { data: events } = await client.models.Event.list({
      filter: { vendorId: { eq: currentVendorSub } },
    });
    for (const event of events || []) {
      await client.models.Event.delete({ id: event.id });
    }

    if (currentVendorProfile?.logoKey) {
      await remove({ path: currentVendorProfile.logoKey });
    }

    if (currentVendorProfile?.id) {
      await client.models.Vendor.delete({ id: currentVendorProfile.id });
    }

    await deleteUser();
    location.reload();
  } catch (err) {
    console.error('Failed to delete account:', err);
    msg.textContent = 'Failed to delete account. Please try again.';
    msg.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Delete my account';
  }
}

async function handleAddEvent() {
  const input = document.getElementById('new-event-name');
  const msg = document.getElementById('add-event-msg');
  const name = input.value.trim();
  const eventUrl = document.getElementById('new-event-url').value.trim() || null;
  const startDate = document.getElementById('new-event-start').value || null;
  const endDate = document.getElementById('new-event-end').value || null;

  msg.style.display = 'none';

  if (!name) {
    msg.textContent = 'Please enter an event name.';
    msg.style.color = '#b42318';
    msg.style.display = 'block';
    return;
  }

  const duplicate = allEvents.some(e => e.name.toLowerCase() === name.toLowerCase());
  if (duplicate) {
    msg.textContent = 'An event with this name already exists.';
    msg.style.color = '#b42318';
    msg.style.display = 'block';
    return;
  }

  const slug = generateSlug(name);

  try {
    const { data, errors } = await client.models.Event.create({
      name,
      slug,
      vendorId: currentVendorSub,
      eventUrl,
      startDate,
      endDate,
      vendorCompanyName: currentVendorProfile?.companyName,
      vendorDescription: currentVendorProfile?.description,
      vendorLogoKey: currentVendorProfile?.logoKey,
      vendorPhone: currentVendorProfile?.phone,
      vendorContactEmail: currentVendorProfile?.email,
      vendorBrandColor: currentVendorProfile?.brandColor,
    });

    if (errors) {
      console.error(errors);
      msg.textContent = 'Failed to create event.';
      msg.style.color = '#b42318';
      msg.style.display = 'block';
      return;
    }

    allEvents.push(data);
    renderEventFilter();
    input.value = '';
    document.getElementById('new-event-url').value = '';
    document.getElementById('new-event-start').value = '';
    document.getElementById('new-event-end').value = '';

    const shortUrl = `${window.location.origin}/e/${encodeURIComponent(slug)}`;
    msg.textContent = `"${name}" added. Share link: ${shortUrl}`;
    msg.style.color = '#1e6b2e';
    msg.style.display = 'block';
  } catch (err) {
    console.error(err);
    msg.textContent = 'Failed to create event.';
    msg.style.color = '#b42318';
    msg.style.display = 'block';
  }
}

// Generates a URL-friendly slug from an event name
function generateSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
