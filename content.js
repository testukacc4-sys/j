// Facebook Post Full Description Copier - v7
(function () {
  'use strict';

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ============================================================
     CONFIRMED from Elements tab:
     - Post text is in: span[dir="auto"] (with long obfuscated classes)
     - "See more" is: div[role="button"][tabindex="0"] INSIDE that span
     - Post is NOT inside role="article" — all articles are comments
     
     STRATEGY:
     1. Find span[dir="auto"] that contains "See more" div[role="button"]
        OR is the longest text block on page (above comments)
     2. Click the See more button inside it
     3. Grab the full text from that span
  ============================================================ */

  function findPostTextSpan() {
    // All span/div with dir="auto" 
    const allDirAuto = [
      ...document.querySelectorAll('span[dir="auto"], div[dir="auto"]')
    ];

    // Score each one
    const scored = allDirAuto.map(el => {
      const text = (el.innerText || el.textContent || '').trim();
      let score = 0;

      // Bonus: contains a "See more" button inside = definitely post text
      const hasSeeMore = [...el.querySelectorAll('[role="button"]')].some(b =>
        (b.innerText || b.textContent || '').trim().toLowerCase() === 'see more'
      );
      if (hasSeeMore) score += 100;

      // Bonus: longer text = more likely to be post body
      score += Math.min(text.length, 500);

      // Penalty: inside a role="article" = comment
      if (el.closest('[role="article"]')) score -= 200;

      // Penalty: inside nav/header/aside
      if (el.closest('nav, header, aside, [role="navigation"], [role="banner"]')) score -= 300;

      // Penalty: very short text
      if (text.length < 20) score -= 500;

      return { el, text, score, hasSeeMore };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Return best candidate
    const best = scored[0];
    return best && best.score > 0 ? best.el : null;
  }

  /* ============================================================
     Expand "See more" — click div[role="button"] inside post span
  ============================================================ */
  async function expandSeeMore() {
    const postSpan = findPostTextSpan();
    if (!postSpan) return;

    // Find "See more" button(s) inside the post text container
    const allBtns = [...postSpan.querySelectorAll('[role="button"], [tabindex="0"]')];
    const seeMoreBtns = allBtns.filter(b =>
      (b.innerText || b.textContent || '').trim().toLowerCase() === 'see more'
    );

    for (const btn of seeMoreBtns) {
      try {
        btn.click();
        await sleep(1000);
      } catch {}
    }

    // Also try parent containers of the span
    // Facebook sometimes puts See more just outside the text span
    const parent = postSpan.parentElement;
    if (parent) {
      const parentBtns = [...parent.querySelectorAll('[role="button"]')].filter(b =>
        (b.innerText || b.textContent || '').trim().toLowerCase() === 'see more'
      );
      for (const btn of parentBtns) {
        if (!seeMoreBtns.includes(btn)) {
          try { btn.click(); await sleep(1000); } catch {}
        }
      }
    }

    await sleep(600);
  }

  /* ============================================================
     Extract post text after expansion
  ============================================================ */
  function getPostText() {
    const postSpan = findPostTextSpan();
    if (!postSpan) return null;

    // Clone and remove the "See more" / "See less" button
    const clone = postSpan.cloneNode(true);
    clone.querySelectorAll('[role="button"]').forEach(b => {
      const t = (b.innerText || b.textContent || '').trim().toLowerCase();
      if (['see more', 'see less', 'see more…'].includes(t)) b.remove();
    });

    const text = (clone.innerText || clone.textContent || '').trim();
    return text.length > 10 ? text : null;
  }

  /* ============================================================
     Clipboard
  ============================================================ */
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const ta = Object.assign(document.createElement('textarea'), {
      value: text, style: 'position:fixed;opacity:0;top:0;left:0'
    });
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }

  /* ============================================================
     Toast
  ============================================================ */
  function toast(msg, err = false) {
    let el = document.getElementById('fbc-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fbc-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.cssText = `
      position:fixed;top:124px;right:22px;z-index:2147483647;
      padding:11px 18px;border-radius:12px;font-size:14px;font-weight:600;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff;
      background:${err ? '#d93025' : '#1a9e5c'};
      box-shadow:0 4px 20px rgba(0,0,0,.25);
      opacity:1;transform:translateY(0);
      transition:opacity .4s,transform .4s;
    `;
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(-12px)';
    }, 4000);
  }

  /* ============================================================
     Clean post text:
     1. Remove lines that start with or contain only # (hashtags)
     2. Cut everything from ~ onwards (including that line)
  ============================================================ */
  function cleanText(text) {
    if (!text) return text;

    // Step 1: Cut at ~ — remove ~ and everything after it
    const tildeIdx = text.indexOf('~');
    if (tildeIdx !== -1) {
      text = text.substring(0, tildeIdx).trim();
    }

    // Step 2: Remove lines that are purely hashtags (#word #word ...)
    // Also remove individual #hashtag tokens from mixed lines
    const lines = text.split('\n');
    const cleaned = lines
      .map(line => {
        const trimmed = line.trim();
        // Remove entire line if it's only hashtags and spaces
        if (/^(#\S+\s*)+$/.test(trimmed)) return null;
        // Remove individual #hashtag words from the line
        return trimmed.replace(/#\S+/g, '').trim();
      })
      .filter(line => line !== null && line.length > 0);

    return cleaned.join('\n').trim();
  }

  /* ============================================================
     Styles
  ============================================================ */
  function injectStyles() {
    if (document.getElementById('fbc-styles')) return;
    const s = document.createElement('style');
    s.id = 'fbc-styles';
    s.textContent = `
      #fbc-btn {
        position:fixed;top:60px;right:50px;z-index:2147483647;
        display:flex;align-items:center;justify-content:center;
        width:56px;height:56px;padding:0;
        background:rgba(24,119,242,0.15);
        backdrop-filter:blur(10px);
        -webkit-backdrop-filter:blur(10px);
        border:2px solid rgba(24,119,242,0.4);
        color:#1877f2;border-radius:50%;font-size:14px;font-weight:700;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        cursor:pointer;
        box-shadow:0 4px 18px rgba(24,119,242,.25), 0 0 0 0 rgba(24,119,242,.3);
        transition:all .35s cubic-bezier(.34,1.56,.64,1);
        user-select:none;overflow:hidden;white-space:nowrap;
      }
      #fbc-btn svg { transition: transform .3s ease; }
      #fbc-btn:hover {
        width:auto;padding:0 20px;border-radius:50px;gap:8px;
        background:rgba(24,119,242,0.9);
        border-color:rgba(24,119,242,0.9);
        color:#fff;
        transform:scale(1.05);
        box-shadow:0 6px 28px rgba(24,119,242,.5);
      }
      #fbc-btn:hover svg { transform: rotate(-10deg) scale(1.1); }
      #fbc-btn:hover .fbc-label { max-width:120px; opacity:1; margin-left:4px; }
      #fbc-btn:active { transform:scale(0.93); }
      #fbc-btn:disabled { cursor:not-allowed; }

      .fbc-label {
        max-width:0; opacity:0; overflow:hidden;
        transition: max-width .35s ease, opacity .3s ease, margin .35s ease;
        font-size:14px; font-weight:700;
      }

      /* Idle pulse ring */
      #fbc-btn.fbc-idle-pulse {
        animation: fbc-idle-glow 2.5s ease-in-out infinite;
      }
      @keyframes fbc-idle-glow {
        0%,100% { box-shadow: 0 4px 18px rgba(24,119,242,.2), 0 0 0 0 rgba(24,119,242,.3); }
        50%      { box-shadow: 0 4px 24px rgba(24,119,242,.4), 0 0 0 10px rgba(24,119,242,.0); }
      }

      /* Loading state */
      #fbc-btn.fbc-loading {
        background:rgba(24,119,242,0.15);
        border-color:rgba(24,119,242,0.4);
        color:#1877f2;
        animation: none;
      }

      /* Success state */
      #fbc-btn.fbc-success {
        background:rgba(26,158,92,0.15);
        border-color:rgba(26,158,92,0.5);
        color:#1a9e5c;
        animation: fbc-success-burst .5s cubic-bezier(.34,1.56,.64,1);
        width:56px; padding:0; border-radius:50%; gap:0;
      }
      #fbc-btn.fbc-success .fbc-label { max-width:0; opacity:0; }
      @keyframes fbc-success-burst {
        0%   { transform:scale(1); box-shadow:0 0 0 0 rgba(26,158,92,.6); }
        40%  { transform:scale(1.3); box-shadow:0 0 0 12px rgba(26,158,92,.2); }
        70%  { transform:scale(0.9); box-shadow:0 0 0 18px rgba(26,158,92,.0); }
        100% { transform:scale(1); }
      }
      /* Checkmark draw animation */
      #fbc-btn.fbc-success .fbc-check {
        stroke-dasharray: 30;
        stroke-dashoffset: 30;
        animation: fbc-draw-check .4s ease .15s forwards;
      }
      @keyframes fbc-draw-check {
        to { stroke-dashoffset: 0; }
      }
      /* Success ripple */
      #fbc-btn.fbc-success::after {
        content:'';
        position:absolute;inset:0;border-radius:50%;
        background:rgba(26,158,92,0.3);
        animation: fbc-ripple .6s ease-out;
      }
      @keyframes fbc-ripple {
        0%   { transform:scale(0.5); opacity:1; }
        100% { transform:scale(2.2); opacity:0; }
      }

      /* Spin */
      @keyframes fbc-spin { to { transform:rotate(360deg); } }
      .fbc-spinning { display:inline-block; animation:fbc-spin .7s linear infinite; }
    `;
    document.head.appendChild(s);
  }

  /* ============================================================
     Button
  ============================================================ */
  const COPY_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2.2">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`;

  const IDLE_HTML = `${COPY_ICON}<span class="fbc-label">Copy Post</span>`;

  function injectButton() {
    if (document.getElementById('fbc-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'fbc-btn';
    btn.innerHTML = IDLE_HTML;
    document.body.appendChild(btn);

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.classList.remove('fbc-idle-pulse', 'fbc-success');
      btn.classList.add('fbc-loading');
      btn.innerHTML = `<span class="fbc-spinning" style="font-size:22px;line-height:1">↻</span>`;
      try {
        await expandSeeMore();
        const rawText = getPostText();
        const text = cleanText(rawText);
        if (!text) {
          toast('❌ Post text හොයාගත නොහැකිය', true);
          btn.classList.remove('fbc-loading');
          btn.innerHTML = IDLE_HTML;
          btn.disabled = false;
          btn.classList.add('fbc-idle-pulse');
        } else {
          const ok = await copyText(text);
          if (ok) {
            btn.classList.remove('fbc-loading');
            btn.classList.add('fbc-success');
            btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline class="fbc-check" points="20 6 9 17 4 12"/>
            </svg>`;
            toast(`✅ Copied! ${text.length} characters`);
            // Auto reset after 2.5s — no hover needed
            setTimeout(() => {
              btn.classList.remove('fbc-success');
              btn.innerHTML = IDLE_HTML;
              btn.disabled = false;
              btn.classList.add('fbc-idle-pulse');
            }, 2500);
            return;
          } else {
            toast('❌ Clipboard access නැත', true);
            btn.classList.remove('fbc-loading');
            btn.innerHTML = IDLE_HTML;
            btn.disabled = false;
            btn.classList.add('fbc-idle-pulse');
          }
        }
      } catch (e) {
        toast('❌ ' + e.message, true);
        btn.classList.remove('fbc-loading');
        btn.innerHTML = IDLE_HTML;
        btn.disabled = false;
        btn.classList.add('fbc-idle-pulse');
      }
    });

    // Pulse on load
    setTimeout(() => btn.classList.add('fbc-idle-pulse'), 800);
  }

  /* ============================================================
     Init + SPA navigation
  ============================================================ */
  function init() { injectStyles(); injectButton(); }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init) : init();

  let prev = location.href;
  new MutationObserver(() => {
    if (location.href !== prev) { prev = location.href; setTimeout(init, 1800); }
  }).observe(document, { subtree: true, childList: true });

})();
