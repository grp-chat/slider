(() => {
  const RECENT_TAP_WINDOW_MS = 180;
  const activePointerIds = new Set();
  const recentBoardTaps = new Map(); // `${slot}:${tileIdx}` -> timestamp

  function applyTouchRules(stageEl) {
    if (!stageEl) return;
    stageEl.style.touchAction = 'manipulation';

    stageEl.querySelectorAll('.puzzle-grid').forEach((gridEl) => {
      gridEl.style.touchAction = 'manipulation';
    });

    stageEl.querySelectorAll('button.puzzle-tile').forEach((tileEl) => {
      tileEl.style.touchAction = 'manipulation';
      tileEl.style.webkitTapHighlightColor = 'transparent';
    });
  }

  function recordAndCheckDuplicate(slot, tileIdx) {
    const key = `${slot}:${tileIdx}`;
    const now = performance.now();
    const last = recentBoardTaps.get(key) || 0;
    if (now - last < RECENT_TAP_WINDOW_MS) {
      return true;
    }
    recentBoardTaps.set(key, now);
    return false;
  }

  function bindStageMultiTouch() {
    const api = window.SliderDashboard;
    const stage = document.getElementById('dashboard-stage');
    if (!api || !stage) return;

    applyTouchRules(stage);

    if (stage.dataset.boundMultiTouch) return;
    stage.dataset.boundMultiTouch = 'true';

    // Capture-phase pointerdown fires immediately for every simultaneous finger/pointer
    stage.addEventListener(
      'pointerdown',
      (e) => {
        const tileBtn = e.target.closest('button.puzzle-tile');
        if (!tileBtn || tileBtn.disabled) return;
        if (activePointerIds.has(e.pointerId)) return;

        const slotEl = tileBtn.closest('.player-slot');
        const gridEl = tileBtn.closest('.puzzle-grid');
        if (!slotEl || !gridEl) return;

        const slot = slotEl.dataset.slot;
        const tiles = Array.from(gridEl.querySelectorAll('button.puzzle-tile'));
        const tileIdx = tiles.indexOf(tileBtn);
        if (!slot || tileIdx < 0) return;

        if (e.pointerType === 'touch' || e.pointerType === 'pen') {
          e.preventDefault();
        }

        activePointerIds.add(e.pointerId);
        recordAndCheckDuplicate(slot, tileIdx);

        if (typeof api.slideTile === 'function') {
          api.slideTile(slot, tileIdx);
        }
        applyTouchRules(stage);
      },
      { capture: true, passive: false }
    );

    const releasePointer = (e) => {
      activePointerIds.delete(e.pointerId);
    };

    stage.addEventListener('pointerup', releasePointer, { capture: true });
    stage.addEventListener('pointercancel', releasePointer, { capture: true });

    // Suppress synthetic click right after a pointerdown on the same tile so moves never double-count
    stage.addEventListener(
      'click',
      (e) => {
        const tileBtn = e.target.closest('button.puzzle-tile');
        if (!tileBtn) return;
        const slotEl = tileBtn.closest('.player-slot');
        const gridEl = tileBtn.closest('.puzzle-grid');
        if (!slotEl || !gridEl) return;

        const slot = slotEl.dataset.slot;
        const tileIdx = Array.from(gridEl.querySelectorAll('button.puzzle-tile')).indexOf(tileBtn);
        if (!slot || tileIdx < 0) return;

        const key = `${slot}:${tileIdx}`;
        const last = recentBoardTaps.get(key) || 0;
        if (performance.now() - last < RECENT_TAP_WINDOW_MS) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      },
      { capture: true }
    );
  }

  // Wrap SliderDashboard lifecycle hooks so touch-action rules stay active after re-renders
  function installHooks() {
    const api = window.SliderDashboard;
    if (!api || api.__multiTouchWrapped) return;
    api.__multiTouchWrapped = true;

    const origOnEnter = api.onEnter;
    const origStartRace = api.startRaceFromTrigger;

    api.onEnter = function (...args) {
      if (typeof origOnEnter === 'function') origOnEnter.apply(this, args);
      bindStageMultiTouch();
    };

    api.startRaceFromTrigger = function (...args) {
      if (typeof origStartRace === 'function') origStartRace.apply(this, args);
      bindStageMultiTouch();
    };

    api.refreshMultiTouch = function () {
      bindStageMultiTouch();
      applyTouchRules(document.getElementById('dashboard-stage'));
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      installHooks();
      bindStageMultiTouch();
    });
  } else {
    installHooks();
    bindStageMultiTouch();
  }
})();