import { Amplify } from 'aws-amplify';
import { signUp, confirmSignUp, resendSignUpCode } from 'aws-amplify/auth';
import outputs from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(outputs);

const registerBtn = document.getElementById('register-btn');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');
const successMsg = document.getElementById('success-msg');

let pendingEmail = '';

registerBtn.addEventListener('click', async () => {
  const fullName = document.getElementById('fullname').value.trim();
  const companyName = document.getElementById('companyname').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const website = document.getElementById('website').value.trim();
  const password = document.getElementById('password').value;

  errorMsg.style.display = 'none';
  successMsg.style.display = 'none';

  if (!fullName) { showError('Full legal name is required.'); return; }
  if (!companyName) { showError('Company name is required.'); return; }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRe.test(email)) { showError('A valid email address is required.'); return; }
  if (!phone) { showError('Phone number is required.'); return; }
  if (!password || password.length < 8) { showError('Password must be at least 8 characters.'); return; }

  registerBtn.disabled = true;
  registerBtn.textContent = 'Creating account…';

  try {
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

    // Store vendor profile for after verification
    localStorage.setItem('pendingVendorProfile', JSON.stringify({
      fullName,
      companyName,
      email,
      phone,
      websiteUrl: website || null,
      vendorId,
    }));

    pendingEmail = email;

    // Hide registration form, show verification form
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
  // Hide registration fields
  document.getElementById('registration-form').style.display = 'none';

  // Show verification section
  document.getElementById('verification-form').style.display = 'block';

  // Show which email the code was sent to
  document.getElementById('verify-email-label').textContent =
    `A 6-digit verification code was sent to ${pendingEmail}`;
}

// Verify button
document.getElementById('verify-btn').addEventListener('click', async () => {
  const code = document.getElementById('verify-code').value.trim();
  const verifyBtn = document.getElementById('verify-btn');
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
    await confirmSignUp({
      username: pendingEmail,
      confirmationCode: code,
    });

    // Show success and redirect to login
    document.getElementById('verification-form').style.display = 'none';
    successMsg.innerHTML = `
      Account verified! You can now
      <a href="/" style="color:#1e6b2e; font-weight:500;">log in to your dashboard</a>.
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

// Resend code button
document.getElementById('resend-btn').addEventListener('click', async () => {
  const resendBtn = document.getElementById('resend-btn');
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