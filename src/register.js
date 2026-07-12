import { Amplify } from 'aws-amplify';
import { signUp } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import outputs from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(outputs);
const client = generateClient({ authMode: 'userPool' });

const registerBtn = document.getElementById('register-btn');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');
const successMsg = document.getElementById('success-msg');

registerBtn.addEventListener('click', async () => {
  const fullName = document.getElementById('fullname').value.trim();
  const companyName = document.getElementById('companyname').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const website = document.getElementById('website').value.trim();
  const password = document.getElementById('password').value;

  errorMsg.style.display = 'none';
  successMsg.style.display = 'none';

  // Validation
  if (!fullName) { showError('Full legal name is required.'); return; }
  if (!companyName) { showError('Company name is required.'); return; }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRe.test(email)) { showError('A valid email address is required.'); return; }
  if (!phone) { showError('Phone number is required.'); return; }
  if (!password || password.length < 8) { showError('Password must be at least 8 characters.'); return; }

  registerBtn.disabled = true;
  registerBtn.textContent = 'Creating account…';

  try {
    // Generate unique vendor ID from company name + random suffix
    const vendorId = generateVendorId(companyName);

    // Create Cognito account
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

    // Store vendor profile in DynamoDB after signup
    // Note: since the user isn't confirmed yet, we store via guest-accessible
    // path — but Vendor uses owner auth, so we need to sign in first.
    // We'll store profile details in localStorage temporarily and
    // complete the Vendor record creation on first dashboard login.
    localStorage.setItem('pendingVendorProfile', JSON.stringify({
      fullName,
      companyName,
      email,
      phone,
      websiteUrl: website || null,
      vendorId,
    }));

    successMsg.style.display = 'block';
    registerBtn.style.display = 'none';
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