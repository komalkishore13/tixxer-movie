/* ================================================
   TIXXER — Cross-Site Auth Gate
   Include this script in all Tixxer sub-sites.
   Blocks payment unless user is logged in via
   the main Tixxer landing page.
   ================================================ */

const TIXXER_LOGIN_URL = 'https://tixxer.vercel.app/login.html';

// ---------- AUTO: Check for auth callback in URL ----------
(function handleAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const authData = params.get('tixxer_auth');

  if (authData) {
    try {
      const user = JSON.parse(atob(authData));
      localStorage.setItem('tixxer_user', JSON.stringify(user));
    } catch (e) {
      console.warn('Invalid auth data');
    }

    // Clean the URL (remove tixxer_auth param)
    params.delete('tixxer_auth');
    const remaining = params.toString();
    const cleanUrl = window.location.pathname + (remaining ? '?' + remaining : '') + window.location.hash;
    window.history.replaceState({}, '', cleanUrl);
  }
})();


/**
 * Get the logged-in Tixxer user (or null).
 */
function getTixxerUser() {
  try {
    return JSON.parse(localStorage.getItem('tixxer_user'));
  } catch {
    return null;
  }
}


/**
 * Call this before payment. Returns user object if logged in,
 * otherwise shows a login popup and returns null.
 */
function requireTixxerAuth() {
  const user = getTixxerUser();
  if (user) return user;

  showTixxerLoginPopup();
  return null;
}


/**
 * Show a styled login-required popup overlay.
 */
function showTixxerLoginPopup() {
  // Don't duplicate
  if (document.getElementById('tixxerAuthOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'tixxerAuthOverlay';
  overlay.innerHTML = `
    <style>
      #tixxerAuthOverlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: tixxerFadeIn 0.3s ease;
      }
      @keyframes tixxerFadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      .tixxer-popup {
        background: #111828;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 40px 36px;
        max-width: 420px;
        width: 90%;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        animation: tixxerSlideUp 0.35s cubic-bezier(0.22, 1, 0.36, 1);
      }
      @keyframes tixxerSlideUp {
        from { transform: translateY(30px); opacity: 0; }
        to   { transform: translateY(0); opacity: 1; }
      }
      .tixxer-popup-icon {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: rgba(124, 91, 245, 0.12);
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 20px;
      }
      .tixxer-popup-icon svg {
        color: #a78bfa;
      }
      .tixxer-popup h2 {
        font-family: 'Playfair Display', Georgia, serif;
        font-size: 1.5rem;
        font-weight: 600;
        color: #f1f1f3;
        margin-bottom: 10px;
      }
      .tixxer-popup p {
        font-family: 'Inter', sans-serif;
        font-size: 0.88rem;
        color: #94a3b8;
        line-height: 1.6;
        margin-bottom: 28px;
      }
      .tixxer-popup-actions {
        display: flex;
        gap: 12px;
      }
      .tixxer-btn-login {
        flex: 1;
        padding: 14px;
        font-family: 'Inter', sans-serif;
        font-size: 0.82rem;
        font-weight: 500;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: #fff;
        background: #7c5bf5;
        border: 1px solid #7c5bf5;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s;
      }
      .tixxer-btn-login:hover {
        background: transparent;
        box-shadow: 0 0 25px rgba(124, 91, 245, 0.3);
      }
      .tixxer-btn-cancel {
        padding: 14px 24px;
        font-family: 'Inter', sans-serif;
        font-size: 0.82rem;
        font-weight: 500;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: #94a3b8;
        background: none;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.3s;
      }
      .tixxer-btn-cancel:hover {
        color: #f1f1f3;
        border-color: rgba(255, 255, 255, 0.25);
      }
    </style>

    <div class="tixxer-popup">
      <div class="tixxer-popup-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
      </div>
      <h2>Login Required</h2>
      <p>You need to sign in to your Tixxer account before making a payment. It only takes a moment.</p>
      <div class="tixxer-popup-actions">
        <button class="tixxer-btn-cancel" id="tixxerPopupCancel">Cancel</button>
        <button class="tixxer-btn-login" id="tixxerPopupLogin">Log In</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close popup
  document.getElementById('tixxerPopupCancel').addEventListener('click', () => {
    overlay.remove();
  });

  // Also close on clicking the dark backdrop
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Redirect to main Tixxer login with current page as redirect
  document.getElementById('tixxerPopupLogin').addEventListener('click', () => {
    const currentUrl = window.location.href;
    window.location.href = TIXXER_LOGIN_URL + '?redirect=' + encodeURIComponent(currentUrl);
  });
}
