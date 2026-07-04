/**
 * libretto_spotify.js — Spotify Web API integration (PKCE OAuth + playback control).
 *
 * Fill in CLIENT_ID and REDIRECT_URI from your Spotify Developer Dashboard
 * before deploying. REDIRECT_URI must match the registered redirect URI exactly
 * and must be HTTPS (or http://127.0.0.1 for local dev).
 *
 * Requires Spotify Premium. Playback is sent to the user's currently active
 * Spotify device (native app); no in-browser audio is created.
 *
 * Public API on window.LibrettoSpotify:
 *   isAuthenticated()         → boolean
 *   connect()                 → initiates PKCE OAuth redirect
 *   disconnect()              → clears tokens, fires onAuthChange callbacks
 *   play(albumId, trackId)    → Promise — resolves on 204, rejects with error code string
 *   onAuthChange(cb)          → subscribe to auth state changes
 *
 * Error codes rejected by play():
 *   'NO_ACTIVE_DEVICE'  — no Spotify app open on any device
 *   'PREMIUM_REQUIRED'  — account is not Premium
 *   'AUTH_FAILED'       — token expired and could not be refreshed
 *   'NETWORK_ERROR'     — fetch threw (offline, DNS, etc.)
 *   'UNKNOWN'           — any other non-204 response
 */
(function () {
  // ── Configuration — fill in CLIENT_ID from your Spotify Developer Dashboard ──
  const CLIENT_ID    = '0fe4d9f573b545c2b8292c1edeef745b';
  const REDIRECT_URI = 'https://jdchourio.github.io';
  const SCOPE        = 'user-modify-playback-state user-read-playback-state';

  // ── Storage keys (namespaced to avoid collisions) ───────────────────────────
  const KEY_VERIFIER    = 'libretto_spotify_pkce_verifier';
  const KEY_VERIFIER_FB = 'libretto_spotify_pkce_verifier_fb';  // iOS Safari fallback
  const KEY_ACCESS      = 'libretto_spotify_access';
  const KEY_REFRESH     = 'libretto_spotify_refresh';
  const KEY_EXPIRES_AT  = 'libretto_spotify_expires_at';
  const KEY_RETURN      = 'libretto_spotify_return';       // page to return to after OAuth

  // ── Auth change callbacks ────────────────────────────────────────────────────
  const _authCallbacks = [];

  function _fireAuthChange() {
    _authCallbacks.forEach(cb => { try { cb(); } catch (_) {} });
  }

  // ── PKCE helpers ─────────────────────────────────────────────────────────────
  function _randomString(len) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => charset[b % charset.length]).join('');
  }

  async function _sha256(plain) {
    const data = new TextEncoder().encode(plain);
    return crypto.subtle.digest('SHA-256', data);
  }

  function _base64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (const b of bytes) str += String.fromCharCode(b);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // ── Verifier storage (sessionStorage + localStorage fallback for iOS Safari) ─
  function _storeVerifier(v) {
    try {
      sessionStorage.setItem(KEY_VERIFIER, v);
      localStorage.setItem(KEY_VERIFIER_FB, v);
    } catch (_) {
      localStorage.setItem(KEY_VERIFIER_FB, v);
    }
  }

  function _retrieveVerifier() {
    let v = null;
    try { v = sessionStorage.getItem(KEY_VERIFIER); } catch (_) {}
    if (!v) v = localStorage.getItem(KEY_VERIFIER_FB);
    return v;
  }

  function _clearVerifier() {
    try { sessionStorage.removeItem(KEY_VERIFIER); } catch (_) {}
    localStorage.removeItem(KEY_VERIFIER_FB);
  }

  // ── Token refresh ─────────────────────────────────────────────────────────────
  async function _refreshTokenIfNeeded() {
    const expiresAt = parseInt(localStorage.getItem(KEY_EXPIRES_AT) || '0', 10);
    if (Date.now() < expiresAt - 60_000) return true;

    const refreshToken = localStorage.getItem(KEY_REFRESH);
    if (!refreshToken) return false;

    let resp;
    try {
      resp = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'refresh_token',
          refresh_token: refreshToken,
          client_id:     CLIENT_ID,
        }),
      });
    } catch (_) {
      return false;
    }

    if (!resp.ok) {
      disconnect();
      return false;
    }

    const body = await resp.json();
    const expiresAt2 = Date.now() + body.expires_in * 1000;
    localStorage.setItem(KEY_ACCESS, body.access_token);
    localStorage.setItem(KEY_EXPIRES_AT, String(expiresAt2));
    if (body.refresh_token) localStorage.setItem(KEY_REFRESH, body.refresh_token);
    return true;
  }

  // ── OAuth callback handler ───────────────────────────────────────────────────
  async function _handleCallback(code) {
    const verifier = _retrieveVerifier();
    if (!verifier) return;

    let resp;
    try {
      resp = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'authorization_code',
          code,
          redirect_uri:  REDIRECT_URI,
          client_id:     CLIENT_ID,
          code_verifier: verifier,
        }),
      });
    } catch (_) {
      return;
    }

    if (!resp.ok) return;

    const body = await resp.json();
    const expiresAt = Date.now() + body.expires_in * 1000;
    localStorage.setItem(KEY_ACCESS, body.access_token);
    localStorage.setItem(KEY_REFRESH, body.refresh_token);
    localStorage.setItem(KEY_EXPIRES_AT, String(expiresAt));
    _clearVerifier();

    // The registered REDIRECT_URI is the site root, so Spotify always lands us
    // there. If a return URL was saved before connect(), bounce back to the page
    // the user actually started from (the token now lives in shared localStorage).
    let returnUrl = null;
    try { returnUrl = localStorage.getItem(KEY_RETURN); } catch (_) {}
    localStorage.removeItem(KEY_RETURN);
    if (returnUrl && returnUrl !== location.href) {
      location.replace(returnUrl);
      return;
    }

    history.replaceState({}, '', location.pathname);
    _fireAuthChange();
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  function isAuthenticated() {
    return !!localStorage.getItem(KEY_ACCESS);
  }

  async function connect() {
    const verifier  = _randomString(96);
    const hash      = await _sha256(verifier);
    const challenge = _base64url(hash);
    _storeVerifier(verifier);

    // Remember where we are so _handleCallback() can return here after the
    // redirect lands on the site root (the single registered REDIRECT_URI).
    try { localStorage.setItem(KEY_RETURN, location.href); } catch (_) {}

    const params = new URLSearchParams({
      client_id:             CLIENT_ID,
      response_type:         'code',
      redirect_uri:          REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge:        challenge,
      scope:                 SCOPE,
    });

    window.location.href = `https://accounts.spotify.com/authorize?${params}`;
  }

  function disconnect() {
    [KEY_ACCESS, KEY_REFRESH, KEY_EXPIRES_AT].forEach(k => localStorage.removeItem(k));
    _clearVerifier();
    _fireAuthChange();
  }

  async function play(albumId, trackId) {
    const ok = await _refreshTokenIfNeeded();
    if (!ok) return Promise.reject('AUTH_FAILED');

    const token = localStorage.getItem(KEY_ACCESS);
    const payload = {
      context_uri: `spotify:album:${albumId}`,
      offset:      { uri: `spotify:track:${trackId}` },
      position_ms: 0,
    };

    let resp;
    try {
      resp = await fetch('https://api.spotify.com/v1/me/player/play', {
        method:  'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    } catch (_) {
      return Promise.reject('NETWORK_ERROR');
    }

    if (resp.status === 204) return;

    let bodyText = '';
    try { bodyText = await resp.text(); } catch (_) {}

    if (resp.status === 401) {
      // Force-expire and retry once
      localStorage.setItem(KEY_EXPIRES_AT, '0');
      const refreshed = await _refreshTokenIfNeeded();
      if (refreshed) {
        const token2 = localStorage.getItem(KEY_ACCESS);
        let resp2;
        try {
          resp2 = await fetch('https://api.spotify.com/v1/me/player/play', {
            method:  'PUT',
            headers: { Authorization: `Bearer ${token2}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
          });
        } catch (_) {
          return Promise.reject('NETWORK_ERROR');
        }
        if (resp2.status === 204) return;
      }
      disconnect();
      return Promise.reject('AUTH_FAILED');
    }

    if (resp.status === 404) return Promise.reject('NO_ACTIVE_DEVICE');

    if (resp.status === 403) {
      let parsed = {};
      try { parsed = JSON.parse(bodyText); } catch (_) {}
      if (parsed?.error?.reason === 'PREMIUM_REQUIRED') return Promise.reject('PREMIUM_REQUIRED');
    }

    return Promise.reject('UNKNOWN');
  }

  function onAuthChange(cb) {
    _authCallbacks.push(cb);
  }

  window.LibrettoSpotify = { isAuthenticated, connect, disconnect, play, onAuthChange };

  // ── Boot: handle OAuth callback or error on page load ───────────────────────
  (async function boot() {
    const params = new URLSearchParams(window.location.search);
    const error  = params.get('error');
    const code   = params.get('code');
    if (error) { history.replaceState({}, '', location.pathname); return; }
    if (code)  { await _handleCallback(code); }
  })();
})();
