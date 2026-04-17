window.addEventListener("DOMContentLoaded", function () {
  if (!window.api) {
    alert("Ошибка: preload.js не загрузился");
    return;
  }

  var heroes = window.api.getHeroes();
  var maps = (window.api.getValoMaps ? window.api.getValoMaps() : []).slice().sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
  var agents = window.api.getValoAgents ? window.api.getValoAgents() : [];

  var ROLE_NAMES = ["Carry", "Mid", "Offlane", "Soft Support", "Hard Support"];
  var MAX_ROLE_REROLLS = 3;
  var CASE_DURATION = 2700;
  var DEFAULT_AGENT_SIZE = 56;
  var MIN_AGENT_SIZE = 25;
  var MAX_AGENT_SIZE = 140;

  var SERVERS = [
    "wss://dvt-server-production.up.railway.app",
    "ws://127.0.0.1:3010",
    "ws://localhost:3010"
  ];

  var els = {
    homeBtn: document.getElementById("homeBtn"),
    modeHeroPicker: document.getElementById("modeHeroPicker"),
    modeValoTac: document.getElementById("modeValoTac"),
    modeUpdates: document.getElementById("modeUpdates"),
    heroPickerControls: document.getElementById("heroPickerControls"),
    valoTacControls: document.getElementById("valoTacControls"),

    homeView: document.getElementById("homeView"),
    heroPickerView: document.getElementById("heroPickerView"),
    valoTacView: document.getElementById("valoTacView"),
    updatesView: document.getElementById("updatesView"),

    modeSelect: document.getElementById("mode"),
    randomBtn: document.getElementById("randomBtn"),
    heroCards: document.getElementById("heroCards"),
    heroEmptyState: document.getElementById("heroEmptyState"),
    resetContainer: document.getElementById("resetContainer"),
    resetRerollBtn: document.getElementById("resetRerollBtn"),

    toggleMapListBtn: document.getElementById("toggleMapListBtn"),
    valoMapDropdown: document.getElementById("valoMapDropdown"),
    valoMapList: document.getElementById("valoMapList"),

    toggleAgentListBtn: document.getElementById("toggleAgentListBtn"),
    agentDropdown: document.getElementById("agentDropdown"),
    agentTray: document.getElementById("agentTray"),

    openOnlineModalBtn: document.getElementById("openOnlineModalBtn"),
    onlineModalOverlay: document.getElementById("onlineModalOverlay"),
    onlineModal: document.getElementById("onlineModal"),
    closeOnlineModalBtn: document.getElementById("closeOnlineModalBtn"),

    colorPalette: document.getElementById("colorPalette"),
    brushSize: document.getElementById("brushSize"),
    eraserSize: document.getElementById("eraserSize"),
    brushSizeValue: document.getElementById("brushSizeValue"),
    eraserSizeValue: document.getElementById("eraserSizeValue"),
    undoMapBtn: document.getElementById("undoMapBtn"),
    clearMapBtn: document.getElementById("clearMapBtn"),
    toggleTipsBtn: document.getElementById("toggleTipsBtn"),
    valoTipsDropdown: document.getElementById("valoTipsDropdown"),
    valoEmptyState: document.getElementById("valoEmptyState"),
    tacBoardWrap: document.getElementById("tacBoardWrap"),
    tacBoard: document.getElementById("tacBoard"),
    valoMapImage: document.getElementById("valoMapImage"),
    valoCanvas: document.getElementById("valoCanvas"),
    valoStatus: document.getElementById("valoStatus"),
    agentLayer: document.getElementById("agentLayer"),
    agentSearchOverlay: document.getElementById("agentSearchOverlay"),
    agentSearchInput: document.getElementById("agentSearchInput"),
    agentSearchResults: document.getElementById("agentSearchResults"),

    lobbyNameInput: document.getElementById("lobbyNameInput"),
    roomCodeInput: document.getElementById("roomCodeInput"),
    createLobbyBtn: document.getElementById("createLobbyBtn"),
    joinLobbyBtn: document.getElementById("joinLobbyBtn"),
    copyRoomCodeBtn: document.getElementById("copyRoomCodeBtn"),
    leaveLobbyBtn: document.getElementById("leaveLobbyBtn"),
    lobbyStatusText: document.getElementById("lobbyStatusText"),
    lobbyParticipants: document.getElementById("lobbyParticipants"),

    valoTacPlayersList: document.getElementById("valoTacPlayersList"),

    appVersionText: document.getElementById("appVersionText"),
    updateStatusBox: document.getElementById("updateStatusBox"),
    updateStatusText: document.getElementById("updateStatusText"),
    updateProgressWrap: document.getElementById("updateProgressWrap"),
    updateProgressBar: document.getElementById("updateProgressBar"),
    checkUpdatesBtn: document.getElementById("checkUpdatesBtn"),
    installUpdateBtn: document.getElementById("installUpdateBtn")
  };

  var state = {
    view: "home",
    activeServerUrl: SERVERS[0],
    heroPicker: {
      mode: 0,
      cards: [],
      isRolling: false,
      hasRolledOnce: false,
      showResetButton: false
    },
    valoTac: {
      currentMapId: null,
      colorIndex: 0,
      colors: Array.prototype.map.call(els.colorPalette.querySelectorAll(".color-swatch"), function (node) {
        return node.dataset.color;
      }),
      color: "#0a84ff",
      brushSize: Number(els.brushSize.value || 5),
      eraserSize: Number(els.eraserSize.value || 14),
      isDrawing: false,
      isPanning: false,
      isErasing: false,
      panX: 0,
      panY: 0,
      zoom: 1,
      minZoom: 0.35,
      maxZoom: 2.6,
      startPanX: 0,
      startPanY: 0,
      originPanX: 0,
      originPanY: 0,
      ctx: els.valoCanvas.getContext("2d"),
      agents: [],
      draggingAgentId: null,
      hoveredAgentId: null,
      dragOffsetX: 0,
      dragOffsetY: 0,
      searchOpen: false,
      searchQuery: "",
      searchActiveIndex: 0,
      filteredAgents: agents.slice(),

      strokes: [],
      currentStroke: null,
      remoteLiveStrokes: {},
      pendingDrawPoints: [],
      drawFlushFrame: 0,
      agentMoveFrame: 0,
      lastMovedAgentId: null,

      multiplayer: {
        socket: null,
        isConnected: false,
        roomCode: "",
        userId: "",
        isHost: false,
        ownerId: "",
        participants: []
      }
    },
    ui: {
      onlineModalOpen: false,
      updateReady: false
    }
  };

  function heroLabel(hero) {
    return String(hero).replace(/_/g, " ");
  }

  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(null, args);
      }, delay);
    };
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function makeId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function normalizeRoomCode(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 12);
  }

  function renderValoTacPlayers() {
    if (!els.valoTacPlayersList) return;

    var list = state.valoTac.multiplayer.participants || [];
    var selfId = state.valoTac.multiplayer.userId;
    var ownerId = state.valoTac.multiplayer.ownerId;

    if (!list.length) {
      els.valoTacPlayersList.innerHTML = '<div class="players-corner-empty">Offline</div>';
      return;
    }

    els.valoTacPlayersList.innerHTML = list.map(function (user) {
      var classes = ["players-corner-chip"];
      if (user.userId === selfId) classes.push("you");
      if (user.userId === ownerId) classes.push("host");

      var suffix = [];
      if (user.userId === selfId) suffix.push("you");
      if (user.userId === ownerId) suffix.push("host");

      return '<div class="' + classes.join(" ") + '">' +
        user.name +
        (suffix.length ? " • " + suffix.join(" • ") : "") +
      "</div>";
    }).join("");
  }

  function setUpdateUiState(type, message, percent) {
    if (!els.updateStatusBox || !els.updateStatusText) return;

    els.updateStatusBox.classList.remove("idle", "checking", "available", "ready", "error");
    els.updateStatusBox.classList.add(type || "idle");
    els.updateStatusText.textContent = message || "";

    if (typeof percent === "number") {
      els.updateProgressWrap.classList.remove("hidden");
      els.updateProgressBar.style.width = Math.max(0, Math.min(100, percent)) + "%";
    } else {
      els.updateProgressWrap.classList.add("hidden");
      els.updateProgressBar.style.width = "0%";
    }

    if (type === "ready" || type === "available") {
      els.modeUpdates.classList.add("has-update");
    }

    if (type === "idle" || type === "checking") {
      if (!state.ui.updateReady) {
        els.modeUpdates.classList.remove("has-update");
      }
    }

    if (type === "error") {
      if (!state.ui.updateReady) {
        els.modeUpdates.classList.remove("has-update");
      }
    }
  }

  function bindUpdaterUi() {
    if (window.electronUpdates) {
      window.electronUpdates.getVersion().then(function (version) {
        if (els.appVersionText) {
          els.appVersionText.textContent = version || "unknown";
        }
      }).catch(function () {
        if (els.appVersionText) {
          els.appVersionText.textContent = "unknown";
        }
      });

      window.electronUpdates.onStatus(function (payload) {
        if (!payload) return;

        if (payload.type === "checking") {
          state.ui.updateReady = false;
          els.installUpdateBtn.classList.add("hidden");
          setUpdateUiState("checking", payload.message || "Проверка обновлений...");
          return;
        }

        if (payload.type === "available") {
          state.ui.updateReady = false;
          els.installUpdateBtn.classList.add("hidden");
          setUpdateUiState("available", payload.message || "Найдено обновление.");
          return;
        }

        if (payload.type === "progress") {
          state.ui.updateReady = false;
          els.installUpdateBtn.classList.add("hidden");
          setUpdateUiState("available", payload.message || "Скачивание обновления...", payload.percent || 0);
          return;
        }

        if (payload.type === "downloaded") {
          state.ui.updateReady = true;
          els.installUpdateBtn.classList.remove("hidden");
          els.modeUpdates.classList.add("has-update");
          setUpdateUiState("ready", payload.message || "Обновление скачано.");
          return;
        }

        if (payload.type === "not-available" || payload.type === "none") {
          state.ui.updateReady = false;
          els.installUpdateBtn.classList.add("hidden");
          els.modeUpdates.classList.remove("has-update");
          setUpdateUiState("idle", payload.message || "Обновлений не найдено.");
          return;
        }

        if (payload.type === "error") {
          state.ui.updateReady = false;
          els.installUpdateBtn.classList.add("hidden");
          els.modeUpdates.classList.remove("has-update");
          setUpdateUiState("error", payload.message || "Ошибка обновления.");
        }
      });

      if (els.checkUpdatesBtn) {
        els.checkUpdatesBtn.addEventListener("click", function () {
          window.electronUpdates.checkNow().then(function (result) {
            if (result && result.dev) {
              setUpdateUiState("idle", "В dev-режиме автообновление отключено.");
            }
          }).catch(function () {
            setUpdateUiState("error", "Не удалось проверить обновления.");
          });
        });
      }

      if (els.installUpdateBtn) {
        els.installUpdateBtn.addEventListener("click", function () {
          window.electronUpdates.installNow().catch(function () {
            setUpdateUiState("error", "Не удалось установить обновление.");
          });
        });
      }
    } else {
      if (els.appVersionText) {
        els.appVersionText.textContent = "unknown";
      }
      setUpdateUiState("idle", "Модуль обновлений недоступен.");
    }
  }

  function fitHeroName(node) {
    if (!node) return;
    node.classList.remove("shrink-1", "shrink-2", "shrink-3");

    if (node.scrollWidth <= node.clientWidth) return;
    node.classList.add("shrink-1");
    if (node.scrollWidth <= node.clientWidth) return;
    node.classList.add("shrink-2");
    if (node.scrollWidth <= node.clientWidth) return;
    node.classList.add("shrink-3");
  }

  function fitAllHeroNames() {
    Array.prototype.forEach.call(document.querySelectorAll(".hero-name"), function (node) {
      fitHeroName(node);
    });
  }

  function setView(nextView) {
    state.view = nextView;

    els.homeView.classList.toggle("active", nextView === "home");
    els.heroPickerView.classList.toggle("active", nextView === "hero-picker");
    els.valoTacView.classList.toggle("active", nextView === "valotac");
    els.updatesView.classList.toggle("active", nextView === "updates");

    els.modeHeroPicker.classList.toggle("active", nextView === "hero-picker");
    els.modeValoTac.classList.toggle("active", nextView === "valotac");
    els.modeUpdates.classList.toggle("active", nextView === "updates");

    toggleControls(els.heroPickerControls, nextView === "hero-picker");
    toggleControls(els.valoTacControls, nextView === "valotac");

    if (nextView !== "valotac") {
      closeAgentSearch();
      closeOnlineModal();
    }
  }

  function toggleControls(node, show) {
    node.classList.toggle("hidden", !show);
    node.classList.toggle("show", show);
  }

  function toggleDropdown(dropdown, show) {
    if (!dropdown) return;
    dropdown.classList.toggle("hidden", !show);
    dropdown.classList.toggle("open", show);
  }

  function openOnlineModal() {
    if (!els.onlineModalOverlay) return;
    state.ui.onlineModalOpen = true;
    els.onlineModalOverlay.classList.remove("hidden");
  }

  function closeOnlineModal() {
    if (!els.onlineModalOverlay) return;
    state.ui.onlineModalOpen = false;
    els.onlineModalOverlay.classList.add("hidden");
  }

  function clearHeroModeClasses() {
    els.heroCards.classList.remove("mode-1", "mode-3", "mode-5");
  }

  function updateHeroVisibility() {
    var shouldShowCards = !!(state.heroPicker.mode && state.heroPicker.cards.length);
    els.heroEmptyState.classList.toggle("hidden", shouldShowCards);
    els.heroCards.classList.toggle("hidden", !shouldShowCards);
    els.resetContainer.classList.toggle(
      "hidden",
      !(state.heroPicker.mode === 5 && state.heroPicker.showResetButton)
    );
  }

  function sampleHero(exclude) {
    var exclusion = Array.isArray(exclude) ? exclude : [];
    var pool = heroes.filter(function (hero) {
      return exclusion.indexOf(hero) === -1;
    });

    if (!pool.length) {
      pool = heroes.slice();
    }

    return pool[Math.floor(Math.random() * pool.length)];
  }

  function getCurrentHeroNames() {
    return state.heroPicker.cards.map(function (card) {
      return card.hero;
    }).filter(Boolean);
  }

  function createHeroCardModel(hero, role) {
    return {
      hero: hero || null,
      role: role || "",
      rerollsUsed: 0
    };
  }

  function createQuestionMarkup() {
    return (
      '<div class="hero-asset-wrap">' +
        '<div class="hero-question-mark">?</div>' +
      "</div>"
    );
  }

  function createHeroMediaMarkup(hero) {
    if (!hero) {
      return createQuestionMarkup();
    }

    return (
      '<div class="hero-asset-wrap">' +
        '<video class="hero-video" autoplay muted loop playsinline preload="metadata">' +
          '<source src="' + window.api.getHeroVideo(hero) + '" type="video/webm">' +
        "</video>" +
        '<img class="hero-fallback hidden" src="' + window.api.getHeroImage(hero) + '" alt="' + heroLabel(hero) + '">' +
      "</div>"
    );
  }

  function createHeroCardElement(cardModel, index) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "hero-card spawning";
    card.dataset.index = String(index);

    var roleHtml = cardModel.role ? '<div class="role-badge">' + cardModel.role + "</div>" : "";
    var rerollsText = state.heroPicker.mode === 5
      ? "Rerolls left: " + Math.max(0, MAX_ROLE_REROLLS - cardModel.rerollsUsed)
      : "Click to reroll";

    card.innerHTML =
      roleHtml +
      '<div class="hero-card-media">' +
        createHeroMediaMarkup(cardModel.hero) +
      "</div>" +
      '<div class="hero-card-meta">' +
        '<div class="hero-name">' + (cardModel.hero ? heroLabel(cardModel.hero) : "Unknown Hero") + "</div>" +
        '<div class="hero-rerolls">' + rerollsText + "</div>" +
      "</div>";

    bindHeroMediaFallback(card);
    fitHeroName(card.querySelector(".hero-name"));

    card.addEventListener("click", function () {
      rerollHeroCard(index);
    });

    return card;
  }

  function bindHeroMediaFallback(card) {
    var video = card.querySelector("video");
    var fallback = card.querySelector(".hero-fallback");
    if (!video || !fallback) return;

    video.addEventListener("error", function () {
      fallback.classList.remove("hidden");
      video.classList.add("hidden");
    });
  }

  function renderHeroCards() {
    if (!state.heroPicker.mode) {
      els.heroCards.innerHTML = "";
      updateHeroVisibility();
      return;
    }

    clearHeroModeClasses();
    els.heroCards.classList.add("mode-" + state.heroPicker.mode);
    els.heroCards.innerHTML = "";

    state.heroPicker.cards.forEach(function (cardModel, index) {
      els.heroCards.appendChild(createHeroCardElement(cardModel, index));
    });

    updateHeroVisibility();
    fitAllHeroNames();
  }

  function buildPreviewCards() {
    state.heroPicker.showResetButton = false;

    if (!state.heroPicker.mode) {
      state.heroPicker.cards = [];
      renderHeroCards();
      return;
    }

    state.heroPicker.cards = [];
    for (var i = 0; i < state.heroPicker.mode; i++) {
      state.heroPicker.cards.push(createHeroCardModel(null, state.heroPicker.mode === 5 ? ROLE_NAMES[i] : ""));
    }
    renderHeroCards();
  }

  function setHeroControlsDisabled(disabled) {
    els.randomBtn.disabled = disabled;
    els.modeSelect.disabled = disabled;
    els.resetRerollBtn.disabled = disabled;
  }

  function updateSingleHeroCard(index) {
    var oldNode = els.heroCards.querySelector('[data-index="' + index + '"]');
    if (!oldNode) return;

    var newNode = createHeroCardElement(state.heroPicker.cards[index], index);
    oldNode.replaceWith(newNode);
    fitAllHeroNames();
  }

  function buildCaseSequence(finalHero, exclude) {
    var sequence = [];
    var usedExclude = Array.isArray(exclude) ? exclude.slice() : [];

    for (var i = 0; i < 18; i++) {
      sequence.push(sampleHero(usedExclude));
    }

    sequence.push(finalHero);
    return sequence;
  }

  function setCardToQuestion(index) {
    var card = els.heroCards.querySelector('[data-index="' + index + '"]');
    if (!card) return;

    var media = card.querySelector(".hero-card-media");
    var nameNode = card.querySelector(".hero-name");

    if (media) {
      media.innerHTML = createQuestionMarkup();
    }
    if (nameNode) {
      nameNode.textContent = "Unknown Hero";
      fitHeroName(nameNode);
    }
  }

  function hideUpcomingCards(fromIndex) {
    for (var i = fromIndex; i < state.heroPicker.cards.length; i++) {
      setCardToQuestion(i);
    }
  }

  function runCaseRollAnimation(index, finalHero, exclude) {
    return new Promise(function (resolve) {
      var card = els.heroCards.querySelector('[data-index="' + index + '"]');
      if (!card) {
        resolve();
        return;
      }

      var media = card.querySelector(".hero-card-media");
      var nameNode = card.querySelector(".hero-name");
      var rerollsNode = card.querySelector(".hero-rerolls");
      var roleNode = card.querySelector(".role-badge");
      var role = state.heroPicker.cards[index].role;
      var currentRerollsUsed = state.heroPicker.cards[index].rerollsUsed;

      if (roleNode) {
        roleNode.style.display = "none";
      }

      card.classList.add("case-rolling");

      var cardHeight = media.clientHeight || 260;
      var sequence = buildCaseSequence(finalHero, exclude);
      var trackHtml = "";

      for (var i = 0; i < sequence.length; i++) {
        trackHtml +=
          '<div class="case-item">' +
            '<div class="case-item-inner">' +
              '<img src="' + window.api.getHeroImage(sequence[i]) + '" alt="' + heroLabel(sequence[i]) + '">' +
            "</div>" +
          "</div>";
      }

      media.innerHTML =
        '<div class="case-window">' +
          '<div class="case-track">' + trackHtml + "</div>" +
        "</div>";

      var track = media.querySelector(".case-track");
      var items = media.querySelectorAll(".case-item");
      Array.prototype.forEach.call(items, function (item) {
        item.style.height = cardHeight + "px";
      });

      nameNode.textContent = "Rolling...";
      fitHeroName(nameNode);

      if (rerollsNode) {
        rerollsNode.textContent = state.heroPicker.mode === 5
          ? "Rerolls left: " + Math.max(0, MAX_ROLE_REROLLS - currentRerollsUsed)
          : "Rolling...";
      }

      var finalIndex = sequence.length - 1;
      var target = -(finalIndex * cardHeight);
      var start = performance.now();

      function frame(now) {
        var progress = Math.min(1, (now - start) / CASE_DURATION);
        var eased = easeOutCubic(progress);
        track.style.transform = "translateY(" + (target * eased) + "px)";

        if (progress < 1) {
          requestAnimationFrame(frame);
        } else {
          card.classList.remove("case-rolling");
          state.heroPicker.cards[index].hero = finalHero;
          state.heroPicker.cards[index].role = role;
          updateSingleHeroCard(index);
          resolve();
        }
      }

      requestAnimationFrame(frame);
    });
  }

  async function generateHeroSet() {
    if (state.heroPicker.isRolling) return;
    if (!state.heroPicker.mode) return;

    state.heroPicker.isRolling = true;
    state.heroPicker.showResetButton = false;
    setHeroControlsDisabled(true);
    els.randomBtn.textContent = "Rolling...";

    try {
      var count = state.heroPicker.mode;
      var plannedHeroes = [];
      var picked = [];

      state.heroPicker.cards = [];
      for (var i = 0; i < count; i++) {
        var hero = sampleHero(picked);
        picked.push(hero);
        plannedHeroes.push(hero);
        state.heroPicker.cards.push(createHeroCardModel(null, count === 5 ? ROLE_NAMES[i] : ""));
      }

      state.heroPicker.hasRolledOnce = true;
      renderHeroCards();

      for (var j = 0; j < state.heroPicker.cards.length; j++) {
        hideUpcomingCards(j + 1);
        await runCaseRollAnimation(j, plannedHeroes[j], plannedHeroes.slice(0, j));
      }

      state.heroPicker.showResetButton = state.heroPicker.mode === 5;
      updateHeroVisibility();
    } finally {
      state.heroPicker.isRolling = false;
      setHeroControlsDisabled(false);
      els.randomBtn.textContent = "Roll";
    }
  }

  async function rerollHeroCard(index) {
    if (state.view !== "hero-picker") return;
    if (state.heroPicker.isRolling) return;

    var cardModel = state.heroPicker.cards[index];
    if (!cardModel || !cardModel.hero) return;

    if (state.heroPicker.mode === 5 && cardModel.rerollsUsed >= MAX_ROLE_REROLLS) {
      return;
    }

    state.heroPicker.isRolling = true;
    setHeroControlsDisabled(true);

    try {
      var currentHero = cardModel.hero;
      var exclude = getCurrentHeroNames().filter(function (hero) {
        return hero !== currentHero;
      });
      var nextHero = sampleHero(exclude);

      if (state.heroPicker.mode === 5) {
        cardModel.rerollsUsed += 1;
      }

      await runCaseRollAnimation(index, nextHero, exclude);
    } finally {
      state.heroPicker.isRolling = false;
      setHeroControlsDisabled(false);
    }
  }

  function resetHeroRerolls() {
    if (state.heroPicker.mode !== 5) return;
    state.heroPicker.cards.forEach(function (card) {
      card.rerollsUsed = 0;
    });
    renderHeroCards();
  }

  function renderMapList() {
    var html = maps.map(function (map) {
      return (
        '<button class="map-item" type="button" data-map-id="' + map.id + '" style="--map-bg:url(\'' + window.api.getValoMapBackground(map.id) + '\')">' +
          '<span class="map-name">' + map.name + "</span>" +
        "</button>"
      );
    }).join("");

    els.valoMapList.innerHTML = html;

    Array.prototype.forEach.call(els.valoMapList.querySelectorAll(".map-item"), function (btn) {
      btn.addEventListener("click", function () {
        if (state.valoTac.multiplayer.isConnected && !state.valoTac.multiplayer.isHost) {
          setLobbyStatus("Только host может менять карту.", "error");
          toggleDropdown(els.valoMapDropdown, false);
          return;
        }

        loadMap(btn.dataset.mapId, { silentSync: false });
        toggleDropdown(els.valoMapDropdown, false);
      });
    });
  }

  function updateMapActiveState() {
    Array.prototype.forEach.call(els.valoMapList.querySelectorAll(".map-item"), function (btn) {
      btn.classList.toggle("active", btn.dataset.mapId === state.valoTac.currentMapId);
    });
  }

  function applyBoardTransform() {
    els.tacBoard.style.transform =
      "translate(calc(-50% + " + state.valoTac.panX + "px), calc(-50% + " + state.valoTac.panY + "px)) scale(" + state.valoTac.zoom + ")";
  }

  function fitBoardToWrap(width, height) {
    var wrapRect = els.tacBoardWrap.getBoundingClientRect();
    if (!wrapRect.width || !wrapRect.height || !width || !height) return;

    var padding = 60;
    var fitScale = Math.min(
      (wrapRect.width - padding) / width,
      (wrapRect.height - padding) / height,
      1
    );

    state.valoTac.zoom = Math.max(state.valoTac.minZoom, Math.min(1, fitScale));
    state.valoTac.panX = 0;
    state.valoTac.panY = 0;
    applyBoardTransform();
  }

  function setCanvasSize(width, height) {
    els.tacBoard.style.width = width + "px";
    els.tacBoard.style.height = height + "px";
    els.valoCanvas.width = width;
    els.valoCanvas.height = height;
    els.valoCanvas.style.width = width + "px";
    els.valoCanvas.style.height = height + "px";
    state.valoTac.ctx.lineCap = "round";
    state.valoTac.ctx.lineJoin = "round";
  }

  function sendMultiplayer(type, payload) {
    var socket = state.valoTac.multiplayer.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({
      type: type,
      payload: payload || {}
    }));
  }

  function setLobbyStatus(text, variant) {
    if (!els.lobbyStatusText) return;

    els.lobbyStatusText.textContent = text;
    els.lobbyStatusText.classList.remove("error", "ok");

    if (variant) {
      els.lobbyStatusText.classList.add(variant);
    }
  }

  function renderParticipants() {
    if (!els.lobbyParticipants) return;

    var selfId = state.valoTac.multiplayer.userId;
    var list = state.valoTac.multiplayer.participants || [];

    els.lobbyParticipants.innerHTML = list.map(function (user) {
      var classes = "lobby-user-chip" + (user.userId === selfId ? " you" : "");
      var suffix = user.userId === selfId ? " (you)" : "";
      var hostSuffix = user.userId === state.valoTac.multiplayer.ownerId ? " [host]" : "";
      return '<div class="' + classes + '">' + user.name + suffix + hostSuffix + "</div>";
    }).join("");

    renderValoTacPlayers();
  }

  function updateClearButtonLabel() {
    if (!els.clearMapBtn) return;

    if (state.valoTac.multiplayer.isConnected && state.valoTac.multiplayer.isHost) {
      els.clearMapBtn.textContent = "Clear All";
      return;
    }

    els.clearMapBtn.textContent = "Clear";
  }

  function updateLobbyButtons() {
    if (!els.copyRoomCodeBtn || !els.leaveLobbyBtn) return;

    var connected = state.valoTac.multiplayer.isConnected;
    var hasCode = !!state.valoTac.multiplayer.roomCode;

    els.copyRoomCodeBtn.disabled = !(connected && hasCode);
    els.leaveLobbyBtn.disabled = !connected;
    updateClearButtonLabel();
    renderValoTacPlayers();
  }

  function disconnectMultiplayer(silentStatus) {
    var socket = state.valoTac.multiplayer.socket;

    if (socket) {
      try {
        socket.close();
      } catch (_error) {}
    }

    state.valoTac.multiplayer.socket = null;
    state.valoTac.multiplayer.isConnected = false;
    state.valoTac.multiplayer.roomCode = "";
    state.valoTac.multiplayer.userId = "";
    state.valoTac.multiplayer.isHost = false;
    state.valoTac.multiplayer.ownerId = "";
    state.valoTac.multiplayer.participants = [];
    state.valoTac.remoteLiveStrokes = {};
    state.valoTac.pendingDrawPoints = [];
    state.activeServerUrl = SERVERS[0];

    renderParticipants();
    updateLobbyButtons();

    if (!silentStatus) {
      setLobbyStatus("Offline");
    }
  }

  function drawStroke(ctx, stroke) {
    if (!stroke || !stroke.points || !stroke.points.length) return;

    ctx.beginPath();
    ctx.globalCompositeOperation = stroke.mode === "erase" ? "destination-out" : "source-over";
    ctx.lineWidth = stroke.size;
    ctx.strokeStyle = stroke.mode === "erase" ? "rgba(0,0,0,1)" : stroke.color;

    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (var i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }

    if (stroke.points.length === 1) {
      ctx.lineTo(stroke.points[0].x + 0.01, stroke.points[0].y + 0.01);
    }

    ctx.stroke();
    ctx.closePath();
  }

  function renderValoCanvas() {
    if (!els.valoCanvas.width || !els.valoCanvas.height) return;

    var ctx = state.valoTac.ctx;
    ctx.clearRect(0, 0, els.valoCanvas.width, els.valoCanvas.height);

    state.valoTac.strokes.forEach(function (stroke) {
      drawStroke(ctx, stroke);
    });

    Object.keys(state.valoTac.remoteLiveStrokes).forEach(function (strokeId) {
      drawStroke(ctx, state.valoTac.remoteLiveStrokes[strokeId]);
    });

    if (state.valoTac.currentStroke) {
      drawStroke(ctx, state.valoTac.currentStroke);
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function applySharedRoomState(payload) {
    var nextMapId = payload.mapId || null;
    var nextStrokes = Array.isArray(payload.strokes) ? payload.strokes : [];
    var nextAgents = Array.isArray(payload.agents) ? payload.agents : [];

    state.valoTac.remoteLiveStrokes = {};

    function applyNow() {
      state.valoTac.strokes = nextStrokes;
      state.valoTac.agents = nextAgents;
      renderValoCanvas();
      renderAgentLayer();
    }

    if (!nextMapId) {
      applyNow();
      return;
    }

    loadMap(nextMapId, {
      silentSync: true,
      keepSharedData: true,
      afterLoad: applyNow
    });
  }

  function handleServerMessage(message) {
    if (!message || !message.type) return;

    var payload = message.payload || {};

    if (message.type === "server-ready") {
      return;
    }

    if (message.type === "error") {
      setLobbyStatus(payload.message || "Ошибка соединения.", "error");
      return;
    }

    if (message.type === "joined") {
      state.valoTac.multiplayer.isConnected = true;
      state.valoTac.multiplayer.userId = payload.userId || "";
      state.valoTac.multiplayer.roomCode = payload.roomCode || "";
      state.valoTac.multiplayer.isHost = !!payload.isHost;
      state.valoTac.multiplayer.ownerId = payload.ownerId || "";
      if (els.roomCodeInput) {
        els.roomCodeInput.value = state.valoTac.multiplayer.roomCode;
      }
      setLobbyStatus("Connected to room " + state.valoTac.multiplayer.roomCode, "ok");
      updateLobbyButtons();
      renderParticipants();
      return;
    }

    if (message.type === "presence") {
      state.valoTac.multiplayer.participants = payload.participants || [];
      state.valoTac.multiplayer.ownerId = payload.ownerId || state.valoTac.multiplayer.ownerId;
      state.valoTac.multiplayer.isHost = state.valoTac.multiplayer.userId === state.valoTac.multiplayer.ownerId;
      renderParticipants();
      updateClearButtonLabel();
      return;
    }

    if (message.type === "room-state") {
      state.valoTac.multiplayer.participants = payload.participants || [];
      state.valoTac.multiplayer.ownerId = payload.ownerId || state.valoTac.multiplayer.ownerId;
      state.valoTac.multiplayer.isHost = state.valoTac.multiplayer.userId === state.valoTac.multiplayer.ownerId;

      if (payload.roomCode) {
        state.valoTac.multiplayer.roomCode = payload.roomCode;
        if (els.roomCodeInput) {
          els.roomCodeInput.value = payload.roomCode;
        }
      }

      renderParticipants();
      updateClearButtonLabel();
      applySharedRoomState(payload);
      return;
    }

    if (message.type === "map:set") {
      if (payload.mapId) {
        loadMap(payload.mapId, {
          silentSync: true,
          keepSharedData: false
        });
      }
      return;
    }

    if (message.type === "draw:start") {
      if (payload.stroke && payload.stroke.strokeId) {
        state.valoTac.remoteLiveStrokes[payload.stroke.strokeId] = payload.stroke;
        renderValoCanvas();
      }
      return;
    }

    if (message.type === "draw:append") {
      var liveStroke = state.valoTac.remoteLiveStrokes[payload.strokeId];
      if (liveStroke && Array.isArray(payload.points) && payload.points.length) {
        liveStroke.points = liveStroke.points.concat(payload.points);
        renderValoCanvas();
      }
      return;
    }

    if (message.type === "draw:end") {
      if (payload.stroke) {
        delete state.valoTac.remoteLiveStrokes[payload.stroke.strokeId];
        state.valoTac.strokes.push(payload.stroke);
        renderValoCanvas();
      }
      return;
    }

    if (message.type === "draw:cancel") {
      if (payload.strokeId) {
        delete state.valoTac.remoteLiveStrokes[payload.strokeId];
        renderValoCanvas();
      }
      return;
    }

    if (message.type === "agent:add") {
      if (payload.agent) {
        state.valoTac.agents.push(payload.agent);
        renderAgentLayer();
      }
      return;
    }

    if (message.type === "agent:update") {
      var agent = state.valoTac.agents.find(function (item) {
        return item.instanceId === payload.instanceId;
      });

      if (agent) {
        if (typeof payload.x === "number") agent.x = payload.x;
        if (typeof payload.y === "number") agent.y = payload.y;
        if (typeof payload.size === "number") agent.size = payload.size;

        var node = els.agentLayer.querySelector('[data-instance-id="' + agent.instanceId + '"]');
        if (node) {
          if (typeof payload.x === "number") node.style.left = payload.x + "px";
          if (typeof payload.y === "number") node.style.top = payload.y + "px";
          if (typeof payload.size === "number") {
            node.style.width = payload.size + "px";
            node.style.height = payload.size + "px";
          }
        } else {
          renderAgentLayer();
        }
      }
      return;
    }

    if (message.type === "agent:remove") {
      state.valoTac.agents = state.valoTac.agents.filter(function (item) {
        return item.instanceId !== payload.instanceId;
      });
      renderAgentLayer();
      return;
    }
  }

  function tryConnectServer(index, desiredCode, playerName, createMode) {
    if (index >= SERVERS.length) {
      setLobbyStatus("Не удалось подключиться к серверу.", "error");
      return;
    }

    var url = SERVERS[index];
    var socket = new WebSocket(url);

    state.valoTac.multiplayer.socket = socket;

    socket.addEventListener("open", function () {
      state.activeServerUrl = url;
      socket.send(JSON.stringify({
        type: "join-room",
        payload: {
          create: !!createMode,
          roomCode: desiredCode,
          name: playerName
        }
      }));
    });

    socket.addEventListener("message", function (event) {
      var parsed = null;
      try {
        parsed = JSON.parse(event.data);
      } catch (_error) {
        parsed = null;
      }
      handleServerMessage(parsed);
    });

    socket.addEventListener("close", function () {
      var hadRoom = !!state.valoTac.multiplayer.roomCode;
      var currentSocket = state.valoTac.multiplayer.socket === socket;

      if (currentSocket) {
        disconnectMultiplayer(true);
      }

      if (!hadRoom && currentSocket) {
        tryConnectServer(index + 1, desiredCode, playerName, createMode);
      } else if (hadRoom) {
        setLobbyStatus("Disconnected", "error");
      }
    });

    socket.addEventListener("error", function () {
      try {
        socket.close();
      } catch (_error) {}
    });
  }

  function connectToRoom(createMode) {
    var desiredCode = normalizeRoomCode(els.roomCodeInput ? els.roomCodeInput.value : "");
    var playerName = String((els.lobbyNameInput ? els.lobbyNameInput.value : "Player") || "Player").trim().slice(0, 24) || "Player";

    if (!createMode && !desiredCode) {
      setLobbyStatus("Введи код комнаты.", "error");
      return;
    }

    disconnectMultiplayer(true);
    setLobbyStatus("Connecting...");
    tryConnectServer(0, desiredCode, playerName, createMode);
  }

  function getCanvasPoint(event) {
    var rect = els.valoCanvas.getBoundingClientRect();
    var scaleX = els.valoCanvas.width / rect.width;
    var scaleY = els.valoCanvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  }

  function getLayerPoint(clientX, clientY) {
    var rect = els.agentLayer.getBoundingClientRect();
    var scaleX = els.valoCanvas.width / rect.width;
    var scaleY = els.valoCanvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  function renderAgentTray() {
    if (!els.agentTray) return;

    els.agentTray.innerHTML = agents.map(function (agent) {
      return (
        '<button class="agent-chip" type="button" data-agent-id="' + agent.id + '" title="' + agent.name + '">' +
          '<img src="' + window.api.getValoAgentImage(agent.id) + '" alt="' + agent.name + '">' +
          "<span>" + agent.short + "</span>" +
        "</button>"
      );
    }).join("");

    Array.prototype.forEach.call(els.agentTray.querySelectorAll(".agent-chip"), function (chip) {
      var img = chip.querySelector("img");
      if (img) {
        img.addEventListener("error", function () {
          img.classList.add("hidden");
        });
      }

      chip.addEventListener("click", function () {
        spawnAgentToken(chip.dataset.agentId);
        toggleDropdown(els.agentDropdown, false);
      });
    });
  }

  function spawnAgentToken(agentId) {
    if (!state.valoTac.currentMapId || !els.valoCanvas.width || !els.valoCanvas.height) return;

    var agent = agents.find(function (item) { return item.id === agentId; });
    if (!agent) return;

    var token = {
      instanceId: agentId + "-" + Date.now() + "-" + Math.floor(Math.random() * 10000),
      agentId: agent.id,
      short: agent.short,
      name: agent.name,
      x: els.valoCanvas.width / 2,
      y: els.valoCanvas.height / 2,
      size: DEFAULT_AGENT_SIZE
    };

    state.valoTac.agents.push(token);
    renderAgentLayer();

    if (state.valoTac.multiplayer.isConnected) {
      sendMultiplayer("agent:add", { agent: token });
    }
  }

  function removeAgentToken(instanceId) {
    state.valoTac.agents = state.valoTac.agents.filter(function (item) {
      return item.instanceId !== instanceId;
    });
    renderAgentLayer();

    if (state.valoTac.multiplayer.isConnected) {
      sendMultiplayer("agent:remove", { instanceId: instanceId });
    }
  }

  function resizeAgentToken(instanceId, delta) {
    var token = state.valoTac.agents.find(function (item) {
      return item.instanceId === instanceId;
    });
    if (!token) return;

    token.size = Math.max(MIN_AGENT_SIZE, Math.min(MAX_AGENT_SIZE, token.size + delta));

    var node = els.agentLayer.querySelector('[data-instance-id="' + instanceId + '"]');
    if (node) {
      node.style.width = token.size + "px";
      node.style.height = token.size + "px";
    }

    if (state.valoTac.multiplayer.isConnected) {
      sendMultiplayer("agent:update", {
        instanceId: instanceId,
        size: token.size
      });
    }
  }

  function renderAgentLayer() {
    if (!els.agentLayer) return;

    els.agentLayer.innerHTML = state.valoTac.agents.map(function (token) {
      return (
        '<button class="agent-token" type="button" data-instance-id="' + token.instanceId + '" ' +
          'style="left:' + token.x + "px; top:" + token.y + "px; width:" + token.size + "px; height:" + token.size + 'px;" title="' + token.name + '">' +
          '<img class="agent-img" src="' + window.api.getValoAgentImage(token.agentId) + '" alt="' + token.name + '">' +
          '<span class="agent-token-label agent-text">' + token.short + "</span>" +
        "</button>"
      );
    }).join("");

    Array.prototype.forEach.call(els.agentLayer.querySelectorAll(".agent-token"), function (node) {
      var img = node.querySelector("img");
      var label = node.querySelector(".agent-token-label");
      var instanceId = node.dataset.instanceId;

      if (img && label) {
        img.addEventListener("load", function () {
          label.style.display = "none";
        });

        img.addEventListener("error", function () {
          img.classList.add("hidden");
          label.style.display = "flex";
        });
      }

      node.addEventListener("pointerdown", function (event) {
        beginAgentDrag(event, instanceId);
      });

      node.addEventListener("pointerenter", function () {
        state.valoTac.hoveredAgentId = instanceId;
      });

      node.addEventListener("pointerleave", function () {
        if (state.valoTac.hoveredAgentId === instanceId) {
          state.valoTac.hoveredAgentId = null;
        }
      });

      node.addEventListener("wheel", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var delta = event.deltaY < 0 ? 4 : -4;
        resizeAgentToken(instanceId, delta);
      }, { passive: false });

      node.addEventListener("contextmenu", function (event) {
        event.preventDefault();
      });

      node.addEventListener("pointerup", function (event) {
        if (event.button === 0 && event.ctrlKey) {
          event.preventDefault();
          removeAgentToken(instanceId);
        }
      });
    });
  }

  function beginAgentDrag(event, instanceId) {
    if (event.button === 0 && event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      removeAgentToken(instanceId);
      return;
    }

    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    var token = state.valoTac.agents.find(function (item) {
      return item.instanceId === instanceId;
    });
    if (!token) return;

    var point = getLayerPoint(event.clientX, event.clientY);
    state.valoTac.draggingAgentId = instanceId;
    state.valoTac.dragOffsetX = point.x - token.x;
    state.valoTac.dragOffsetY = point.y - token.y;

    var tokenNode = els.agentLayer.querySelector('[data-instance-id="' + instanceId + '"]');
    if (tokenNode) {
      tokenNode.classList.add("dragging");
    }
  }

  function scheduleDraggedAgentSync(instanceId) {
    state.valoTac.lastMovedAgentId = instanceId;

    if (state.valoTac.agentMoveFrame) return;

    state.valoTac.agentMoveFrame = requestAnimationFrame(function () {
      state.valoTac.agentMoveFrame = 0;

      if (!state.valoTac.multiplayer.isConnected || !state.valoTac.lastMovedAgentId) return;

      var token = state.valoTac.agents.find(function (item) {
        return item.instanceId === state.valoTac.lastMovedAgentId;
      });

      if (!token) return;

      sendMultiplayer("agent:update", {
        instanceId: token.instanceId,
        x: token.x,
        y: token.y,
        size: token.size
      });
    });
  }

  function moveAgentDrag(event) {
    if (!state.valoTac.draggingAgentId) return;

    var token = state.valoTac.agents.find(function (item) {
      return item.instanceId === state.valoTac.draggingAgentId;
    });
    if (!token) return;

    var point = getLayerPoint(event.clientX, event.clientY);
    token.x = Math.max(0, Math.min(els.valoCanvas.width, point.x - state.valoTac.dragOffsetX));
    token.y = Math.max(0, Math.min(els.valoCanvas.height, point.y - state.valoTac.dragOffsetY));

    var node = els.agentLayer.querySelector('[data-instance-id="' + token.instanceId + '"]');
    if (node) {
      node.style.left = token.x + "px";
      node.style.top = token.y + "px";
    }

    scheduleDraggedAgentSync(token.instanceId);
  }

  function endAgentDrag() {
    if (!state.valoTac.draggingAgentId) return;

    var node = els.agentLayer.querySelector('[data-instance-id="' + state.valoTac.draggingAgentId + '"]');
    if (node) {
      node.classList.remove("dragging");
    }

    if (state.valoTac.multiplayer.isConnected) {
      var token = state.valoTac.agents.find(function (item) {
        return item.instanceId === state.valoTac.draggingAgentId;
      });

      if (token) {
        sendMultiplayer("agent:update", {
          instanceId: token.instanceId,
          x: token.x,
          y: token.y,
          size: token.size
        });
      }
    }

    state.valoTac.draggingAgentId = null;
    state.valoTac.dragOffsetX = 0;
    state.valoTac.dragOffsetY = 0;
  }

  function loadMap(mapId, options) {
    options = options || {};

    state.valoTac.currentMapId = mapId;
    els.valoStatus.textContent = mapId || "Выберите карту";
    els.valoEmptyState.classList.add("hidden");
    els.tacBoardWrap.classList.remove("hidden");
    els.valoMapImage.src = window.api.getValoMapImage(mapId);

    els.valoMapImage.onload = function () {
      var width = els.valoMapImage.naturalWidth || 1024;
      var height = els.valoMapImage.naturalHeight || 1024;

      setCanvasSize(width, height);

      if (!options.keepSharedData) {
        state.valoTac.strokes = [];
        state.valoTac.currentStroke = null;
        state.valoTac.remoteLiveStrokes = {};
        state.valoTac.agents = [];
      }

      renderValoCanvas();
      renderAgentLayer();
      fitBoardToWrap(width, height);
      updateMapActiveState();

      if (typeof options.afterLoad === "function") {
        options.afterLoad();
      }

      if (!options.silentSync && state.valoTac.multiplayer.isConnected) {
        if (!state.valoTac.multiplayer.isHost) {
          setLobbyStatus("Только host может менять карту.", "error");
          return;
        }

        sendMultiplayer("map:set", {
          mapId: mapId
        });
      }
    };
  }

  function filterAgents(query) {
    var normalized = String(query || "").trim().toLowerCase();
    if (!normalized) {
      return agents.slice();
    }

    return agents.filter(function (agent) {
      return agent.name.toLowerCase().indexOf(normalized) !== -1;
    });
  }

  function renderAgentSearchResults() {
    var items = state.valoTac.filteredAgents;
    els.agentSearchResults.innerHTML = items.map(function (agent, index) {
      return (
        '<button class="agent-search-item' + (index === state.valoTac.searchActiveIndex ? " active" : "") + '" ' +
          'type="button" data-agent-id="' + agent.id + '">' +
          '<div class="agent-search-thumb">' +
            '<img src="' + window.api.getValoAgentImage(agent.id) + '" alt="' + agent.name + '">' +
            "<span>" + agent.short + "</span>" +
          "</div>" +
          '<div class="agent-search-name">' + agent.name + "</div>" +
        "</button>"
      );
    }).join("");

    Array.prototype.forEach.call(els.agentSearchResults.querySelectorAll(".agent-search-item"), function (node) {
      var img = node.querySelector("img");
      if (img) {
        img.addEventListener("error", function () {
          img.classList.add("hidden");
        });
      }

      node.addEventListener("click", function () {
        selectSearchedAgent(node.dataset.agentId);
      });
    });
  }

  function openAgentSearch() {
    if (state.view !== "valotac" || !state.valoTac.currentMapId) return;

    state.valoTac.searchOpen = true;
    state.valoTac.searchQuery = "";
    state.valoTac.searchActiveIndex = 0;
    state.valoTac.filteredAgents = agents.slice();

    els.agentSearchOverlay.classList.remove("hidden");
    els.agentSearchInput.value = "";
    renderAgentSearchResults();
    els.agentSearchInput.focus();
    els.agentSearchInput.select();
  }

  function closeAgentSearch() {
    state.valoTac.searchOpen = false;
    state.valoTac.searchQuery = "";
    state.valoTac.searchActiveIndex = 0;
    state.valoTac.filteredAgents = agents.slice();

    els.agentSearchOverlay.classList.add("hidden");
    els.agentSearchInput.value = "";
    els.agentSearchResults.innerHTML = "";
  }

  function updateAgentSearch(query) {
    state.valoTac.searchQuery = query;
    state.valoTac.filteredAgents = filterAgents(query);
    state.valoTac.searchActiveIndex = 0;
    renderAgentSearchResults();
  }

  function selectSearchedAgent(agentId) {
    spawnAgentToken(agentId);
    closeAgentSearch();
  }

  function flushPendingDrawPoints() {
    if (!state.valoTac.multiplayer.isConnected) {
      state.valoTac.pendingDrawPoints = [];
      state.valoTac.drawFlushFrame = 0;
      return;
    }

    if (!state.valoTac.currentStroke || !state.valoTac.pendingDrawPoints.length) {
      state.valoTac.drawFlushFrame = 0;
      return;
    }

    var points = state.valoTac.pendingDrawPoints.slice();
    state.valoTac.pendingDrawPoints = [];
    state.valoTac.drawFlushFrame = 0;

    sendMultiplayer("draw:append", {
      strokeId: state.valoTac.currentStroke.strokeId,
      points: points
    });
  }

  function scheduleDrawFlush() {
    if (state.valoTac.drawFlushFrame) return;

    state.valoTac.drawFlushFrame = requestAnimationFrame(function () {
      flushPendingDrawPoints();
    });
  }

  function beginPointerAction(event) {
    if (state.valoTac.draggingAgentId) return;
    if (!state.valoTac.currentMapId) return;
    if (state.valoTac.searchOpen) return;

    if (event.button === 1) {
      event.preventDefault();
      state.valoTac.isPanning = true;
      state.valoTac.originPanX = state.valoTac.panX;
      state.valoTac.originPanY = state.valoTac.panY;
      state.valoTac.startPanX = event.clientX;
      state.valoTac.startPanY = event.clientY;
      els.tacBoard.classList.add("panning");
      return;
    }

    if (event.button === 0 || event.button === 2) {
      event.preventDefault();

      state.valoTac.isDrawing = true;
      state.valoTac.isErasing = event.button === 2;

      var point = getCanvasPoint(event);
      var currentUserId = state.valoTac.multiplayer.userId || "local";

      state.valoTac.currentStroke = {
        strokeId: makeId(),
        userId: currentUserId,
        mode: state.valoTac.isErasing ? "erase" : "draw",
        color: state.valoTac.color,
        size: state.valoTac.isErasing ? state.valoTac.eraserSize : state.valoTac.brushSize,
        points: [point]
      };

      state.valoTac.pendingDrawPoints = [];

      if (state.valoTac.multiplayer.isConnected) {
        sendMultiplayer("draw:start", {
          stroke: {
            strokeId: state.valoTac.currentStroke.strokeId,
            userId: state.valoTac.currentStroke.userId,
            mode: state.valoTac.currentStroke.mode,
            color: state.valoTac.currentStroke.color,
            size: state.valoTac.currentStroke.size,
            points: [point]
          }
        });
      }

      renderValoCanvas();
    }
  }

  function movePointerAction(event) {
    if (state.valoTac.draggingAgentId) {
      moveAgentDrag(event);
      return;
    }

    if (state.valoTac.isPanning) {
      state.valoTac.panX = state.valoTac.originPanX + (event.clientX - state.valoTac.startPanX);
      state.valoTac.panY = state.valoTac.originPanY + (event.clientY - state.valoTac.startPanY);
      applyBoardTransform();
      return;
    }

    if (!state.valoTac.isDrawing || !state.valoTac.currentStroke) return;

    var point = getCanvasPoint(event);
    state.valoTac.currentStroke.points.push(point);
    state.valoTac.pendingDrawPoints.push(point);

    if (state.valoTac.multiplayer.isConnected) {
      scheduleDrawFlush();
    }

    renderValoCanvas();
  }

  function endPointerAction() {
    endAgentDrag();

    if (state.valoTac.isDrawing && state.valoTac.currentStroke) {
      if (state.valoTac.currentStroke.points.length === 1) {
        state.valoTac.currentStroke.points.push({
          x: state.valoTac.currentStroke.points[0].x + 0.01,
          y: state.valoTac.currentStroke.points[0].y + 0.01
        });
      }

      flushPendingDrawPoints();

      state.valoTac.strokes.push(state.valoTac.currentStroke);

      if (state.valoTac.multiplayer.isConnected) {
        sendMultiplayer("draw:end", {
          strokeId: state.valoTac.currentStroke.strokeId
        });
      }

      state.valoTac.currentStroke = null;
      renderValoCanvas();
    }

    state.valoTac.isDrawing = false;
    state.valoTac.isPanning = false;
    state.valoTac.isErasing = false;
    els.tacBoard.classList.remove("panning");
  }

  function handleWheel(event) {
    if (!state.valoTac.currentMapId || state.valoTac.searchOpen) return;

    if (event.ctrlKey) {
      event.preventDefault();
      var brushDelta = event.deltaY < 0 ? 1 : -1;
      state.valoTac.brushSize = Math.max(2, Math.min(60, state.valoTac.brushSize + brushDelta));
      els.brushSize.value = String(state.valoTac.brushSize);
      els.brushSizeValue.textContent = String(state.valoTac.brushSize);
      return;
    }

    if (event.altKey) {
      event.preventDefault();
      var eraserDelta = event.deltaY < 0 ? 2 : -2;
      state.valoTac.eraserSize = Math.max(4, Math.min(100, state.valoTac.eraserSize + eraserDelta));
      els.eraserSize.value = String(state.valoTac.eraserSize);
      els.eraserSizeValue.textContent = String(state.valoTac.eraserSize);
      return;
    }

    event.preventDefault();
    var zoomDelta = event.deltaY < 0 ? 0.12 : -0.12;
    state.valoTac.zoom = Math.max(state.valoTac.minZoom, Math.min(state.valoTac.maxZoom, state.valoTac.zoom + zoomDelta));
    applyBoardTransform();
  }

  function getCurrentStrokeOwnerId() {
    return state.valoTac.multiplayer.userId || "local";
  }

  function undoOwnStroke() {
    if (!state.valoTac.strokes.length) return;

    var ownerId = getCurrentStrokeOwnerId();
    var indexToRemove = -1;

    for (var i = state.valoTac.strokes.length - 1; i >= 0; i--) {
      if (state.valoTac.strokes[i].userId === ownerId) {
        indexToRemove = i;
        break;
      }
    }

    if (indexToRemove === -1) return;

    state.valoTac.strokes.splice(indexToRemove, 1);
    renderValoCanvas();

    if (state.valoTac.multiplayer.isConnected) {
      sendMultiplayer("draw:undo", {});
    }
  }

  function clearOwnStrokes() {
    var ownerId = getCurrentStrokeOwnerId();

    state.valoTac.strokes = state.valoTac.strokes.filter(function (stroke) {
      return stroke.userId !== ownerId;
    });

    if (state.valoTac.currentStroke && state.valoTac.currentStroke.userId === ownerId) {
      state.valoTac.currentStroke = null;
    }

    state.valoTac.pendingDrawPoints = [];
    renderValoCanvas();

    if (state.valoTac.multiplayer.isConnected) {
      sendMultiplayer("draw:clear", { scope: "self" });
    }
  }

  function clearAllStrokes() {
    if (!state.valoTac.multiplayer.isConnected || !state.valoTac.multiplayer.isHost) {
      clearOwnStrokes();
      return;
    }

    state.valoTac.strokes = [];
    state.valoTac.remoteLiveStrokes = {};
    state.valoTac.currentStroke = null;
    state.valoTac.pendingDrawPoints = [];
    renderValoCanvas();

    sendMultiplayer("draw:clear", { scope: "all" });
  }

  function updateColorSwatches() {
    Array.prototype.forEach.call(els.colorPalette.querySelectorAll(".color-swatch"), function (node, index) {
      node.classList.toggle("active", index === state.valoTac.colorIndex);
    });
    state.valoTac.color = state.valoTac.colors[state.valoTac.colorIndex];
  }

  function shiftColor(step) {
    var total = state.valoTac.colors.length;
    state.valoTac.colorIndex = (state.valoTac.colorIndex + step + total) % total;
    updateColorSwatches();
  }

  function hasPrimaryModifier(event) {
    return !!(event.ctrlKey || event.metaKey);
  }

  function isCode(event, code) {
    return String(event.code || "") === code;
  }

  function isUndoHotkey(event) {
    return hasPrimaryModifier(event) && isCode(event, "KeyZ");
  }

  function isSearchHotkey(event) {
    return hasPrimaryModifier(event) && isCode(event, "KeyF");
  }

  function isPrevColorHotkey(event) {
    return isCode(event, "KeyQ");
  }

  function isNextColorHotkey(event) {
    return isCode(event, "KeyE");
  }

  function isClearHotkey(event) {
    return isCode(event, "KeyR");
  }

  function isCenterMapHotkey(event) {
    return isCode(event, "Space");
  }

  function bindEvents() {
    els.homeBtn.addEventListener("click", function () {
      setView("home");
    });

    els.modeHeroPicker.addEventListener("click", function () {
      setView("hero-picker");
      renderHeroCards();
    });

    els.modeValoTac.addEventListener("click", function () {
      setView("valotac");
    });

    els.modeUpdates.addEventListener("click", function () {
      setView("updates");
    });

    if (els.openOnlineModalBtn) {
      els.openOnlineModalBtn.addEventListener("click", function () {
        openOnlineModal();
      });
    }

    if (els.closeOnlineModalBtn) {
      els.closeOnlineModalBtn.addEventListener("click", function () {
        closeOnlineModal();
      });
    }

    if (els.onlineModalOverlay) {
      els.onlineModalOverlay.addEventListener("mousedown", function (event) {
        if (event.target === els.onlineModalOverlay) {
          closeOnlineModal();
        }
      });
    }

    if (els.onlineModal) {
      els.onlineModal.addEventListener("mousedown", function (event) {
        event.stopPropagation();
      });
    }

    els.randomBtn.addEventListener("click", generateHeroSet);

    els.modeSelect.addEventListener("change", function () {
      state.heroPicker.mode = Number(els.modeSelect.value || 0);
      state.heroPicker.hasRolledOnce = false;
      buildPreviewCards();
    });

    els.resetRerollBtn.addEventListener("click", resetHeroRerolls);

    els.toggleMapListBtn.addEventListener("click", function () {
      var nextState = !els.valoMapDropdown.classList.contains("open");
      toggleDropdown(els.valoMapDropdown, nextState);
      toggleDropdown(els.agentDropdown, false);
    });

    els.toggleAgentListBtn.addEventListener("click", function () {
      var nextState = !els.agentDropdown.classList.contains("open");
      toggleDropdown(els.agentDropdown, nextState);
      toggleDropdown(els.valoMapDropdown, false);
    });

    els.toggleTipsBtn.addEventListener("click", function () {
      var isCollapsed = els.valoTipsDropdown.classList.toggle("collapsed");
      els.toggleTipsBtn.classList.toggle("open", !isCollapsed);
    });

    Array.prototype.forEach.call(els.colorPalette.querySelectorAll(".color-swatch"), function (swatch, index) {
      swatch.addEventListener("click", function () {
        state.valoTac.colorIndex = index;
        updateColorSwatches();
      });
    });

    els.brushSize.addEventListener("input", function () {
      state.valoTac.brushSize = Number(els.brushSize.value || 5);
      els.brushSizeValue.textContent = String(state.valoTac.brushSize);
    });

    els.eraserSize.addEventListener("input", function () {
      state.valoTac.eraserSize = Number(els.eraserSize.value || 14);
      els.eraserSizeValue.textContent = String(state.valoTac.eraserSize);
    });

    els.undoMapBtn.addEventListener("click", undoOwnStroke);

    els.clearMapBtn.addEventListener("click", function () {
      if (state.valoTac.multiplayer.isConnected && state.valoTac.multiplayer.isHost) {
        clearAllStrokes();
        return;
      }
      clearOwnStrokes();
    });

    els.valoCanvas.addEventListener("pointerdown", beginPointerAction);
    window.addEventListener("pointermove", movePointerAction);
    window.addEventListener("pointerup", endPointerAction);

    els.tacBoardWrap.addEventListener("wheel", handleWheel, { passive: false });
    els.tacBoardWrap.addEventListener("contextmenu", function (event) {
      event.preventDefault();
    });

    els.agentSearchInput.addEventListener("input", function () {
      updateAgentSearch(els.agentSearchInput.value);
    });

    els.agentSearchInput.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAgentSearch();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (state.valoTac.filteredAgents.length) {
          state.valoTac.searchActiveIndex = Math.min(
            state.valoTac.searchActiveIndex + 1,
            state.valoTac.filteredAgents.length - 1
          );
          renderAgentSearchResults();
        }
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (state.valoTac.filteredAgents.length) {
          state.valoTac.searchActiveIndex = Math.max(state.valoTac.searchActiveIndex - 1, 0);
          renderAgentSearchResults();
        }
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        var selected = state.valoTac.filteredAgents[state.valoTac.searchActiveIndex];
        if (selected) {
          selectSearchedAgent(selected.id);
        }
      }
    });

    els.agentSearchOverlay.addEventListener("mousedown", function (event) {
      if (event.target === els.agentSearchOverlay) {
        closeAgentSearch();
      }
    });

    if (els.createLobbyBtn) {
      els.createLobbyBtn.addEventListener("click", function () {
        connectToRoom(true);
      });
    }

    if (els.joinLobbyBtn) {
      els.joinLobbyBtn.addEventListener("click", function () {
        connectToRoom(false);
      });
    }

    if (els.leaveLobbyBtn) {
      els.leaveLobbyBtn.addEventListener("click", function () {
        if (state.valoTac.multiplayer.socket && state.valoTac.multiplayer.socket.readyState === WebSocket.OPEN) {
          sendMultiplayer("leave-room", {});
        }
        disconnectMultiplayer();
      });
    }

    if (els.copyRoomCodeBtn) {
      els.copyRoomCodeBtn.addEventListener("click", function () {
        var code = state.valoTac.multiplayer.roomCode;
        if (!code) return;

        navigator.clipboard.writeText(code).then(function () {
          setLobbyStatus("Код скопирован: " + code, "ok");
        }).catch(function () {
          setLobbyStatus("Не удалось скопировать код.", "error");
        });
      });
    }

    if (els.roomCodeInput) {
      els.roomCodeInput.addEventListener("input", function () {
        els.roomCodeInput.value = normalizeRoomCode(els.roomCodeInput.value);
      });
    }

    window.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.ui.onlineModalOpen) {
        closeOnlineModal();
        return;
      }

      if (isSearchHotkey(event) && state.view === "valotac" && state.valoTac.currentMapId) {
        event.preventDefault();
        if (state.valoTac.searchOpen) {
          closeAgentSearch();
        } else {
          openAgentSearch();
        }
        return;
      }

      if (state.valoTac.searchOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeAgentSearch();
        }
        return;
      }

      if (isUndoHotkey(event)) {
        event.preventDefault();
        undoOwnStroke();
        return;
      }

      if (isPrevColorHotkey(event)) {
        event.preventDefault();
        shiftColor(-1);
        return;
      }

      if (isNextColorHotkey(event)) {
        event.preventDefault();
        shiftColor(1);
        return;
      }

      if (isClearHotkey(event)) {
        event.preventDefault();
        clearOwnStrokes();
        return;
      }

      if (isCenterMapHotkey(event)) {
        event.preventDefault();
        fitBoardToWrap(els.valoCanvas.width || 1024, els.valoCanvas.height || 1024);
      }
    });

    window.addEventListener("resize", debounce(function () {
      if (state.valoTac.currentMapId && els.valoCanvas.width && els.valoCanvas.height) {
        fitBoardToWrap(els.valoCanvas.width, els.valoCanvas.height);
      }
      fitAllHeroNames();
    }, 120));
  }

  bindUpdaterUi();
  renderMapList();
  renderAgentTray();
  updateColorSwatches();
  renderHeroCards();
  renderParticipants();
  updateLobbyButtons();
  updateClearButtonLabel();
  renderValoTacPlayers();
  setLobbyStatus("Offline");
  bindEvents();
  setView("home");
});