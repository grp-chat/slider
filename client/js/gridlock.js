(() => {
  const DEFAULT_GRID_STEP_PX = 12; // Fine snap step for straight alignment

  const state = {
    stepPx: DEFAULT_GRID_STEP_PX,
    showGuidesWhileDragging: true,
    activeDrag: null // { slotEl, pointerId, offsetX, offsetY, stageRect }
  };

  function snapValue(val, step) {
    return Math.round(val / step) * step;
  }

  function getStage() {
    return document.getElementById('dashboard-stage');
  }

  function isRaceLocked() {
    const api = window.SliderDashboard;
    if (!api || typeof api.getState !== 'function') return false;
    const { phase } = api.getState();
    return phase === 'racing' || phase === 'jumbling' || phase === 'countdown';
  }

  function ensureGridOverlay(stage) {
    if (!stage) return null;
    let overlay = stage.querySelector('[data-role="gridlock-overlay"]');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.dataset.role = 'gridlock-overlay';
      overlay.style.cssText = [
        'position:absolute;',
        'inset:0;',
        'pointer-events:none;',
        'z-index:1;',
        'opacity:0;',
        'transition:opacity 120ms ease;'
      ].join('');
      stage.prepend(overlay);
    }

    const step = state.stepPx;
    overlay.style.backgroundImage = [
      `linear-gradient(to right, rgba(148, 163, 184, 0.16) 1px, transparent 1px)`,
      `linear-gradient(to bottom, rgba(148, 163, 184, 0.16) 1px, transparent 1px)`
    ].join(', ');
    overlay.style.backgroundSize = `${step}px ${step}px`;
    return overlay;
  }

  function setGridOverlayVisible(stage, visible) {
    const overlay = ensureGridOverlay(stage);
    if (!overlay) return;
    overlay.style.opacity = visible && state.showGuidesWhileDragging ? '1' : '0';
  }

  function snapSlotToGrid(slotEl, stageRect, rawLeft, rawTop) {
    const step = state.stepPx;
    const maxLeft = Math.max(0, stageRect.width - slotEl.offsetWidth);
    const maxTop = Math.max(0, stageRect.height - slotEl.offsetHeight);

    const snappedLeft = Math.max(0, Math.min(snapValue(rawLeft, step), maxLeft));
    const snappedTop = Math.max(0, Math.min(snapValue(rawTop, step), maxTop));

    slotEl.style.left = `${snappedLeft}px`;
    slotEl.style.top = `${snappedTop}px`;
    slotEl.style.right = 'auto';
    slotEl.style.bottom = 'auto';
  }

  function bindSlotGridDrag(slotEl, stage) {
    if (!slotEl || slotEl.dataset.boundGridLock) return;
    slotEl.dataset.boundGridLock = 'true';

    const handle = slotEl.querySelector('[data-drag-handle="true"]') || slotEl;

    handle.addEventListener(
      'pointerdown',
      (e) => {
        if (isRaceLocked()) return;
        if (e.target.closest('button')) return;
        if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;

        const stageRect = stage.getBoundingClientRect();
        const slotRect = slotEl.getBoundingClientRect();

        if (getComputedStyle(stage).position === 'static') {
          stage.style.position = 'relative';
        }
        if (getComputedStyle(slotEl).position === 'static') {
          slotEl.style.position = 'absolute';
          slotEl.style.left = `${Math.max(0, slotRect.left - stageRect.left)}px`;
          slotEl.style.top = `${Math.max(0, slotRect.top - stageRect.top)}px`;
        }

        slotEl.style.zIndex = '3';

        state.activeDrag = {
          slotEl,
          pointerId: e.pointerId,
          offsetX: e.clientX - slotRect.left,
          offsetY: e.clientY - slotRect.top,
          stageRect
        };

        try {
          slotEl.setPointerCapture(e.pointerId);
        } catch {
          // Safe fallback if pointer capture is unavailable
        }

        setGridOverlayVisible(stage, true);
      },
      { capture: true }
    );

    slotEl.addEventListener(
      'pointermove',
      (e) => {
        const drag = state.activeDrag;
        if (!drag || drag.slotEl !== slotEl || drag.pointerId !== e.pointerId) return;
        if (isRaceLocked()) {
          slotEl.style.zIndex = '';
          state.activeDrag = null;
          setGridOverlayVisible(stage, false);
          return;
        }

        const rawLeft = e.clientX - drag.stageRect.left - drag.offsetX;
        const rawTop = e.clientY - drag.stageRect.top - drag.offsetY;
        snapSlotToGrid(slotEl, drag.stageRect, rawLeft, rawTop);
      },
      { capture: true }
    );

    const finishDrag = (e) => {
      const drag = state.activeDrag;
      if (!drag || drag.slotEl !== slotEl || drag.pointerId !== e.pointerId) return;

      const rawLeft = e.clientX - drag.stageRect.left - drag.offsetX;
      const rawTop = e.clientY - drag.stageRect.top - drag.offsetY;
      snapSlotToGrid(slotEl, drag.stageRect, rawLeft, rawTop);

      slotEl.style.zIndex = '';
      state.activeDrag = null;
      setGridOverlayVisible(stage, false);
    };

    slotEl.addEventListener('pointerup', finishDrag, { capture: true });
    slotEl.addEventListener('pointercancel', finishDrag, { capture: true });
    slotEl.addEventListener('lostpointercapture', finishDrag, { capture: true });
  }

  function initGridLock() {
    const stage = getStage();
    if (!stage) return;

    ensureGridOverlay(stage);
    stage.querySelectorAll('.player-slot').forEach((slotEl) => {
      bindSlotGridDrag(slotEl, stage);
    });
  }

  function installHooks() {
    const api = window.SliderDashboard;
    if (!api || api.__gridLockWrapped) return;
    api.__gridLockWrapped = true;

    const origOnEnter = api.onEnter;
    api.onEnter = function (...args) {
      if (typeof origOnEnter === 'function') origOnEnter.apply(this, args);
      initGridLock();
    };
  }

  window.SliderGridLock = {
    setGridStep(px) {
      const next = Number(px);
      if (!Number.isFinite(next) || next < 2) return;
      state.stepPx = Math.round(next);
      ensureGridOverlay(getStage());
    },
    getGridStep() {
      return state.stepPx;
    },
    setShowGuides(enabled) {
      state.showGuidesWhileDragging = Boolean(enabled);
      if (!state.showGuidesWhileDragging) {
        setGridOverlayVisible(getStage(), false);
      }
    },
    refresh: initGridLock
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      installHooks();
      initGridLock();
    });
  } else {
    installHooks();
    initGridLock();
  }
})();