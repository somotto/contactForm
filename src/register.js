import { Amplify } from 'aws-amplify';
import { signUp, confirmSignUp, resendSignUpCode } from 'aws-amplify/auth';
import outputs from '../amplify_outputs.json' with { type: 'json' };
import { putPendingFile, clearPendingFiles } from './pendingFiles.js';
import { parseYouTubeId } from './youtube.js';

Amplify.configure(outputs);

const registerBtn = document.getElementById('register-btn');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');
const successMsg = document.getElementById('success-msg');

let pendingEmail = '';

document.getElementById('add-product-btn').addEventListener('click', () => {
  const container = document.getElementById('products-container');
  const row = document.createElement('div');
  row.className = 'product-row';
  row.innerHTML = `
    <input type="text" class="product-input" />
    <button type="button" class="remove-product-btn" aria-label="Remove">&times;</button>
  `;
  container.appendChild(row);
});

document.getElementById('products-container').addEventListener('click', (ev) => {
  if (!ev.target.classList.contains('remove-product-btn')) return;
  const container = document.getElementById('products-container');
  if (container.children.length > 1) {
    ev.target.closest('.product-row').remove();
  }
});

document.getElementById('logo').addEventListener('change', async (ev) => {
  const preview = document.getElementById('logo-preview');
  const file = ev.target.files[0];
  if (!file) {
    preview.style.display = 'none';
    return;
  }
  preview.src = await fileToBase64(file);
  preview.style.display = 'block';
});

function selectSwatch(el, color) {
  document.querySelectorAll('#brand-color-swatches .swatch').forEach((s) => s.classList.remove('selected'));
  document.getElementById('custom-swatch').style.background = '';
  el.classList.add('selected');
  document.getElementById('brandColor').value = color;
}

document.querySelectorAll('#brand-color-swatches button.swatch').forEach((swatch) => {
  swatch.addEventListener('click', () => selectSwatch(swatch, swatch.dataset.color));
});

document.getElementById('custom-color-input').addEventListener('input', (ev) => {
  const customSwatch = document.getElementById('custom-swatch');
  selectSwatch(customSwatch, ev.target.value);
  customSwatch.style.background = ev.target.value;
});

registerBtn.addEventListener('click', async () => {
  const fullName    = document.getElementById('fullname').value.trim();
  const companyName = document.getElementById('companyname').value.trim();
  const email       = document.getElementById('email').value.trim();
  const phone       = document.getElementById('phone').value.trim();
  const website     = document.getElementById('website').value.trim();
  const brandColor  = document.getElementById('brandColor').value;
  const products    = [...document.querySelectorAll('.product-input')]
    .map((input) => input.value.trim())
    .filter(Boolean);
  const password    = document.getElementById('password').value;
  const logoFile    = document.getElementById('logo').files[0] || null;
  const videoInput  = document.getElementById('video-url').value.trim();
  const videoFile   = document.getElementById('video-file').files[0] || null;
  const profileDoc  = document.getElementById('profile-doc').files[0] || null;

  errorMsg.style.display = 'none';
  successMsg.style.display = 'none';

  if (!fullName)    { showError('Full legal name is required.'); return; }
  if (!companyName) { showError('Company name is required.'); return; }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRe.test(email)) { showError('A valid email address is required.'); return; }
  if (!phone)    { showError('Phone number is required.'); return; }
  if (products.length === 0) { showError('Please add at least one product or service.'); return; }
  if (!password || password.length < 8) { showError('Password must be at least 8 characters.'); return; }
  if (!logoFile) { showError('A logo or photo is required.'); return; }
  if (logoFile.size > 2 * 1024 * 1024) { showError('Logo must be 2 MB or smaller.'); return; }

  let videoUrl = null;
  if (videoInput) {
    const videoId = parseYouTubeId(videoInput);
    if (!videoId) { showError('Please enter a valid YouTube video link.'); return; }
    videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  }
  if (videoUrl && videoFile) { showError('Please provide either a YouTube link or a video file, not both.'); return; }
  if (videoFile && videoFile.size > 50 * 1024 * 1024) { showError('Video must be 50 MB or smaller.'); return; }
  if (profileDoc && profileDoc.size > 10 * 1024 * 1024) { showError('Company profile document must be 10 MB or smaller.'); return; }

  registerBtn.disabled = true;
  registerBtn.textContent = 'Creating account…';

  try {
    // Stash optional files before signUp, so a storage failure aborts before an
    // account exists. Clearing first stops a previous abandoned attempt's files
    // from being uploaded against this account.
    try {
      await clearPendingFiles();
      if (videoFile) await putPendingFile('video', videoFile);
      if (profileDoc) await putPendingFile('profileDoc', profileDoc);
    } catch (err) {
      console.error('Failed to store pending files:', err);
      showError('Your browser could not store the video/document for upload. Try without them, or use a different browser.');
      return;
    }

    const vendorId = generateVendorId(companyName);

    await signUp({
      username: email,
      password,
      options: {
        userAttributes: {
          email,
          name: fullName,
          phone_number: phone.startsWith('+') ? phone : `+${phone}`,
        },
      },
    });

    // Convert logo to base64 so it survives until the user is authenticated
    // and can actually write to S3. Upload happens on first dashboard load.
    const logoData = await fileToBase64(logoFile);

    localStorage.setItem('pendingVendorProfile', JSON.stringify({
      fullName,
      companyName,
      email,
      phone,
      websiteUrl: website || '',
      vendorId,
      logoKey: null,          // filled in by dashboard after authenticated upload
      description: products.join(', '), // kept for older single-string consumers (email fallback, etc.)
      products,
      brandColor,
      videoUrl,               // videoKey / profileDocKey filled in by dashboard after upload
    }));

    localStorage.setItem('pendingVendorLogo', JSON.stringify({
      data: logoData,
      type: logoFile.type,
      ext: logoFile.name.split('.').pop(),
    }));

    pendingEmail = email;
    showVerificationForm();

  } catch (err) {
    console.error(err);
    if (err.name === 'UsernameExistsException') {
      showError('An account with this email already exists. Please log in instead.');
    } else if (err.name === 'InvalidPasswordException') {
      showError('Password must include uppercase, lowercase, number and symbol.');
    } else {
      showError(err.message || 'Registration failed. Please try again.');
    }
  } finally {
    registerBtn.disabled = false;
    registerBtn.textContent = 'Create account →';
  }
});

function showVerificationForm() {
  document.getElementById('registration-form').style.display = 'none';
  document.getElementById('verification-form').style.display = 'block';
  document.getElementById('verify-email-label').textContent =
    `A 6-digit verification code was sent to ${pendingEmail}`;
}

document.getElementById('verify-btn').addEventListener('click', async () => {
  const code = document.getElementById('verify-code').value.trim();
  const verifyBtn   = document.getElementById('verify-btn');
  const verifyError = document.getElementById('verify-error');

  verifyError.style.display = 'none';

  if (!code || code.length !== 6) {
    verifyError.textContent = 'Please enter the 6-digit code from your email.';
    verifyError.style.display = 'block';
    return;
  }

  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Verifying…';

  try {
    await confirmSignUp({ username: pendingEmail, confirmationCode: code });

    document.getElementById('verification-form').style.display = 'none';
    successMsg.innerHTML = `
      Account verified! You can now
      <a href="/login.html" style="color:#1e6b2e; font-weight:500;">log in to your dashboard</a>.
    `;
    successMsg.style.display = 'block';

  } catch (err) {
    console.error(err);
    if (err.name === 'CodeMismatchException') {
      verifyError.textContent = 'Incorrect code. Please check your email and try again.';
    } else if (err.name === 'ExpiredCodeException') {
      verifyError.textContent = 'Code has expired. Click "Resend code" to get a new one.';
    } else {
      verifyError.textContent = err.message || 'Verification failed. Please try again.';
    }
    verifyError.style.display = 'block';
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Verify account';
  }
});

document.getElementById('resend-btn').addEventListener('click', async () => {
  const resendBtn   = document.getElementById('resend-btn');
  const verifyError = document.getElementById('verify-error');

  try {
    resendBtn.textContent = 'Sending…';
    resendBtn.disabled = true;
    await resendSignUpCode({ username: pendingEmail });
    verifyError.textContent = 'A new code has been sent to your email.';
    verifyError.style.color = '#1e6b2e';
    verifyError.style.display = 'block';
  } catch (err) {
    verifyError.textContent = 'Failed to resend code. Please try again.';
    verifyError.style.color = '#b42318';
    verifyError.style.display = 'block';
  } finally {
    resendBtn.textContent = 'Resend code';
    resendBtn.disabled = false;
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function generateVendorId(companyName) {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 12);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug}-${suffix}`;
}

function showError(message) {
  errorText.textContent = message;
  errorMsg.style.display = 'block';
}
