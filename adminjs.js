// Predefined accounts (username: password)
// Modify these values for additional admin accounts.
const ACCOUNTS = {
  "admin": "123",
  "operator": "routeMaster",
};

const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorEl = document.getElementById('error');
const submitBtn = document.getElementById('submitBtn');
const loaderOverlay = document.getElementById('loaderOverlay');
const loginCard = document.querySelector('.login-card');

function showError(msg) {
  if (errorEl) errorEl.textContent = msg;
  if (loginCard) {
    loginCard.classList.remove('shake');
    // restart animation
    void loginCard.offsetWidth;
    loginCard.classList.add('shake');
  }
}

function clearError() {
  if (errorEl) errorEl.textContent = '';
  if (loginCard) loginCard.classList.remove('shake');
}

function disableForm(disabled = true) {
  if (usernameInput) usernameInput.disabled = disabled;
  if (passwordInput) passwordInput.disabled = disabled;
  if (submitBtn) submitBtn.disabled = disabled;
}

function showLoader() {
  if (loaderOverlay) {
    loaderOverlay.classList.add('show');
    loaderOverlay.setAttribute('aria-hidden', 'false');
  }
}

function hideLoader() {
  if (loaderOverlay) {
    loaderOverlay.classList.remove('show');
    loaderOverlay.setAttribute('aria-hidden', 'true');
  }
}

/* Primary login flow (index.html) */
if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearError();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showError('Please fill both fields.');
      return;
    }

    // Simple predefined account check
    const expected = ACCOUNTS[username];
    if (!expected || expected !== password) {
      showError('Invalid username or password.');
      return;
    }

    // Successful login
    disableForm(true);
    showLoader();

    // persist simple session info (short-lived)
    try {
      sessionStorage.setItem('evac_admin_user', username);
    } catch (err) {
      // ignore storage errors
    }

    // Keep loader visible for a short moment to show animation, then redirect
    setTimeout(() => {
      // Transition to admin page
      window.location.href = 'dump.html';
    }, 1300);
  });

  // allow "Enter" while focused on inputs
  [usernameInput, passwordInput].forEach((el) => {
    if (el) el.addEventListener('input', clearError);
  });
}

/* Re-authentication modal logic (for actions that "go forward")
   Usage: Add class="needs-auth" and data-target="URL" to any link/button.
   When clicked, a modal will prompt for admin username & password again.
   On success it navigates to the target URL and stores the session user.
*/
const authOverlay = document.getElementById('authOverlay');
if (authOverlay) {
  const authForm = document.getElementById('authForm');
  const authUser = document.getElementById('authUsername');
  const authPass = document.getElementById('authPassword');
  const authError = document.getElementById('authError');
  const authCancel = document.getElementById('authCancel');
  let pendingTarget = null;

  function openAuthModal(target) {
    pendingTarget = target || 'trynew.html';
    if (authUser) authUser.value = '';
    if (authPass) authPass.value = '';
    if (authError) authError.textContent = '';
    authOverlay.classList.add('show');
    authOverlay.setAttribute('aria-hidden', 'false');
    if (authUser) authUser.focus();
  }

  function closeAuthModal() {
    pendingTarget = null;
    authOverlay.classList.remove('show');
    authOverlay.setAttribute('aria-hidden', 'true');
  }

  // Delegate clicks on elements that require auth
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('.needs-auth');
    if (!el) return;
    e.preventDefault();
    // use data-target or href
    const target = el.getAttribute('data-target') || el.getAttribute('href') || el.dataset.target;
    openAuthModal(target);
  });

  if (authCancel) authCancel.addEventListener('click', (e) => {
    e.preventDefault();
    closeAuthModal();
  });

  if (authForm) {
    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (authError) authError.textContent = '';
      const u = authUser.value.trim();
      const p = authPass.value;
      if (!u || !p) {
        if (authError) authError.textContent = 'Enter username and password';
        return;
      }

      const expected = ACCOUNTS[u];
      if (!expected || expected !== p) {
        if (authError) authError.textContent = 'Invalid credentials';
        // slight shake for feedback
        authForm.classList.remove('shake');
        void authForm.offsetWidth;
        authForm.classList.add('shake');
        return;
      }

      // success: persist and navigate after showing loader briefly
      try {
        sessionStorage.setItem('evac_admin_user', u);
      } catch (err) { /* ignore */ }

      closeAuthModal();
      showLoader();
      // small delay so loader is visible
      setTimeout(() => {
        window.location.href = pendingTarget || 'trynew.html';
      }, 800);
    });
  }

  // Allow Enter key to submit and clear errors on input
  [authUser, authPass].forEach((el) => {
    if (!el) return;
    el.addEventListener('input', () => {
      if (authError) authError.textContent = '';
      if (authForm) authForm.classList.remove('shake');
    });
    el.addEventListener('keyup', (ev) => {
      if (ev.key === 'Escape') closeAuthModal();
    });
  });
}