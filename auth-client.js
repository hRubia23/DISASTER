const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showLoginBtn = document.getElementById('showLoginBtn');
const showRegisterBtn = document.getElementById('showRegisterBtn');
const authMessage = document.getElementById('authMessage');
const switchButtons = document.querySelectorAll('[data-switch-target]');
const registerAgencySelect = document.getElementById('registerAgency');
const registerAgencyOtherField = document.getElementById('registerAgencyOtherField');
const registerAgencyOtherInput = document.getElementById('registerAgencyOther');

function setMessage(message, type = 'info') {
  if (!authMessage) {
    return;
  }

  authMessage.textContent = message;
  authMessage.classList.remove('error', 'success');

  if (type === 'error') {
    authMessage.classList.add('error');
  } else if (type === 'success') {
    authMessage.classList.add('success');
  }
}

function showLoginView() {
  loginForm?.classList.add('visible');
  loginForm?.classList.remove('hidden');
  registerForm?.classList.remove('visible');
  registerForm?.classList.add('hidden');
  showLoginBtn?.classList.add('active', 'danger');
  showRegisterBtn?.classList.remove('active', 'danger');
  setMessage('');
}

function showRegisterView() {
  registerForm?.classList.add('visible');
  registerForm?.classList.remove('hidden');
  loginForm?.classList.remove('visible');
  loginForm?.classList.add('hidden');
  showRegisterBtn?.classList.add('active');
  showLoginBtn?.classList.remove('active', 'danger');
  setMessage('');
}

function syncAgencyOtherVisibility() {
  if (!registerAgencySelect || !registerAgencyOtherField || !registerAgencyOtherInput) {
    return;
  }

  const selected = String(registerAgencySelect.value || '');
  const isOthers = selected === 'Others';

  registerAgencyOtherField.classList.toggle('hidden', !isOthers);
  registerAgencyOtherInput.required = isOthers;
  if (!isOthers) {
    registerAgencyOtherInput.value = '';
  }
}

async function getCurrentUser() {
  try {
    const response = await fetch('/api/me', {
      credentials: 'include'
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return payload.logged_in ? payload.user : null;
  } catch (error) {
    return null;
  }
}

async function requestJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(body)
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch (error) {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.');
  }

  return payload;
}

if (showLoginBtn) {
  showLoginBtn.addEventListener('click', showLoginView);
}

if (showRegisterBtn) {
  showRegisterBtn.addEventListener('click', showRegisterView);
}

switchButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.switchTarget === 'register') {
      showRegisterView();
    } else {
      showLoginView();
    }
  });
});

if (registerAgencySelect) {
  registerAgencySelect.addEventListener('change', syncAgencyOtherVisibility);
}

if (registerForm) {
  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const fullNameField = document.getElementById('registerName');
    const firstName = document.getElementById('registerFirstName')?.value.trim() || '';
    const lastName = document.getElementById('registerLastName')?.value.trim() || '';
    const full_name = (fullNameField?.value.trim() || `${firstName} ${lastName}`.trim());
    const email = document.getElementById('registerEmail')?.value.trim();
    const agencySelected = registerAgencySelect ? String(registerAgencySelect.value || '').trim() : '';
    const agencyOther = registerAgencyOtherInput ? String(registerAgencyOtherInput.value || '').trim() : '';
    const organization = agencySelected === 'Others' ? agencyOther : agencySelected;
    const password = document.getElementById('registerPassword')?.value || '';
    const confirmPassword = document.getElementById('registerConfirmPassword')?.value;

    if (typeof confirmPassword === 'string' && confirmPassword !== password) {
      setMessage('Passwords do not match.', 'error');
      return;
    }

    if (!organization) {
      setMessage('Please select your organization / agency.', 'error');
      return;
    }

    try {
      await requestJson('/api/register', { full_name, email, password, organization });
      setMessage('Registration successful. You can now log in.', 'success');
      registerForm.reset();
      syncAgencyOtherVisibility();
      showLoginView();
    } catch (error) {
      setMessage(error.message, 'error');
    }
  });
}

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = document.getElementById('loginEmail')?.value.trim();
    const password = document.getElementById('loginPassword')?.value || '';

    try {
      await requestJson('/api/login', { email, password });
      setMessage('Login successful. Redirecting...', 'success');
      window.location.href = 'index.html';
    } catch (error) {
      setMessage(error.message, 'error');
    }
  });
}

(async () => {
  showLoginView();
  syncAgencyOtherVisibility();

  const user = await getCurrentUser();
  if (user) {
    window.location.href = 'index.html';
  }
})();
