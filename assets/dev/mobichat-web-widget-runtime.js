(function (window, document) {
  if (!window || !document) return;

  const existing = window.Mobichat;
  const queue = (existing && existing.q) || [];
  const boot = (existing && existing._boot) || {};

  /* Mobitech DS Foundation — resolved semantic values for shadow DOM embeds */
  const DS = {
    fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
    textStrong: "#151c24",
    textDefault: "#1f2937",
    textWeak: "#4b5563",
    textDisable: "#9ca3af",
    textOnBrand: "#ffffff",
    textBrand: "#1e64dc",
    textError: "#b91c1c",
    textSuccess: "#15803d",
    textWarning: "#b45309",
    bgBase: "#ffffff",
    bgWeak: "#f3f4f6",
    bgDisabled: "#f5f5f5",
    bgSuccessSoft: "#f0fdf4",
    bgSuccessIcon: "#dcfce7",
    bgWarningSoft: "#fffbeb",
    bgBrandSoft: "#eff8ff",
    borderDefault: "#d1d5db",
    borderWeak: "#d1d5db",
    borderWarningWeak: "#fde68a",
    iconWeak: "#6b7280",
    online: "#22c55e",
    offline: "#9ca3af",
    success: "#16a34a",
    danger: "#dc2626",
    warningAccent: "#f59e0b",
    brand: "#1e64dc",
    brandHover: "#1e4faf",
    radiusXxs: "4px",
    radiusXs: "6px",
    radiusS: "8px",
    radiusM: "10px",
    radiusL: "12px",
    radiusXl: "16px",
    radiusXxl: "20px",
    radiusMax: "999px",
    space2: "2px",
    space4: "4px",
    space6: "6px",
    space8: "8px",
    space10: "10px",
    space12: "12px",
    space16: "16px",
    space20: "20px",
    space24: "24px",
    shadowSm: "0 1px 3px 0 rgb(23 23 23 / 0.08)",
    shadowMd: "0 4px 6px -1px rgb(23 23 23 / 0.08)",
    shadowLg: "0 10px 15px -3px rgb(23 23 23 / 0.1)",
    shadowXlg: "0 20px 20px -5px rgb(23 23 23 / 0.15)",
    focusBrand: "0 0 0 2px #ffffff, 0 0 0 4px #1e64dc",
  };

  const SURVEY_FOLLOWUP_ANSWER_TYPES = Object.freeze({
    TEXT: "TEXT",
    DROPDOWN: "DROPDOWN",
  });

  const THEME = {
    primary: boot.primaryColor || DS.brand,
    primaryHover: DS.brandHover,
  };

  let apiBase = "";
  let siteId = null;
  let config = null;
  let visitorId = null;
  let hostIdentity = null;
  let identityVerifiedUserId = null;
  let open = false;
  let sending = false;
  let pollTimer = null;
  let unreadCount = 0;
  // Persisted per visitor (see loadReadState()) so the unread badge survives page navigation.
  let lastSeenMessageId = null;
  let hasKnownConversation = false;
  let lastMessageId = null;
  let conversationId = null;
  let screeningCompleted = false;
  let screeningValues = {};
  // host user_id the stored screening answers belong to (null when answered anonymously)
  let screeningOwner = null;
  let chatEnded = false;
  let endingChat = false;
  let pendingNewChat = false;
  let activeSurveyId = null;
  let surveyData = null;
  let selectedRating = 0;
  let surveySubmitting = false;
  let surveyLoadedForId = null;
  let queued = false;
  let queuePosition = null;
  let queueMessageText = "";
  let queuePollTimer = null;
  let admittedForThisOpen = false;
  let selectedReply = null;
  let messageSearchQuery = "";
  let messageSearchTimer = null;
  // Settles once init() has loaded config and finished its identify (see waitForIdentity()).
  let bootReady = null;
  // Identify requests still in flight (from init, the loader's queued identify, or the host page).
  const pendingIdentifies = new Set();

  function ensureInterFont() {
    if (document.getElementById("mobichat-inter-font")) return;
    const link = document.createElement("link");
    link.id = "mobichat-inter-font";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }

  function shadeColor(hex, amount) {
    const raw = String(hex || THEME.primary).replace("#", "");
    if (raw.length !== 6) return THEME.primary;
    const num = parseInt(raw, 16);
    let r = (num >> 16) + amount;
    let g = ((num >> 8) & 0xff) + amount;
    let b = (num & 0xff) + amount;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  if (String(THEME.primary).toLowerCase() !== DS.brand.toLowerCase()) {
    THEME.primaryHover = shadeColor(THEME.primary, -18);
  }

  function applyTheme(primary) {
    THEME.primary = primary || THEME.primary;
    const normalized = String(THEME.primary).toLowerCase();
    THEME.primaryHover = normalized === DS.brand.toLowerCase() ? DS.brandHover : shadeColor(THEME.primary, -18);
    styleEl.textContent = buildCss();
    launcher.style.background = THEME.primary;
  }

  function buildCss() {
    return `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .root {
      font-family: ${DS.fontFamily};
      color: ${DS.textDefault};
      -webkit-font-smoothing: antialiased;
      --mc-primary: ${THEME.primary};
      --mc-primary-hover: ${THEME.primaryHover};
    }
    .launcher {
      width: 56px;
      height: 56px;
      border: none;
      border-radius: ${DS.radiusMax};
      background: var(--mc-primary);
      color: ${DS.textOnBrand};
      cursor: pointer;
      box-shadow: ${DS.shadowLg};
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      transition: background .15s ease, box-shadow .15s ease;
    }
    .launcher:hover { background: var(--mc-primary-hover); box-shadow: ${DS.shadowXlg}; }
    .launcher:focus-visible { outline: none; box-shadow: ${DS.focusBrand}; }
    .launcher:active { box-shadow: ${DS.shadowMd}; }
    .presence {
      position: absolute;
      right: ${DS.space2};
      bottom: ${DS.space2};
      width: 12px;
      height: 12px;
      border-radius: ${DS.radiusMax};
      border: 2px solid ${DS.bgBase};
      background: ${DS.online};
    }
    .presence.offline { background: ${DS.offline}; }
    .unread-indicator {
      position: absolute;
      top: -4px;
      right: -4px;
      min-width: 20px;
      height: 20px;
      padding: 0 5px;
      border: 2px solid ${DS.bgBase};
      border-radius: ${DS.radiusMax};
      background: #dc2626;
      color: ${DS.textOnBrand};
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
    }
    .unread-indicator.show { display: flex; }
    .panel {
      position: absolute;
      bottom: 72px;
      width: min(380px, calc(100vw - 24px));
      height: min(560px, calc(100vh - 100px));
      background: ${DS.bgBase};
      border: 1px solid ${DS.borderDefault};
      border-radius: ${DS.radiusXxl};
      box-shadow: ${DS.shadowXlg};
      display: flex;
      flex-direction: column;
      overflow: hidden;
      opacity: 0;
      transform: translateY(8px);
      pointer-events: none;
      transition: opacity .18s ease, transform .18s ease;
    }
    .panel.open {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    .panel.pos-right { right: 0; }
    .panel.pos-left { left: 0; }
    .header {
      background: var(--mc-primary);
      color: ${DS.textOnBrand};
      padding: ${DS.space16};
      display: flex;
      align-items: center;
      gap: ${DS.space12};
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: ${DS.radiusL};
      background: rgba(255,255,255,0.16);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .header-copy { min-width: 0; flex: 1; }
    .header .title {
      font-weight: 600;
      font-size: 16px;
      line-height: 24px;
      letter-spacing: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .header .status {
      display: flex;
      align-items: center;
      gap: ${DS.space6};
      margin-top: ${DS.space2};
      font-size: 12px;
      line-height: 16px;
      font-weight: 500;
      opacity: 0.92;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: ${DS.radiusMax};
      background: ${DS.online};
    }
    .dot.offline { background: ${DS.offline}; }
    .header-close {
      border: none;
      background: rgba(255,255,255,0.12);
      color: ${DS.textOnBrand};
      width: 32px;
      height: 32px;
      border-radius: ${DS.radiusS};
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background .15s ease;
    }
    .header-close:hover { background: rgba(255,255,255,0.2); }
    .header-close:focus-visible { outline: none; box-shadow: ${DS.focusBrand}; }
    .header-search {
      border: none;
      background: rgba(255,255,255,0.12);
      color: ${DS.textOnBrand};
      width: 32px;
      height: 32px;
      border-radius: ${DS.radiusS};
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .header-search:hover { background: rgba(255,255,255,0.2); }
    .header-search:focus-visible { outline: none; box-shadow: ${DS.focusBrand}; }
    .header-actions { display: flex; align-items: center; gap: ${DS.space6}; }
    .message-search {
      display: none;
      gap: ${DS.space8};
      align-items: center;
      padding: ${DS.space8} ${DS.space12};
      border-bottom: 1px solid ${DS.borderDefault};
      background: ${DS.bgBase};
    }
    .message-search.show { display: flex; }
    .message-search input {
      flex: 1;
      min-width: 0;
      border: 1px solid ${DS.borderDefault};
      border-radius: ${DS.radiusS};
      padding: ${DS.space8} ${DS.space10};
      font: inherit;
      font-size: 13px;
      color: ${DS.textDefault};
    }
    .message-search input:focus { outline: none; border-color: var(--mc-primary); box-shadow: ${DS.focusBrand}; }
    .message-search button, .reply-cancel, .reply-action {
      border: none;
      background: transparent;
      color: ${DS.textWeak};
      cursor: pointer;
      font: inherit;
    }
    .message-search button:hover, .reply-cancel:hover, .reply-action:hover { color: ${DS.textDefault}; }
    .bubble-wrap.search-hidden { display: none; }
    .search-empty { display: none; text-align: center; color: ${DS.textWeak}; font-size: 13px; padding: ${DS.space12}; }
    .search-empty.show { display: block; }
    .bubble-meta {
      font-size: 12px;
      line-height: 16px;
      color: ${DS.textWeak};
      padding: 0 ${DS.space4};
    }
    .bubble-meta-sender { font-weight: 600; }
    .bubble-wrap.user .bubble-meta { text-align: right; }
    .bubble-media { display: flex; flex-direction: column; gap: ${DS.space6}; margin-top: ${DS.space2}; max-width: 100%; }
    .bubble-media img {
      display: block;
      max-width: 220px;
      width: 100%;
      border-radius: ${DS.radiusL};
      border: 1px solid ${DS.borderDefault};
      background: ${DS.bgBase};
      cursor: pointer;
    }
    .bubble-file {
      display: inline-flex;
      align-items: center;
      gap: ${DS.space8};
      padding: ${DS.space8} ${DS.space10};
      border-radius: ${DS.radiusL};
      border: 1px solid ${DS.borderDefault};
      background: ${DS.bgBase};
      color: var(--mc-primary);
      text-decoration: none;
      font-size: 12px;
      line-height: 16px;
      font-weight: 600;
      max-width: 100%;
    }
    .bubble-file span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ended-banner {
      display: none;
      flex-direction: column;
      gap: ${DS.space10};
      align-items: center;
      padding: ${DS.space16} ${DS.space12};
      border-top: 1px solid ${DS.borderDefault};
      background: ${DS.bgBase};
      text-align: center;
    }
    .ended-banner.show { display: flex; }
    .ended-banner p {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: ${DS.textWeak};
    }
    .ended-banner button {
      border: none;
      background: var(--mc-primary);
      color: ${DS.textOnBrand};
      border-radius: ${DS.radiusS};
      padding: ${DS.space10} ${DS.space16};
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    }
    .ended-banner button:hover { background: var(--mc-primary-hover); }
    .ended-banner button:focus-visible { outline: none; box-shadow: ${DS.focusBrand}; }
    .csat-panel {
      display: none;
      flex-direction: column;
      gap: ${DS.space10};
      padding: ${DS.space16} ${DS.space12};
      border-top: 1px solid ${DS.borderDefault};
      background: ${DS.bgBase};
    }
    .csat-panel.show { display: flex; }
    .csat-panel.hidden { display: none !important; }
    .csat-title {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      color: ${DS.textDefault};
    }
    .csat-question {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: ${DS.textWeak};
    }
    .csat-scale {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: ${DS.space4};
      padding: ${DS.space4} 0;
    }
    .csat-scale-btn {
      border: none;
      background: transparent;
      cursor: pointer;
      padding: ${DS.space4};
      border-radius: ${DS.radiusS};
      line-height: 1;
      font-size: 24px;
      color: ${DS.borderDefault};
      transition: color .12s ease, opacity .12s ease, background .12s ease;
      font-family: inherit;
    }
    .csat-scale-btn:hover { background: ${DS.bgWeak}; }
    .csat-scale-btn:focus-visible { outline: none; box-shadow: ${DS.focusBrand}; }
    .csat-scale-btn.selected { color: ${DS.warningAccent}; }
    .csat-scale-btn.emoji { font-size: 24px; opacity: 0.4; }
    .csat-scale-btn.emoji.selected { opacity: 1; }
    .csat-labels {
      display: flex;
      justify-content: space-between;
      gap: ${DS.space8};
      font-size: 12px;
      line-height: 16px;
      color: ${DS.textWeak};
    }
    .csat-followup {
      display: none;
      flex-direction: column;
      gap: ${DS.space6};
    }
    .csat-followup.show { display: flex; }
    .csat-followup label {
      font-size: 12px;
      line-height: 16px;
      font-weight: 600;
      color: ${DS.textDefault};
    }
    .csat-followup textarea,
    .csat-followup select {
      width: 100%;
      min-height: 64px;
      border: 1px solid ${DS.borderDefault};
      border-radius: ${DS.radiusS};
      padding: ${DS.space10} ${DS.space12};
      font: inherit;
      font-size: 14px;
      line-height: 20px;
      color: ${DS.textDefault};
      background: ${DS.bgBase};
      outline: none;
    }
    .csat-followup textarea { resize: vertical; }
    .csat-followup select { min-height: 40px; }
    .csat-followup textarea:focus,
    .csat-followup select:focus { border-color: var(--mc-primary); box-shadow: ${DS.focusBrand}; }
    .csat-actions {
      display: flex;
      flex-direction: column;
      gap: ${DS.space8};
    }
    .csat-submit {
      border: none;
      background: var(--mc-primary);
      color: ${DS.textOnBrand};
      border-radius: ${DS.radiusS};
      padding: ${DS.space10} ${DS.space16};
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
    }
    .csat-submit:hover { background: var(--mc-primary-hover); }
    .csat-submit:focus-visible { outline: none; box-shadow: ${DS.focusBrand}; }
    .csat-submit:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .csat-error {
      display: none;
      margin: 0;
      font-size: 12px;
      line-height: 16px;
      color: ${DS.textError};
    }
    .csat-error.show { display: block; }
    .csat-thanks {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: ${DS.space8};
      text-align: center;
      padding: ${DS.space8} 0 ${DS.space2};
    }
    .csat-thanks.show { display: flex; }
    .csat-thanks-icon {
      width: 40px;
      height: 40px;
      border-radius: ${DS.radiusMax};
      background: ${DS.bgSuccessIcon};
      color: ${DS.textSuccess};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 700;
    }
    .csat-thanks p {
      margin: 0;
      font-size: 14px;
      line-height: 20px;
      color: ${DS.textDefault};
    }
    .csat-form.hidden { display: none; }
    .composer.hidden { display: none; }
    .attach-btn {
      border: none;
      background: transparent;
      color: ${DS.iconWeak};
      min-width: 36px;
      min-height: 36px;
      border-radius: ${DS.radiusS};
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-family: inherit;
    }
    .attach-btn:hover { background: ${DS.bgWeak}; color: ${DS.textDefault}; }
    .attach-btn:focus-visible { outline: none; box-shadow: ${DS.focusBrand}; }
    .attach-btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .attach-btn.hidden { display: none; }
    .widget-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: ${DS.space10};
      padding: 0 ${DS.space12} ${DS.space10};
      background: ${DS.bgBase};
      border-top: none;
    }
    .widget-footer.composer-hidden {
      border-top: 1px solid ${DS.borderDefault};
      padding-top: ${DS.space8};
    }
    .end-chat-btn {
      border: none;
      background: transparent;
      color: ${DS.textWeak};
      font-size: 12px;
      line-height: 16px;
      font-weight: 500;
      padding: 0;
      cursor: pointer;
      font-family: inherit;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .end-chat-btn:hover { color: ${DS.textError}; }
    .end-chat-btn:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      text-decoration: none;
    }
    .end-chat-btn.hidden { display: none; }
    .powered-by {
      margin-left: auto;
      font-size: 12px;
      line-height: 16px;
      color: ${DS.textWeak};
      text-decoration: none;
      white-space: nowrap;
    }
    .powered-by:hover { color: ${DS.textDefault}; text-decoration: underline; }
    .powered-by.hidden { display: none; }
    .screening-footer {
      display: flex;
      justify-content: center;
      padding: 0 ${DS.space12} ${DS.space10};
      background: ${DS.bgBase};
    }
    .screening-powered-by {
      font-size: 12px;
      line-height: 16px;
      color: ${DS.textWeak};
      text-decoration: none;
      white-space: nowrap;
    }
    .screening-powered-by:hover { color: ${DS.textDefault}; text-decoration: underline; }
    .screening-powered-by.hidden { display: none; }
    .hours-banner {
      display: none;
      padding: ${DS.space8} ${DS.space12};
      font-size: 12px;
      line-height: 16px;
      background: ${DS.bgWarningSoft};
      color: ${DS.textWarning};
      border-bottom: 1px solid ${DS.borderWarningWeak};
    }
    .hours-banner.show { display: block; }
    .messages, .screening {
      flex: 1;
      overflow-y: auto;
      padding: ${DS.space16};
      background: ${DS.bgWeak};
      display: flex;
      flex-direction: column;
      gap: ${DS.space10};
      scroll-behavior: smooth;
    }
    .message-date-separator {
      align-self: center;
      padding: ${DS.space4} ${DS.space12};
      border-radius: ${DS.radiusL};
      background: ${DS.bgBase};
      color: ${DS.textDefault};
      box-shadow: ${DS.shadowSm};
      font-size: 12px;
      font-weight: 600;
      line-height: 16px;
    }
    .bubble-wrap { position: relative; display: flex; flex-direction: column; gap: ${DS.space6}; max-width: 92%; }
    .bubble-wrap.user { align-self: flex-end; align-items: flex-end; }
    .bubble-wrap.agent, .bubble-wrap.bot { align-self: flex-start; align-items: flex-start; }
    .bubble-wrap.system { align-self: stretch; align-items: center; max-width: 100%; }
    .bubble {
      max-width: 100%;
      min-width: 0;
      padding: ${DS.space10} ${DS.space12};
      border-radius: ${DS.radiusXl};
      font-size: 14px;
      line-height: 20px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .bubble.user {
      background: var(--mc-primary);
      color: ${DS.textOnBrand};
      border-bottom-right-radius: ${DS.radiusXxs};
    }
    .bubble.agent, .bubble.bot {
      background: ${DS.bgBase};
      color: ${DS.textDefault};
      border: 1px solid ${DS.borderDefault};
      border-bottom-left-radius: ${DS.radiusXxs};
      box-shadow: ${DS.shadowSm};
    }
    .bubble.system {
      background: transparent;
      color: ${DS.textWeak};
      font-size: 12px;
      line-height: 16px;
      text-align: center;
      padding: ${DS.space4} ${DS.space8};
      align-self: center;
      max-width: 100%;
    }
    .quoted-message {
      margin-bottom: ${DS.space8};
      border-left: 4px solid ${DS.borderDefault};
      border-radius: ${DS.radiusS};
      background: ${DS.bgWeak};
      padding: ${DS.space6} ${DS.space8};
      font-size: 12px;
      line-height: 16px;
      color: ${DS.textWeak};
      overflow: hidden;
      min-width: 0;
      max-width: 100%;
    }
    .bubble.user .quoted-message {
      border-left-color: rgba(255,255,255,0.55);
      background: rgba(255,255,255,0.2);
      color: rgba(255,255,255,0.82);
    }
    .quoted-message strong { display: block; color: ${DS.textDefault}; margin-bottom: ${DS.space2}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bubble.user .quoted-message strong { color: ${DS.textOnBrand}; }
    .quoted-message span { display: block; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .reply-action, .copy-action {
      position: absolute;
      top: 0;
      border: 1px solid ${DS.borderDefault};
      background: ${DS.bgBase};
      color: ${DS.textDefault};
      width: 32px;
      height: 32px;
      padding: 0;
      border-radius: ${DS.radiusMax};
      box-shadow: ${DS.shadowSm};
      opacity: 0;
      visibility: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1;
      transition: opacity .15s ease .45s, visibility 0s linear .45s;
    }
    .bubble-wrap:hover .reply-action, .bubble-wrap:focus-within .reply-action,
    .bubble-wrap:hover .copy-action, .bubble-wrap:focus-within .copy-action {
      opacity: 1;
      visibility: visible;
      transition-delay: 0s;
    }
    .bubble-wrap.agent .reply-action, .bubble-wrap.bot .reply-action { left: calc(100% + ${DS.space4}); }
    .bubble-wrap.agent .copy-action, .bubble-wrap.bot .copy-action { left: calc(100% + 40px); }
    .bubble-wrap.user .reply-action { right: calc(100% + ${DS.space4}); }
    .bubble-wrap.user .copy-action { right: calc(100% + 40px); }
    .bubble-wrap.actions-overlay { padding-top: 36px; }
    .bubble-wrap.actions-overlay .reply-action, .bubble-wrap.actions-overlay .copy-action { top: 0; }
    .bubble-wrap.actions-overlay .reply-action { left: auto; right: 40px; }
    .bubble-wrap.actions-overlay .copy-action { left: auto; right: 4px; }
    .reply-action:hover, .copy-action:hover { color: var(--mc-primary); }
    .reply-action:focus-visible, .copy-action:focus-visible { outline: none; box-shadow: ${DS.focusBrand}; }
    @media (hover: none) {
      .bubble-wrap .reply-action, .bubble-wrap .copy-action,
      .bubble-wrap:focus-within .reply-action, .bubble-wrap:focus-within .copy-action {
        opacity: 0;
        visibility: hidden;
      }
      .bubble-wrap.mobile-actions-visible .reply-action,
      .bubble-wrap.mobile-actions-visible .copy-action {
        opacity: 1;
        visibility: visible;
        transition-delay: 0s;
      }
      .bubble-wrap .copy-action { top: 0; right: 0; left: auto; }
    }
    .reply-preview {
      display: none;
      align-items: flex-start;
      gap: ${DS.space8};
      padding: ${DS.space8} ${DS.space12};
      border-bottom: 1px solid ${DS.borderDefault};
      background: ${DS.bgWeak};
    }
    .reply-preview.show { display: flex; }
    .reply-preview-copy { flex: 1; min-width: 0; overflow: hidden; }
    .reply-preview-copy strong, .reply-preview-copy span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .reply-preview-copy strong { font-size: 12px; line-height: 16px; color: ${DS.textWeak}; margin-bottom: ${DS.space2}; }
    .reply-preview-copy span { font-size: 14px; line-height: 20px; color: ${DS.textDefault}; }
    .reply-cancel { flex-shrink: 0; padding: ${DS.space2}; font-size: 18px; line-height: 18px; border-radius: ${DS.radiusMax}; }
    .reply-cancel:hover { background: ${DS.borderDefault}; }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: ${DS.space6};
      margin-top: ${DS.space2};
      max-width: 100%;
    }
    .chip, .action-btn {
      border: 1px solid var(--mc-primary);
      background: ${DS.bgBase};
      color: var(--mc-primary);
      border-radius: ${DS.radiusMax};
      padding: ${DS.space6} ${DS.space12};
      font-size: 12px;
      line-height: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: background .15s ease, color .15s ease;
      font-family: inherit;
      max-width: 100%;
      overflow-wrap: anywhere;
    }
    .chip.action-link { display: inline-flex; align-items: center; text-decoration: none; }
    .chip:hover, .action-btn:hover {
      background: var(--mc-primary);
      color: ${DS.textOnBrand};
    }
    .chip:focus-visible, .action-btn:focus-visible { outline: none; box-shadow: ${DS.focusBrand}; }
    .action-btn {
      border-radius: ${DS.radiusS};
      width: 100%;
      text-align: center;
      padding: ${DS.space10} ${DS.space12};
      font-size: 14px;
      line-height: 20px;
    }
    .starter { display: flex; flex-direction: column; gap: ${DS.space8}; margin-top: ${DS.space4}; }
    .starter-label {
      font-size: 12px;
      line-height: 16px;
      font-weight: 600;
      color: ${DS.textWeak};
    }
    .composer, .screening-actions {
      display: flex;
      gap: ${DS.space8};
      padding: ${DS.space12};
      border-top: 1px solid ${DS.borderDefault};
      background: ${DS.bgBase};
      align-items: center;
    }
    .composer input, .field input, .field select {
      flex: 1;
      width: 100%;
      border: 1px solid ${DS.borderDefault};
      border-radius: ${DS.radiusS};
      padding: ${DS.space10} ${DS.space12};
      font-size: 14px;
      line-height: 20px;
      outline: none;
      background: ${DS.bgBase};
      color: ${DS.textDefault};
      font-family: inherit;
    }
    .composer input:focus, .field input:focus, .field select:focus {
      border-color: var(--mc-primary);
      box-shadow: ${DS.focusBrand};
    }
    .composer button, .screening-actions button {
      border: none;
      background: var(--mc-primary);
      color: ${DS.textOnBrand};
      border-radius: ${DS.radiusS};
      min-width: 44px;
      min-height: 40px;
      padding: 0 ${DS.space16};
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: inherit;
    }
    .composer button:hover, .screening-actions button:hover { background: var(--mc-primary-hover); }
    .composer button:focus-visible, .screening-actions button:focus-visible { outline: none; box-shadow: ${DS.focusBrand}; }
    .composer button:disabled, .screening-actions button:disabled, .chip:disabled, .action-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .screening-actions button { width: 100%; }
    .field { display: flex; flex-direction: column; gap: ${DS.space6}; }
    .field label { font-size: 12px; line-height: 16px; font-weight: 600; color: ${DS.textDefault}; }
    .error {
      color: ${DS.textError};
      font-size: 12px;
      line-height: 16px;
      padding: 0 ${DS.space12} ${DS.space8};
      display: none;
    }
    .error.show { display: block; }
    .chat-view, .screening-view, .queue-view { display: none; flex-direction: column; flex: 1; min-height: 0; }
    .chat-view.active, .screening-view.active, .queue-view.active { display: flex; }
    .queue-view {
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: ${DS.space16};
      padding: ${DS.space24};
    }
    .queue-spinner {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 3px solid ${DS.bgWeak};
      border-top-color: var(--mc-primary);
      animation: mc-spin 0.8s linear infinite;
    }
    @keyframes mc-spin { to { transform: rotate(360deg); } }
    .queue-message {
      font-size: 14px;
      line-height: 20px;
      color: ${DS.textDefault};
      max-width: 260px;
    }
    .queue-position {
      font-size: 13px;
      line-height: 18px;
      color: ${DS.textWeak};
    }
    .empty {
      margin: auto;
      text-align: center;
      color: ${DS.textWeak};
      font-size: 14px;
      line-height: 20px;
      padding: ${DS.space24} ${DS.space12};
      max-width: 240px;
    }
    @media (max-width: 480px) {
      .panel {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        height: 100dvh;
        border-radius: 0;
        bottom: 0;
      }
      .launcher { width: 56px; height: 56px; }
      .launcher.hide-on-mobile-open { display: none; }
    }
  `;
  }

  ensureInterFont();

  const host = document.createElement("div");
  host.id = "mobichat-web-widget-root";
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.zIndex = "2147483000";
  host.style.bottom = "20px";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const styleEl = document.createElement("style");
  styleEl.textContent = buildCss();

  const root = document.createElement("div");
  root.className = "root";
  root.innerHTML = `
    <div class="panel pos-right">
      <div class="header">
        <div class="avatar" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H9l-4 4v-4.5A2.5 2.5 0 0 1 4 13.5v-8Z" fill="currentColor"/></svg>
        </div>
        <div class="header-copy">
          <div class="title">Chat</div>
          <div class="status"><span class="dot"></span><span class="status-text">Online</span></div>
        </div>
        <div class="header-actions">
          <button type="button" class="header-search" aria-label="Search messages" aria-expanded="false">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6" stroke="currentColor" stroke-width="2"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
          <button type="button" class="header-close" aria-label="Close chat">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
      <div class="hours-banner"></div>
      <div class="message-search">
        <input type="search" placeholder="Search loaded messages" aria-label="Search messages" />
        <button type="button" aria-label="Close search">×</button>
      </div>
      <div class="screening-view">
        <div class="screening"></div>
        <div class="error screening-error"></div>
        <div class="screening-actions">
          <button type="button" class="screening-submit">Start Chat</button>
        </div>
        <div class="screening-footer">
          <a class="screening-powered-by" href="https://mobichat.id" target="_blank" rel="noopener noreferrer">Powered by Mobichat</a>
        </div>
      </div>
      <div class="queue-view">
        <div class="queue-spinner" aria-hidden="true"></div>
        <p class="queue-message"></p>
        <p class="queue-position"></p>
      </div>
      <div class="chat-view">
        <div class="messages"></div>
        <div class="search-empty">No loaded messages match your search.</div>
        <div class="error chat-error"></div>
        <div class="reply-preview"><div class="reply-preview-copy"></div><button type="button" class="reply-cancel" aria-label="Cancel reply">×</button></div>
        <form class="composer">
          <!-- Keep in sync with FILE_EXTENSION in src/lib/constants.js (server is the source of truth/enforces this) -->
          <input type="file" class="attach-input" hidden />
          <button type="button" class="attach-btn" aria-label="Attach file">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21.44 11.05l-9.19 9.19a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.19 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.49" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <input type="text" name="message" placeholder="Type a message..." autocomplete="off" maxlength="2000" />
          <button type="submit" aria-label="Send">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12h12M12 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </form>
        <div class="csat-panel" aria-live="polite">
          <div class="csat-form">
            <p class="csat-title"></p>
            <p class="csat-question"></p>
            <div class="csat-scale" role="group" aria-label="Rating"></div>
            <div class="csat-labels"><span class="csat-label-low"></span><span class="csat-label-high"></span></div>
            <div class="csat-followup">
              <label class="csat-followup-label"></label>
              <textarea class="csat-followup-input" maxlength="1000" rows="3"></textarea>
              <select class="csat-followup-select" hidden></select>
            </div>
            <p class="csat-error"></p>
            <div class="csat-actions">
              <button type="button" class="csat-submit">Send Rating</button>
            </div>
          </div>
          <div class="csat-thanks">
            <div class="csat-thanks-icon" aria-hidden="true">✓</div>
            <p class="csat-thanks-text"></p>
          </div>
        </div>
        <div class="ended-banner">
          <p>This chat has ended.</p>
          <button type="button" class="restart-chat-btn">Start new chat</button>
        </div>
        <div class="widget-footer">
          <button type="button" class="end-chat-btn">End chat</button>
          <a class="powered-by" href="https://mobichat.id" target="_blank" rel="noopener noreferrer">Powered by Mobichat</a>
        </div>
      </div>
    </div>
  `;

  const chatIcon =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H9l-4 4v-4.5A2.5 2.5 0 0 1 4 13.5v-8Z" fill="currentColor"/></svg>';
  const closeIcon =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  const launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open chat");
  launcher.innerHTML = chatIcon + '<span class="presence"></span><span class="unread-indicator" aria-hidden="true"></span>';

  shadow.appendChild(styleEl);
  shadow.appendChild(root);
  root.appendChild(launcher);

  const panel = root.querySelector(".panel");
  const screeningView = root.querySelector(".screening-view");
  const chatView = root.querySelector(".chat-view");
  const queueView = root.querySelector(".queue-view");
  const queueMessageEl = root.querySelector(".queue-message");
  const queuePositionEl = root.querySelector(".queue-position");
  const screeningEl = root.querySelector(".screening");
  const messagesEl = root.querySelector(".messages");
  const titleEl = root.querySelector(".title");
  const statusTextEl = root.querySelector(".status-text");
  const statusDotEl = root.querySelector(".dot");
  let presenceEl = launcher.querySelector(".presence");
  let unreadIndicatorEl = launcher.querySelector(".unread-indicator");
  const hoursBannerEl = root.querySelector(".hours-banner");
  const screeningErrorEl = root.querySelector(".screening-error");
  const chatErrorEl = root.querySelector(".chat-error");
  const messageSearchEl = root.querySelector(".message-search");
  const messageSearchInputEl = messageSearchEl.querySelector("input");
  const messageSearchCloseBtn = messageSearchEl.querySelector("button");
  const messageSearchBtn = root.querySelector(".header-search");
  const searchEmptyEl = root.querySelector(".search-empty");
  const replyPreviewEl = root.querySelector(".reply-preview");
  const replyPreviewCopyEl = root.querySelector(".reply-preview-copy");
  const replyCancelBtn = root.querySelector(".reply-cancel");
  const formEl = root.querySelector(".composer");
  const inputEl = formEl.querySelector('input[name="message"]');
  const sendBtn = formEl.querySelector('button[type="submit"]');
  const attachBtn = formEl.querySelector(".attach-btn");
  const attachInputEl = formEl.querySelector(".attach-input");
  const screeningSubmitBtn = root.querySelector(".screening-submit");
  const headerCloseBtn = root.querySelector(".header-close");
  const endChatBtn = root.querySelector(".end-chat-btn");
  const endedBannerEl = root.querySelector(".ended-banner");
  const restartChatBtn = root.querySelector(".restart-chat-btn");
  const widgetFooterEl = root.querySelector(".widget-footer");
  const poweredByEl = root.querySelector(".powered-by");
  const csatPanelEl = root.querySelector(".csat-panel");
  const csatFormEl = root.querySelector(".csat-form");
  const csatTitleEl = root.querySelector(".csat-title");
  const csatQuestionEl = root.querySelector(".csat-question");
  const csatScaleEl = root.querySelector(".csat-scale");
  const csatLabelLowEl = root.querySelector(".csat-label-low");
  const csatLabelHighEl = root.querySelector(".csat-label-high");
  const csatFollowupEl = root.querySelector(".csat-followup");
  const csatFollowupLabelEl = root.querySelector(".csat-followup-label");
  const csatFollowupInputEl = root.querySelector(".csat-followup-input");
  const csatFollowupSelectEl = root.querySelector(".csat-followup-select");
  const csatErrorEl = root.querySelector(".csat-error");
  const screeningPoweredByEl = root.querySelector(".screening-powered-by");
  const csatSubmitBtn = root.querySelector(".csat-submit");
  const csatThanksEl = root.querySelector(".csat-thanks");
  const csatThanksTextEl = root.querySelector(".csat-thanks-text");

  const CSAT_EMOJIS = ["😢", "😕", "😐", "🙂", "😄"];
  const CSAT_STAR =
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.47L12 17.77 6.2 20.37l1.11-6.47-4.7-4.58 6.49-.94L12 2.5z"/></svg>';

  function setHostPosition(position) {
    const side = position === "left" ? "left" : "right";
    host.style.left = side === "left" ? "20px" : "";
    host.style.right = side === "right" ? "20px" : "";
    panel.classList.toggle("pos-left", side === "left");
    panel.classList.toggle("pos-right", side === "right");
  }

  setHostPosition(boot.position || "right");

  // Remove boot placeholder once real UI mounts.
  const bootEl = document.getElementById("mobichat-web-widget-boot");
  if (bootEl) bootEl.remove();

  function getScriptEl() {
    return document.querySelector('script[data-mobichat-widget-runtime="true"]');
  }

  function resolveApiBase() {
    if (boot.apiBase) return String(boot.apiBase).replace(/\/$/, "");
    const scriptEl = getScriptEl();
    const fromAttr = scriptEl && scriptEl.getAttribute("data-api-base");
    if (fromAttr) return fromAttr.replace(/\/$/, "");
    const src = scriptEl && scriptEl.src;
    if (src) {
      try {
        return new URL(src).origin;
      } catch (e) {
        /* fall through */
      }
    }
    return window.location.origin;
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "v_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  }

  function storageKey(suffix) {
    return "mobichat_" + suffix + "_" + siteId;
  }

  function getOrCreateVisitorId(id) {
    const key = "mobichat_visitor_" + id;
    try {
      const existingId = window.localStorage.getItem(key);
      if (existingId) return existingId;
      const created = uuid();
      window.localStorage.setItem(key, created);
      return created;
    } catch (e) {
      return uuid();
    }
  }

  function isDebugMode() {
    try {
      return /(?:^|[?&])mobichat_debug=1(?:&|$)/.test(window.location.search || "");
    } catch (e) {
      return false;
    }
  }

  function debugWarn() {
    if (!isDebugMode()) return;
    try {
      console.warn.apply(console, ["[Mobichat]"].concat(Array.prototype.slice.call(arguments)));
    } catch (e) {
      /* ignore */
    }
  }

  function debugError() {
    if (!isDebugMode()) return;
    try {
      console.error.apply(console, ["[Mobichat]"].concat(Array.prototype.slice.call(arguments)));
    } catch (e) {
      /* ignore */
    }
  }

  function identityStorageKey() {
    return storageKey("host_identity");
  }

  function loadCachedIdentity() {
    try {
      const raw = window.sessionStorage.getItem(identityStorageKey());
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function saveCachedIdentity(payload) {
    try {
      if (!payload) {
        window.sessionStorage.removeItem(identityStorageKey());
        return;
      }
      window.sessionStorage.setItem(identityStorageKey(), JSON.stringify(payload));
    } catch (e) {
      /* ignore */
    }
  }

  function sanitizeHostIdentity(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const appId = String(
      input.app_id || input.appId || input.siteId || input.site_id || siteId || ""
    ).trim();
    const userIdRaw = input.user_id != null ? input.user_id : input.userId;
    const userId =
      userIdRaw != null && String(userIdRaw).trim() !== ""
        ? String(userIdRaw).trim().slice(0, 255)
        : null;

    const name =
      input.name != null && String(input.name).trim()
        ? String(input.name).trim().slice(0, 255)
        : null;
    const email =
      input.email != null && String(input.email).trim()
        ? String(input.email).trim().slice(0, 255)
        : null;
    const avatarUrl =
      input.avatar_url != null || input.avatarUrl != null
        ? String(input.avatar_url || input.avatarUrl).trim().slice(0, 2048) || null
        : null;
    const identityHash =
      input.identity_hash != null || input.identityHash != null
        ? String(input.identity_hash || input.identityHash).trim().toLowerCase() || null
        : null;
    const signedAt =
      input.signed_at != null || input.signedAt != null
        ? String(input.signed_at || input.signedAt).trim() || null
        : null;
    const fcmToken =
      input.fcm_token != null || input.fcmToken != null
        ? String(input.fcm_token || input.fcmToken).trim().slice(0, 4096) || null
        : null;
    // Host-defined identifier for where this user comes from (e.g. their app or account id).
    const sourceId =
      input.source_id != null || input.sourceId != null
        ? String(input.source_id != null ? input.source_id : input.sourceId).trim().slice(0, 255) || null
        : null;

    const metadata = {};
    if (input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)) {
      const entries = Object.entries(input.metadata);
      if (entries.length > 10) {
        debugWarn("metadata limited to 10 keys; excess keys dropped");
      }
      entries.slice(0, 10).forEach(function (pair) {
        const k = String(pair[0] || "").trim().slice(0, 64);
        if (!k) return;
        metadata[k] = String(pair[1] == null ? "" : pair[1]).slice(0, 255);
      });
    }

    return {
      app_id: appId || null,
      user_id: userId,
      name: name,
      email: email,
      avatar_url: avatarUrl,
      identity_hash: identityHash,
      signed_at: signedAt,
      metadata: metadata,
      fcm_token: fcmToken,
      source_id: sourceId,
    };
  }

  function getIdentityPayloadForApi() {
    if (!hostIdentity || !hostIdentity.user_id) return undefined;
    return {
      user_id: hostIdentity.user_id,
      name: hostIdentity.name || undefined,
      email: hostIdentity.email || undefined,
      avatar_url: hostIdentity.avatar_url || undefined,
      identity_hash: hostIdentity.identity_hash || undefined,
      signed_at: hostIdentity.signed_at || undefined,
      metadata: hostIdentity.metadata || undefined,
      fcm_token: hostIdentity.fcm_token || undefined,
      source_id: hostIdentity.source_id || undefined,
    };
  }

  function syncIdentify(raw) {
    const verifiedUserIdBefore = identityVerifiedUserId;
    const request = identifyNow(raw);
    pendingIdentifies.add(request);
    return request.then(function (data) {
      pendingIdentifies.delete(request);
      // The host identified after this open already loaded history (e.g. it called
      // Mobichat("identify") after Mobichat("open")): reload so the linked user's history shows.
      if (
        identityVerifiedUserId &&
        identityVerifiedUserId !== verifiedUserIdBefore &&
        open &&
        admittedForThisOpen &&
        !queued
      ) {
        loadMessages({ incremental: false }).catch(function () { });
      }
      return data;
    });
  }

  // A verified identify is what links this visitorId to the host user's existing conversation
  // server-side. Until it settles, /messages only knows the anonymous visitor (usually no history).
  async function waitForIdentity() {
    if (bootReady) await bootReady.catch(function () { });
    while (pendingIdentifies.size) {
      await Promise.all(Array.from(pendingIdentifies));
    }
  }

  // Never rejects: failures fall back to an anonymous session.
  async function identifyNow(raw) {
    try {
      const sanitized = sanitizeHostIdentity(raw);
      if (!sanitized.user_id) {
        hostIdentity = null;
        identityVerifiedUserId = null;
        saveCachedIdentity(null);
        return { anonymous: true };
      }

      // After verified once this session, allow profile updates without re-signing.
      if (
        identityVerifiedUserId &&
        String(identityVerifiedUserId) === String(sanitized.user_id) &&
        !sanitized.identity_hash
      ) {
        hostIdentity = Object.assign({}, hostIdentity || {}, sanitized, {
          identity_hash: (hostIdentity && hostIdentity.identity_hash) || null,
        });
        saveCachedIdentity({
          identity: hostIdentity,
          verifiedUserId: identityVerifiedUserId,
        });
      } else {
        hostIdentity = sanitized;
        saveCachedIdentity({
          identity: hostIdentity,
          verifiedUserId: identityVerifiedUserId,
        });
      }

      if (!siteId || !visitorId || !apiBase) {
        return { queued: true };
      }

      const data = await apiFetch("/api/public/web-widget/identify?siteId=" + encodeURIComponent(siteId), {
        method: "POST",
        body: JSON.stringify({
          siteId: siteId,
          visitorId: visitorId,
          identity: getIdentityPayloadForApi(),
        }),
      });

      if (data && data.verified && data.user_id) {
        identityVerifiedUserId = String(data.user_id);
        saveCachedIdentity({
          identity: hostIdentity,
          verifiedUserId: identityVerifiedUserId,
        });
      } else if (data && (data.anonymous || data.blocked)) {
        if (data.reason === "hash_mismatch") {
          debugError("identity_hash verification failed; falling back to anonymous session");
        } else if (data.reason === "require_verified") {
          debugError("verified identity required; identify ignored (anonymous session)");
        }
        // Drop client identity when server rejected it (bad hash or require-verified).
        if (data.anonymous && !data.user_id && (hostIdentity?.identity_hash || data.blocked)) {
          hostIdentity = null;
          identityVerifiedUserId = null;
          saveCachedIdentity(null);
        }
      }

      return data || { anonymous: true };
    } catch (error) {
      debugWarn("identify failed; continuing as anonymous", error && error.message);
      return { anonymous: true, reason: "network_error" };
    }
  }

  function resetIdentity() {
    hostIdentity = null;
    identityVerifiedUserId = null;
    saveCachedIdentity(null);
    try {
      window.localStorage.removeItem("mobichat_visitor_" + siteId);
    } catch (e) {
      /* ignore */
    }
    visitorId = siteId ? getOrCreateVisitorId(siteId) : null;
    conversationId = null;
    lastMessageId = null;
    loadReadState();
    clearUnreadMessages();
    pendingNewChat = false;
    chatEnded = false;
    screeningCompleted = false;
    screeningValues = {};
    screeningOwner = null;
    try {
      window.localStorage.removeItem(storageKey("screening"));
    } catch (e) {
      /* ignore */
    }
    if (messagesEl) {
      messagesEl.innerHTML = "";
      ensureEmptyState();
    }
  }

  function loadScreeningState() {
    try {
      const raw = window.localStorage.getItem(storageKey("screening"));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const owner = (parsed && parsed.owner) || null;
      const currentUserId = hostIdentity && hostIdentity.user_id ? String(hostIdentity.user_id) : null;
      // Answers are stored per site, not per user: never reuse another host user's answers
      // (e.g. a different user logging in on a shared browser without Mobichat("reset")).
      if (owner && currentUserId && String(owner) !== currentUserId) {
        window.localStorage.removeItem(storageKey("screening"));
        screeningCompleted = false;
        screeningValues = {};
        screeningOwner = null;
        return;
      }
      screeningCompleted = Boolean(parsed && parsed.completed);
      screeningValues = (parsed && parsed.values) || {};
      screeningOwner = owner;
    } catch (e) {
      screeningCompleted = false;
      screeningValues = {};
      screeningOwner = null;
    }
  }

  function saveScreeningState() {
    if (!screeningOwner && hostIdentity && hostIdentity.user_id) screeningOwner = String(hostIdentity.user_id);
    try {
      window.localStorage.setItem(
        storageKey("screening"),
        JSON.stringify({ completed: screeningCompleted, values: screeningValues, owner: screeningOwner })
      );
    } catch (e) {
      /* ignore */
    }
  }

  function isHostIdentityVerified(identity) {
    if (!identity) return false;
    if (identity.identity_hash) return true;
    return Boolean(identityVerifiedUserId && String(identityVerifiedUserId) === String(identity.user_id));
  }

  // Fills a missing name/email of an unverified host identity from the visitor's screening answers,
  // so a host that only passes user_id still gets a named contact. Screening answers are typed by
  // the visitor: they never override what the host passed, and never go on a verified identity —
  // identity_hash only signs user_id, and a verified identity may claim contacts.email server-side.
  function withScreeningIdentityFallback(identity) {
    if (!identity || isHostIdentityVerified(identity)) return identity;
    if (screeningOwner && String(screeningOwner) !== String(identity.user_id)) return identity;

    const fields = (config && config.screeningForm && config.screeningForm.fields) || [];
    const next = Object.assign({}, identity);
    fields.forEach(function (field) {
      if (field.type !== "name" && field.type !== "email") return;
      const value = String(screeningValues[field.id] || "").trim();
      if (value && !next[field.type]) next[field.type] = value.slice(0, 255);
    });
    return next;
  }

  function applyAutomaticScreening() {
    const settings = (boot && boot.settings) || window.mobichatSettings || {};
    const automaticScreening = settings.screening || {};
    const metadataValues =
      settings.metadata && typeof settings.metadata === "object" && !Array.isArray(settings.metadata)
        ? settings.metadata
        : {};
    const hasMetadataValues = Object.keys(metadataValues).length > 0;
    if ((!automaticScreening.autoSubmit && !hasMetadataValues) || screeningCompleted) return;

    // Metadata enables automatic screening by itself. Explicit screening values take precedence
    // when both sources provide a value for the same configured field.
    const suppliedValues = Object.assign({}, metadataValues, automaticScreening.values || {});
    const normalizedSuppliedValues = {};
    Object.keys(suppliedValues).forEach(function (key) {
      normalizedSuppliedValues[String(key).trim().toLowerCase()] = suppliedValues[key];
    });

    const fields = (config && config.screeningForm && config.screeningForm.fields) || [];
    fields.forEach(function (field) {
      let value = suppliedValues[field.id];
      if (value == null) value = suppliedValues[field.type];
      if (value == null) value = normalizedSuppliedValues[String(field.id || "").trim().toLowerCase()];
      if (value == null) value = normalizedSuppliedValues[String(field.type || "").trim().toLowerCase()];
      if (value == null) value = normalizedSuppliedValues[String(field.title || "").trim().toLowerCase()];
      if (value == null && field.type === "name") value = hostIdentity && hostIdentity.name;
      if (value == null && field.type === "email") value = hostIdentity && hostIdentity.email;
      if (value != null) screeningValues[field.id] = String(value).trim();
    });

    const error = validateScreening();
    if (error) {
      debugWarn("automatic screening was not completed", error);
      return;
    }

    screeningCompleted = true;
    saveScreeningState();
  }

  function showError(el, message) {
    if (!message) {
      el.textContent = "";
      el.classList.remove("show");
      return;
    }
    el.textContent = message;
    el.classList.add("show");
  }

  function getTrackedWebsite() {
    const capturePageUrl = Boolean(config && config.tracking && config.tracking.capturePageUrl);
    return capturePageUrl ? window.location.href : window.location.origin;
  }

  function getTrackingHints() {
    let timezone = "";
    let locale = "";
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      locale = Intl.DateTimeFormat().resolvedOptions().locale || navigator.language || "";
    } catch (e) {
      locale = navigator.language || "";
    }
    return { timezone: timezone, locale: locale, language: locale };
  }

  function needsScreening() {
    return Boolean(config && config.screeningForm && config.screeningForm.enabled) && !screeningCompleted;
  }

  function isOnline() {
    if (!config || !config.businessHours || !config.businessHours.enabled) return true;
    return Boolean(config.businessHours.isOnline);
  }

  function updatePresence() {
    const online = isOnline();
    presenceEl.classList.toggle("offline", !online);
    statusDotEl.classList.toggle("offline", !online);
    statusTextEl.textContent = online ? "Online" : "Away";
    const offlineMsg =
      (config && config.businessHours && config.businessHours.offlineMessage) ||
      "We're currently offline. Leave a message and we'll reply soon.";
    if (config && config.businessHours && config.businessHours.enabled && !online) {
      hoursBannerEl.textContent = offlineMsg;
      hoursBannerEl.classList.add("show");
    } else {
      hoursBannerEl.textContent = "";
      hoursBannerEl.classList.remove("show");
    }
  }

  function setMode() {
    if (queued) {
      queueView.classList.add("active");
      screeningView.classList.remove("active");
      chatView.classList.remove("active");
      updatePresence();
      return;
    }
    queueView.classList.remove("active");
    const showScreening = needsScreening();
    screeningView.classList.toggle("active", showScreening);
    chatView.classList.toggle("active", !showScreening);
    updatePresence();
  }

  function renderScreeningForm() {
    screeningEl.innerHTML = "";
    const fields = (config && config.screeningForm && config.screeningForm.fields) || [];
    fields.forEach(function (field) {
      const wrap = document.createElement("div");
      wrap.className = "field";
      const label = document.createElement("label");
      label.textContent = field.required ? field.title + " *" : field.title;
      wrap.appendChild(label);

      const input = document.createElement("input");
      input.type = field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "phone" ? "tel" : "text";
      if (field.type === "phone") {
        input.inputMode = "tel";
        input.autocomplete = "tel";
      }
      input.placeholder = field.placeholder || field.title || "";
      input.name = field.id;
      input.required = Boolean(field.required);
      input.value = screeningValues[field.id] || "";
      input.addEventListener("input", function () {
        screeningValues[field.id] = input.value;
      });
      wrap.appendChild(input);
      screeningEl.appendChild(wrap);
    });
  }

  function removeStarter() {
    const starter = messagesEl.querySelector("[data-starter='true']");
    if (starter) starter.remove();
  }

  function hasConversationMessages() {
    return Boolean(messagesEl.querySelector("[data-message-id]"));
  }

  function renderStarterActions() {
    if (needsScreening() || chatEnded) return;
    removeStarter();

    // Action buttons only at the start of a chat.
    if (hasConversationMessages()) return;
    const buttons = (config && config.richMessages && config.richMessages.buttons) || [];
    if (!buttons.length) return;

    const wrap = document.createElement("div");
    wrap.className = "starter";
    wrap.setAttribute("data-starter", "true");

    const label = document.createElement("div");
    label.className = "starter-label";
    label.textContent = "Quick actions";
    wrap.appendChild(label);
    buttons.forEach(function (item) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "action-btn";
      btn.textContent = item.label;
      btn.addEventListener("click", function () {
        removeStarter();
        sendMessage(item.label, { type: "button", id: item.id, label: item.label });
      });
      wrap.appendChild(btn);
    });

    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendMessageActions(wrap, actions, messageId) {
    if (!actions || !actions.length) return;
    const row = document.createElement("div");
    row.className = "actions";
    actions.forEach(function (action) {
      if (action.type === "url") {
        let destination;
        try {
          destination = new URL(String(action.url || ""), window.location.href);
        } catch (error) {
          return;
        }
        if (destination.protocol !== "http:" && destination.protocol !== "https:") return;

        const link = document.createElement("a");
        link.className = "chip action-link";
        link.textContent = action.label;
        link.href = destination.toString();
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        row.appendChild(link);
        return;
      }

      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = action.label;
      chip.addEventListener("click", function () {
        Array.prototype.forEach.call(row.querySelectorAll("button"), function (btn) {
          btn.disabled = true;
        });
        sendMessage(action.label, {
          type: "message_action",
          id: action.id,
          label: action.label,
          messageId: messageId,
        });
      });
      row.appendChild(chip);
    });
    wrap.appendChild(row);
  }

  function parseMessageDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatMessageTime(value) {
    const date = parseMessageDate(value);
    if (!date) return "";
    try {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  }

  function getMessageDateKey(value) {
    const date = parseMessageDate(value);
    if (!date) return "";
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-");
  }

  function formatMessageDate(value) {
    const date = parseMessageDate(value);
    if (!date) return "";

    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayDifference = Math.round((todayStart.getTime() - dateStart.getTime()) / 86400000);
    if (dayDifference === 0) return "Today";
    if (dayDifference === 1) return "Yesterday";

    const options = { weekday: "short", day: "numeric", month: "short" };
    if (date.getFullYear() !== today.getFullYear()) options.year = "numeric";
    return date.toLocaleDateString([], options);
  }

  function refreshMessageDateSeparators() {
    messagesEl.querySelectorAll(":scope > .message-date-separator").forEach(function (separator) {
      separator.remove();
    });

    let previousDateKey = "";
    messagesEl.querySelectorAll(":scope > [data-message-id]").forEach(function (wrap) {
      const dateKey = getMessageDateKey(wrap.dataset.messageCreatedAt);
      if (!dateKey || dateKey === previousDateKey) return;
      previousDateKey = dateKey;
      const separator = document.createElement("div");
      separator.className = "message-date-separator";
      separator.dataset.messageDate = dateKey;
      separator.textContent = formatMessageDate(wrap.dataset.messageCreatedAt);
      messagesEl.insertBefore(separator, wrap);
    });
  }

  function isImageAttachment(attachment) {
    const type = String((attachment && attachment.type) || "").toLowerCase();
    if (type.indexOf("image/") === 0) return true;
    const name = String((attachment && attachment.name) || "").toLowerCase();
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name);
  }

  function appendAttachments(wrap, attachments) {
    if (!attachments || !attachments.length) return;
    const media = document.createElement("div");
    media.className = "bubble-media";

    attachments.forEach(function (attachment) {
      if (!attachment || !attachment.url) return;
      if (isImageAttachment(attachment)) {
        const link = document.createElement("a");
        link.href = attachment.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        const img = document.createElement("img");
        img.src = attachment.url;
        img.alt = attachment.name || "Image";
        img.loading = "lazy";
        link.appendChild(img);
        media.appendChild(link);
        return;
      }

      const fileLink = document.createElement("a");
      fileLink.className = "bubble-file";
      fileLink.href = attachment.url;
      fileLink.target = "_blank";
      fileLink.rel = "noopener noreferrer";
      fileLink.download = attachment.name || "file";
      fileLink.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" stroke-width="1.8"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.8"/></svg>';
      const label = document.createElement("span");
      label.textContent = attachment.name || "Download file";
      fileLink.appendChild(label);
      media.appendChild(fileLink);
    });

    if (media.childNodes.length) wrap.appendChild(media);
  }

  function isSurveyDismissed(surveyId) {
    if (!surveyId) return false;
    try {
      return window.localStorage.getItem(storageKey("csat_dismissed_" + surveyId)) === "1";
    } catch (e) {
      return false;
    }
  }

  function markSurveyDismissed(surveyId) {
    if (!surveyId) return;
    try {
      window.localStorage.setItem(storageKey("csat_dismissed_" + surveyId), "1");
    } catch (e) {
      /* ignore */
    }
  }

  function hideCsatPanel() {
    csatPanelEl.classList.remove("show");
    csatFormEl.classList.remove("hidden");
    csatThanksEl.classList.remove("show");
    csatErrorEl.classList.remove("show");
    csatErrorEl.textContent = "";
    csatFollowupEl.classList.remove("show");
    csatFollowupInputEl.value = "";
    csatFollowupSelectEl.value = "";
    selectedRating = 0;
    surveyData = null;
    activeSurveyId = null;
    surveyLoadedForId = null;
    surveySubmitting = false;
  }

  function getSurveyQuestion() {
    if (!surveyData || !Array.isArray(surveyData.survey_master_questions)) return null;
    return surveyData.survey_master_questions[0] || null;
  }

  function getSurveyOptions(question) {
    const options = (question && question.rating_config && question.rating_config.options) || [];
    if (Array.isArray(options) && options.length) {
      return options
        .slice()
        .sort(function (a, b) {
          return (a.rating || 0) - (b.rating || 0);
        })
        .map(function (opt, index) {
          return {
            rating: opt.rating || index + 1,
            text: opt.text || "",
          };
        });
    }
    return [1, 2, 3, 4, 5].map(function (rating) {
      return { rating: rating, text: "" };
    });
  }

  function getSurveyScaleType(question) {
    const raw = String((question && question.rating_config && question.rating_config.scale_type) || "star").toUpperCase();
    if (raw === "EMOTIONS" || raw === "EMOJI") return "emoji";
    return "star";
  }

  function getActiveFollowUp(question, rating) {
    if (!question || !rating) return null;
    const followups = Array.isArray(question.followup_questions) ? question.followup_questions : [];
    const perScore = followups.find(function (f) {
      return Number(f.rating_value) === Number(rating);
    });
    if (perScore) return perScore;
    const forAll = followups.find(function (f) {
      return Number(f.rating_value) === 0 || f.rating_value == null;
    });
    return forAll || null;
  }

  function updateCsatFollowUp() {
    const question = getSurveyQuestion();
    const followUp = getActiveFollowUp(question, selectedRating);
    if (!followUp || !followUp.question_text) {
      csatFollowupEl.classList.remove("show");
      csatFollowupInputEl.value = "";
      csatFollowupSelectEl.value = "";
      return;
    }
    csatFollowupLabelEl.textContent = followUp.required
      ? followUp.question_text + " *"
      : followUp.question_text;
    const isDropdown = followUp.answer_type === SURVEY_FOLLOWUP_ANSWER_TYPES.DROPDOWN;
    csatFollowupInputEl.hidden = isDropdown;
    csatFollowupSelectEl.hidden = !isDropdown;
    if (isDropdown) {
      csatFollowupSelectEl.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select an answer";
      csatFollowupSelectEl.appendChild(placeholder);
      (Array.isArray(followUp.answer_options) ? followUp.answer_options : []).forEach(function (answerOption) {
        const option = document.createElement("option");
        option.value = answerOption;
        option.textContent = answerOption;
        csatFollowupSelectEl.appendChild(option);
      });
    }
    csatFollowupEl.classList.add("show");
  }

  function renderCsatScale() {
    const question = getSurveyQuestion();
    const options = getSurveyOptions(question);
    const scaleType = getSurveyScaleType(question);
    csatScaleEl.innerHTML = "";
    csatLabelLowEl.textContent = (options[0] && options[0].text) || "";
    csatLabelHighEl.textContent = (options[options.length - 1] && options[options.length - 1].text) || "";

    options.forEach(function (option) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "csat-scale-btn" + (scaleType === "emoji" ? " emoji" : "");
      btn.setAttribute("aria-label", "Rate " + option.rating);
      if (scaleType === "emoji") {
        btn.textContent = CSAT_EMOJIS[option.rating - 1] || "😐";
      } else {
        btn.innerHTML = CSAT_STAR;
      }
      if (scaleType === "emoji") {
        if (selectedRating === option.rating) btn.classList.add("selected");
      } else if (selectedRating && option.rating <= selectedRating) {
        btn.classList.add("selected");
      }
      btn.addEventListener("click", function () {
        const previousFollowUp = getActiveFollowUp(question, selectedRating);
        const nextFollowUp = getActiveFollowUp(question, option.rating);
        if (
          previousFollowUp && nextFollowUp && previousFollowUp.id !== nextFollowUp.id &&
          (previousFollowUp.answer_type === SURVEY_FOLLOWUP_ANSWER_TYPES.DROPDOWN || nextFollowUp.answer_type === SURVEY_FOLLOWUP_ANSWER_TYPES.DROPDOWN)
        ) {
          csatFollowupInputEl.value = "";
          csatFollowupSelectEl.value = "";
        }
        selectedRating = option.rating;
        renderCsatScale();
        updateCsatFollowUp();
        csatErrorEl.classList.remove("show");
        csatErrorEl.textContent = "";
      });
      csatScaleEl.appendChild(btn);
    });
  }

  function showCsatThanks() {
    csatFormEl.classList.add("hidden");
    csatThanksTextEl.textContent =
      (surveyData && surveyData.thank_you_message) || "Thank you for your feedback!";
    csatThanksEl.classList.add("show");
    csatPanelEl.classList.add("show");
  }

  function renderCsatForm() {
    const question = getSurveyQuestion();
    if (!surveyData || !question) {
      hideCsatPanel();
      return;
    }
    csatTitleEl.textContent = surveyData.survey_title || "How was your experience?";
    csatQuestionEl.textContent = question.question_text || "";
    selectedRating = 0;
    csatFollowupInputEl.value = "";
    csatFollowupSelectEl.value = "";
    csatErrorEl.classList.remove("show");
    csatErrorEl.textContent = "";
    csatFormEl.classList.remove("hidden");
    csatThanksEl.classList.remove("show");
    renderCsatScale();
    updateCsatFollowUp();
    csatPanelEl.classList.add("show");
  }

  async function maybeShowSurvey(survey) {
    const surveyId = survey && survey.id ? String(survey.id) : null;
    if (!surveyId || isSurveyDismissed(surveyId)) {
      return;
    }
    if (surveyLoadedForId === surveyId && surveyData) {
      csatPanelEl.classList.add("show");
      return;
    }

    activeSurveyId = surveyId;
    try {
      const params = new URLSearchParams({
        siteId: String(siteId),
        visitorId: String(visitorId),
        surveyId: surveyId,
      });
      const data = await apiFetch("/api/public/web-widget/survey?" + params.toString());
      surveyData = data && data.data ? data.data : null;
      surveyLoadedForId = surveyId;
      if (!surveyData) {
        hideCsatPanel();
        return;
      }
      if (surveyData.survey_status === "SUBMITTED") {
        markSurveyDismissed(surveyId);
        showCsatThanks();
        return;
      }
      renderCsatForm();
    } catch (error) {
      console.warn("[Mobichat] failed to load CSAT survey", error);
      hideCsatPanel();
    }
  }

  async function submitCsatSurvey() {
    if (surveySubmitting || !activeSurveyId || !surveyData) return;
    const question = getSurveyQuestion();
    if (!question) return;

    if (!selectedRating) {
      csatErrorEl.textContent = "Please select a rating";
      csatErrorEl.classList.add("show");
      return;
    }

    const followUp = getActiveFollowUp(question, selectedRating);
    const followUpText = String(
      followUp && followUp.answer_type === SURVEY_FOLLOWUP_ANSWER_TYPES.DROPDOWN
        ? csatFollowupSelectEl.value
        : csatFollowupInputEl.value || ""
    ).trim();
    if (followUp && followUp.required && !followUpText) {
      csatErrorEl.textContent = "Please answer the follow-up question";
      csatErrorEl.classList.add("show");
      return;
    }

    surveySubmitting = true;
    csatSubmitBtn.disabled = true;
    csatErrorEl.classList.remove("show");
    csatErrorEl.textContent = "";

    try {
      await apiFetch("/api/public/web-widget/survey?siteId=" + encodeURIComponent(siteId), {
        method: "POST",
        body: JSON.stringify({
          siteId: siteId,
          visitorId: visitorId,
          surveyId: activeSurveyId,
          answers: [
            {
              question_id: question.id,
              rating_value: selectedRating,
              message_value: followUpText || null,
            },
          ],
        }),
      });
      markSurveyDismissed(activeSurveyId);
      showCsatThanks();
    } catch (error) {
      csatErrorEl.textContent = error.message || "Failed to submit feedback";
      csatErrorEl.classList.add("show");
    } finally {
      surveySubmitting = false;
      csatSubmitBtn.disabled = false;
    }
  }

  function setChatEnded(ended) {
    chatEnded = Boolean(ended);
    formEl.classList.toggle("hidden", chatEnded);
    endedBannerEl.classList.toggle("show", chatEnded);
    widgetFooterEl.classList.toggle("composer-hidden", chatEnded);
    applyEndChatButtonVisibility();
    if (!chatEnded) {
      hideCsatPanel();
    }
    if (chatEnded) {
      stopPolling();
      disconnectMqtt();
      // Chat is over — free the concurrency slot immediately for the next queued visitor
      // rather than waiting for it to expire (best-effort, doesn't block the UI), and stop the
      // heartbeat/queue poll loop so a released slot can't bounce this visitor into a "waiting"
      // view after they've already ended the conversation.
      stopQueuePolling();
      releaseQueueSlot();
    } else if (open && !needsScreening() && !pendingNewChat) {
      // Don't blindly re-arm polling here: if MQTT already has a live/reconnecting client,
      // its own "connect"/give-up handlers own the polling on/off decision — restarting the
      // timer unconditionally on every chat action would leave it running forever once armed,
      // since nothing else stops it again while already connected.
      if (!mqttClient) startPolling();
      connectMqtt().catch(function () { });
    }
  }

  function applyPoweredByVisibility() {
    const show = !config || config.showPoweredBy !== false;
    poweredByEl.classList.toggle("hidden", !show);
    screeningPoweredByEl.classList.toggle("hidden", !show);
  }

  function applyEndChatButtonVisibility() {
    const enabled = !config || config.showEndChatButton !== false;
    endChatBtn.classList.toggle("hidden", !enabled || chatEnded);
    endChatBtn.disabled = chatEnded;
  }

  function applyAttachmentVisibility() {
    const enabled = !config || config.attachmentsEnabled !== false;
    attachBtn.classList.toggle("hidden", !enabled);
    if (!enabled) attachInputEl.value = "";
  }

  function resetChatUi() {
    if (activeSurveyId) {
      markSurveyDismissed(activeSurveyId);
    }
    hideCsatPanel();
    showError(chatErrorEl, "");
    setChatEnded(false);
    appendDivider("New chat started");
    renderGreetingBubble();
    renderStarterActions();
  }

  async function endChat() {
    if (endingChat || chatEnded || needsScreening()) return;
    endingChat = true;
    endChatBtn.disabled = true;
    showError(chatErrorEl, "");

    try {
      const data = await apiFetch("/api/public/web-widget/conversation?siteId=" + encodeURIComponent(siteId), {
        method: "POST",
        body: JSON.stringify({
          siteId: siteId,
          visitorId: visitorId,
          action: "end",
        }),
      });
      setChatEnded(true);
      appendDivider("You ended this chat.");
      if (data && data.survey) {
        await maybeShowSurvey(data.survey);
      }
    } catch (error) {
      showError(chatErrorEl, error.message || "Failed to end chat");
      endChatBtn.disabled = false;
    } finally {
      endingChat = false;
    }
  }

  function restartChat() {
    // Same conversation is reopened server-side on the next message — keep full history
    // visible, just mark where the new chat segment begins and pause polling until then
    // (the conversation is still "resolved" server-side, which would otherwise re-show the
    // ended banner).
    pendingNewChat = true;
    resetChatUi();
    if (open) inputEl.focus();
  }

  function appendDivider(text) {
    const wrap = document.createElement("div");
    wrap.className = "bubble-wrap system";
    const bubble = document.createElement("div");
    bubble.className = "bubble system";
    bubble.textContent = text;
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function truncateMessageText(value) {
    const text = String(value || "Attachment").trim();
    return text.length > 80 ? text.slice(0, 77) + "..." : text;
  }

  function getWidgetMessageText(text, actions) {
    const messageText = String(text || "");
    if (!actions || !actions.length) return messageText;
    return messageText.split(/#{10,}/, 1)[0].trimEnd();
  }

  function updateUnreadIndicator() {
    if (!unreadIndicatorEl) return;
    const hasUnread = unreadCount > 0;
    unreadIndicatorEl.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    unreadIndicatorEl.classList.toggle("show", hasUnread);
    launcher.setAttribute(
      "aria-label",
      open ? "Close chat" : hasUnread ? "Open chat (" + unreadCount + " unread messages)" : "Open chat"
    );
  }

  function clearUnreadMessages() {
    unreadCount = 0;
    updateUnreadIndicator();
    markMessagesSeen();
  }

  // Per-visitor read state in localStorage: whether this visitor has an active conversation
  // (so init() only fetches messages for visitors who actually chatted) and the newest message
  // id they have seen, so a page load can recount unread replies instead of resetting to 0.
  function readStateKey() {
    return storageKey("read_" + visitorId);
  }

  function loadReadState() {
    lastSeenMessageId = null;
    hasKnownConversation = false;
    if (!siteId || !visitorId) return;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(readStateKey()) || "null");
      if (parsed && typeof parsed === "object") {
        hasKnownConversation = Boolean(parsed.hasConversation);
        const seen = Number(parsed.lastSeenMessageId);
        lastSeenMessageId = parsed.lastSeenMessageId != null && Number.isFinite(seen) ? seen : null;
      }
    } catch (e) {
      /* ignore */
    }
  }

  function saveReadState() {
    if (!siteId || !visitorId) return;
    try {
      window.localStorage.setItem(
        readStateKey(),
        JSON.stringify({ hasConversation: hasKnownConversation, lastSeenMessageId: lastSeenMessageId })
      );
    } catch (e) {
      /* ignore */
    }
  }

  function setHasKnownConversation(value) {
    if (hasKnownConversation === value) return;
    hasKnownConversation = value;
    saveReadState();
  }

  function markMessagesSeen() {
    if (lastMessageId == null) return;
    if (lastSeenMessageId != null && lastSeenMessageId >= lastMessageId) return;
    lastSeenMessageId = lastMessageId;
    saveReadState();
  }

  function isUnseenMessage(numericId) {
    return lastSeenMessageId == null || Number.isNaN(numericId) || numericId > lastSeenMessageId;
  }

  // Page load with the widget closed: for a visitor with an active conversation, load it once so
  // conversationId/lastMessageId are known (counting only replies newer than the last seen one),
  // then keep MQTT connected so new agent/bot replies keep updating the unread badge.
  async function restoreUnreadState() {
    if (!hasKnownConversation || open || needsScreening() || pendingNewChat || chatEnded) return;
    await loadMessages({ incremental: false, markUnread: lastSeenMessageId != null });
    // No stored read state yet (e.g. first load after this feature shipped): treat history as seen.
    if (lastSeenMessageId == null) markMessagesSeen();
    if (!open) await connectMqtt();
  }

  function renderLauncher() {
    launcher.innerHTML =
      (open ? closeIcon : chatIcon) +
      '<span class="presence' + (isOnline() ? "" : " offline") + '"></span><span class="unread-indicator" aria-hidden="true"></span>';
    presenceEl = launcher.querySelector(".presence");
    unreadIndicatorEl = launcher.querySelector(".unread-indicator");
    updateUnreadIndicator();
  }

  function applyMessageSearch() {
    const query = messageSearchQuery.toLowerCase();
    let matches = 0;
    messagesEl.querySelectorAll("[data-message-id]").forEach(function (wrap) {
      const match = !query || wrap.textContent.toLowerCase().includes(query);
      wrap.classList.toggle("search-hidden", !match);
      if (match) matches += 1;
    });
    searchEmptyEl.classList.toggle("show", Boolean(query) && matches === 0);
  }

  async function searchConversationMessages(query) {
    const params = new URLSearchParams({ siteId: String(siteId), visitorId: String(visitorId), search: query });
    const data = await apiFetch("/api/public/web-widget/messages?" + params.toString());
    if (query !== messageSearchQuery) return;
    (Array.isArray(data.messages) ? data.messages : []).forEach(function (message) {
      appendMessage(message, { skipScroll: true });
    });
    applyMessageSearch();
  }

  function setSelectedReply(message) {
    selectedReply = message
      ? {
        type: "message",
        id: String(message.id),
        label: truncateMessageText(message.text),
        senderName: String(message.sender_name || (message.type === "user" ? "You" : "Support")),
      }
      : null;
    replyPreviewEl.classList.toggle("show", Boolean(selectedReply));
    if (selectedReply) {
      replyPreviewCopyEl.innerHTML = "";
      const sender = document.createElement("strong");
      sender.textContent = selectedReply.senderName;
      const text = document.createElement("span");
      text.textContent = selectedReply.label;
      replyPreviewCopyEl.append(sender, text);
      inputEl.focus();
    }
  }

  async function copyMessageText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    let copied = false;
    try {
      textarea.select();
      copied = document.execCommand("copy");
    } finally {
      textarea.remove();
    }
    if (!copied) throw new Error("Clipboard copy was rejected");
  }

  function updateMessageActionLayout(wrap) {
    if (!wrap.querySelector(".bubble") || !wrap.classList.contains("has-copy-action")) return;
    const messagesStyle = window.getComputedStyle(messagesEl);
    const availableWidth = messagesEl.clientWidth
      - parseFloat(messagesStyle.paddingLeft)
      - parseFloat(messagesStyle.paddingRight);
    wrap.classList.toggle("actions-overlay", wrap.getBoundingClientRect().width + 76 > availableWidth);
  }

  function enableMobileMessageActions(wrap) {
    const bubble = wrap.querySelector(".bubble");
    if (!bubble || wrap.classList.contains("system")) return;
    bubble.addEventListener("click", function () {
      if (!window.matchMedia("(hover: none)").matches) return;
      const shouldShow = !wrap.classList.contains("mobile-actions-visible");
      messagesEl.querySelectorAll(".bubble-wrap.mobile-actions-visible").forEach(function (item) {
        item.classList.remove("mobile-actions-visible");
      });
      wrap.classList.toggle("mobile-actions-visible", shouldShow);
    });
  }

  // Keeps bubbles in server id order. A full history load can arrive after newer messages are
  // already rendered (e.g. the visitor's just-sent message) and must not land below them.
  function insertMessageWrap(wrap, numericId) {
    if (!Number.isNaN(numericId)) {
      const rendered = messagesEl.querySelectorAll(":scope > [data-message-id]");
      for (let i = 0; i < rendered.length; i++) {
        if (Number(rendered[i].dataset.messageId) > numericId) {
          messagesEl.insertBefore(wrap, rendered[i]);
          return;
        }
      }
    }
    messagesEl.appendChild(wrap);
  }

  function appendMessage(message, options) {
    options = options || {};
    if (!message || !message.id) return;
    const numericId = Number(message.id);
    if (messagesEl.querySelector('[data-message-id="' + message.id + '"]')) return;

    const empty = messagesEl.querySelector(".empty");
    if (empty) empty.remove();

    const type = message.type || "agent";
    if (options.markUnread && !open && type !== "user" && type !== "system" && isUnseenMessage(numericId)) {
      unreadCount += 1;
      updateUnreadIndicator();
    }

    const wrap = document.createElement("div");
    wrap.className = "bubble-wrap " + type;
    wrap.dataset.messageId = String(message.id);
    if (parseMessageDate(message.created_at)) {
      wrap.dataset.messageCreatedAt = String(message.created_at);
    }

    const senderLabel = message.display_sender_name || (type === "bot" ? "AI Assistant" : "");
    const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
    const messageActions = Array.isArray(message.actions) ? message.actions : [];
    const displayText = getWidgetMessageText(message.text, messageActions);
    const hasText = Boolean(displayText.trim());
    const metadataReply = message.metadata && message.metadata.reply;
    const reply =
      metadataReply && metadataReply.reply_type === "message"
        ? {
          senderName: metadataReply.reply_sender_name || "Message",
          label: metadataReply.reply_label || "Attachment",
        }
        : message.reply_to_message
          ? {
            senderName: message.reply_to_message.sender_name || "Message",
            label: message.reply_to_message.text || "Attachment",
          }
          : null;

    if (hasText || !hasAttachments || reply) {
      const bubble = document.createElement("div");
      bubble.className = "bubble " + type;

      if (reply) {
        const quoted = document.createElement("div");
        quoted.className = "quoted-message";
        const sender = document.createElement("strong");
        sender.textContent = reply.senderName;
        const text = document.createElement("span");
        text.textContent = reply.label;
        quoted.append(sender, text);
        bubble.appendChild(quoted);
      }

      if (hasText) {
        const messageText = document.createElement("span");
        messageText.textContent = displayText;
        bubble.appendChild(messageText);

        if (type !== "system") {
          const copyButton = document.createElement("button");
          copyButton.type = "button";
          copyButton.className = "copy-action";
          copyButton.setAttribute("aria-label", "Copy message");
          copyButton.title = "Copy message";
          copyButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="2"/></svg>';
          wrap.classList.add("has-copy-action");
          copyButton.addEventListener("click", async function () {
            try {
              await copyMessageText(displayText);
              copyButton.setAttribute("aria-label", "Message copied");
              copyButton.title = "Message copied";
            } catch (error) {
              copyButton.setAttribute("aria-label", "Could not copy message");
              copyButton.title = "Could not copy message";
            }
            window.setTimeout(function () {
              copyButton.setAttribute("aria-label", "Copy message");
              copyButton.title = "Copy message";
            }, 1500);
          });
          wrap.appendChild(copyButton);
        }
      }
      wrap.appendChild(bubble);
    }

    if (hasAttachments) {
      appendAttachments(wrap, message.attachments);
    }

    const timeLabel = formatMessageTime(message.created_at);
    if (timeLabel && type !== "system") {
      const meta = document.createElement("div");
      meta.className = "bubble-meta";
      meta.append(document.createTextNode(timeLabel));
      if (senderLabel && type !== "user") {
        meta.append(document.createTextNode(" · "));
        const sender = document.createElement("span");
        sender.className = "bubble-meta-sender";
        sender.textContent = senderLabel;
        meta.appendChild(sender);
      }
      wrap.appendChild(meta);
    }

    if (type === "agent" || type === "bot") {
      appendMessageActions(wrap, messageActions, message.id);
    }

    if (type !== "system") {
      const replyButton = document.createElement("button");
      replyButton.type = "button";
      replyButton.className = "reply-action";
      replyButton.setAttribute("aria-label", "Reply to this message");
      replyButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 9 4 14l5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 5v5a4 4 0 0 1-4 4H4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      replyButton.addEventListener("click", function () {
        if (!chatEnded) setSelectedReply(message);
      });
      wrap.appendChild(replyButton);
    }

    insertMessageWrap(wrap, numericId);
    refreshMessageDateSeparators();
    updateMessageActionLayout(wrap);
    enableMobileMessageActions(wrap);
    applyMessageSearch();

    if (!Number.isNaN(numericId)) {
      lastMessageId = lastMessageId == null ? numericId : Math.max(lastMessageId, numericId);
      if (open) markMessagesSeen();
    }

    if (!options.skipScroll) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderGreetingBubble() {
    if (!config || !config.greeting) return;
    if (messagesEl.querySelector(".bubble-wrap.greeting")) return;
    const wrap = document.createElement("div");
    wrap.className = "bubble-wrap agent greeting";
    const bubble = document.createElement("div");
    bubble.className = "bubble agent";
    bubble.textContent = config.greeting;
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
  }

  function ensureEmptyState() {
    if (messagesEl.children.length) return;
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Send a message to start the conversation.";
    messagesEl.appendChild(empty);
  }

  async function apiFetch(path, options) {
    options = options || {};
    const isFormDataBody = typeof FormData !== "undefined" && options.body instanceof FormData;
    const response = await fetch(apiBase + path, {
      ...options,
      credentials: "omit",
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
        // FormData (file upload) needs the browser to set its own multipart boundary header;
        // forcing text/plain here (our usual CORS-preflight-avoidance trick for JSON bodies)
        // would strip that and corrupt the upload.
        ...(options.body && !isFormDataBody ? { "Content-Type": "text/plain;charset=UTF-8" } : {}),
      },
    });
    const data = await response.json().catch(function () {
      return {};
    });
    if (!response.ok) {
      const error = new Error(data.error || "Request failed (" + response.status + ")");
      // Preserve status + body so callers can special-case specific failures (e.g. the
      // concurrency-cap 429 from /messages) instead of only having a flattened message string.
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function readCachedConfig() {
    if (boot.prefetchedConfig) return boot.prefetchedConfig;
    try {
      const raw = sessionStorage.getItem("mobichat_cfg_" + siteId);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.config) return null;
      if (Date.now() - (parsed.at || 0) > 5 * 60 * 1000) return null;
      return parsed.config;
    } catch (e) {
      return null;
    }
  }

  async function loadConfig() {
    let next = null;
    if (boot.configPromise) {
      next = await boot.configPromise;
    }
    if (!next) next = readCachedConfig();
    if (!next) {
      next = await apiFetch("/api/public/web-widget/config?siteId=" + encodeURIComponent(siteId));
    }

    config = next;
    titleEl.textContent = (config && (config.agentName || config.name)) || "Chat";
    if (config && config.primaryColor) applyTheme(config.primaryColor);
    if (config && config.position) setHostPosition(config.position);
    applyPoweredByVisibility();
    applyEndChatButtonVisibility();
    applyAttachmentVisibility();
    loadScreeningState();
    if (config && config.screeningForm && config.screeningForm.enabled) {
      applyAutomaticScreening();
      if (needsScreening()) renderScreeningForm();
    }
    setMode();
    if (!needsScreening()) {
      renderGreetingBubble();
      renderStarterActions();
      ensureEmptyState();
    }
  }

  async function loadMessages(options) {
    options = options || {};
    // A full load decides which conversation's history is shown, so it must not race identify.
    if (!options.incremental) await waitForIdentity();
    if (!siteId || !visitorId || needsScreening()) return;
    if (pendingNewChat) return;
    const params = new URLSearchParams({
      siteId: String(siteId),
      visitorId: String(visitorId),
    });

    // Never fetch below what's already rendered (covers full reload + incremental polls).
    let afterId = null;
    if (options.incremental && lastMessageId != null) {
      afterId = lastMessageId;
    }
    if (afterId != null) params.set("after", String(afterId));

    const data = await apiFetch("/api/public/web-widget/messages?" + params.toString());
    conversationId = data.conversationId || conversationId;

    const visible = Array.isArray(data.messages) ? data.messages : [];

    // On full reload, pull starters out so they can be re-attached after history.
    if (!options.incremental) {
      removeStarter();
    }

    if (data.ended) {
      setChatEnded(true);
      if (data.survey) {
        maybeShowSurvey(data.survey).catch(function () { });
      }
    } else if (!options.incremental) {
      setChatEnded(false);
    }
    setHasKnownConversation(Boolean(conversationId) && !data.ended);

    if (visible.length) {
      const empty = messagesEl.querySelector(".empty");
      if (empty) empty.remove();
    }
    visible.forEach(function (message) {
      appendMessage(message, {
        skipScroll: options.incremental && visible.length > 3,
        markUnread: Boolean(options.markUnread),
      });
    });
    if (visible.length && open) messagesEl.scrollTop = messagesEl.scrollHeight;

    if (!chatEnded && !pendingNewChat && (!options.incremental || visible.length)) {
      renderStarterActions();
    }
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  const MQTT_RECONNECT_DELAY_MS = 5000;
  // How many auto-reconnect attempts mqtt.js may make before we give up and fall back to
  // polling — polling should NOT kick in on every transient disconnect, only once we're
  // confident MQTT isn't coming back on its own.
  const MQTT_MAX_RECONNECT_ATTEMPTS = 5;
  // After a connect attempt fails outright (or exhausts its reconnect attempts), wait this
  // long before letting another connectMqtt() call actually hit the network again — without
  // this, every subsequent chat action (sendMessage/proceedIntoChat/etc., which all call
  // connectMqtt() unconditionally) would re-fetch credentials and retry the broker connection
  // as soon as mqttClient is nulled out, effectively hammering mqtt-credentials every few
  // messages whenever the broker is unreachable.
  const MQTT_RETRY_COOLDOWN_MS = 60000;
  let mqttClient = null;
  let mqttScriptPromise = null;
  let mqttTopic = null;
  let mqttTokenRefreshTimer = null;
  let mqttConnecting = false;
  let mqttReconnectAttempts = 0;
  let mqttRetryAfter = 0;

  function startPolling(intervalOverrideMs) {
    stopPolling();
    if (needsScreening() || chatEnded || pendingNewChat) return;
    const interval = intervalOverrideMs || (config && config.pollIntervalMs) || 3000;
    pollTimer = setInterval(function () {
      if (!open || needsScreening() || chatEnded || pendingNewChat) return;
      loadMessages({ incremental: true }).catch(function (error) {
        console.warn("[Mobichat] failed to poll messages", error);
      });
    }, interval);
  }

  function loadMqttScript() {
    if (window.mqtt) return Promise.resolve(window.mqtt);
    if (mqttScriptPromise) return mqttScriptPromise;
    mqttScriptPromise = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      // Self-hosted (see public/js/mqtt.min.js) rather than a third-party CDN, so it works
      // regardless of the embedding site's script-src CSP and doesn't depend on an external host.
      script.src = apiBase + "/js/mqtt.min.js";
      script.async = true;
      script.onload = function () {
        if (window.mqtt) resolve(window.mqtt);
        else reject(new Error("mqtt.min.js loaded without exposing window.mqtt"));
      };
      script.onerror = function () {
        mqttScriptPromise = null;
        reject(new Error("Failed to load mqtt.min.js"));
      };
      document.head.appendChild(script);
    });
    return mqttScriptPromise;
  }

  function stopMqttTokenRefresh() {
    if (mqttTokenRefreshTimer) {
      clearTimeout(mqttTokenRefreshTimer);
      mqttTokenRefreshTimer = null;
    }
  }

  function disconnectMqtt() {
    stopMqttTokenRefresh();
    mqttTopic = null;
    mqttReconnectAttempts = 0;
    if (mqttClient) {
      // Same belt-and-suspenders as giveUpAndStopReconnecting() in connectMqtt(): end(true)
      // alone doesn't reliably cancel an in-flight reconnect timer on some mqtt.js versions,
      // so also disable reconnectPeriod and detach listeners before ending, otherwise this
      // "abandoned" client could keep silently retrying the broker in the background even
      // though mqttClient no longer references it.
      try {
        if (mqttClient.options) mqttClient.options.reconnectPeriod = 0;
      } catch (e) {
        // ignore
      }
      try {
        mqttClient.removeAllListeners();
      } catch (e) {
        // ignore
      }
      try {
        mqttClient.end(true);
      } catch (e) {
        // ignore
      }
      mqttClient = null;
    }
  }

  function scheduleMqttTokenRefresh(expiresInSeconds) {
    stopMqttTokenRefresh();
    const ttlMs = (Number(expiresInSeconds) || 3600) * 1000;
    // Refresh well before expiry so a fresh token/connection is in place before the broker
    // drops us for auth expiry (EMQX JWT `exp`).
    const refreshInMs = Math.max(ttlMs * 0.8, 30000);
    mqttTokenRefreshTimer = setTimeout(function () {
      // forceRefresh=true: this is the one caller that must actually hit the credentials
      // endpoint again even though a client is already connected (see connectMqtt below).
      if (!chatEnded && !pendingNewChat) {
        connectMqtt(true).catch(function (error) {
          console.warn("[Mobichat] failed to refresh MQTT credentials", error);
        });
      }
    }, refreshInMs);
  }

  // Best-effort real-time push. While connected, polling is stopped entirely (see the
  // "connect" handler below); polling only resumes once MQTT is confirmed unreachable —
  // either this initial connect attempt fails outright, or mid-session reconnect attempts
  // (handled internally by mqtt.js) are exhausted (see the "reconnect" handler below).
  //
  // `forceRefresh` is only passed by scheduleMqttTokenRefresh's timer, to proactively renew
  // the token before it expires. Every other caller (sendMessage, proceedIntoChat,
  // submitScreening, setChatEnded, etc.) calls this with no argument every time a chat action
  // happens, so two guards below keep those calls cheap and no-op instead of hammering
  // mqtt-credentials on every message:
  async function connectMqtt(forceRefresh) {
    if (!siteId || !visitorId || mqttConnecting) return;
    if (needsScreening() || chatEnded || pendingNewChat) return;
    // Keep the subscription alive while the widget is closed so the launcher can receive
    // incoming-message signals and update its unread indicator without polling.
    // No conversation exists yet for this visitor (no message sent, no contact created
    // server-side) — mqtt-credentials would only return ready:false in this case, so don't
    // bother calling it until the first message actually creates one.
    if (!conversationId) return;
    // Already have a live subscription — the topic only changes after an explicit
    // disconnectMqtt() (reset/new chat/chat ended), which clears mqttClient, so there's no
    // need to re-fetch credentials just because the caller re-invoked connectMqtt().
    if (mqttClient && !forceRefresh) return;
    // A previous attempt just failed outright or exhausted its reconnects — don't let the
    // next chat action immediately retry. Open widgets use polling during this cooldown;
    // closed widgets wait for the next MQTT retry opportunity instead of background polling.
    if (!forceRefresh && Date.now() < mqttRetryAfter) return;
    mqttConnecting = true;
    try {
      const creds = await apiFetch(
        "/api/public/web-widget/mqtt-credentials?siteId=" + encodeURIComponent(siteId) + "&visitorId=" + encodeURIComponent(visitorId)
      );
      if (!creds || !creds.ready) return;
      if (chatEnded || pendingNewChat) return;

      // Contact (and therefore the scoped topic) can change across a reset/new-chat cycle —
      // always reconnect against the latest topic rather than assuming the old one still applies.
      if (mqttClient && mqttTopic === creds.topic) {
        scheduleMqttTokenRefresh(creds.expiresInSeconds);
        return;
      }
      disconnectMqtt();
      mqttReconnectAttempts = 0;

      const mqtt = await loadMqttScript();
      const client = mqtt.connect(creds.brokerUrl, {
        username: visitorId,
        password: creds.token,
        clean: true,
        reconnectPeriod: MQTT_RECONNECT_DELAY_MS,
        connectTimeout: 10000,
      });
      mqttClient = client;
      mqttTopic = creds.topic;

      client.on("connect", function () {
        mqttReconnectAttempts = 0;
        mqttRetryAfter = 0;
        client.subscribe(creds.topic, { qos: 0 }, function (error) {
          if (error) console.warn("[Mobichat] MQTT subscribe failed", error);
        });
        // Live updates are flowing — no need to poll while MQTT is connected.
        stopPolling();
      });
      client.on("message", function () {
        if (!needsScreening() && !chatEnded && !pendingNewChat) {
          loadMessages({ incremental: true, markUnread: !open }).catch(function (error) {
            console.warn("[Mobichat] failed to load MQTT message update", error);
          });
        }
      });
      client.on("error", function (error) {
        console.warn("[Mobichat] MQTT error", error);
      });
      // `giveUpAndStopReconnecting` may be invoked more than once for the same client (the
      // "reconnect" event can keep firing on some mqtt.js versions even after end() is called
      // mid-retry — a known quirk where end() doesn't reliably cancel an in-flight reconnect
      // timer), so it must be idempotent: without the `gaveUp` guard, every subsequent
      // "reconnect" firing would re-run this block, repeatedly resetting mqttRetryAfter and
      // defeating the whole cooldown (which is exactly what caused continuous
      // connect-attempt/credential-refetch loops even after just a single chat message).
      let gaveUp = false;
      function giveUpAndStopReconnecting() {
        if (gaveUp) return;
        gaveUp = true;
        // Belt-and-suspenders around end()'s known unreliability: disable reconnectPeriod on
        // the instance itself and detach our listeners so nothing here can re-fire, then end().
        try {
          if (client.options) client.options.reconnectPeriod = 0;
        } catch (e) {
          // ignore
        }
        try {
          client.removeAllListeners();
        } catch (e) {
          // ignore
        }
        try {
          client.end(true);
        } catch (e) {
          // ignore
        }
        if (mqttClient === client) {
          mqttClient = null;
          mqttTopic = null;
        }
        mqttRetryAfter = Date.now() + MQTT_RETRY_COOLDOWN_MS;
        if (open) startPolling();
      }
      client.on("reconnect", function () {
        // mqtt.js retries on its own (reconnectPeriod) — don't fall back to polling on every
        // transient drop, only once we've given up on reconnecting.
        mqttReconnectAttempts += 1;
        if (mqttReconnectAttempts > MQTT_MAX_RECONNECT_ATTEMPTS) {
          giveUpAndStopReconnecting();
        }
      });

      scheduleMqttTokenRefresh(creds.expiresInSeconds);
    } catch (error) {
      console.warn("[Mobichat] MQTT connect failed", error);
      // Credential fetch / script load / initial connect() itself failed outright (not a
      // mid-session reconnect) — fall back to polling only while the widget is open. The
      // closed state intentionally relies on MQTT rather than background HTTP polling.
      mqttRetryAfter = Date.now() + MQTT_RETRY_COOLDOWN_MS;
      if (!mqttClient && open) startPolling();
    } finally {
      mqttConnecting = false;
    }
  }

  function stopQueuePolling() {
    if (queuePollTimer) {
      clearTimeout(queuePollTimer);
      queuePollTimer = null;
    }
  }

  function renderQueueInfo() {
    queueMessageEl.textContent = queueMessageText || "You're in a queue. Please wait...";
    queuePositionEl.textContent = queuePosition ? "Position in line: #" + queuePosition : "";
  }

  // Best-effort — releases this visitor's concurrency slot/queue spot immediately instead of
  // waiting for it to expire, so the next queued visitor is admitted sooner. Never blocks the
  // close/end-chat flow on its result.
  function releaseQueueSlot() {
    if (!siteId || !visitorId) return;
    try {
      apiFetch("/api/public/web-widget/queue", {
        method: "POST",
        body: JSON.stringify({ siteId: siteId, visitorId: visitorId, action: "leave" }),
      }).catch(function () { });
    } catch (e) {
      // ignore
    }
  }

  async function proceedIntoChat() {
    try {
      if (!config) await loadConfig();
      setMode();
      if (!needsScreening()) {
        await loadMessages({ incremental: false });
        // See sendMessage()'s comment: only (re)start polling if MQTT doesn't already have a
        // live/reconnecting client, otherwise this unconditionally re-arms a timer that never
        // gets stopped again (stopPolling() only runs inside MQTT's own "connect" handler).
        if (!mqttClient) startPolling();
        connectMqtt().catch(function () { });
        inputEl.focus();
      }
    } catch (error) {
      showError(needsScreening() ? screeningErrorEl : chatErrorEl, error.message || "Unable to load chat");
    }
  }

  /**
   * Concurrent-session gate: checked (and re-polled) before proceeding to loadConfig() /
   * loadMessages() / connectMqtt(). Every response also renews this visitor's slot/queue
   * position (see web-widget-queue.js), so this keeps re-scheduling itself at the server's
   * requested interval for as long as the widget stays open — this doubles as the heartbeat.
   */
  async function pollQueueGate() {
    if (!open || chatEnded) return;
    let data;
    try {
      data = await apiFetch(
        "/api/public/web-widget/queue?siteId=" + encodeURIComponent(siteId) + "&visitorId=" + encodeURIComponent(visitorId)
      );
    } catch (error) {
      // Network hiccup while gating/waiting — retry shortly rather than giving up entirely.
      queuePollTimer = setTimeout(pollQueueGate, 4000);
      return;
    }
    if (!open) return;

    if (!data || data.enabled === false || data.status === "active") {
      queued = false;
      setMode();
      // Run the normal load flow exactly once per widget-open, as soon as admission is
      // confirmed — immediately if never gated, or the moment a queued visitor is promoted.
      if (!admittedForThisOpen) {
        admittedForThisOpen = true;
        await proceedIntoChat();
      }
      // Feature disabled entirely for this widget — no need to keep polling this endpoint.
      if (data && data.enabled === false) return;
      queuePollTimer = setTimeout(pollQueueGate, (data && data.pollIntervalMs) || 20000);
      return;
    }

    queued = true;
    queuePosition = data.position || null;
    queueMessageText = data.queueMessage || queueMessageText;
    renderQueueInfo();
    setMode();
    queuePollTimer = setTimeout(pollQueueGate, data.pollIntervalMs || 4000);
  }

  async function setOpen(nextOpen) {
    open = nextOpen;
    panel.classList.toggle("open", open);
    launcher.classList.toggle("hide-on-mobile-open", open && window.matchMedia("(max-width: 480px)").matches);
    renderLauncher();

    if (open) {
      clearUnreadMessages();
      showError(chatErrorEl, "");
      showError(screeningErrorEl, "");
      stopQueuePolling();
      admittedForThisOpen = false;
      await pollQueueGate();
    } else {
      stopPolling();
      stopQueuePolling();
      if (queued) releaseQueueSlot();
      queued = false;
      admittedForThisOpen = false;
      // Retain (or establish) MQTT while closed so agent/bot replies update unread state.
      connectMqtt().catch(function (error) {
        console.warn("[Mobichat] failed to connect MQTT for unread updates", error);
      });
    }
  }

  // Keep the launcher hidden/shown correctly across viewport-size changes (e.g. device
  // rotation) while the panel is open, since visibility is otherwise only set on open/close.
  window.addEventListener("resize", function () {
    launcher.classList.toggle("hide-on-mobile-open", open && window.matchMedia("(max-width: 480px)").matches);
    messagesEl.querySelectorAll(".bubble-wrap.has-copy-action").forEach(updateMessageActionLayout);
  });

  function validateScreening() {
    const fields = (config && config.screeningForm && config.screeningForm.fields) || [];
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const value = String(screeningValues[field.id] || "").trim();
      if (field.required && !value) return field.title + " is required";
      if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return "Please enter a valid email";
      }
      if (field.type === "number" && value && Number.isNaN(Number(value))) {
        return (field.title || "Number") + " must be a valid number";
      }
      // Mirrors normalizeTypedPhone (src/lib/phone-utils.js): 10-15 digits, only phone characters.
      if (field.type === "phone" && value) {
        let phoneDigits = value.replace(/\D/g, "");
        if (phoneDigits.indexOf("00") === 0) phoneDigits = phoneDigits.slice(2);
        else if (phoneDigits.indexOf("0") === 0) phoneDigits = "62" + phoneDigits.slice(1);
        if (!/^\+?[\d\s\-().]+$/.test(value) || phoneDigits.length < 10 || phoneDigits.length > 15) {
          return (field.title || "Phone") + " must be a valid phone number";
        }
      }
    }
    const hasNameOrEmail = fields.some(function (field) {
      if (field.type !== "name" && field.type !== "email") return false;
      return String(screeningValues[field.id] || "").trim();
    });
    if (fields.some(function (f) { return f.type === "name" || f.type === "email"; }) && !hasNameOrEmail) {
      return "Name or email is required";
    }
    return null;
  }

  function submitScreening() {
    showError(screeningErrorEl, "");
    const error = validateScreening();
    if (error) {
      showError(screeningErrorEl, error);
      return;
    }

    screeningCompleted = true;
    saveScreeningState();
    setMode();
    renderGreetingBubble();
    renderStarterActions();
    ensureEmptyState();
    loadMessages({ incremental: false }).catch(function () { });
    // See sendMessage()'s comment: don't unconditionally re-arm polling if MQTT already owns it.
    if (!mqttClient) startPolling();
    connectMqtt().catch(function () { });
    inputEl.focus();
  }

  async function sendMessage(text, replyContext, attachmentFile) {
    if (sending || (!text && !attachmentFile) || needsScreening() || chatEnded) return;
    sending = true;
    sendBtn.disabled = true;
    attachBtn.disabled = true;
    showError(chatErrorEl, "");
    removeStarter();

    try {
      const clientMessageId = uuid();
      const nameField = ((config && config.screeningForm && config.screeningForm.fields) || []).find(
        function (field) {
          return field.type === "name";
        }
      );
      const displayName = nameField ? screeningValues[nameField.id] : undefined;
      const screeningData = config && config.screeningForm && config.screeningForm.enabled ? screeningValues : undefined;
      // Settle identify first so we know whether the identity is verified before adding screening values.
      await waitForIdentity();
      const identity = withScreeningIdentityFallback(getIdentityPayloadForApi());

      let data;
      if (attachmentFile) {
        const formData = new FormData();
        formData.append("siteId", siteId);
        formData.append("visitorId", visitorId);
        formData.append("text", text || "");
        formData.append("clientMessageId", clientMessageId);
        if (displayName) formData.append("displayName", displayName);
        if (screeningData) formData.append("screeningData", JSON.stringify(screeningData));
        formData.append("website", getTrackedWebsite());
        formData.append("trackingHints", JSON.stringify(getTrackingHints()));
        if (replyContext) formData.append("replyContext", JSON.stringify(replyContext));
        if (identity) formData.append("identity", JSON.stringify(identity));
        formData.append("attachment", attachmentFile);

        data = await apiFetch("/api/public/web-widget/messages?siteId=" + encodeURIComponent(siteId), {
          method: "POST",
          body: formData,
        });
      } else {
        data = await apiFetch("/api/public/web-widget/messages?siteId=" + encodeURIComponent(siteId), {
          method: "POST",
          body: JSON.stringify({
            siteId: siteId,
            visitorId: visitorId,
            text: text,
            clientMessageId: clientMessageId,
            displayName: displayName,
            screeningData: screeningData,
            website: getTrackedWebsite(),
            trackingHints: getTrackingHints(),
            replyContext: replyContext || undefined,
            identity: identity,
          }),
        });
      }
      conversationId = data.conversationId || conversationId;
      if (conversationId) setHasKnownConversation(true);
      pendingNewChat = false;
      if (data.message) appendMessage(data.message);
      inputEl.value = "";
      setSelectedReply(null);
      renderStarterActions();
      // Only (re)start polling if MQTT doesn't already have a live/reconnecting client for this
      // session. Previously this ran unconditionally on every single sendMessage() call, which
      // re-armed the 3s poll timer even while MQTT was already connected — and since polling is
      // only ever stopped again inside MQTT's own "connect" event handler (which doesn't refire
      // on subsequent messages once already connected), that left polling running forever after
      // the very next message, hammering /api/public/web-widget/messages continuously even
      // though the MQTT push channel was healthy the whole time.
      if (!mqttClient) startPolling();
      // The first message is what actually creates the contact/conversation, so this is the
      // first point where mqtt-credentials can return ready:true — connectMqtt() no-ops if
      // already connected to the same topic, so this is safe to call unconditionally here.
      connectMqtt().catch(function () { });
    } catch (error) {
      showError(chatErrorEl, error.message || "Failed to send message");
      renderStarterActions();
      // Server-side concurrency cap rejected this message (defense-in-depth backstop for the
      // client-side queue gate at open-time — e.g. this tab's slot expired, or another visitor
      // took the last slot in a race). Re-check the gate immediately so the queue view shows up
      // right away instead of waiting for the next scheduled heartbeat poll.
      if (error.status === 429 && error.data && error.data.queued) {
        pollQueueGate().catch(function () { });
      }
    } finally {
      sending = false;
      sendBtn.disabled = false;
      attachBtn.disabled = false;
      inputEl.focus();
    }
  }

  // Max file size checked client-side before upload starts; the server enforces the real
  // per-type limits (image/video/audio/document) and returns the authoritative error.
  const MAX_CLIENT_ATTACHMENT_SIZE = 100 * 1024 * 1024;

  attachBtn.addEventListener("click", function () {
    if (sending || needsScreening() || chatEnded) return;
    attachInputEl.click();
  });

  attachInputEl.addEventListener("change", function () {
    const file = attachInputEl.files && attachInputEl.files[0];
    attachInputEl.value = "";
    if (!file) return;
    if (file.size > MAX_CLIENT_ATTACHMENT_SIZE) {
      showError(chatErrorEl, "File (" + (file.size / 1024 / 1024).toFixed(2) + "MB) is too large");
      return;
    }
    sendMessage(String(inputEl.value || "").trim(), selectedReply, file);
  });

  messageSearchBtn.addEventListener("click", function () {
    const isOpen = messageSearchEl.classList.toggle("show");
    messageSearchBtn.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) messageSearchInputEl.focus();
  });
  messageSearchCloseBtn.addEventListener("click", function () {
    if (messageSearchTimer) clearTimeout(messageSearchTimer);
    messageSearchQuery = "";
    messageSearchInputEl.value = "";
    messageSearchEl.classList.remove("show");
    messageSearchBtn.setAttribute("aria-expanded", "false");
    applyMessageSearch();
  });
  messageSearchInputEl.addEventListener("input", function () {
    if (messageSearchTimer) clearTimeout(messageSearchTimer);
    messageSearchQuery = String(messageSearchInputEl.value || "").trim();
    applyMessageSearch();
    if (messageSearchQuery) {
      const query = messageSearchQuery;
      messageSearchTimer = setTimeout(function () {
        searchConversationMessages(query).catch(function (error) {
          console.warn("[Mobichat] failed to search messages", error);
        });
      }, 250);
    }
  });
  replyCancelBtn.addEventListener("click", function () {
    setSelectedReply(null);
  });

  async function init(options) {
    options = options || {};
    const nextSiteId = options.siteId != null ? options.siteId : options.site_id || options.app_id || options.appId;
    if (!nextSiteId) {
      console.warn("[Mobichat] init requires siteId (or app_id)");
      return;
    }

    siteId = String(nextSiteId);
    apiBase = String(options.apiBase || resolveApiBase() || "").replace(/\/$/, "");
    visitorId = getOrCreateVisitorId(siteId);
    loadReadState();

    const cached = loadCachedIdentity();
    if (cached && cached.identity) {
      hostIdentity = cached.identity;
      identityVerifiedUserId = cached.verifiedUserId || null;
    }

    const bootSettings = (boot && boot.settings) || window.mobichatSettings || null;
    if (bootSettings && (bootSettings.user_id || bootSettings.userId)) {
      // Apply settings identity; network sync happens below after config load.
      hostIdentity = sanitizeHostIdentity(bootSettings);
    }

    // Assigned synchronously so open()/identify() calls processed right after init() see it.
    bootReady = (async function () {
      await loadConfig();
      // Identify can switch the visitor (resetIdentity) and links it to the host user's history,
      // so opening the chat and restoring unread state both happen only after it settles.
      if (hostIdentity && hostIdentity.user_id) await syncIdentify(hostIdentity);
    })();

    try {
      await bootReady;
      if (boot.pendingOpen) {
        boot.pendingOpen = false;
        await setOpen(true);
      } else {
        restoreUnreadState().catch(function (error) {
          console.warn("[Mobichat] failed to restore unread state", error);
        });
      }
    } catch (error) {
      console.warn("[Mobichat] failed to load config", error);
    }
  }

  function Mobichat() {
    const args = Array.prototype.slice.call(arguments);
    const command = args[0];
    const payload = args[1];
    if (command === "init") return init(payload || {});
    if (command === "open") return setOpen(true);
    if (command === "close") return setOpen(false);
    if (command === "identify") return syncIdentify(payload || {});
    if (command === "reset") {
      resetIdentity();
      return undefined;
    }
    console.warn("[Mobichat] unknown command", command);
  }

  Mobichat.q = [];
  Mobichat._boot = boot;
  Mobichat.init = init;
  Mobichat.identify = function (payload) {
    return syncIdentify(payload || {});
  };
  Mobichat.reset = function () {
    resetIdentity();
  };
  Mobichat.open = function () {
    return setOpen(true);
  };
  Mobichat.close = function () {
    return setOpen(false);
  };
  window.Mobichat = Mobichat;

  launcher.addEventListener("click", function () {
    setOpen(!open);
  });
  headerCloseBtn.addEventListener("click", function () {
    setOpen(false);
  });
  endChatBtn.addEventListener("click", function () {
    endChat();
  });
  restartChatBtn.addEventListener("click", function () {
    restartChat();
  });
  csatSubmitBtn.addEventListener("click", function () {
    submitCsatSurvey();
  });
  screeningSubmitBtn.addEventListener("click", submitScreening);
  formEl.addEventListener("submit", function (event) {
    event.preventDefault();
    const text = String(inputEl.value || "").trim();
    if (!text || chatEnded) return;
    sendMessage(text, selectedReply);
  });

  queue.forEach(function (item) {
    try {
      Mobichat.apply(null, item);
    } catch (error) {
      console.warn("[Mobichat] queued command failed", error);
    }
  });

  if (boot.siteId && !siteId) {
    init({ siteId: boot.siteId, apiBase: boot.apiBase });
  }
})(window, document);
