(() => {
  const appEl = document.getElementById('app');
  const views = document.querySelectorAll('.spa-view');
  const navButtons = document.querySelectorAll('[data-target-view]');
  const btnTriggerCountdown = document.getElementById('btn-trigger-countdown');

  const socket = typeof io === 'function' ? io() : null;

  function showView(viewName) {
    const prevView = appEl ? appEl.dataset.view : null;

    views.forEach((view) => {
      const isMatch = view.id === `view-${viewName}`;
      view.classList.toggle('active', isMatch);
    });

    if (appEl) {
      appEl.dataset.view = viewName;
    }

    if (
      prevView === 'dashboard' &&
      viewName !== 'dashboard' &&
      window.SliderDashboard &&
      typeof window.SliderDashboard.onLeave === 'function'
    ) {
      window.SliderDashboard.onLeave();
    }

    if (
      viewName === 'dashboard' &&
      window.SliderDashboard &&
      typeof window.SliderDashboard.onEnter === 'function'
    ) {
      window.SliderDashboard.onEnter();
    }
  }

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.targetView;
      if (target) {
        showView(target);
      }
    });
  });

  function triggerDashboardRace(seconds = 3) {
    showView('dashboard');
    if (
      window.SliderDashboard &&
      typeof window.SliderDashboard.startRaceFromTrigger === 'function'
    ) {
      window.SliderDashboard.startRaceFromTrigger(seconds);
    }
  }

  // Control Panel (tablet) -> Socket.io -> Dashboard
  if (btnTriggerCountdown) {
    btnTriggerCountdown.addEventListener('click', () => {
      if (socket && socket.connected) {
        socket.emit('trigger-countdown', { seconds: 3 });
      } else {
        triggerDashboardRace(3);
      }
    });
  }

  if (socket) {
    socket.on('start-countdown', (payload = {}) => {
      const seconds = Number(payload.seconds) || 3;
      triggerDashboardRace(seconds);
    });
  }

  // Default landing screen is Main Menu
  showView('menu');
})();