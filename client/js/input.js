(() => {
  const TWO_PLAYER_MIN_TOUCHES = 2;
  const FOUR_PLAYER_MIN_TOUCHES = 4;

  const activePointers = new Map(); // pointerId -> { id, type, x, y, color }
  const PALETTE = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2'];

  let peakTouches = 0;
  let passedTwoPlayers = false;
  let passedFourPlayers = false;

  function pickColor(pointerId) {
    const idx = Math.abs(Number(pointerId) || 0) % PALETTE.length;
    return PALETTE[idx];
  }

  function getPad() {
    return document.getElementById('input-check-pad');
  }

  function getStatusEl() {
    return document.getElementById('input-check-status');
  }

  function ensureResetButton() {
    const view = document.getElementById('view-input-check');
    const pad = getPad();
    if (!view || !pad || document.getElementById('btn-reset-input-check')) return;

    const btn = document.createElement('button');
    btn.id = 'btn-reset-input-check';
    btn.type = 'button';
    btn.textContent = 'Reset Peak Test';
    btn.style.cssText =
      'margin-bottom:10px;padding:6px 12px;border-radius:6px;border:1px solid #475569;background:#1e293b;color:#fff;font-weight:600;cursor:pointer;';

    btn.addEventListener('click', () => {
      resetPeakTest();
    });

    pad.parentNode.insertBefore(btn, pad);
  }

  function resetPeakTest() {
    peakTouches = activePointers.size;
    passedTwoPlayers = peakTouches >= TWO_PLAYER_MIN_TOUCHES;
    passedFourPlayers = peakTouches >= FOUR_PLAYER_MIN_TOUCHES;
    renderInputCheck();
  }

  function updateStatusText() {
    const statusEl = getStatusEl();
    if (!statusEl) return;

    const activeCount = activePointers.size;
    if (activeCount > peakTouches) {
      peakTouches = activeCount;
    }
    if (peakTouches >= TWO_PLAYER_MIN_TOUCHES) {
      passedTwoPlayers = true;
    }
    if (peakTouches >= FOUR_PLAYER_MIN_TOUCHES) {
      passedFourPlayers = true;
    }

    const twoPlayerText = passedTwoPlayers ? 'PASS (2+)' : 'WAIT (need 2)';
    const fourPlayerText = passedFourPlayers ? 'PASS (4+)' : 'WAIT (need 4)';

    statusEl.textContent =
      `Active: ${activeCount} | Peak: ${peakTouches} | ` +
      `2-Player Check: ${twoPlayerText} | 4-Player Check: ${fourPlayerText}`;
  }

  function renderTouchMarkers(pad) {
    if (!pad) return;

    pad.style.position = 'relative';
    pad.style.touchAction = 'none';
    pad.style.userSelect = 'none';
    pad.style.webkitUserSelect = 'none';
    pad.style.overflow = 'hidden';

    let layer = pad.querySelector('[data-role="touch-markers-layer"]');
    if (!layer) {
      layer = document.createElement('div');
      layer.dataset.role = 'touch-markers-layer';
      layer.style.cssText =
        'position:absolute;inset:0;pointer-events:none;z-index:2;';
      pad.appendChild(layer);
    }

    let badgeBar = pad.querySelector('[data-role="touch-check-badges"]');
    if (!badgeBar) {
      badgeBar = document.createElement('div');
      badgeBar.dataset.role = 'touch-check-badges';
      badgeBar.style.cssText =
        'position:absolute;top:10px;left:10px;right:10px;display:flex;flex-wrap:wrap;gap:8px;pointer-events:none;z-index:3;font-size:13px;font-weight:700;';
      pad.appendChild(badgeBar);
    }

    const twoOk = activePointers.size >= TWO_PLAYER_MIN_TOUCHES || passedTwoPlayers;
    const fourOk = activePointers.size >= FOUR_PLAYER_MIN_TOUCHES || passedFourPlayers;

    badgeBar.innerHTML = `
      <span style="padding:4px 10px;border-radius:999px;background:${twoOk ? '#16a34a' : '#334155'};color:#fff;">
        2 Players (2+ fingers): ${twoOk ? 'OK' : 'Testing'}
      </span>
      <span style="padding:4px 10px;border-radius:999px;background:${fourOk ? '#16a34a' : '#334155'};color:#fff;">
        4 Players (4+ fingers): ${fourOk ? 'OK' : 'Testing'}
      </span>
      <span style="padding:4px 10px;border-radius:999px;background:#0f172a;color:#fff;border:1px solid #475569;">
        Fingers Down: ${activePointers.size} (Max: ${peakTouches})
      </span>
    `;

    layer.innerHTML = '';
    activePointers.forEach((pt) => {
      const marker = document.createElement('div');
      marker.style.cssText = [
        'position:absolute;',
        `left:${pt.x}px;`,
        `top:${pt.y}px;`,
        'width:64px;',
        'height:64px;',
        'margin-left:-32px;',
        'margin-top:-32px;',
        'border-radius:50%;',
        `border:3px solid ${pt.color};`,
        'background:rgba(255,255,255,0.22);',
        'display:flex;',
        'align-items:center;',
        'justify-content:center;',
        'color:#fff;',
        'background-color:rgba(15,23,42,0.78);',
        'font-size:12px;',
        'font-weight:700;',
        'box-shadow:0 4px 14px rgba(0,0,0,0.35);'
      ].join('');
      marker.textContent = `#${pt.id}`;
      layer.appendChild(marker);
    });
  }

  function renderInputCheck() {
    ensureResetButton();
    updateStatusText();
    renderTouchMarkers(getPad());
  }

  function recordPointerPosition(pad, e) {
    const rect = pad.getBoundingClientRect();
    activePointers.set(e.pointerId, {
      id: e.pointerId,
      type: e.pointerType || 'touch',
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      color: pickColor(e.pointerId)
    });
  }

  function bindInputCheckPad() {
    const pad = getPad();
    if (!pad) return;

    ensureResetButton();
    pad.style.touchAction = 'none';

    if (!pad.dataset.boundInputCheck) {
      pad.dataset.boundInputCheck = 'true';

      pad.addEventListener(
        'pointerdown',
        (e) => {
          if (e.pointerType === 'touch' || e.pointerType === 'pen') {
            e.preventDefault();
          }
          try {
            pad.setPointerCapture(e.pointerId);
          } catch {
            // Ignore if synthetic/un-capturable pointer
          }
          recordPointerPosition(pad, e);
          renderInputCheck();
        },
        { passive: false }
      );

      pad.addEventListener(
        'pointermove',
        (e) => {
          if (!activePointers.has(e.pointerId)) return;
          if (e.pointerType === 'touch' || e.pointerType === 'pen') {
            e.preventDefault();
          }
          recordPointerPosition(pad, e);
          renderInputCheck();
        },
        { passive: false }
      );

      const handleRelease = (e) => {
        if (!activePointers.has(e.pointerId)) return;
        activePointers.delete(e.pointerId);
        renderInputCheck();
      };

      pad.addEventListener('pointerup', handleRelease);
      pad.addEventListener('pointercancel', handleRelease);
      pad.addEventListener('lostpointercapture', handleRelease);
    }

    renderInputCheck();
  }

  window.SliderInputCheck = {
    onEnter() {
      bindInputCheckPad();
    },
    onLeave() {
      activePointers.clear();
      renderInputCheck();
    },
    resetPeak: resetPeakTest,
    getStats() {
      return {
        activeTouches: activePointers.size,
        peakTouches,
        twoPlayerReady: passedTwoPlayers,
        fourPlayerReady: passedFourPlayers
      };
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindInputCheckPad);
  } else {
    bindInputCheckPad();
  }
})();