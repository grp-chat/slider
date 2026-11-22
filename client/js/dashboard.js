(() => {
  const GRID_SIZE = 3;
  const SOLVED_BOARD = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  const FINAL_TILE_NUMBER = 9;

  const IMAGE_COUNT = 10;
  const IMAGE_CANDIDATE_BASES = ['/assets', 'assets', './assets'];
  const SQUARE_SIZE = 700;

  const BOARD_SCALE_MIN = 0.65;
  const BOARD_SCALE_MAX = 1.45;
  const BOARD_SCALE_STEP = 0.1;

  const state = {
    boardScale: 1,
    selectedImageIndex: 0, // 0..9 -> 1.jpg..10.jpg
    resolvedBase: '/assets',
    normalizedImages: {}, // { [index]: dataUrl }
    loadingImages: {}, // { [index]: Promise<string> }
    sampleOpen: false,
    phase: 'idle', // 'idle' | 'jumbling' | 'countdown' | 'racing' | 'finished'
    raceStartTime: 0,
    boards: {},
    finishers: [],
    timers: []
  };

  function clearAllTimers() {
    state.timers.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    state.timers = [];
  }

  function scheduleTimeout(fn, ms) {
    const id = setTimeout(fn, ms);
    state.timers.push(id);
    return id;
  }

  function scheduleInterval(fn, ms) {
    const id = setInterval(fn, ms);
    state.timers.push(id);
    return id;
  }

  function getImagePath(index, base = state.resolvedBase) {
    const safeIdx = ((index % IMAGE_COUNT) + IMAGE_COUNT) % IMAGE_COUNT;
    return `${base}/${safeIdx + 1}.jpg`;
  }

  // Center-crops non-square images and normalizes every image to a uniform SQUARE_SIZE x SQUARE_SIZE square
  function normalizeToSquareDataURL(img, size = SQUARE_SIZE) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return img.currentSrc || img.src || '';

    const w = img.naturalWidth || img.width || size;
    const h = img.naturalHeight || img.height || size;
    const side = Math.min(w, h);
    const sx = (w - side) / 2;
    const sy = (h - side) / 2;

    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.86);
  }

  function tryLoadFromCandidates(index, candidateIdx, resolve) {
    if (candidateIdx >= IMAGE_CANDIDATE_BASES.length) {
      const fallbackSrc = getImagePath(index, state.resolvedBase);
      delete state.loadingImages[index];
      resolve(fallbackSrc);
      return;
    }

    const base = IMAGE_CANDIDATE_BASES[candidateIdx];
    const src = getImagePath(index, base);
    const img = new Image();
    img.decoding = 'async';

    img.onload = () => {
      state.resolvedBase = base;
      try {
        const squareUrl = normalizeToSquareDataURL(img, SQUARE_SIZE);
        state.normalizedImages[index] = squareUrl;
        delete state.loadingImages[index];
        resolve(squareUrl);
      } catch {
        state.normalizedImages[index] = src;
        delete state.loadingImages[index];
        resolve(src);
      }
    };

    img.onerror = () => {
      tryLoadFromCandidates(index, candidateIdx + 1, resolve);
    };

    img.src = src;
  }

  function loadNormalizedPuzzleImage(index = state.selectedImageIndex) {
    const safeIdx = ((index % IMAGE_COUNT) + IMAGE_COUNT) % IMAGE_COUNT;
    if (state.normalizedImages[safeIdx]) {
      return Promise.resolve(state.normalizedImages[safeIdx]);
    }
    if (state.loadingImages[safeIdx]) {
      return state.loadingImages[safeIdx];
    }

    const promise = new Promise((resolve) => {
      tryLoadFromCandidates(safeIdx, 0, resolve);
    });

    state.loadingImages[safeIdx] = promise;
    return promise;
  }

  function preloadAllPuzzleImages() {
    for (let i = 0; i < IMAGE_COUNT; i++) {
      loadNormalizedPuzzleImage(i);
    }
  }

  function getActivePuzzleImageSrc() {
    return (
      state.normalizedImages[state.selectedImageIndex] ||
      getImagePath(state.selectedImageIndex, state.resolvedBase)
    );
  }

  function isSolved(tiles) {
    return tiles.every((val, idx) => val === SOLVED_BOARD[idx]);
  }

  function getAdjacentIndices(emptyIdx) {
    const row = Math.floor(emptyIdx / GRID_SIZE);
    const col = emptyIdx % GRID_SIZE;
    const neighbors = [];
    if (row > 0) neighbors.push((row - 1) * GRID_SIZE + col);
    if (row < GRID_SIZE - 1) neighbors.push((row + 1) * GRID_SIZE + col);
    if (col > 0) neighbors.push(row * GRID_SIZE + (col - 1));
    if (col < GRID_SIZE - 1) neighbors.push(row * GRID_SIZE + (col + 1));
    return neighbors;
  }

  // Generate a guaranteed solvable 3x3 board by applying valid blank-space slides from solved
  function createSolvableBoard(steps = 28) {
    const tiles = [...SOLVED_BOARD];
    let emptyIdx = tiles.indexOf(0);
    let prevEmptyIdx = -1;

    for (let i = 0; i < steps; i++) {
      const candidates = getAdjacentIndices(emptyIdx).filter((idx) => idx !== prevEmptyIdx);
      const nextIdx = candidates[Math.floor(Math.random() * candidates.length)];
      [tiles[emptyIdx], tiles[nextIdx]] = [tiles[nextIdx], tiles[emptyIdx]];
      prevEmptyIdx = emptyIdx;
      emptyIdx = nextIdx;
    }

    if (isSolved(tiles)) {
      return createSolvableBoard(steps);
    }
    return tiles;
  }

  function buildJumbleFrames(finalTiles, frameCount = 9) {
    const frames = [];
    for (let i = 0; i < frameCount; i++) {
      frames.push(createSolvableBoard(18));
    }
    frames.push([...finalTiles]);
    return frames;
  }

  function applyBoardScale() {
    const labelEl = document.getElementById('board-size-label');
    if (labelEl) {
      labelEl.textContent = `${Math.round(state.boardScale * 100)}%`;
    }

    Object.values(state.boards).forEach((board) => {
      if (!board.el) return;
      if (!board.el.dataset.baseSquareSize) {
        const rect = board.el.getBoundingClientRect();
        const measured = Math.min(rect.width || 280, rect.height || 280);
        board.el.dataset.baseSquareSize = String(Math.round(measured || 280));
      }
      const baseSquare = Number(board.el.dataset.baseSquareSize) || 280;
      const nextSquare = Math.round(baseSquare * state.boardScale);

      // Lock 1:1 square dimensions so width and height scale identically with zero distortion
      board.el.style.width = `${nextSquare}px`;
      board.el.style.height = `${nextSquare}px`;
      board.el.style.minWidth = `${nextSquare}px`;
      board.el.style.minHeight = `${nextSquare}px`;
      board.el.style.aspectRatio = '1 / 1';
      board.el.style.boxSizing = 'border-box';

      if (board.gridEl) {
        board.gridEl.style.width = '100%';
        board.gridEl.style.aspectRatio = '1 / 1';
      }
    });
  }

  function adjustBoardScale(delta) {
    const next = Math.min(
      BOARD_SCALE_MAX,
      Math.max(BOARD_SCALE_MIN, Number((state.boardScale + delta).toFixed(2)))
    );
    state.boardScale = next;
    applyBoardScale();
  }

  function isFullscreenActive() {
    return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function syncFullscreenButtonLabel() {
    const fsBtn = document.getElementById('btn-fullscreen-mode');
    if (!fsBtn) return;
    fsBtn.textContent = isFullscreenActive() ? 'Exit Fullscreen' : 'Fullscreen';
  }

  function toggleFullscreenMode() {
    const dashboardView = document.getElementById('view-dashboard');
    const target = dashboardView || document.documentElement;

    if (!isFullscreenActive()) {
      const req =
        target.requestFullscreen ||
        target.webkitRequestFullscreen ||
        document.documentElement.requestFullscreen;
      if (req) {
        Promise.resolve(req.call(target)).catch(() => {}).finally(syncFullscreenButtonLabel);
      }
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) {
        Promise.resolve(exit.call(document)).catch(() => {}).finally(syncFullscreenButtonLabel);
      }
    }
  }

  function getDashboardHeader() {
    const dashboardView = document.getElementById('view-dashboard');
    if (dashboardView) {
      const header = dashboardView.querySelector('.view-header');
      if (header) return header;
    }
    const stage = document.getElementById('dashboard-stage');
    if (stage && stage.parentElement) {
      return stage.parentElement.querySelector('.view-header');
    }
    return null;
  }

  function ensureHeaderControlsMounted() {
    const header = getDashboardHeader();
    if (!header) return;

    header.style.display = 'flex';
    header.style.flexWrap = 'nowrap';
    header.style.alignItems = 'center';
    header.style.gap = '8px';
    header.style.overflowX = 'auto';
    header.style.whiteSpace = 'nowrap';

    const mainMenuBtn = header.querySelector('.btn-back[data-target-view="menu"]');
    const centerHub = document.getElementById('center-hub');

    let startBtn = document.getElementById('btn-start-race');
    if (!startBtn) {
      startBtn = document.createElement('button');
      startBtn.id = 'btn-start-race';
      startBtn.type = 'button';
      startBtn.textContent = 'Start Race';
    }

    let resetBtn = document.getElementById('btn-reset-race');
    if (!resetBtn) {
      resetBtn = document.createElement('button');
      resetBtn.id = 'btn-reset-race';
      resetBtn.type = 'button';
      resetBtn.textContent = 'Reset';
    }

    // Move existing Start Race and Reset out of center-hub and into the same top header line as Main Menu
    if (mainMenuBtn && mainMenuBtn.nextSibling !== startBtn) {
      mainMenuBtn.insertAdjacentElement('afterend', startBtn);
    } else if (!mainMenuBtn && startBtn.parentElement !== header) {
      header.prepend(startBtn);
    }

    if (startBtn.nextSibling !== resetBtn) {
      startBtn.insertAdjacentElement('afterend', resetBtn);
    }

    if (centerHub) {
      centerHub.style.display = 'none';
      centerHub.setAttribute('aria-hidden', 'true');
    }

    if (!document.getElementById('dashboard-inline-controls')) {
      const inlineGroup = document.createElement('div');
      inlineGroup.id = 'dashboard-inline-controls';
      inlineGroup.style.cssText =
        'display:inline-flex;align-items:center;gap:6px;margin-left:auto;flex-shrink:0;';

      const picLabel = document.createElement('span');
      picLabel.textContent = 'Picture:';

      const imageSelect = document.createElement('select');
      imageSelect.id = 'select-puzzle-image';
      imageSelect.setAttribute('aria-label', 'Select puzzle picture 1 to 10');
      for (let i = 0; i < IMAGE_COUNT; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `Picture ${i + 1} (${i + 1}.jpg)`;
        imageSelect.appendChild(opt);
      }

      const sizeText = document.createElement('span');
      sizeText.textContent = 'Size:';

      const sizeMinusBtn = document.createElement('button');
      sizeMinusBtn.id = 'btn-board-size-minus';
      sizeMinusBtn.type = 'button';
      sizeMinusBtn.textContent = '-';
      sizeMinusBtn.setAttribute('aria-label', 'Make boards smaller');

      const sizeLabel = document.createElement('span');
      sizeLabel.id = 'board-size-label';
      sizeLabel.textContent = `${Math.round(state.boardScale * 100)}%`;
      sizeLabel.style.cssText = 'min-width:40px;text-align:center;font-variant-numeric:tabular-nums;';

      const sizePlusBtn = document.createElement('button');
      sizePlusBtn.id = 'btn-board-size-plus';
      sizePlusBtn.type = 'button';
      sizePlusBtn.textContent = '+';
      sizePlusBtn.setAttribute('aria-label', 'Make boards bigger');

      const sampleBtn = document.createElement('button');
      sampleBtn.id = 'btn-sample-puzzle';
      sampleBtn.type = 'button';
      sampleBtn.textContent = 'Sample';

      const fullscreenBtn = document.createElement('button');
      fullscreenBtn.id = 'btn-fullscreen-mode';
      fullscreenBtn.type = 'button';
      fullscreenBtn.textContent = isFullscreenActive() ? 'Exit Fullscreen' : 'Fullscreen';

      inlineGroup.append(
        picLabel,
        imageSelect,
        sizeText,
        sizeMinusBtn,
        sizeLabel,
        sizePlusBtn,
        sampleBtn,
        fullscreenBtn
      );
      header.appendChild(inlineGroup);
    }

    let sampleModal = document.getElementById('sample-preview-modal');
    if (!sampleModal) {
      sampleModal = document.createElement('div');
      sampleModal.id = 'sample-preview-modal';
      sampleModal.hidden = true;
      sampleModal.style.cssText =
        'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.82);align-items:center;justify-content:center;z-index:9999;padding:20px;';
      sampleModal.innerHTML = `
        <div style="background:#0f172a;color:#fff;padding:16px;border-radius:12px;max-width:90vw;max-height:90vh;display:flex;flex-direction:column;align-items:center;gap:12px;box-shadow:0 20px 50px rgba(0,0,0,0.6);">
          <div style="display:flex;justify-content:space-between;align-items:center;width:100%;gap:16px;">
            <strong id="sample-preview-title">Sample Puzzle</strong>
            <button id="btn-close-sample" type="button" style="padding:6px 12px;border-radius:6px;border:none;background:#334155;color:#fff;cursor:pointer;">Close</button>
          </div>
          <img id="sample-preview-img" alt="Sample puzzle image" style="width:min(70vh,70vw);height:min(70vh,70vw);object-fit:contain;border-radius:8px;background:#1e293b;" />
        </div>
      `;
      document.body.appendChild(sampleModal);
    }

    syncControlValues();
    syncFullscreenButtonLabel();
  }

  function syncControlValues() {
    const imageSelect = document.getElementById('select-puzzle-image');
    const sizeLabel = document.getElementById('board-size-label');
    if (imageSelect) imageSelect.value = String(state.selectedImageIndex);
    if (sizeLabel) sizeLabel.textContent = `${Math.round(state.boardScale * 100)}%`;
  }

  function openSamplePreview() {
    ensureHeaderControlsMounted();
    const modal = document.getElementById('sample-preview-modal');
    const imgEl = document.getElementById('sample-preview-img');
    const titleEl = document.getElementById('sample-preview-title');
    if (!modal || !imgEl) return;

    state.sampleOpen = true;
    const idx = state.selectedImageIndex;
    if (titleEl) {
      titleEl.textContent = `Sample — Picture ${idx + 1} (${idx + 1}.jpg)`;
    }
    imgEl.src = getActivePuzzleImageSrc();
    modal.hidden = false;
    modal.style.display = 'flex';

    loadNormalizedPuzzleImage(idx).then((normalizedUrl) => {
      if (state.sampleOpen && state.selectedImageIndex === idx) {
        imgEl.src = normalizedUrl;
      }
    });
  }

  function closeSamplePreview() {
    state.sampleOpen = false;
    const modal = document.getElementById('sample-preview-modal');
    if (modal) {
      modal.hidden = true;
      modal.style.display = 'none';
    }
  }

  function setSelectedImage(newIndex) {
    const parsed = Number(newIndex);
    if (Number.isNaN(parsed)) return;
    state.selectedImageIndex = ((parsed % IMAGE_COUNT) + IMAGE_COUNT) % IMAGE_COUNT;
    syncControlValues();

    loadNormalizedPuzzleImage(state.selectedImageIndex).then(() => {
      Object.values(state.boards).forEach((board) => renderBoard(board));
      if (state.sampleOpen) {
        openSamplePreview();
      }
    });

    Object.values(state.boards).forEach((board) => renderBoard(board));
  }

  function ensureBoardsMounted() {
    ensureHeaderControlsMounted();
    const stage = document.getElementById('dashboard-stage');
    if (!stage) return;

    const slots = stage.querySelectorAll('.player-slot');
    slots.forEach((slotEl) => {
      const slotName = slotEl.dataset.slot;
      const team = slotEl.dataset.team || '';

      if (!state.boards[slotName]) {
        slotEl.style.display = 'flex';
        slotEl.style.flexDirection = 'column';
        slotEl.style.aspectRatio = '1 / 1';

        slotEl.innerHTML = `
          <div class="board-header" data-drag-handle="true" style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-shrink:0;">
            <span class="board-title">${slotName.replace('-', ' ').toUpperCase()} (${team})</span>
            <div style="display:flex;align-items:center;gap:6px;">
              <button type="button" data-role="toggle-numbers" style="padding:2px 8px;font-size:12px;border-radius:4px;border:1px solid #94a3b8;background:#fff;color:#000;cursor:pointer;">Hide #</button>
              <span class="board-status" data-role="status">Ready</span>
            </div>
          </div>
          <div class="puzzle-grid" data-role="grid" style="flex:1 1 auto;min-height:0;"></div>
        `;

        const board = {
          slot: slotName,
          team,
          el: slotEl,
          gridEl: slotEl.querySelector('[data-role="grid"]'),
          statusEl: slotEl.querySelector('[data-role="status"]'),
          toggleNumBtn: slotEl.querySelector('[data-role="toggle-numbers"]'),
          tiles: [...SOLVED_BOARD],
          showNumbers: true,
          moves: 0,
          finishedAt: null
        };

        if (board.toggleNumBtn) {
          board.toggleNumBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            board.showNumbers = !board.showNumbers;
            board.toggleNumBtn.textContent = board.showNumbers ? 'Hide #' : 'Show #';
            renderBoard(board);
          });
        }

        state.boards[slotName] = board;
      }

      renderBoard(state.boards[slotName]);
    });

    applyBoardScale();
  }

  function appendTileSliceAndBadge(cell, tileNum, showNumbers) {
    const imgSrc = getActivePuzzleImageSrc();
    // Tile numbers 1..9 map to 3x3 positions 0..8
    const sourceIdx = tileNum - 1;
    const srcRow = Math.floor(sourceIdx / GRID_SIZE);
    const srcCol = sourceIdx % GRID_SIZE;

    const sliceImg = document.createElement('img');
    sliceImg.src = imgSrc;
    sliceImg.alt = `Tile ${tileNum}`;
    sliceImg.draggable = false;
    sliceImg.style.position = 'absolute';
    sliceImg.style.width = `${GRID_SIZE * 100}%`;
    sliceImg.style.height = `${GRID_SIZE * 100}%`;
    sliceImg.style.aspectRatio = '1 / 1';
    sliceImg.style.left = `-${srcCol * 100}%`;
    sliceImg.style.top = `-${srcRow * 100}%`;
    sliceImg.style.maxWidth = 'none';
    sliceImg.style.pointerEvents = 'none';

    cell.appendChild(sliceImg);

    if (showNumbers) {
      const badge = document.createElement('span');
      badge.className = 'tile-number-badge';
      badge.textContent = String(tileNum);
      badge.style.cssText =
        'position:absolute;top:4px;left:4px;z-index:2;background:#ffffff;color:#000000;border:1px solid #000000;border-radius:3px;padding:1px 5px;font-size:12px;font-weight:700;line-height:1.2;pointer-events:none;';
      cell.appendChild(badge);
    }
  }

  function renderBoard(board) {
    const { gridEl, statusEl, tiles, finishedAt, showNumbers } = board;
    if (!gridEl) return;

    const isCompleted = finishedAt !== null;

    gridEl.style.display = 'grid';
    gridEl.style.gridTemplateColumns = `repeat(${GRID_SIZE}, minmax(0, 1fr))`;
    gridEl.style.gridTemplateRows = `repeat(${GRID_SIZE}, minmax(0, 1fr))`;
    gridEl.innerHTML = '';

    tiles.forEach((value, idx) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'puzzle-tile';
      cell.style.position = 'relative';
      cell.style.overflow = 'hidden';
      cell.style.padding = '0';
      cell.style.aspectRatio = '1 / 1';

      if (value === 0 && isCompleted) {
        // Reveal the 9th tile once this player finishes the puzzle
        appendTileSliceAndBadge(cell, FINAL_TILE_NUMBER, showNumbers);
        cell.disabled = true;
      } else if (value === 0) {
        cell.classList.add('is-empty');
        cell.disabled = true;
        cell.setAttribute('aria-label', 'Empty space');
      } else {
        appendTileSliceAndBadge(cell, value, showNumbers);
        // Intentionally NO movable-tile highlight class (is-movable omitted)
        cell.disabled = state.phase !== 'racing' || isCompleted;

        cell.addEventListener('click', () => {
          handleTileTap(board, idx);
        });
      }

      gridEl.appendChild(cell);
    });

    if (statusEl) {
      if (finishedAt !== null) {
        const rank = state.finishers.indexOf(board.slot) + 1;
        const sec = ((finishedAt - state.raceStartTime) / 1000).toFixed(2);
        statusEl.textContent = `#${rank} • ${sec}s`;
      } else if (state.phase === 'jumbling') {
        statusEl.textContent = 'Jumbling...';
      } else if (state.phase === 'countdown') {
        statusEl.textContent = 'Get Ready';
      } else if (state.phase === 'racing') {
        statusEl.textContent = 'Racing';
      } else {
        statusEl.textContent = 'Ready';
      }
    }
  }

  function handleTileTap(board, tileIdx) {
    if (state.phase !== 'racing' || board.finishedAt !== null) return;

    const emptyIdx = board.tiles.indexOf(0);
    const adjacent = getAdjacentIndices(emptyIdx);
    if (!adjacent.includes(tileIdx)) return;

    [board.tiles[emptyIdx], board.tiles[tileIdx]] = [board.tiles[tileIdx], board.tiles[emptyIdx]];
    board.moves += 1;

    if (isSolved(board.tiles)) {
      board.finishedAt = performance.now();
      if (!state.finishers.includes(board.slot)) {
        state.finishers.push(board.slot);
      }

      // Independent player finishes: each player finishes on their own while others keep racing
      const allBoards = Object.values(state.boards);
      const allFinished = allBoards.length > 0 && allBoards.every((b) => b.finishedAt !== null);

      if (allFinished) {
        state.phase = 'finished';
        allBoards.forEach((b) => renderBoard(b));
        announceAllFinished(board);
        return;
      }

      renderBoard(board);
      return;
    }

    renderBoard(board);
  }

  function announceAllFinished(lastFinisherBoard) {
    const overlay = document.getElementById('countdown-overlay');
    const valueEl = document.getElementById('countdown-value');
    if (!overlay || !valueEl) return;

    const firstSlot = state.finishers[0] || lastFinisherBoard.slot;
    const firstBoard = state.boards[firstSlot] || lastFinisherBoard;
    const elapsedSec = ((firstBoard.finishedAt - state.raceStartTime) / 1000).toFixed(2);
    valueEl.textContent = `${firstSlot.toUpperCase()} #1 (${elapsedSec}s) • ALL DONE`;
    overlay.hidden = false;

    scheduleTimeout(() => {
      if (state.phase === 'finished') {
        overlay.hidden = true;
      }
    }, 2400);
  }

  function runFastJumbleThenCountdown(seconds = 3) {
    clearAllTimers();
    ensureBoardsMounted();
    loadNormalizedPuzzleImage(state.selectedImageIndex);

    const overlay = document.getElementById('countdown-overlay');
    const countdownValue = document.getElementById('countdown-value');

    state.phase = 'jumbling';
    state.finishers = [];
    state.raceStartTime = 0;

    const boardEntries = Object.values(state.boards);
    const sequences = boardEntries.map((board) => {
      board.moves = 0;
      board.finishedAt = null;
      const finalTiles = createSolvableBoard(30);
      return {
        board,
        frames: buildJumbleFrames(finalTiles, 9)
      };
    });

    boardEntries.forEach((b) => renderBoard(b));

    const totalFrames = sequences[0] ? sequences[0].frames.length : 1;
    const frameIntervalMs = 50;

    let step = 0;
    const jumbleTimer = scheduleInterval(() => {
      sequences.forEach(({ board, frames }) => {
        board.tiles = [...frames[Math.min(step, frames.length - 1)]];
        renderBoard(board);
      });

      step += 1;
      if (step >= totalFrames) {
        clearInterval(jumbleTimer);
        startSyncedCountdown(seconds, overlay, countdownValue);
      }
    }, frameIntervalMs);
  }

  function startSyncedCountdown(seconds, overlay, countdownValue) {
    state.phase = 'countdown';
    Object.values(state.boards).forEach((b) => renderBoard(b));

    if (!overlay || !countdownValue) {
      beginRace();
      return;
    }

    let current = seconds;
    countdownValue.textContent = String(current);
    overlay.hidden = false;

    const cdTimer = scheduleInterval(() => {
      current -= 1;
      if (current > 0) {
        countdownValue.textContent = String(current);
      } else if (current === 0) {
        countdownValue.textContent = 'GO!';
      } else {
        clearInterval(cdTimer);
        overlay.hidden = true;
        beginRace();
      }
    }, 800);
  }

  function beginRace() {
    state.phase = 'racing';
    state.raceStartTime = performance.now();
    Object.values(state.boards).forEach((b) => renderBoard(b));
  }

  function resetDashboard() {
    clearAllTimers();
    closeSamplePreview();
    state.phase = 'idle';
    state.finishers = [];
    state.raceStartTime = 0;

    const overlay = document.getElementById('countdown-overlay');
    if (overlay) overlay.hidden = true;

    ensureBoardsMounted();
    Object.values(state.boards).forEach((board) => {
      board.tiles = [...SOLVED_BOARD];
      board.moves = 0;
      board.finishedAt = null;
      renderBoard(board);
    });
  }

  function bindDashboardButtons() {
    const btnStart = document.getElementById('btn-start-race');
    const btnReset = document.getElementById('btn-reset-race');
    const btnSample = document.getElementById('btn-sample-puzzle');
    const btnFullscreen = document.getElementById('btn-fullscreen-mode');
    const btnCloseSample = document.getElementById('btn-close-sample');
    const sampleModal = document.getElementById('sample-preview-modal');
    const imageSelect = document.getElementById('select-puzzle-image');
    const btnSizeMinus = document.getElementById('btn-board-size-minus');
    const btnSizePlus = document.getElementById('btn-board-size-plus');

    if (btnStart && !btnStart.dataset.boundDashboard) {
      btnStart.dataset.boundDashboard = 'true';
      btnStart.addEventListener('click', () => {
        runFastJumbleThenCountdown(3);
      });
    }

    if (btnReset && !btnReset.dataset.boundDashboard) {
      btnReset.dataset.boundDashboard = 'true';
      btnReset.addEventListener('click', () => {
        resetDashboard();
      });
    }

    if (btnSample && !btnSample.dataset.boundDashboard) {
      btnSample.dataset.boundDashboard = 'true';
      btnSample.addEventListener('click', () => {
        openSamplePreview();
      });
    }

    if (btnFullscreen && !btnFullscreen.dataset.boundDashboard) {
      btnFullscreen.dataset.boundDashboard = 'true';
      btnFullscreen.addEventListener('click', () => {
        toggleFullscreenMode();
      });
    }

    if (!document.body.dataset.boundFullscreenSync) {
      document.body.dataset.boundFullscreenSync = 'true';
      document.addEventListener('fullscreenchange', syncFullscreenButtonLabel);
      document.addEventListener('webkitfullscreenchange', syncFullscreenButtonLabel);
    }

    if (btnCloseSample && !btnCloseSample.dataset.boundDashboard) {
      btnCloseSample.dataset.boundDashboard = 'true';
      btnCloseSample.addEventListener('click', () => {
        closeSamplePreview();
      });
    }

    if (sampleModal && !sampleModal.dataset.boundDashboard) {
      sampleModal.dataset.boundDashboard = 'true';
      sampleModal.addEventListener('click', (e) => {
        if (e.target === sampleModal) {
          closeSamplePreview();
        }
      });
    }

    if (imageSelect && !imageSelect.dataset.boundDashboard) {
      imageSelect.dataset.boundDashboard = 'true';
      imageSelect.addEventListener('change', (e) => {
        setSelectedImage(e.target.value);
      });
    }

    if (btnSizeMinus && !btnSizeMinus.dataset.boundDashboard) {
      btnSizeMinus.dataset.boundDashboard = 'true';
      btnSizeMinus.addEventListener('click', () => {
        adjustBoardScale(-BOARD_SCALE_STEP);
      });
    }

    if (btnSizePlus && !btnSizePlus.dataset.boundDashboard) {
      btnSizePlus.dataset.boundDashboard = 'true';
      btnSizePlus.addEventListener('click', () => {
        adjustBoardScale(BOARD_SCALE_STEP);
      });
    }
  }

  window.SliderDashboard = {
    onEnter() {
      ensureBoardsMounted();
      bindDashboardButtons();
      preloadAllPuzzleImages();
    },
    onLeave() {
      clearAllTimers();
      closeSamplePreview();
      const overlay = document.getElementById('countdown-overlay');
      if (overlay) overlay.hidden = true;
      if (state.phase !== 'idle') {
        state.phase = 'idle';
        Object.values(state.boards).forEach((b) => renderBoard(b));
      }
    },
    startRaceFromTrigger(seconds = 3) {
      ensureBoardsMounted();
      bindDashboardButtons();
      runFastJumbleThenCountdown(seconds);
    },
    setPuzzleImage(index) {
      setSelectedImage(index);
    },
    openSample() {
      openSamplePreview();
    },
    toggleFullscreen: toggleFullscreenMode,
    slideTile(slotName, tileIdx) {
      const board = state.boards[slotName];
      if (!board) return false;
      const beforeMoves = board.moves;
      handleTileTap(board, tileIdx);
      return board.moves > beforeMoves;
    },
    getState() {
      return {
        phase: state.phase,
        boardScale: state.boardScale,
        selectedImageIndex: state.selectedImageIndex + 1,
        finishers: [...state.finishers]
      };
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    ensureBoardsMounted();
    bindDashboardButtons();
    preloadAllPuzzleImages();
  });
})();