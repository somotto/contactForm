import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { signIn, confirmSignIn, getCurrentUser, signOut, fetchAuthSession, deleteUser, confirmSignUp, resendSignUpCode } from 'aws-amplify/auth';
import { uploadData, remove, getUrl } from 'aws-amplify/storage';
import outputs from '../amplify_outputs.json' with { type: 'json' };
import { getPendingFile, clearPendingFiles } from './pendingFiles.js';
import { applyBrandColor } from './brandColor.js';

Amplify.configure(outputs);
const client = generateClient({ authMode: 'userPool' });

const wrapEl = document.querySelector('.wrap');
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

const otpCard = document.getElementById('otp-card');
const otpHint = document.getElementById('otp-hint');
const otpVerifyBtn = document.getElementById('otp-verify-btn');
const otpErrorMsg = document.getElementById('otp-error-msg');
const otpErrorText = document.getElementById('otp-error-text');

const verifyEmailCard = document.getElementById('verify-email-card');
const verifyEmailLink = document.getElementById('verify-email-link');
const backToLoginFromVerifyLink = document.getElementById('back-to-login-from-verify-link');
const verifyRequestForm = document.getElementById('verify-request-form');
const verifyConfirmForm = document.getElementById('verify-confirm-form');
const verifySendBtn = document.getElementById('verify-send-btn');
const verifyConfirmBtn = document.getElementById('verify-confirm-btn');
const verifyResendLink = document.getElementById('verify-resend-link');
const verifyHint = document.getElementById('verify-hint');
const verifyErrorMsg = document.getElementById('verify-error-msg');
const verifyErrorText = document.getElementById('verify-error-text');
const verifySuccessMsg = document.getElementById('verify-success-msg');
const verifySuccessText = document.getElementById('verify-success-text');

let pendingResetEmail = '';
let pendingVerifyEmail = '';

let allSubmissions = [];
let allEvents = [];
let currentVendorSub = '';
let currentVendorProfile = null;
let submissionSubscription = null;
let editingEventId = null;

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
    } else if (result.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE') {
      const destination = result.nextStep.codeDeliveryDetails?.destination;
      otpHint.textContent = destination
        ? `Enter the verification code sent to ${destination}.`
        : 'Enter the verification code sent to your email.';
      otpErrorMsg.style.display = 'none';
      document.getElementById('otp-code').value = '';
      loginCard.style.display = 'none';
      otpCard.style.display = 'block';
    } else {
      showError('Additional sign-in step required. Please contact the administrator.');
    }
  } catch (err) {
    console.error(err);
    if (err.name === 'UserNotConfirmedException') {
      await startVerifyEmailFlow(email, { autoSend: true });
    } else {
      showError('Incorrect email or password.');
    }
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Log in';
  }
});

otpVerifyBtn.addEventListener('click', async () => {
  const code = document.getElementById('otp-code').value.trim();
  otpErrorMsg.style.display = 'none';

  if (!code) {
    showOtpError('Please enter the verification code.');
    return;
  }

  otpVerifyBtn.disabled = true;
  otpVerifyBtn.textContent = 'Verifying…';

  try {
    const result = await confirmSignIn({ challengeResponse: code });
    if (result.isSignedIn) {
      otpCard.style.display = 'none';
      showDashboard();
    } else {
      showOtpError('Additional sign-in step required. Please contact the administrator.');
    }
  } catch (err) {
    console.error(err);
    showOtpError('Incorrect or expired code. Please try again.');
  } finally {
    otpVerifyBtn.disabled = false;
    otpVerifyBtn.textContent = 'Verify';
  }
});

function showOtpError(message) {
  otpErrorText.textContent = message;
  otpErrorMsg.style.display = 'block';
}

// Self-service flow for accounts that registered but never completed email
// confirmation — Cognito otherwise leaves them stuck (can't log in, and can't
// use the custom password-reset flow either, since requestPasswordReset
// requires a CONFIRMED account). Reuses confirmSignUp/resendSignUpCode, the
// same APIs register.js uses right after signUp.
async function startVerifyEmailFlow(email, { autoSend = false } = {}) {
  loginCard.style.display = 'none';
  otpCard.style.display = 'none';
  forgotPasswordCard.style.display = 'none';
  verifyEmailCard.style.display = 'block';
  verifyErrorMsg.style.display = 'none';
  verifySuccessMsg.style.display = 'none';
  document.getElementById('verify-email').value = email;
  pendingVerifyEmail = email;

  if (autoSend) {
    const sent = await sendVerificationCode(email);
    verifyRequestForm.style.display = sent ? 'none' : 'block';
    verifyConfirmForm.style.display = sent ? 'block' : 'none';
  } else {
    verifyRequestForm.style.display = 'block';
    verifyConfirmForm.style.display = 'none';
  }
}

async function sendVerificationCode(email) {
  try {
    const result = await resendSignUpCode({ username: email });
    const destination = result?.destination;
    verifyHint.textContent = destination
      ? `Your email isn't verified yet. Enter the code sent to ${destination}.`
      : "Your email isn't verified yet. Enter the code we just sent you.";
    return true;
  } catch (err) {
    console.error(err);
    if (err.name === 'InvalidParameterException') {
      showVerifyError('This account is already verified — try logging in, or use "Forgot password?" instead.');
    } else if (err.name === 'UserNotFoundException') {
      showVerifyError('No account found with that email address.');
    } else {
      showVerifyError(err.message || 'Failed to send verification code. Please try again.');
    }
    return false;
  }
}

function showVerifyError(message) {
  verifyErrorText.textContent = message;
  verifyErrorMsg.style.display = 'block';
}

verifyEmailLink.addEventListener('click', () => {
  startVerifyEmailFlow(document.getElementById('login-email').value.trim());
});

backToLoginFromVerifyLink.addEventListener('click', () => {
  verifyEmailCard.style.display = 'none';
  verifyErrorMsg.style.display = 'none';
  verifySuccessMsg.style.display = 'none';
  loginCard.style.display = 'block';
});

verifySendBtn.addEventListener('click', async () => {
  const email = document.getElementById('verify-email').value.trim();
  verifyErrorMsg.style.display = 'none';

  if (!email) {
    showVerifyError('Please enter your email address.');
    return;
  }

  verifySendBtn.disabled = true;
  verifySendBtn.textContent = 'Sending…';

  pendingVerifyEmail = email;
  const sent = await sendVerificationCode(email);
  if (sent) {
    verifyRequestForm.style.display = 'none';
    verifyConfirmForm.style.display = 'block';
  }

  verifySendBtn.disabled = false;
  verifySendBtn.textContent = 'Send verification code';
});

verifyResendLink.addEventListener('click', async () => {
  await sendVerificationCode(pendingVerifyEmail);
});

verifyConfirmBtn.addEventListener('click', async () => {
  const code = document.getElementById('verify-code').value.trim();
  verifyErrorMsg.style.display = 'none';

  if (!code || code.length !== 6) {
    showVerifyError('Please enter the 6-digit code from your email.');
    return;
  }

  verifyConfirmBtn.disabled = true;
  verifyConfirmBtn.textContent = 'Verifying…';

  try {
    await confirmSignUp({ username: pendingVerifyEmail, confirmationCode: code });
    verifyConfirmForm.style.display = 'none';
    verifySuccessText.textContent = 'Email verified! You can now log in.';
    verifySuccessMsg.style.display = 'block';
  } catch (err) {
    console.error(err);
    if (err.name === 'CodeMismatchException') {
      showVerifyError('Incorrect code. Please check your email and try again.');
    } else if (err.name === 'ExpiredCodeException') {
      showVerifyError('Code has expired. Click "Resend code" to get a new one.');
    } else {
      showVerifyError(err.message || 'Verification failed. Please try again.');
    }
  } finally {
    verifyConfirmBtn.disabled = false;
    verifyConfirmBtn.textContent = 'Verify email';
  }
});

logoutBtn.addEventListener('click', async () => {
  if (submissionSubscription) {
    submissionSubscription.unsubscribe();
    submissionSubscription = null;
  }
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
    const { errors } = await client.mutations.requestPasswordReset(
      { email },
      { authMode: 'apiKey' }
    );
    const message = errors?.[0]?.message || '';

    if (!errors) {
      pendingResetEmail = email;
      forgotRequestForm.style.display = 'none';
      forgotConfirmForm.style.display = 'block';
    } else if (message.includes('AccountNotConfirmed')) {
      // Registration was never confirmed, so there's no password to reset yet.
      forgotPasswordCard.style.display = 'none';
      await startVerifyEmailFlow(email, { autoSend: true });
    } else if (message.includes('NoAccountFound')) {
      showForgotError('No account found with that email address.');
    } else if (message.includes('TooManyRequests')) {
      showForgotError('A code was already sent recently. Check your email, or wait a minute and try again.');
    } else {
      showForgotError(message || 'Failed to send reset code. Please try again.');
    }
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
    const { errors } = await client.mutations.confirmPasswordReset(
      { email: pendingResetEmail, code, newPassword },
      { authMode: 'apiKey' }
    );
    const message = errors?.[0]?.message || '';

    if (!errors) {
      forgotConfirmForm.style.display = 'none';
      forgotSuccessText.textContent = 'Password reset. You can now log in with your new password.';
      forgotSuccessMsg.style.display = 'block';
    } else if (message.includes('CodeMismatch')) {
      showForgotError('Incorrect code. Please check your email and try again.');
    } else if (message.includes('CodeExpiredOrInvalid')) {
      showForgotError('Code has expired. Please request a new one.');
    } else if (message.includes('TooManyAttempts')) {
      showForgotError('Too many incorrect attempts. Please request a new code.');
    } else {
      showForgotError(message || 'Failed to reset password. Please try again.');
    }
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
  document.getElementById('edit-profile-btn').style.display = 'inline-block';
  document.getElementById('nav-cta').style.display = 'none'; // "Register" makes no sense once logged in
  wrapEl.classList.add('dashboard-active');
  document.body.classList.add('dashboard-active');

  // Complete vendor profile creation if pending from registration
  const pending = localStorage.getItem('pendingVendorProfile');
  if (pending) {
    try {
      const profile = JSON.parse(pending);

      // Use identityId (Identity Pool ID) — this is what {entity_id} maps to in storage rules
      const { identityId } = await fetchAuthSession();

      // Upload logo now that the user is authenticated
      const pendingLogo = localStorage.getItem('pendingVendorLogo');
      if (pendingLogo) {
        const { data: dataUrl, type, ext } = JSON.parse(pendingLogo);
        const key = `logos/${identityId}/logo.${ext}`;
        // Decode base64 data URL → Uint8Array → Blob
        const base64 = dataUrl.split(',')[1];
        const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const blob = new Blob([binary], { type });
        await uploadData({ path: key, data: blob, options: { contentType: type } }).result;
        profile.logoKey = key;
        localStorage.removeItem('pendingVendorLogo');
      }

      const video = await uploadPendingFile('video', identityId, 'video');
      if (video) profile.videoKey = video.key;
      const profileDoc = await uploadPendingFile('profileDoc', identityId, 'company-profile');
      if (profileDoc) {
        profile.profileDocKey = profileDoc.key;
        profile.profileDocName = profileDoc.fileName;
      }

      const { errors } = await client.models.Vendor.create(profile);
      if (errors) {
        console.error('Vendor.create errors:', errors);
      } else {
        localStorage.removeItem('pendingVendorProfile');
        await clearPendingFiles().catch((err) => console.error('Failed to clear pending files:', err));
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
    // Event/Submission authorization is owner-scoped by vendorId (see
    // amplify/data/resource.ts), so list() already returns only this
    // vendor's own rows server-side — no client-side filter needed.
    const [eventsResult, submissionsResult] = await Promise.all([
      client.models.Event.list(),
      client.models.Submission.list(),
    ]);

    if (eventsResult.errors || submissionsResult.errors) {
      showError('Failed to load dashboard data.');
      return;
    }

    allEvents = eventsResult.data || [];
    allSubmissions = submissionsResult.data || [];

    loadingMsg.style.display = 'none';
    renderEventFilter();
    renderEventsList();
    resetEventForm();
    subscribeToNewSubmissions();

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

// Uploads an optional file stashed by register.js (see pendingFiles.js).
// Unlike the logo, a failure is logged and skipped rather than blocking
// Vendor.create — these fields are optional, and a large video is the
// likeliest upload to fail.
async function uploadPendingFile(name, identityId, baseName) {
  try {
    const file = await getPendingFile(name);
    if (!file) return null;
    const key = `media/${identityId}/${baseName}.${file.name.split('.').pop()}`;
    await uploadData({
      path: key,
      data: file,
      options: { contentType: file.type || 'application/octet-stream' },
    }).result;
    return { key, fileName: file.name };
  } catch (err) {
    console.error(`Failed to upload pending ${name}:`, err);
    return null;
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
      if (data[0].brandColor) {
        applyBrandColor(data[0].brandColor);
      }
      if (data[0].logoKey) {
        try {
          const { url } = await getUrl({ path: data[0].logoKey });
          const headerLogo = document.getElementById('header-logo');
          if (headerLogo) {
            headerLogo.src = url.toString();
            headerLogo.style.display = 'block';
          }
        } catch (err) {
          console.error('Failed to load vendor logo:', err);
        }
      }
    }
  } catch (err) {
    console.error('Failed to load vendor profile from DB:', err);
  }

  // Fallback: read from localStorage if DB returned nothing
  if (!companyName) {
    const pending = localStorage.getItem('pendingVendorProfile');
    if (pending) {
      try {
        const profile = JSON.parse(pending);
        companyName = profile.companyName || null;
        if (profile.brandColor) {
          applyBrandColor(profile.brandColor);
        }
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

  // Start from allEvents, which always has the real slug (Submission has no
  // eventSlug field, so deriving slugs from submissions is what caused /e/null links).
  // Sorted newest-created-first so the most recently added event is on top.
  const sortedEvents = [...allEvents].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  const uniqueEvents = sortedEvents.map(e => ({ id: e.id, name: e.name, slug: e.slug }));

  // Include events referenced by submissions but no longer present in allEvents
  // (e.g. the event was deleted after submissions came in) — slug is unknown for these.
  allSubmissions
    .filter(s => s.eventId && s.eventName)
    .forEach(s => {
      if (!uniqueEvents.find(u => u.id === s.eventId)) {
        uniqueEvents.push({ id: s.eventId, name: s.eventName, slug: null });
      }
    });

  // Form URLs now live in the "Your Events" table (renderEventsList) instead
  // of being duplicated here — this dropdown is just for filtering submissions.
  filterContainer.innerHTML = `
    <label for="event-filter" style="font-size: 12px; font-weight: 500; color: #666; margin-right: 8px;">View Submissions by Event:</label>
    <select id="event-filter" style="padding: 6px 10px; border-radius: 4px; border: 1px solid #c7c9cf; font-size: 13px;">
      <option value="">All events</option>
      ${uniqueEvents.map(e => `<option value="${escapeHtml(e.name)}">${escapeHtml(e.name)}</option>`).join('')}
    </select>
  `;

  document.getElementById('event-filter').addEventListener('change', (ev) => {
    renderTable(filterSubmissions(ev.target.value));
  });
}

// Renders the vendor's own events (name, venue, dates, form link, Edit
// button) in the dashboard. This is the only place events can be edited from.
function renderEventsList() {
  const table = document.getElementById('events-table');
  const emptyMsg = document.getElementById('events-empty-msg');
  const tbody = document.getElementById('events-body');
  if (!table) return;

  const sortedEvents = [...allEvents].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  if (sortedEvents.length === 0) {
    table.style.display = 'none';
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';
  table.style.display = 'table';

  const baseUrl = window.location.origin;
  tbody.innerHTML = '';
  sortedEvents.forEach((ev) => {
    const url = ev.slug ? `${baseUrl}/e/${encodeURIComponent(ev.slug)}` : null;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(ev.name)}</td>
      <td>${escapeHtml(ev.venue || '—')}</td>
      <td>${formatDateRange(ev.startDate, ev.endDate) || '—'}</td>
      <td>${url ? `<a href="${url}" target="_blank" style="color:var(--brand-color); word-break: break-all;">Open link</a>` : '—'}</td>
      <td><button type="button" class="edit-event-btn" style="padding:4px 10px; font-size:12px; border:1px solid #c7c9cf; border-radius:4px; background:#fff; cursor:pointer;">Edit</button></td>
    `;
    row.querySelector('.edit-event-btn').addEventListener('click', () => startEditEvent(ev));
    tbody.appendChild(row);
  });
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateRange(start, end) {
  const s = formatDate(start), e = formatDate(end);
  if (s && e && start !== end) return `${s} – ${e}`;
  return s || e || null;
}

// Applies the currently-selected event filter (or "all") to allSubmissions.
function filterSubmissions(eventName) {
  return eventName
    ? allSubmissions.filter(s => s.eventName === eventName)
    : allSubmissions;
}

function getActiveEventFilter() {
  return document.getElementById('event-filter')?.value || '';
}

// Live-updates the table as new submissions arrive, so vendors don't have to
// reload the page to see them. Runs once per dashboard session.
function subscribeToNewSubmissions() {
  if (submissionSubscription) return;

  // Submission authorization is owner-scoped by vendorId (see
  // amplify/data/resource.ts), so onCreate only ever delivers this vendor's
  // own rows server-side — no client-side filter needed.
  submissionSubscription = client.models.Submission.onCreate().subscribe({
    next: (newSubmission) => {
      if (allSubmissions.some(s => s.id === newSubmission.id)) return;
      allSubmissions.push(newSubmission);
      // Don't rebuild the filter dropdown here — it would reset the vendor's
      // current selection, and the new submission can't add an event that
      // wasn't already in allEvents (submissions only target existing events).
      document.getElementById('loading-msg').style.display = 'none';
      renderTable(filterSubmissions(getActiveEventFilter()));
    },
    error: (err) => console.error('Submission subscription error:', err),
  });
}

function renderTable(submissions) {
  const tbody = document.getElementById('submissions-body');
  const table = document.getElementById('submissions-table');
  const emptyMsg = document.getElementById('empty-msg');
  const countEl = document.getElementById('submission-count');

  tbody.innerHTML = '';

  if (countEl) {
    countEl.textContent = `${submissions.length} submission${submissions.length === 1 ? '' : 's'}`;
    countEl.style.display = 'block';
  }

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
        <td>${escapeHtml(s.comment || '—')}</td>
        <td class="${s.consent ? 'consent-yes' : 'consent-no'}">${s.consent ? 'Yes' : 'No'}</td>
        <td>${submittedDate}</td>
      `;
      tbody.appendChild(row);
    });
}

document.addEventListener('DOMContentLoaded', () => {
  const addEventBtn = document.getElementById('add-event-btn');
  if (addEventBtn) addEventBtn.addEventListener('click', handleSaveEvent);

  const cancelEditBtn = document.getElementById('cancel-edit-event-btn');
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', resetEventForm);

  const addProductBtn = document.getElementById('add-event-product-btn');
  if (addProductBtn) addProductBtn.addEventListener('click', () => addEventProductRow());

  const productsContainer = document.getElementById('event-products-container');
  if (productsContainer) {
    productsContainer.addEventListener('click', (ev) => {
      if (!ev.target.classList.contains('remove-product-btn')) return;
      if (productsContainer.children.length > 1) {
        ev.target.closest('.product-row').remove();
      }
    });
  }

  const deleteAccountBtn = document.getElementById('delete-account-btn');
  if (deleteAccountBtn) deleteAccountBtn.addEventListener('click', handleDeleteAccount);

  const startInput = document.getElementById('new-event-start');
  const endInput = document.getElementById('new-event-end');
  if (startInput && endInput) {
    const todayStr = new Date().toISOString().slice(0, 10);
    startInput.min = todayStr;
    endInput.min = todayStr;
    startInput.addEventListener('change', () => {
      endInput.min = startInput.value > todayStr ? startInput.value : todayStr;
    });
  }
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
    // Owner-scoped authorization (amplify/data/resource.ts) means these
    // list() calls already only return this vendor's own rows.
    const { data: submissions } = await client.models.Submission.list();
    for (const submission of submissions || []) {
      await client.models.Submission.delete({ id: submission.id });
    }

    const { data: events } = await client.models.Event.list();
    for (const event of events || []) {
      await client.models.Event.delete({ id: event.id });
    }

    const fileKeys = [
      currentVendorProfile?.logoKey,
      currentVendorProfile?.videoKey,
      currentVendorProfile?.profileDocKey,
    ].filter(Boolean);
    for (const key of fileKeys) {
      await remove({ path: key });
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

// Populates the Add/Edit form from an existing event and switches it into
// edit mode. The same form and handleSaveEvent() are used for both add and
// edit — editingEventId is what tells them apart.
function startEditEvent(event) {
  editingEventId = event.id;
  document.getElementById('new-event-name').value = event.name || '';
  document.getElementById('new-event-url').value = event.eventUrl || '';
  document.getElementById('new-event-venue').value = event.venue || '';
  document.getElementById('new-event-start').value = event.startDate || '';
  document.getElementById('new-event-end').value = event.endDate || '';
  setEventProductRows(event.vendorProducts || []);

  document.getElementById('add-event-heading').textContent = 'Edit Event';
  document.getElementById('add-event-btn').textContent = 'Save changes';
  document.getElementById('cancel-edit-event-btn').style.display = 'inline-block';
  document.getElementById('add-event-msg').style.display = 'none';

  document.getElementById('add-event-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Resets the Add/Edit form back to "add a new event" mode. Services default
// to the vendor's profile products as a starting point, editable per event.
function resetEventForm() {
  editingEventId = null;
  document.getElementById('new-event-name').value = '';
  document.getElementById('new-event-url').value = '';
  document.getElementById('new-event-venue').value = '';
  document.getElementById('new-event-start').value = '';
  document.getElementById('new-event-end').value = '';
  setEventProductRows(currentVendorProfile?.products || []);

  document.getElementById('add-event-heading').textContent = 'Add an Event';
  document.getElementById('add-event-btn').textContent = 'Add event';
  document.getElementById('cancel-edit-event-btn').style.display = 'none';
}

function addEventProductRow(value = '') {
  const container = document.getElementById('event-products-container');
  const row = document.createElement('div');
  row.className = 'product-row';
  row.innerHTML = `
    <input type="text" class="product-input" value="${escapeHtml(value)}" />
    <button type="button" class="remove-product-btn" aria-label="Remove">&times;</button>
  `;
  container.appendChild(row);
}

function setEventProductRows(values) {
  const container = document.getElementById('event-products-container');
  container.innerHTML = '';
  const rows = values && values.length > 0 ? values : [''];
  rows.forEach((v) => addEventProductRow(v));
}

async function handleSaveEvent() {
  const input = document.getElementById('new-event-name');
  const msg = document.getElementById('add-event-msg');
  const name = input.value.trim();
  const eventUrl = document.getElementById('new-event-url').value.trim() || null;
  const venue = document.getElementById('new-event-venue').value.trim() || null;
  const startDate = document.getElementById('new-event-start').value || null;
  const endDate = document.getElementById('new-event-end').value || null;
  const vendorProducts = [...document.querySelectorAll('#event-products-container .product-input')]
    .map((el) => el.value.trim())
    .filter(Boolean);

  msg.style.display = 'none';

  if (!name) {
    msg.textContent = 'Please enter an event name.';
    msg.style.color = '#b42318';
    msg.style.display = 'block';
    return;
  }

  const duplicate = allEvents.some(
    (e) => e.id !== editingEventId && e.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    msg.textContent = 'An event with this name already exists.';
    msg.style.color = '#b42318';
    msg.style.display = 'block';
    return;
  }

  // Past-date validation only applies when creating a new event — an
  // existing event's dates naturally move into the past over time, and
  // editing e.g. its venue shouldn't be blocked by that.
  if (!editingEventId) {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (startDate && startDate < todayStr) {
      msg.textContent = 'Start date cannot be in the past.';
      msg.style.color = '#b42318';
      msg.style.display = 'block';
      return;
    }
    if (endDate && endDate < todayStr) {
      msg.textContent = 'End date cannot be in the past.';
      msg.style.color = '#b42318';
      msg.style.display = 'block';
      return;
    }
  }
  if (startDate && endDate && endDate < startDate) {
    msg.textContent = 'End date must be on or after the start date.';
    msg.style.color = '#b42318';
    msg.style.display = 'block';
    return;
  }

  try {
    if (editingEventId) {
      const { data, errors } = await client.models.Event.update({
        id: editingEventId,
        name,
        eventUrl,
        venue,
        startDate,
        endDate,
        vendorProducts,
      });

      if (errors) {
        console.error(errors);
        msg.textContent = 'Failed to save changes.';
        msg.style.color = '#b42318';
        msg.style.display = 'block';
        return;
      }

      const idx = allEvents.findIndex((e) => e.id === editingEventId);
      if (idx !== -1) allEvents[idx] = data;
      renderEventsList();
      renderEventFilter();
      resetEventForm();

      msg.textContent = `"${name}" updated.`;
      msg.style.color = '#1e6b2e';
      msg.style.display = 'block';
    } else {
      const slug = generateSlug(name);
      const { data, errors } = await client.models.Event.create({
        name,
        slug,
        vendorId: currentVendorSub,
        eventUrl,
        venue,
        startDate,
        endDate,
        vendorCompanyName: currentVendorProfile?.companyName,
        vendorDescription: currentVendorProfile?.description,
        vendorProducts,
        vendorLogoKey: currentVendorProfile?.logoKey,
        vendorPhone: currentVendorProfile?.phone,
        vendorContactEmail: currentVendorProfile?.email,
        vendorBrandColor: currentVendorProfile?.brandColor,
        vendorVideoUrl: currentVendorProfile?.videoUrl,
        vendorVideoKey: currentVendorProfile?.videoKey,
        vendorProfileDocKey: currentVendorProfile?.profileDocKey,
        vendorProfileDocName: currentVendorProfile?.profileDocName,
      });

      if (errors) {
        console.error(errors);
        msg.textContent = 'Failed to create event.';
        msg.style.color = '#b42318';
        msg.style.display = 'block';
        return;
      }

      allEvents.push(data);
      renderEventsList();
      renderEventFilter();
      resetEventForm();

      const shortUrl = `${window.location.origin}/e/${encodeURIComponent(slug)}`;
      msg.textContent = `"${name}" added. Share link: ${shortUrl}`;
      msg.style.color = '#1e6b2e';
      msg.style.display = 'block';
    }
  } catch (err) {
    console.error(err);
    msg.textContent = editingEventId ? 'Failed to save changes.' : 'Failed to create event.';
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
