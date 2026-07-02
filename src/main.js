import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import outputs from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(outputs);

const client = generateClient({ authMode: 'identityPool' });

const submitBtn = document.getElementById('submit-btn');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');
const successMsg = document.getElementById('success-msg');
const eventSelect = document.getElementById('eventSelect');

// Read event from URL parameter — no AppSync call needed
const params = new URLSearchParams(window.location.search);
const eventParam = params.get('event');

if (eventParam) {
  // Event specified in URL — show it locked
  eventSelect.innerHTML = `<option value="${escapeHtml(eventParam)}">${escapeHtml(eventParam)}</option>`;
  eventSelect.disabled = true;
} else {
  // No event in URL — show a text input instead
  eventSelect.outerHTML = `<input id="eventSelect" type="text" placeholder="Enter event name" style="width: 100%; box-sizing: border-box; border-radius: 4px; border: 1px solid #c7c9cf; padding: 10px 12px; font-size: 14px;" />`;
}

submitBtn.addEventListener('click', async () => {
  const eventName = document.getElementById('eventSelect').value.trim();
  const name = document.getElementById('fullname').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const consent = document.getElementById('consent').checked;

  errorMsg.style.display = 'none';
  successMsg.style.display = 'none';

  if (!eventName) {
    showError('Please enter or select an event.');
    return;
  }
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
      eventName,
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}