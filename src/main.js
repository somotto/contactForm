import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import outputs from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(outputs);

const client = generateClient({ authMode: 'identityPool' });

const submitBtn = document.getElementById('submit-btn');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');
const successMsg = document.getElementById('success-msg');

// Read event name from URL parameter — no dropdown, no AppSync call
const params = new URLSearchParams(window.location.search);
const eventName = params.get('event') || '';

if (eventName) {
  const banner = document.getElementById('event-banner');
  const bannerName = document.getElementById('event-banner-name');
  bannerName.textContent = eventName;
  banner.style.display = 'block';
}

submitBtn.addEventListener('click', async () => {
  const name = document.getElementById('fullname').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const consent = document.getElementById('consent').checked;

  errorMsg.style.display = 'none';
  successMsg.style.display = 'none';

  if (!name) {
    showError('Full legal name is required.');
    return;
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRe.test(email)) {
    showError('A valid corporate email address is required.');
    return;
  }
  if (!phone) {
    showError('A direct telephone number is required.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const { errors } = await client.models.Submission.create({
      eventName: eventName || null,
      name,
      email,
      phone,
      consent,
      submittedAt: new Date().toISOString(),
    });

    if (errors) {
      console.error(errors);
      showError('Something went wrong submitting your details. Please try again.');
      return;
    }

    successMsg.style.display = 'block';
    document.getElementById('fullname').value = '';
    document.getElementById('email').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('consent').checked = false;
  } catch (err) {
    console.error(err);
    showError('Something went wrong submitting your details. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit registration →';
  }
});

function showError(message) {
  errorText.textContent = message;
  errorMsg.style.display = 'block';
}