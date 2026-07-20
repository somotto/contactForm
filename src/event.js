import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import outputs from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(outputs);

const client = generateClient({ authMode: 'apiKey' });

// Extract slug from path: /e/renewable-energy → "renewable-energy"
const slug = decodeURIComponent(window.location.pathname.replace(/^\/e\//, '').replace(/\/$/, ''));

const loadingOverlay = document.getElementById('loading-overlay');
const formContent = document.getElementById('form-content');
const notFound = document.getElementById('not-found');
const submitBtn = document.getElementById('submit-btn');
const errorMsg = document.getElementById('error-msg');
const errorText = document.getElementById('error-text');
const successMsg = document.getElementById('success-msg');

let resolvedEvent = null;

async function init() {
  if (!slug) {
    loadingOverlay.style.display = 'none';
    notFound.style.display = 'block';
    return;
  }

  try {
    // Look up event by slug (public guest read)
    const { data, errors } = await client.models.Event.list({
      filter: { slug: { eq: slug } },
    });

    if (errors || !data || data.length === 0) {
      loadingOverlay.style.display = 'none';
      notFound.style.display = 'block';
      return;
    }

    resolvedEvent = data[0];

    // Update header with event name
    document.getElementById('header-event-label').textContent = resolvedEvent.name;
    document.getElementById('header-title').textContent = 'Contact registration';
    document.title = `Register — ${resolvedEvent.name}`;

    loadingOverlay.style.display = 'none';
    formContent.style.display = 'block';
  } catch (err) {
    console.error(err);
    loadingOverlay.style.display = 'none';
    notFound.style.display = 'block';
  }
}

submitBtn.addEventListener('click', async () => {
  const name = document.getElementById('fullname').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const consent = document.getElementById('consent').checked;

  errorMsg.style.display = 'none';
  successMsg.style.display = 'none';

  if (!name) { showError('Full legal name is required.'); return; }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRe.test(email)) { showError('A valid corporate email address is required.'); return; }
  if (!phone) { showError('A direct telephone number is required.'); return; }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const { errors } = await client.models.Submission.create({
      name,
      email,
      phone,
      consent,
      submittedAt: new Date().toISOString(),
      eventId: resolvedEvent?.id || null,
      eventName: resolvedEvent?.name || null,
      vendorId: resolvedEvent?.vendorId || null,
    });

    if (errors) {
      console.error(errors);
      showError('Something went wrong. Please try again.');
      return;
    }

    successMsg.style.display = 'block';
    document.getElementById('fullname').value = '';
    document.getElementById('email').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('consent').checked = false;
  } catch (err) {
    console.error(err);
    showError('Something went wrong. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit registration →';
  }
});

function showError(msg) {
  errorText.textContent = msg;
  errorMsg.style.display = 'block';
}

init();
