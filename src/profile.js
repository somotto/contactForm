import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import {
  getCurrentUser, fetchAuthSession, fetchUserAttributes, updateUserAttributes, confirmUserAttribute, updatePassword,
} from 'aws-amplify/auth';
import { uploadData, remove, getUrl } from 'aws-amplify/storage';
import outputs from '../amplify_outputs.json' with { type: 'json' };
import { parseYouTubeId } from './youtube.js';

Amplify.configure(outputs);
const client = generateClient({ authMode: 'userPool' });

const saveProfileBtn = document.getElementById('save-profile-btn');
const emailBtn = document.getElementById('email-btn');
const passwordBtn = document.getElementById('password-btn');

let vendor = null;
let pendingNewEmail = '';

async function init() {
  try {
    await getCurrentUser();
  } catch {
    window.location.replace('/login.html');
    return;
  }

  let data, errors;
  try {
    ({ data, errors } = await client.models.Vendor.list());
  } catch (err) {
    console.error(err);
    document.getElementById('loading-msg').textContent = 'Failed to load your profile. Please reload the page.';
    return;
  }
  if (errors || !data || data.length === 0) {
    // The Vendor row is created by dashboard.js on first login, from the
    // profile register.js stashed in localStorage — so it can be missing if
    // the vendor landed here before ever opening the dashboard.
    document.getElementById('loading-msg').innerHTML =
      'Your profile isn\'t set up yet. Please open <a href="/login.html">your dashboard</a> first, then come back.';
    return;
  }

  vendor = data[0];
  await populateForm();
  document.getElementById('loading-msg').style.display = 'none';
  document.getElementById('profile-content').style.display = 'block';
}

async function populateForm() {
  document.getElementById('fullname').value = vendor.fullName || '';
  document.getElementById('companyname').value = vendor.companyName || '';
  document.getElementById('phone').value = vendor.phone || '';
  document.getElementById('website').value = vendor.websiteUrl || '';
  document.getElementById('email').value = vendor.email || '';
  document.getElementById('video-url').value = vendor.videoUrl || '';

  for (const id of ['logo', 'video-file', 'profile-doc']) {
    document.getElementById(id).value = '';
  }
  document.getElementById('remove-video').checked = false;
  document.getElementById('remove-doc').checked = false;

  setProductRows(vendor.products || []);
  setBrandColor(vendor.brandColor || '#0C447C');
  applyHeader();

  const logoPreview = document.getElementById('logo-preview');
  const headerLogo = document.getElementById('header-logo');
  const logoUrl = await signedUrl(vendor.logoKey);
  if (logoUrl) {
    logoPreview.src = logoUrl;
    logoPreview.style.display = 'block';
    headerLogo.src = logoUrl;
  } else {
    logoPreview.style.display = 'none';
  }

  const currentVideo = document.getElementById('current-video');
  const removeVideoRow = document.getElementById('remove-video-row');
  const videoUrl = await signedUrl(vendor.videoKey);
  if (videoUrl) {
    currentVideo.innerHTML = `Current: <a href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener">your uploaded video</a>`;
    currentVideo.style.display = 'block';
    removeVideoRow.style.display = 'flex';
  } else {
    currentVideo.style.display = 'none';
    removeVideoRow.style.display = 'none';
  }

  const currentDoc = document.getElementById('current-doc');
  const removeDocRow = document.getElementById('remove-doc-row');
  const docUrl = await signedUrl(vendor.profileDocKey);
  if (docUrl) {
    currentDoc.innerHTML = `Current: <a href="${escapeHtml(docUrl)}" target="_blank" rel="noopener">${escapeHtml(vendor.profileDocName || 'company profile')}</a>`;
    currentDoc.style.display = 'block';
    removeDocRow.style.display = 'flex';
  } else {
    currentDoc.style.display = 'none';
    removeDocRow.style.display = 'none';
  }
}

function applyHeader() {
  document.getElementById('header-company').textContent = vendor.companyName || 'TheEventConnector';
  document.title = `Edit Profile — ${vendor.companyName}`;
  document.documentElement.style.setProperty('--brand-color', vendor.brandColor || '#0C447C');
}

// ── Profile details ──────────────────────────────────────────────────────────

saveProfileBtn.addEventListener('click', async () => {
  const fullName    = document.getElementById('fullname').value.trim();
  const companyName = document.getElementById('companyname').value.trim();
  const phone       = document.getElementById('phone').value.trim();
  const website     = document.getElementById('website').value.trim();
  const brandColor  = document.getElementById('brandColor').value;
  const products    = [...document.querySelectorAll('.product-input')]
    .map((input) => input.value.trim())
    .filter(Boolean);
  const logoFile    = document.getElementById('logo').files[0] || null;
  const videoInput  = document.getElementById('video-url').value.trim();
  const videoFile   = document.getElementById('video-file').files[0] || null;
  const removeVideo = document.getElementById('remove-video').checked;
  const docFile     = document.getElementById('profile-doc').files[0] || null;
  const removeDoc   = document.getElementById('remove-doc').checked;

  hideMsg('profile-msg');

  if (!fullName)    { showMsg('profile-msg', 'Full legal name is required.'); return; }
  if (!companyName) { showMsg('profile-msg', 'Company name is required.'); return; }
  if (!phone)       { showMsg('profile-msg', 'Phone number is required.'); return; }
  if (products.length === 0) { showMsg('profile-msg', 'Please add at least one product or service.'); return; }
  if (logoFile && logoFile.size > 2 * 1024 * 1024) { showMsg('profile-msg', 'Logo must be 2 MB or smaller.'); return; }

  let videoUrl = null;
  if (videoInput) {
    const videoId = parseYouTubeId(videoInput);
    if (!videoId) { showMsg('profile-msg', 'Please enter a valid YouTube video link.'); return; }
    videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  }
  if (videoUrl && videoFile) { showMsg('profile-msg', 'Please provide either a YouTube link or a video file, not both.'); return; }
  if (videoFile && videoFile.size > 50 * 1024 * 1024) { showMsg('profile-msg', 'Video must be 50 MB or smaller.'); return; }
  if (docFile && docFile.size > 10 * 1024 * 1024) { showMsg('profile-msg', 'Company profile document must be 10 MB or smaller.'); return; }

  saveProfileBtn.disabled = true;
  saveProfileBtn.textContent = 'Saving…';

  try {
    // identityId is what {entity_id} maps to in amplify/storage/resource.ts
    const { identityId } = await fetchAuthSession();
    // Cognito's email is the source of truth for the contact email; re-reading
    // it here also repairs the Vendor row if a past email change verified in
    // Cognito but failed to save below (see finishEmailChange).
    const { email } = await fetchUserAttributes();

    let logoKey = vendor.logoKey;
    if (logoFile) {
      logoKey = await upload(logoFile, `logos/${identityId}/logo`);
    }

    // YouTube link and uploaded video are mutually exclusive, as on register.html.
    let videoKey = vendor.videoKey;
    if (videoFile) {
      videoKey = await upload(videoFile, `media/${identityId}/video`);
    } else if (videoUrl || removeVideo) {
      videoKey = null;
    }

    let profileDocKey = vendor.profileDocKey;
    let profileDocName = vendor.profileDocName;
    if (docFile) {
      profileDocKey = await upload(docFile, `media/${identityId}/company-profile`);
      profileDocName = docFile.name;
    } else if (removeDoc) {
      profileDocKey = null;
      profileDocName = null;
    }

    const { data, errors } = await client.models.Vendor.update({
      id: vendor.id,
      fullName,
      companyName,
      email: email || vendor.email,
      phone,
      websiteUrl: website || '',
      logoKey,
      description: products.join(', '),
      products,
      brandColor,
      videoUrl,
      videoKey,
      profileDocKey,
      profileDocName,
    });
    if (errors) {
      console.error('Vendor.update errors:', errors);
      showMsg('profile-msg', 'Failed to save your profile. Please try again.');
      return;
    }

    // Replaced files with a different extension (or removed ones) leave the
    // old object behind; clean it up now nothing references it.
    const oldKeys = [vendor.logoKey, vendor.videoKey, vendor.profileDocKey].filter(Boolean);
    const newKeys = new Set([logoKey, videoKey, profileDocKey]);
    for (const key of oldKeys) {
      if (!newKeys.has(key)) {
        await remove({ path: key }).catch((err) => console.error(`Failed to remove ${key}:`, err));
      }
    }

    vendor = data;
    const failed = await syncEvents();
    await populateForm();

    if (failed > 0) {
      showMsg('profile-msg', `Profile saved, but ${failed} of your event form(s) couldn't be updated. Save again to retry.`);
    } else {
      showMsg('profile-msg', 'Profile saved. Your event forms now show the updated details.', 'success');
    }
  } catch (err) {
    console.error(err);
    showMsg('profile-msg', 'Failed to save your profile. Please try again.');
  } finally {
    saveProfileBtn.disabled = false;
    saveProfileBtn.textContent = 'Save changes';
  }
});

// Re-copies the snapshotted vendor fields onto every one of this vendor's
// events (see the snapshot pattern in CLAUDE.md), so e.html reflects the
// edit. vendorProducts is deliberately left alone — it's edited per event.
// Returns the number of events that failed to update.
async function syncEvents() {
  const events = [];
  let nextToken = null;
  do {
    // Owner-scoped authorization: only this vendor's own events come back.
    const res = await client.models.Event.list({ nextToken });
    if (res.errors) throw new Error('Failed to list events');
    events.push(...res.data);
    nextToken = res.nextToken;
  } while (nextToken);

  const results = await Promise.allSettled(events.map((ev) =>
    client.models.Event.update({
      id: ev.id,
      vendorCompanyName: vendor.companyName,
      vendorDescription: vendor.description,
      vendorLogoKey: vendor.logoKey,
      vendorPhone: vendor.phone,
      vendorContactEmail: vendor.email,
      vendorBrandColor: vendor.brandColor,
      vendorVideoUrl: vendor.videoUrl,
      vendorVideoKey: vendor.videoKey,
      vendorProfileDocKey: vendor.profileDocKey,
      vendorProfileDocName: vendor.profileDocName,
    })
  ));
  const failed = results.filter((r) => r.status === 'rejected' || r.value.errors);
  failed.forEach((r) => console.error('Event.update failed:', r.reason || r.value.errors));
  return failed.length;
}

async function upload(file, keyWithoutExt) {
  const key = `${keyWithoutExt}.${file.name.split('.').pop()}`;
  await uploadData({
    path: key,
    data: file,
    options: { contentType: file.type || 'application/octet-stream' },
  }).result;
  return key;
}

// ── Email ────────────────────────────────────────────────────────────────────
// Email is the Cognito login username, so changing it goes through Cognito's
// attribute verification. Amplify enables keepOriginal for email, so the old
// address stays the login (and receives MFA codes) until the new one is
// confirmed — an abandoned change can't lock the vendor out.

emailBtn.addEventListener('click', async () => {
  hideMsg('email-msg');
  if (pendingNewEmail) {
    await confirmEmailChange();
  } else {
    await startEmailChange();
  }
});

async function startEmailChange() {
  const newEmail = document.getElementById('email').value.trim();
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!newEmail || !emailRe.test(newEmail)) { showMsg('email-msg', 'A valid email address is required.'); return; }
  if (newEmail.toLowerCase() === (vendor.email || '').toLowerCase()) {
    showMsg('email-msg', 'That is already your email address.');
    return;
  }

  emailBtn.disabled = true;
  emailBtn.textContent = 'Sending code…';
  try {
    const output = await updateUserAttributes({ userAttributes: { email: newEmail } });
    if (output.email?.nextStep?.updateAttributeStep === 'CONFIRM_ATTRIBUTE_WITH_CODE') {
      pendingNewEmail = newEmail;
      document.getElementById('email').disabled = true;
      document.getElementById('email-code').value = '';
      document.getElementById('email-code-hint').textContent =
        `A 6-digit code was sent to ${newEmail}. Your current email stays active until you verify.`;
      document.getElementById('email-code-row').style.display = 'block';
      emailBtn.textContent = 'Verify email';
    } else {
      await finishEmailChange(newEmail);
    }
  } catch (err) {
    console.error(err);
    if (err.name === 'AliasExistsException') {
      showMsg('email-msg', 'Another account already uses this email address.');
    } else if (err.name === 'LimitExceededException') {
      showMsg('email-msg', 'Too many attempts. Please wait a while and try again.');
    } else {
      showMsg('email-msg', err.message || 'Failed to change email. Please try again.');
    }
  } finally {
    emailBtn.disabled = false;
    if (!pendingNewEmail) emailBtn.textContent = 'Change email';
  }
}

async function confirmEmailChange() {
  const code = document.getElementById('email-code').value.trim();
  if (!code || code.length !== 6) { showMsg('email-msg', 'Please enter the 6-digit code from your email.'); return; }

  emailBtn.disabled = true;
  emailBtn.textContent = 'Verifying…';
  try {
    await confirmUserAttribute({ userAttributeKey: 'email', confirmationCode: code });
    await finishEmailChange(pendingNewEmail);
  } catch (err) {
    console.error(err);
    if (err.name === 'CodeMismatchException') {
      showMsg('email-msg', 'Incorrect code. Please check your email and try again.');
    } else if (err.name === 'ExpiredCodeException') {
      showMsg('email-msg', 'Code has expired. Reload this page and request a new one.');
    } else {
      showMsg('email-msg', err.message || 'Verification failed. Please try again.');
    }
  } finally {
    emailBtn.disabled = false;
    emailBtn.textContent = pendingNewEmail ? 'Verify email' : 'Change email';
  }
}

async function finishEmailChange(newEmail) {
  pendingNewEmail = '';
  document.getElementById('email').disabled = false;
  document.getElementById('email-code-row').style.display = 'none';

  // The login is already changed at this point; the Vendor row and event
  // snapshots only hold the contact email shown on the forms.
  const { data, errors } = await client.models.Vendor.update({ id: vendor.id, email: newEmail })
    .catch((err) => ({ errors: [err] }));
  if (errors) {
    console.error('Vendor.update errors:', errors);
    showMsg('email-msg', `Your login email is now ${newEmail}, but your event forms couldn't be updated. Click "Save changes" above to retry.`);
    return;
  }
  vendor = data;
  const failed = await syncEvents().catch(() => -1);
  if (failed !== 0) {
    showMsg('email-msg', `Your login email is now ${newEmail}, but some event forms couldn't be updated. Save your profile to retry.`);
    return;
  }
  showMsg('email-msg', `Email updated. Use ${newEmail} to log in from now on.`, 'success');
}

// ── Password ─────────────────────────────────────────────────────────────────

passwordBtn.addEventListener('click', async () => {
  const oldPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  hideMsg('password-msg');

  if (!oldPassword) { showMsg('password-msg', 'Please enter your current password.'); return; }
  if (!newPassword || newPassword.length < 8) { showMsg('password-msg', 'New password must be at least 8 characters.'); return; }

  passwordBtn.disabled = true;
  passwordBtn.textContent = 'Changing…';
  try {
    await updatePassword({ oldPassword, newPassword });
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    showMsg('password-msg', 'Password changed.', 'success');
  } catch (err) {
    console.error(err);
    if (err.name === 'NotAuthorizedException') {
      showMsg('password-msg', 'Current password is incorrect.');
    } else if (err.name === 'InvalidPasswordException') {
      showMsg('password-msg', 'Password must include uppercase, lowercase, number and symbol.');
    } else if (err.name === 'LimitExceededException') {
      showMsg('password-msg', 'Too many attempts. Please wait a while and try again.');
    } else {
      showMsg('password-msg', err.message || 'Failed to change password. Please try again.');
    }
  } finally {
    passwordBtn.disabled = false;
    passwordBtn.textContent = 'Change password';
  }
});

// ── Products / brand color (same widgets as register.js) ────────────────────

function addProductRow(value = '') {
  const row = document.createElement('div');
  row.className = 'product-row';
  row.innerHTML = `
    <input type="text" class="product-input" value="${escapeHtml(value)}" />
    <button type="button" class="remove-product-btn" aria-label="Remove">&times;</button>
  `;
  document.getElementById('products-container').appendChild(row);
}

function setProductRows(values) {
  document.getElementById('products-container').innerHTML = '';
  (values.length > 0 ? values : ['']).forEach((v) => addProductRow(v));
}

document.getElementById('add-product-btn').addEventListener('click', () => addProductRow());

document.getElementById('products-container').addEventListener('click', (ev) => {
  if (!ev.target.classList.contains('remove-product-btn')) return;
  const container = document.getElementById('products-container');
  if (container.children.length > 1) {
    ev.target.closest('.product-row').remove();
  }
});

function selectSwatch(el, color) {
  document.querySelectorAll('#brand-color-swatches .swatch').forEach((s) => s.classList.remove('selected'));
  document.getElementById('custom-swatch').style.background = '';
  el.classList.add('selected');
  document.getElementById('brandColor').value = color;
}

function setBrandColor(color) {
  const preset = [...document.querySelectorAll('#brand-color-swatches button.swatch')]
    .find((s) => s.dataset.color.toLowerCase() === color.toLowerCase());
  if (preset) {
    selectSwatch(preset, preset.dataset.color);
  } else {
    const customSwatch = document.getElementById('custom-swatch');
    document.getElementById('custom-color-input').value = color;
    selectSwatch(customSwatch, color);
    customSwatch.style.background = color;
  }
}

document.querySelectorAll('#brand-color-swatches button.swatch').forEach((swatch) => {
  swatch.addEventListener('click', () => selectSwatch(swatch, swatch.dataset.color));
});

document.getElementById('custom-color-input').addEventListener('input', (ev) => {
  const customSwatch = document.getElementById('custom-swatch');
  selectSwatch(customSwatch, ev.target.value);
  customSwatch.style.background = ev.target.value;
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function signedUrl(key) {
  if (!key) return null;
  try {
    const { url } = await getUrl({ path: key });
    return url.toString();
  } catch (err) {
    console.error(`Failed to load ${key}:`, err);
    return null;
  }
}

function showMsg(id, message, kind = 'error') {
  const el = document.getElementById(id);
  el.textContent = message;
  el.className = `msg ${kind}`;
  el.style.display = 'block';
}

function hideMsg(id) {
  document.getElementById(id).style.display = 'none';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

init();
