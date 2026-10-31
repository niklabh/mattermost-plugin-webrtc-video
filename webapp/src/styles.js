/**
 * Plugin stylesheet. Colours come from the Mattermost theme CSS variables so the
 * picker, sidebar and posts follow the user's theme; the call window is always
 * dark, like most video UIs.
 */
const STYLE_ID = 'wrtc-video-styles';

const CSS = `
.wrtc-icon { display: inline-block; vertical-align: middle; flex-shrink: 0; }

/* ---------- Avatar ---------- */
.wrtc-avatar {
  position: relative; display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; border-radius: 50%; font-weight: 600; color: #fff;
  background: linear-gradient(135deg, #5b8def, #7b5cf0);
  transition: box-shadow .15s ease;
}
.wrtc-avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
.wrtc-avatar--speaking { box-shadow: 0 0 0 2px var(--online-indicator, #3db887), 0 0 12px rgba(61,184,135,.6); }
.wrtc-status {
  position: absolute; right: -1px; bottom: -1px; width: 30%; height: 30%; min-width: 8px; min-height: 8px;
  border-radius: 50%; border: 2px solid var(--center-channel-bg, #fff); background: rgba(var(--center-channel-color-rgb, 63,67,80), .32);
}
.wrtc-status--online { background: var(--online-indicator, #3db887); }
.wrtc-status--away { background: var(--away-indicator, #ffbc1f); }
.wrtc-status--dnd { background: var(--dnd-indicator, #d24b4e); }

/* ---------- Shared buttons ---------- */
.wrtc-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; padding: 0 14px; border: none; border-radius: 4px; cursor: pointer;
  font: inherit; font-size: 12px; font-weight: 600; line-height: 1; white-space: nowrap;
}
.wrtc-btn:disabled { opacity: .5; cursor: default; }
.wrtc-btn:focus-visible, .wrtc-ctl:focus-visible, .wrtc-row:focus-visible { outline: 2px solid var(--button-bg, #1c58d9); outline-offset: 2px; }
.wrtc-btn--primary { background: var(--button-bg, #1c58d9); color: var(--button-color, #fff); }
.wrtc-btn--primary:hover:not(:disabled) { filter: brightness(1.08); }
.wrtc-btn--tertiary { background: rgba(var(--button-bg-rgb, 28,88,217), .08); color: var(--button-bg, #1c58d9); }
.wrtc-btn--tertiary:hover:not(:disabled) { background: rgba(var(--button-bg-rgb, 28,88,217), .16); }
.wrtc-btn--danger { background: var(--error-text, #d24b4e); color: #fff; }
.wrtc-btn--ghost { background: transparent; color: inherit; }
.wrtc-btn--ghost:hover:not(:disabled) { background: rgba(var(--center-channel-color-rgb, 63,67,80), .08); }
.wrtc-btn--icon { width: 32px; padding: 0; }

/* ---------- Channel header button ---------- */
.wrtc-header-btn {
  display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; cursor: pointer;
  border: 1px solid rgba(var(--center-channel-color-rgb, 63,67,80), .16); border-radius: 4px;
  background: transparent; color: rgba(var(--center-channel-color-rgb, 63,67,80), .72);
  font: inherit; font-size: 12px; font-weight: 600;
}
.wrtc-header-btn:hover { background: rgba(var(--center-channel-color-rgb, 63,67,80), .08); color: var(--center-channel-color, #3f4350); }
.wrtc-dropdown-item { display: flex; align-items: center; gap: 8px; }

/* ---------- Overlay / dialog ---------- */
.wrtc-backdrop {
  position: fixed; inset: 0; z-index: 1050; display: flex; align-items: center; justify-content: center;
  padding: 16px; background: rgba(0,0,0,.5); animation: wrtc-fade .15s ease;
}
.wrtc-dialog {
  width: 100%; max-width: 480px; max-height: calc(100vh - 32px); display: flex; flex-direction: column;
  border-radius: 12px; overflow: hidden; background: var(--center-channel-bg, #fff); color: var(--center-channel-color, #3f4350);
  box-shadow: 0 20px 32px rgba(0,0,0,.24); animation: wrtc-pop .18s ease;
}
.wrtc-dialog__header { display: flex; align-items: center; justify-content: space-between; padding: 20px 20px 8px 24px; }
.wrtc-dialog__title { margin: 0; font-size: 20px; font-weight: 600; }
.wrtc-dialog__body { padding: 8px 24px 24px; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }

/* ---------- Picker ---------- */
.wrtc-search {
  display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; margin-bottom: 12px;
  border-radius: 4px; border: 1px solid rgba(var(--center-channel-color-rgb, 63,67,80), .16);
  color: rgba(var(--center-channel-color-rgb, 63,67,80), .64);
}
.wrtc-search:focus-within { border-color: var(--button-bg, #1c58d9); box-shadow: inset 0 0 0 1px var(--button-bg, #1c58d9); }
.wrtc-search input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; color: var(--center-channel-color, #3f4350); font: inherit; font-size: 14px; }
.wrtc-section-label {
  margin: 4px 0 6px; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  color: rgba(var(--center-channel-color-rgb, 63,67,80), .56);
}
.wrtc-list { list-style: none; margin: 0 -8px; padding: 0; overflow-y: auto; min-height: 120px; max-height: 360px; }
.wrtc-row {
  display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px; border: none; border-radius: 6px;
  background: transparent; color: inherit; text-align: left; cursor: pointer; font: inherit;
}
.wrtc-row:hover, .wrtc-row--active { background: rgba(var(--button-bg-rgb, 28,88,217), .08); }
.wrtc-row__text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.wrtc-row__name { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wrtc-row__sub { font-size: 12px; color: rgba(var(--center-channel-color-rgb, 63,67,80), .64); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wrtc-row__action { color: var(--button-bg, #1c58d9); opacity: 0; transition: opacity .1s; }
.wrtc-row:hover .wrtc-row__action, .wrtc-row--active .wrtc-row__action { opacity: 1; }
.wrtc-empty { padding: 32px 8px; text-align: center; font-size: 14px; color: rgba(var(--center-channel-color-rgb, 63,67,80), .64); }

/* ---------- Invite post ---------- */
.wrtc-post {
  display: flex; align-items: center; gap: 12px; max-width: 420px; margin-top: 4px; padding: 12px 16px;
  border-radius: 8px; border: 1px solid rgba(var(--center-channel-color-rgb, 63,67,80), .16);
  background: var(--center-channel-bg, #fff); box-shadow: 0 2px 3px rgba(0,0,0,.06);
}
.wrtc-post__icon {
  display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
  background: rgba(var(--button-bg-rgb, 28,88,217), .12); color: var(--button-bg, #1c58d9);
}
.wrtc-post__icon--missed { background: rgba(210,75,78,.12); color: var(--error-text, #d24b4e); }
.wrtc-post__icon--ringing { animation: wrtc-wiggle 1.2s ease-in-out infinite; }
.wrtc-post__text { flex: 1; min-width: 0; }
.wrtc-post__title { font-weight: 600; font-size: 14px; }
.wrtc-post__sub { font-size: 12px; color: rgba(var(--center-channel-color-rgb, 63,67,80), .64); }

/* ---------- Sidebar ---------- */
.wrtc-sidebar { padding: 4px 8px 8px; color: var(--sidebar-text, #fff); border-bottom: 1px solid rgba(var(--sidebar-text-rgb, 255,255,255), .08); margin-bottom: 4px; }
.wrtc-sidebar__call {
  display: flex; align-items: center; gap: 8px; width: 100%; height: 32px; padding: 0 10px; margin-bottom: 4px;
  border: none; border-radius: 4px; cursor: pointer; font: inherit; font-size: 14px; font-weight: 600;
  background: rgba(var(--sidebar-text-rgb, 255,255,255), .08); color: var(--sidebar-text, #fff);
}
.wrtc-sidebar__call:hover { background: rgba(var(--sidebar-text-rgb, 255,255,255), .16); }
.wrtc-sidebar__head { display: flex; align-items: center; justify-content: space-between; height: 32px; padding: 0 2px 0 4px; }
.wrtc-sidebar__label {
  display: flex; align-items: center; gap: 2px; padding: 0; border: none; background: none; cursor: pointer; font: inherit;
  font-size: 12px; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; color: rgba(var(--sidebar-text-rgb, 255,255,255), .64);
}
.wrtc-sidebar__label:hover { color: var(--sidebar-text, #fff); }
.wrtc-sidebar__iconbtn {
  display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0;
  border: none; border-radius: 4px; background: transparent; color: rgba(var(--sidebar-text-rgb, 255,255,255), .64); cursor: pointer;
}
.wrtc-sidebar__iconbtn:hover { background: rgba(var(--sidebar-text-rgb, 255,255,255), .08); color: var(--sidebar-text, #fff); }
.wrtc-sidebar__iconbtn--danger:hover { color: #ff8a8a; }
.wrtc-room {
  display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 0 4px 0 10px; border-radius: 4px; cursor: pointer;
  color: rgba(var(--sidebar-text-rgb, 255,255,255), .72); font-size: 14px;
}
.wrtc-room:hover { background: rgba(var(--sidebar-text-rgb, 255,255,255), .08); color: var(--sidebar-text, #fff); }
.wrtc-room--active { background: rgba(var(--sidebar-text-rgb, 255,255,255), .12); color: var(--sidebar-text, #fff); font-weight: 600; }
.wrtc-room__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wrtc-room .wrtc-sidebar__iconbtn { visibility: hidden; }
.wrtc-room:hover .wrtc-sidebar__iconbtn { visibility: visible; }
.wrtc-participants { list-style: none; margin: 2px 0 4px; padding: 0 0 0 26px; }
.wrtc-participant { display: flex; align-items: center; gap: 8px; height: 28px; font-size: 13px; color: rgba(var(--sidebar-text-rgb, 255,255,255), .8); }
.wrtc-participant__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wrtc-participant .wrtc-icon { opacity: .6; }
.wrtc-voicebar { display: flex; align-items: center; gap: 4px; margin-top: 6px; padding: 6px; border-radius: 6px; background: rgba(var(--sidebar-text-rgb, 255,255,255), .08); }
.wrtc-voicebar__info { flex: 1; min-width: 0; padding-left: 4px; }
.wrtc-voicebar__status { font-size: 11px; font-weight: 600; color: var(--online-indicator, #3db887); }
.wrtc-voicebar__room { font-size: 12px; color: rgba(var(--sidebar-text-rgb, 255,255,255), .72); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wrtc-voicebar .wrtc-sidebar__iconbtn { width: 28px; height: 28px; }
.wrtc-voicebar .wrtc-sidebar__iconbtn--off { color: #ff8a8a; }
.wrtc-voicebar .wrtc-sidebar__iconbtn--leave { background: rgba(210,75,78,.85); color: #fff; }
.wrtc-sidebar__form { display: flex; gap: 4px; padding: 2px 0 6px; }
.wrtc-sidebar__input {
  flex: 1; min-width: 0; height: 28px; padding: 0 8px; border-radius: 4px; font: inherit; font-size: 13px;
  border: 1px solid rgba(var(--sidebar-text-rgb, 255,255,255), .24); background: rgba(0,0,0,.16); color: var(--sidebar-text, #fff);
}
.wrtc-sidebar__input:focus { outline: none; border-color: rgba(var(--sidebar-text-rgb, 255,255,255), .56); }
.wrtc-sidebar__hint { padding: 4px 10px; font-size: 12px; line-height: 1.4; color: rgba(var(--sidebar-text-rgb, 255,255,255), .56); }
.wrtc-sidebar__error { color: #ff8a8a; }

/* ---------- Call window ---------- */
.wrtc-call {
  position: fixed; z-index: 1060; display: flex; flex-direction: column; overflow: hidden;
  background: #0f1117; color: #e8eaf0; box-shadow: 0 24px 64px rgba(0,0,0,.5);
  font-size: 14px; animation: wrtc-pop .18s ease;
}
.wrtc-call--full { inset: 32px; margin: auto; max-width: 1080px; max-height: 760px; border-radius: 16px; }
.wrtc-call--mini { right: 20px; bottom: 20px; width: 320px; height: 220px; border-radius: 12px; }
.wrtc-call--incoming { right: 20px; bottom: 20px; width: 340px; height: auto; border-radius: 16px; }
.wrtc-call:fullscreen { inset: 0; max-width: none; max-height: none; border-radius: 0; }
.wrtc-call__backdrop { position: fixed; inset: 0; z-index: 1059; background: rgba(0,0,0,.55); animation: wrtc-fade .15s ease; }
.wrtc-call__top {
  position: absolute; top: 0; left: 0; right: 0; z-index: 3; display: flex; align-items: center; gap: 10px;
  padding: 12px 12px 24px 16px; background: linear-gradient(rgba(0,0,0,.55), transparent);
}
.wrtc-call__who { flex: 1; min-width: 0; }
.wrtc-call__name { font-weight: 600; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wrtc-call__status { font-size: 12px; color: rgba(232,234,240,.72); font-variant-numeric: tabular-nums; }
.wrtc-call__status--warn { color: #ffbc1f; }
.wrtc-call__stage { position: relative; flex: 1; min-height: 0; background: #07080c; }
.wrtc-call__remote { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #07080c; }
.wrtc-call__remote--contain { object-fit: contain; }
.wrtc-call__hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.wrtc-call__placeholder {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
  background: radial-gradient(circle at 50% 40%, #222838 0%, #0f1117 70%); text-align: center; padding: 24px;
}
.wrtc-call__placeholder-title { font-size: 20px; font-weight: 600; }
.wrtc-call__placeholder-sub { color: rgba(232,234,240,.7); max-width: 360px; line-height: 1.45; }
.wrtc-call--mini .wrtc-call__placeholder { gap: 8px; }
.wrtc-call--mini .wrtc-call__placeholder-title { font-size: 14px; }
.wrtc-call__pulse { position: relative; }
.wrtc-call__pulse::before, .wrtc-call__pulse::after {
  content: ''; position: absolute; inset: -10px; border-radius: 50%; border: 2px solid rgba(91,141,239,.5);
  animation: wrtc-ring 2s ease-out infinite;
}
.wrtc-call__pulse::after { animation-delay: 1s; }
.wrtc-call__self {
  position: absolute; right: 16px; bottom: 88px; z-index: 2; width: 22%; min-width: 120px; max-width: 220px; aspect-ratio: 16 / 10;
  border-radius: 10px; overflow: hidden; background: #1b1f2a; border: 1px solid rgba(255,255,255,.18); box-shadow: 0 8px 24px rgba(0,0,0,.45);
}
.wrtc-call__self video { width: 100%; height: 100%; object-fit: cover; }
.wrtc-call__self--mirror video { transform: scaleX(-1); }
.wrtc-call__self-off { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.wrtc-call--mini .wrtc-call__self { right: 8px; bottom: 56px; min-width: 72px; width: 28%; border-radius: 6px; }
.wrtc-call__badge {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px;
  background: rgba(0,0,0,.5); font-size: 11px; color: #fff;
}
.wrtc-call__bar {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 3; display: flex; align-items: center; justify-content: center; gap: 12px;
  padding: 24px 16px 16px; background: linear-gradient(transparent, rgba(0,0,0,.6));
}
.wrtc-call--mini .wrtc-call__bar { gap: 6px; padding: 16px 8px 8px; }
.wrtc-ctl {
  display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; padding: 0;
  border: none; border-radius: 50%; cursor: pointer; color: #fff; background: rgba(255,255,255,.14);
  transition: background .12s ease, transform .12s ease;
}
.wrtc-ctl:hover:not(:disabled) { background: rgba(255,255,255,.24); }
.wrtc-ctl:active:not(:disabled) { transform: scale(.94); }
.wrtc-ctl:disabled { opacity: .4; cursor: default; }
.wrtc-ctl--off { background: #fff; color: #1b1f2a; }
.wrtc-ctl--off:hover:not(:disabled) { background: #e8eaf0; }
.wrtc-ctl--on { background: #5b8def; }
.wrtc-ctl--end { width: 64px; border-radius: 24px; background: #d24b4e; }
.wrtc-ctl--end:hover:not(:disabled) { background: #e05357; }
.wrtc-ctl--accept { width: 56px; height: 56px; background: #3db887; }
.wrtc-ctl--accept:hover:not(:disabled) { background: #46c993; }
.wrtc-ctl--decline { width: 56px; height: 56px; background: #d24b4e; }
.wrtc-ctl--decline:hover:not(:disabled) { background: #e05357; }
.wrtc-call--mini .wrtc-ctl { width: 36px; height: 36px; }
.wrtc-call--mini .wrtc-ctl--end { width: 48px; }
.wrtc-call__iconbtn {
  display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0;
  border: none; border-radius: 6px; background: rgba(255,255,255,.08); color: #fff; cursor: pointer;
}
.wrtc-call__iconbtn:hover { background: rgba(255,255,255,.2); }
.wrtc-incoming { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 28px 24px 24px; text-align: center; }
.wrtc-incoming__name { margin-top: 14px; font-size: 18px; font-weight: 600; }
.wrtc-incoming__kind { color: rgba(232,234,240,.72); }
.wrtc-incoming__actions { display: flex; gap: 40px; margin-top: 18px; }
.wrtc-incoming__action { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 12px; color: rgba(232,234,240,.8); }
.wrtc-ended__actions { display: flex; gap: 12px; margin-top: 8px; }
.wrtc-ended__actions .wrtc-btn--ghost { color: #e8eaf0; background: rgba(255,255,255,.1); }
.wrtc-ended__actions .wrtc-btn--ghost:hover { background: rgba(255,255,255,.18); }
.wrtc-flip { transform: scaleX(-1); }

@keyframes wrtc-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes wrtc-pop { from { opacity: 0; transform: scale(.97); } to { opacity: 1; transform: none; } }
@keyframes wrtc-ring { 0% { transform: scale(.9); opacity: .9; } 100% { transform: scale(1.5); opacity: 0; } }
@keyframes wrtc-wiggle { 0%, 60%, 100% { transform: rotate(0); } 10%, 30%, 50% { transform: rotate(-12deg); } 20%, 40% { transform: rotate(12deg); } }
@media (prefers-reduced-motion: reduce) {
  .wrtc-call, .wrtc-dialog, .wrtc-backdrop, .wrtc-call__backdrop { animation: none; }
  .wrtc-call__pulse::before, .wrtc-call__pulse::after, .wrtc-post__icon--ringing { animation: none; }
}
@media (max-width: 640px) {
  .wrtc-call--full { inset: 0; border-radius: 0; }
  .wrtc-call__self { bottom: 84px; width: 30%; }
}
`;

export function injectStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
}

export function removeStyles() {
    const el = typeof document !== 'undefined' && document.getElementById(STYLE_ID);
    if (el) {
        el.remove();
    }
}
