(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const titleScreen = document.getElementById("title-screen");
  const endScreen = document.getElementById("end-screen");
  const titleButton = document.getElementById("title-button");
  const replayButton = document.getElementById("replay-button");
  const menuButton = document.getElementById("menu-button");
  const fullscreenButton = document.getElementById("fullscreen-button");
  const introAudio = document.getElementById("intro-audio");
  const mapAudio = document.getElementById("map-audio");
  const finalAudio = document.getElementById("final-audio");
  const stickZone = document.getElementById("stick-zone");
  const stickKnob = document.getElementById("stick-knob");
  const pauseOverlay = document.getElementById("pause-overlay");
  const settingsOverlay = document.getElementById("settings-overlay");
  const settingMusicToggle = document.getElementById("setting-music-toggle");
  const settingVolDown = document.getElementById("setting-vol-down");
  const settingVolUp = document.getElementById("setting-vol-up");
  const settingVolValue = document.getElementById("setting-vol-value");
  const settingOpacityDown = document.getElementById("setting-opacity-down");
  const settingOpacityUp = document.getElementById("setting-opacity-up");
  const settingOpacityValue = document.getElementById("setting-opacity-value");
  const settingsCloseButton = document.getElementById("settings-close");
  const selectButton = document.getElementById("select-button");
  const startButton = document.getElementById("start-button");
  const W = canvas.width;
  const H = canvas.height;
  const HUD_AUTO_BUTTON = { x: 124, y: 8, w: 52, h: 29 };
  const WORLD_W = 4300;
  const FLOOR_MIN = 176;
  const FLOOR_MAX = 232;
  const GRAVITY = 0.34;
  const HERO_NAMES = {
    chris: "Chris",
    nico: "Nico",
    thomas: "Thomas",
  };
  /** Ritmo aproximado da trilha final — ajuste para alinhar fogos à música */
  const FINAL_BPM = 94;
  const FINAL_BEAT_OFFSET_SEC = 0.06;
  const ENDING_CREDITS = [
    "Chris — obrigado por cada momento.",
    "Laura, Clara e família",
    "Nico · Thomas · Evelin",
    "Osvaldo · Ivone · Camille",
    "Que este novo ciclo seja leve, forte e cheio de amor.",
    "Feliz aniversário — com orgulho de você.",
    "CHRIS, O JOGO · feito com carinho",
  ];

  const SETTINGS_KEY = "chrisGameSettingsV1";
  const BASE_AUDIO_VOL = { intro: 0.65, map: 0.62, final: 0.68 };

  function normalizeSettings(raw) {
    const fallback = { musicEnabled: true, volume: 1, touchManualOpacity: 0.62 };
    if (!raw || typeof raw !== "object") return { ...fallback };
    const volume = Math.max(0, Math.min(1, Number(raw.volume)));
    const touchManualOpacity = Math.max(0.35, Math.min(0.95, Number(raw.touchManualOpacity)));
    return {
      musicEnabled: Boolean(raw.musicEnabled ?? true),
      volume: Number.isFinite(volume) ? volume : fallback.volume,
      touchManualOpacity: Number.isFinite(touchManualOpacity) ? touchManualOpacity : fallback.touchManualOpacity,
    };
  }

  let settings = normalizeSettings();

  function loadSettingsFromStorage() {
    try {
      const stored = window.localStorage?.getItem(SETTINGS_KEY);
      if (!stored) return;
      settings = normalizeSettings({ ...settings, ...JSON.parse(stored) });
    } catch (_) {}
  }

  function saveSettingsToStorage() {
    try {
      window.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (_) {}
  }

  ctx.imageSmoothingEnabled = false;
  loadSettingsFromStorage();

  const controls = {
    keys: new Set(),
    actionDown: Object.create(null),
    justPressed: Object.create(null),
    touchX: 0,
    touchY: 0,
  };

  const keyMap = {
    KeyJ: "punch",
    KeyZ: "punch",
    KeyK: "jump",
    KeyX: "jump",
    KeyL: "special",
    KeyC: "special",
    KeyI: "morph",
    KeyV: "morph",
  };

  const moveKeys = {
    ArrowLeft: [-1, 0],
    KeyA: [-1, 0],
    ArrowRight: [1, 0],
    KeyD: [1, 0],
    ArrowUp: [0, -1],
    KeyW: [0, -1],
    ArrowDown: [0, 1],
    KeyS: [0, 1],
  };

  const state = {
    mode: "title",
    titleArmed: false,
    autoStartAt: 0,
    autoPlay: false,
    pendingAutoPlay: false,
    titleTime: 0,
    time: 0,
    lastTick: 0,
    cameraX: 0,
    shake: 0,
    player: null,
    selectedHeroId: "chris",
    allies: [],
    enemies: [],
    obstacles: [],
    items: [],
    waves: [],
    particles: [],
    projectiles: [],
    floaters: [],
    fireworks: [],
    family: [],
    nicoNpc: null,
    nicoJoined: false,
    thomasJoined: false,
    boss: null,
    bossActive: false,
    bossVulnerable: false,
    dramaTriggered: false,
    arenaLockX: null,
    bossDeathTimer: 0,
    bossTransformTimer: 0,
    bossNextPhase: 2,
    hammerThrow: null,
    zordBeamTimer: 0,
    dramaTimer: 0,
    dramaStep: 0,
    deathTimer: 0,
    endingTimer: 0,
    dialogue: null,
    dialogueTimer: 0,
    finaleOverlayShown: false,
    endingLastBeat: -1,
    userPaused: false,
    settingsOpen: false,
    bgmDuckMul: 1,
  };

  function applyTouchOpacityCss() {
    document.documentElement.style.setProperty("--touch-manual-opacity", String(settings.touchManualOpacity));
  }

  function applyBgmVolumes() {
    const master = settings.musicEnabled ? settings.volume : 0;
    const g = master * state.bgmDuckMul;
    introAudio.volume = BASE_AUDIO_VOL.intro * g;
    mapAudio.volume = BASE_AUDIO_VOL.map * g;
    finalAudio.volume = BASE_AUDIO_VOL.final * g;
  }

  applyTouchOpacityCss();
  applyBgmVolumes();

  const scenery = buildScenery();
  let audioCtx = null;
  let entityId = 1;
  let stickPointer = null;

  function buildScenery() {
    const clouds = [];
    const buildings = [];
    const trees = [];
    const details = [];

    for (let i = 0; i < 24; i += 1) {
      clouds.push({
        x: i * 205 + ((i * 53) % 90),
        y: 22 + ((i * 29) % 44),
        scale: 0.75 + ((i * 17) % 50) / 100,
      });
    }

    for (let i = 0; i < 32; i += 1) {
      buildings.push({
        x: i * 150 + ((i * 37) % 52),
        w: 46 + ((i * 19) % 46),
        h: 42 + ((i * 31) % 55),
        color: ["#6e8ac2", "#8179ae", "#5698b1", "#b37a76", "#759d79"][i % 5],
      });
    }

    for (let i = 0; i < 46; i += 1) {
      trees.push({
        x: i * 96 + 24 + ((i * 43) % 40),
        y: 154 + ((i * 11) % 12),
        tone: ["#23824d", "#2d9d5a", "#4a9a46", "#197d61"][i % 4],
      });
    }

    for (let i = 0; i < 70; i += 1) {
      details.push({
        x: i * 68 + ((i * 23) % 20),
        y: 244 + ((i * 13) % 12),
        color: ["#e9db77", "#ffffff", "#78cfe8", "#f48f72"][i % 4],
      });
    }

    return { clouds, buildings, trees, details };
  }

  function heroName(id) {
    return HERO_NAMES[id] || "Chris";
  }

  function getEarlyAllyId() {
    return state.selectedHeroId === "nico" ? "chris" : "nico";
  }

  function getLateAllyId() {
    return state.selectedHeroId === "thomas" ? "chris" : "thomas";
  }

  function getHeroById(heroId) {
    if (state.player?.heroId === heroId) return state.player;
    return state.allies.find((ally) => ally.heroId === heroId) || null;
  }

  function getBirthdayHero() {
    return getHeroById("chris") || state.player;
  }

  function makeObstacles() {
    return [
      { type: "trash", x: 345, y: 221, rx: 14, ry: 13, solid: true },
      { type: "manhole", x: 520, y: 239, rx: 0, ry: 0, solid: false },
      { type: "car", x: 710, y: 188, rx: 45, ry: 18, solid: true, color: "#4c93c9" },
      { type: "barrel", x: 880, y: 222, rx: 13, ry: 13, solid: true, breakable: true, hp: 2 },
      { type: "rocks", x: 1045, y: 229, rx: 18, ry: 10, solid: true },
      { type: "manhole", x: 1185, y: 236, rx: 0, ry: 0, solid: false },
      { type: "barrel", x: 1375, y: 197, rx: 13, ry: 13, solid: true, breakable: true, hp: 2 },
      { type: "trash", x: 1625, y: 226, rx: 14, ry: 13, solid: true },
      { type: "car", x: 1810, y: 195, rx: 46, ry: 18, solid: true, color: "#d05f48" },
      { type: "barrel", x: 2085, y: 222, rx: 13, ry: 13, solid: true, breakable: true, hp: 2 },
      { type: "rocks", x: 2325, y: 188, rx: 18, ry: 10, solid: true },
      { type: "manhole", x: 2490, y: 238, rx: 0, ry: 0, solid: false },
      { type: "barrel", x: 2660, y: 222, rx: 13, ry: 13, solid: true, breakable: true, hp: 2 },
      { type: "car", x: 2860, y: 194, rx: 46, ry: 18, solid: true, color: "#a7b55d" },
      { type: "trash", x: 3045, y: 226, rx: 14, ry: 13, solid: true },
      { type: "barrel", x: 3235, y: 200, rx: 13, ry: 13, solid: true, breakable: true, hp: 2 },
      { type: "manhole", x: 3425, y: 239, rx: 0, ry: 0, solid: false },
      { type: "rocks", x: 3585, y: 228, rx: 18, ry: 10, solid: true },
      { type: "barrel", x: 3730, y: 222, rx: 13, ry: 13, solid: true, breakable: true, hp: 2 },
    ].map((obstacle, index) => ({
      id: `obstacle-${index}`,
      hp: obstacle.hp || 1,
      maxHp: obstacle.hp || 1,
      broken: false,
      wobble: 0,
      ...obstacle,
    }));
  }

  function makeWaves() {
    return [
      {
        trigger: 250,
        enemies: [
          ["grunt", 390, 202],
          ["grunt", 440, 224],
        ],
      },
      {
        trigger: 620,
        enemies: [
          ["grunt", 760, 190],
          ["runner", 820, 218],
          ["grunt", 875, 206],
        ],
      },
      {
        trigger: 980,
        enemies: [
          ["brute", 1110, 214],
          ["grunt", 1160, 188],
        ],
      },
      {
        trigger: 1420,
        enemies: [
          ["runner", 1535, 198],
          ["grunt", 1585, 228],
          ["brute", 1650, 208],
        ],
      },
      {
        trigger: 1900,
        enemies: [
          ["grunt", 2050, 190],
          ["runner", 2105, 224],
          ["grunt", 2170, 208],
          ["brute", 2225, 218],
        ],
      },
      {
        trigger: 2380,
        enemies: [
          ["runner", 2520, 194],
          ["grunt", 2585, 224],
          ["brute", 2660, 210],
        ],
      },
      {
        trigger: 2860,
        enemies: [
          ["grunt", 3015, 188],
          ["runner", 3075, 225],
          ["grunt", 3145, 206],
          ["brute", 3210, 219],
        ],
      },
      {
        trigger: 3330,
        enemies: [
          ["runner", 3460, 198],
          ["brute", 3535, 216],
          ["grunt", 3600, 230],
        ],
      },
    ].map((wave, index) => ({ ...wave, id: `wave-${index}`, spawned: false }));
  }

  function createHero(id, x, y) {
    const base = {
      id: entityId += 1,
      kind: "hero",
      heroId: id,
      x,
      y,
      z: 0,
      vz: 0,
      vx: 0,
      vy: 0,
      hp: 5,
      maxHp: 5,
      facing: 1,
      speed: 1.25,
      morph: false,
      megazord: false,
      power: 0,
      attackTimer: 0,
      attackCooldown: 0,
      attackType: "",
      attackHit: false,
      hurtTimer: 0,
      invuln: 0,
      aiCooldown: 0,
      followOffset: 0,
      walkCycle: 0,
      moving: false,
      hasHammer: id === "thomas",
      arrivalTimer: 0,
    };

    if (id === "nico") {
      base.hp = 4;
      base.maxHp = 4;
      base.speed = 1.46;
      base.followOffset = -56;
    }

    if (id === "thomas") {
      base.hp = 5;
      base.maxHp = 5;
      base.speed = 1.34;
      base.followOffset = 42;
    }

    return base;
  }

  function createEnemy(type, x, y) {
    const stats = {
      grunt: { hp: 2, speed: 0.66, range: 25, damage: 1 },
      runner: { hp: 2, speed: 0.9, range: 24, damage: 1 },
      brute: { hp: 4, speed: 0.5, range: 30, damage: 1 },
      boss: { hp: 46, speed: 0.72, range: 42, damage: 1 },
    }[type];

    return {
      id: entityId += 1,
      kind: type === "boss" ? "boss" : "enemy",
      enemyType: type,
      x,
      y,
      z: 0,
      vx: 0,
      vy: 0,
      hp: stats.hp,
      maxHp: stats.hp,
      speed: stats.speed,
      range: stats.range,
      damage: stats.damage,
      facing: -1,
      attackTimer: 0,
      attackCooldown: 30 + Math.random() * 26,
      attackHit: false,
      hurtTimer: 0,
      invuln: 0,
      dead: false,
      deathTimer: 0,
      flash: 0,
      walkCycle: 0,
      moving: false,
      transformed: false,
      phase: type === "boss" ? 1 : 0,
      offscreen: false,
      powerCooldown: type === "boss" ? 120 : 0,
      preThomasCooldown: type === "boss" ? 78 : 0,
    };
  }

  function canPauseGameplay() {
    return ["playing", "drama", "bossTransform", "bossDeath", "dying"].includes(state.mode);
  }

  function shouldPauseGameUpdates() {
    if (state.settingsOpen) return true;
    if (state.userPaused && canPauseGameplay()) return true;
    return false;
  }

  function shouldPauseAllAudio() {
    if (state.settingsOpen) return true;
    if (state.userPaused && canPauseGameplay()) return true;
    return false;
  }

  function resumeAudioForCurrentMode() {
    unlockAudio();
    if (shouldPauseAllAudio()) return;
    if (state.mode === "title") {
      tryStartIntroFromBeginning(false);
    } else if (state.mode === "ending") {
      playAudio(finalAudio);
    } else if (["playing", "drama", "bossTransform", "bossDeath", "dying"].includes(state.mode)) {
      playAudio(mapAudio);
    }
  }

  function syncFreezeAudio() {
    if (shouldPauseAllAudio()) {
      introAudio.pause();
      mapAudio.pause();
      finalAudio.pause();
    } else {
      resumeAudioForCurrentMode();
    }
  }

  function clearActionEdges() {
    controls.justPressed = Object.create(null);
  }

  function updatePauseSettingsOverlays() {
    const pauseVisible = state.userPaused && !state.settingsOpen && canPauseGameplay();
    document.body.classList.toggle("user-paused", pauseVisible);
    if (pauseOverlay) {
      pauseOverlay.classList.toggle("active", pauseVisible);
      pauseOverlay.setAttribute("aria-hidden", pauseVisible ? "false" : "true");
    }
    if (settingsOverlay) {
      settingsOverlay.classList.toggle("active", state.settingsOpen);
      settingsOverlay.setAttribute("aria-hidden", state.settingsOpen ? "false" : "true");
    }
  }

  function refreshSettingsPanel() {
    if (settingMusicToggle) {
      settingMusicToggle.textContent = settings.musicEnabled ? "Ligada" : "Desligada";
    }
    if (settingVolValue) {
      settingVolValue.textContent = `${Math.round(settings.volume * 100)}%`;
    }
    if (settingOpacityValue) {
      settingOpacityValue.textContent = `${Math.round(settings.touchManualOpacity * 100)}%`;
    }
  }

  function openSettings() {
    unlockAudio();
    state.settingsOpen = true;
    clearStick();
    refreshSettingsPanel();
    syncFreezeAudio();
    updatePauseSettingsOverlays();
  }

  function closeSettings() {
    state.settingsOpen = false;
    syncFreezeAudio();
    updatePauseSettingsOverlays();
  }

  function toggleSettings() {
    if (state.settingsOpen) closeSettings();
    else openSettings();
  }

  function toggleUserPause() {
    if (!canPauseGameplay()) return;
    state.userPaused = !state.userPaused;
    if (state.userPaused) clearStick();
    clearActionEdges();
    syncFreezeAudio();
    updatePauseSettingsOverlays();
  }

  function onStartButton() {
    unlockAudio();
    if (state.settingsOpen) {
      closeSettings();
      clearActionEdges();
      return;
    }
    if (!canPauseGameplay()) return;
    toggleUserPause();
  }

  function onSelectButton() {
    unlockAudio();
    toggleSettings();
    clearActionEdges();
  }

  function bumpVolume(delta) {
    settings.volume = Math.max(0, Math.min(1, Math.round((settings.volume + delta) * 100) / 100));
    saveSettingsToStorage();
    applyBgmVolumes();
    refreshSettingsPanel();
    syncFreezeAudio();
  }

  function bumpTouchOpacity(delta) {
    settings.touchManualOpacity = Math.max(
      0.35,
      Math.min(0.95, Math.round((settings.touchManualOpacity + delta) * 100) / 100)
    );
    saveSettingsToStorage();
    applyTouchOpacityCss();
    refreshSettingsPanel();
  }

  function toggleMusicEnabled() {
    settings.musicEnabled = !settings.musicEnabled;
    saveSettingsToStorage();
    applyBgmVolumes();
    refreshSettingsPanel();
    syncFreezeAudio();
  }

  function resetLevel() {
    entityId = 1;
    state.cameraX = 0;
    state.shake = 0;
    state.selectedHeroId = "chris";
    state.player = createHero("chris", 82, 210);
    state.allies = [];
    state.enemies = [];
    state.obstacles = makeObstacles();
    state.items = [];
    state.projectiles = [];
    state.waves = makeWaves();
    state.particles = [];
    state.floaters = [];
    state.fireworks = [];
    state.family = [];
    state.nicoNpc = { x: 1280, y: 207, facing: -1, heroId: getEarlyAllyId() };
    state.nicoJoined = false;
    state.thomasJoined = false;
    state.boss = null;
    state.bossActive = false;
    state.bossVulnerable = false;
    state.dramaTriggered = false;
    state.arenaLockX = null;
    state.bossDeathTimer = 0;
    state.bossTransformTimer = 0;
    state.bossNextPhase = 2;
    state.hammerThrow = null;
    state.zordBeamTimer = 0;
    state.dramaTimer = 0;
    state.dramaStep = 0;
    state.deathTimer = 0;
    state.endingTimer = 0;
    state.dialogue = null;
    state.dialogueTimer = 0;
    state.finaleOverlayShown = false;
    state.endingLastBeat = -1;
    state.userPaused = false;
    state.settingsOpen = false;
    state.bgmDuckMul = 1;
    updatePauseSettingsOverlays();
    endScreen.classList.remove("active");
  }

  function setAutoPlay(enabled) {
    state.autoPlay = Boolean(enabled);
    document.body.classList.toggle(
      "auto-playing",
      state.autoPlay && state.mode !== "title" && state.mode !== "ending"
    );
  }

  function startLevel(autoPlay = false) {
    resetLevel();
    state.mode = "playing";
    document.body.classList.add("playing");
    setAutoPlay(autoPlay);
    titleScreen.classList.remove("active");
    endScreen.classList.remove("active");
    stopAudio(finalAudio);
    stopAudio(introAudio);
    state.bgmDuckMul = 1;
    applyBgmVolumes();
    playAudio(mapAudio);
  }

  function unlockAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }

    if (audioCtx?.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  function playAudio(audio) {
    unlockAudio();
    audio.play().catch(() => {});
  }

  function stopAudio(audio) {
    audio.pause();
    audio.currentTime = 0;
  }

  function tryStartIntroFromBeginning(force = false) {
    if (state.mode !== "title") return;
    if (state.settingsOpen) return;
    if (force) introAudio.currentTime = 0;
    if (!introAudio.paused && !force) return;
    playAudio(introAudio);
  }

  /** Toca a música do menu assim que possível (autoplay; navegador pode bloquear até haver gesto). */
  function kickIntroAutoplay() {
    if (state.mode !== "title") return;
    if (state.settingsOpen) return;
    unlockAudio();
    introAudio.play().catch(() => {});
  }

  function playSfx(type) {
    unlockAudio();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const gain = audioCtx.createGain();
    const osc = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();

    const presets = {
      punch: [160, 70, 0.08, "square", 0.2],
      hit: [260, 95, 0.1, "sawtooth", 0.24],
      jump: [420, 620, 0.12, "triangle", 0.14],
      special: [180, 760, 0.24, "sawtooth", 0.32],
      morph: [240, 980, 0.45, "square", 0.34],
      hurt: [110, 60, 0.18, "sawtooth", 0.22],
      thunder: [65, 34, 0.5, "sawtooth", 0.42],
      firework: [520, 120, 0.32, "triangle", 0.26],
      heart: [360, 720, 0.18, "triangle", 0.18],
      menu: [320, 560, 0.1, "triangle", 0.18],
      barrel: [190, 95, 0.22, "square", 0.28],
      land: [120, 55, 0.2, "triangle", 0.28],
      bossPower: [520, 130, 0.34, "sawtooth", 0.36],
      transform: [160, 1180, 0.62, "sawtooth", 0.42],
      boom: [90, 28, 0.58, "sawtooth", 0.48],
    };

    const [from, to, length, wave, volume] = presets[type] || presets.hit;
    filter.type = "lowpass";
    filter.frequency.value = type === "thunder" ? 420 : 1600;
    osc.type = wave;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + length);
    osc2.type = "square";
    osc2.frequency.setValueAtTime(from * 0.5, now);
    osc2.frequency.exponentialRampToValueAtTime(Math.max(20, to * 0.5), now + length);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.min(0.75, volume * 1.25), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + length + 0.02);
    osc2.stop(now + length + 0.02);
  }

  function playLayeredSfx(types) {
    for (const type of types) {
      playSfx(type);
    }
  }

  function pressAction(action) {
    if (!controls.actionDown[action]) {
      controls.justPressed[action] = true;
    }
    controls.actionDown[action] = true;
  }

  function releaseAction(action) {
    controls.actionDown[action] = false;
  }

  function consumeAction(action) {
    const value = Boolean(controls.justPressed[action]);
    controls.justPressed[action] = false;
    return value;
  }

  function getMoveVector() {
    let x = controls.touchX;
    let y = controls.touchY;

    for (const [code, axis] of Object.entries(moveKeys)) {
      if (controls.keys.has(code)) {
        x += axis[0];
        y += axis[1];
      }
    }

    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }

    return { x, y };
  }

  function setDialogue(name, text, frames = 190) {
    state.dialogue = { name, text };
    state.dialogueTimer = frames;
  }

  function addParticle(particle) {
    state.particles.push({
      life: 34,
      maxLife: 34,
      vx: 0,
      vy: 0,
      size: 2,
      color: "#ffffff",
      type: "spark",
      ...particle,
    });
  }

  function burst(x, y, color, amount = 12) {
    for (let i = 0; i < amount; i += 1) {
      const angle = (Math.PI * 2 * i) / amount;
      const speed = 0.8 + (i % 5) * 0.28;
      addParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.35,
        color,
        size: 2 + (i % 3),
        life: 26 + (i % 5) * 5,
        maxLife: 48,
      });
    }
  }

  function addFloater(text, x, y, color = "#fff1a3") {
    state.floaters.push({ text, x, y, color, life: 58, maxLife: 58 });
  }

  function spawnWave(wave) {
    wave.spawned = true;
    state.arenaLockX = wave.trigger + 350;
    for (const [type, x, y] of wave.enemies) {
      state.enemies.push(createEnemy(type, x, y));
    }
    setDialogue(heroName(state.player.heroId), "Bora abrir caminho!", 120);
  }

  function spawnBoss() {
    state.boss = createEnemy("boss", 3920, 207);
    state.bossActive = true;
    state.enemies.push(state.boss);
    setDialogue("Vilão", "Vocês não passam daqui!", 180);
  }

  function joinNico() {
    const allyId = getEarlyAllyId();
    if (state.allies.some((ally) => ally.heroId === allyId)) return;
    state.nicoJoined = true;
    const ally = createHero(allyId, state.player.x - 48, state.player.y + 8);
    ally.followOffset = -56;
    state.allies.push(ally);
    setDialogue(heroName(allyId), `${heroName(state.player.heroId)}! Eu cubro sua esquerda.`, 190);
    burst(ally.x, ally.y - 34, "#ffe36d", 14);
  }

  function ensureNicoAlly() {
    const allyId = getEarlyAllyId();
    state.nicoJoined = true;
    let ally = state.allies.find((member) => member.heroId === allyId);
    if (!ally) {
      ally = createHero(allyId, state.player.x - 58, clamp(state.player.y + 10, FLOOR_MIN, FLOOR_MAX));
      ally.followOffset = -56;
      state.allies.unshift(ally);
    }
    return ally;
  }

  function joinThomas() {
    if (state.thomasJoined) return;
    const allyId = getLateAllyId();
    state.thomasJoined = true;
    const ally = createHero(allyId, state.player.x + 92, state.player.y - 2);
    ally.followOffset = 42;
    ally.z = 72;
    ally.arrivalTimer = 150;
    ally.hasHammer = ally.heroId === "thomas";
    state.allies.push(ally);
    burst(ally.x, ally.y - 34, "#fff8bf", 24);
  }

  function morphHero(hero, forced = false) {
    if (hero.morph && !forced) return;
    if (!forced && hero.power < 100) return;

    hero.morph = true;
    hero.power = forced ? 100 : Math.max(hero.power, 65);
    hero.hp = hero.maxHp;
    hero.invuln = 42;
    state.shake = Math.max(state.shake, forced ? 14 : 8);
    playLayeredSfx(forced ? ["transform", "thunder"] : ["morph", "special"]);
    burst(hero.x, hero.y - 28, rangerColor(hero), forced ? 42 : 26);
    for (let i = 0; i < 4; i += 1) {
      addParticle({
        type: "lightning",
        x: hero.x - 24 + i * 16,
        y: hero.y - 80 + i * 6,
        vx: 0,
        vy: 0,
        color: i % 2 ? "#fffbe8" : rangerColor(hero),
        size: 2,
        life: 16 + i * 3,
        maxLife: 28,
      });
    }
    addFloater("POWER!", hero.x, hero.y - 58, "#fff5a6");
  }

  function updateTitle(step) {
    state.titleTime += step / 60;
    state.time += step / 60;
    state.cameraX = 0;

    updateParticles(step);
  }

  function updatePlaying(step) {
    state.time += step / 60;
    if (state.dialogueTimer > 0) state.dialogueTimer -= step;
    if (state.dialogueTimer <= 0) state.dialogue = null;
    if (state.shake > 0) state.shake -= step;

    updatePlayer(step);
    updateAllies(step);
    updateSpawns();
    updateEnemies(step);
    updateProjectiles(step);
    if (!state.enemies.some((enemy) => !enemy.dead && enemy.kind === "enemy")) {
      state.arenaLockX = null;
    }
    updateObstacles(step);
    updateItems(step);
    updateParticles(step);
    updateFloaters(step);
    updateCamera(step);
  }

  function updatePlayer(step) {
    const p = state.player;
    const autoIntent = state.autoPlay ? getAutoPilotIntent(p) : null;
    const move = autoIntent?.move || getMoveVector();
    const oldX = p.x;
    const oldY = p.y;

    if (p.invuln > 0) p.invuln -= step;
    if (p.hurtTimer > 0) p.hurtTimer -= step;
    if (p.attackCooldown > 0) p.attackCooldown -= step;
    if (p.attackTimer > 0) {
      p.attackTimer -= step;
      if (!p.attackHit && p.attackTimer < (p.attackType === "special" ? 17 : 10)) {
        resolveHeroAttack(p);
      }
    }

    if (autoIntent?.morph || (!state.autoPlay && consumeAction("morph"))) morphHero(p);

    if ((autoIntent?.jump || (!state.autoPlay && consumeAction("jump"))) && p.z <= 0.2) {
      p.vz = 6.2;
      p.z = 1;
      playSfx("jump");
    }

    if (autoIntent?.special || (!state.autoPlay && consumeAction("special"))) {
      if (p.megazord || p.morph || p.power >= 35) startHeroAttack(p, "special");
    }

    if (autoIntent?.punch || (!state.autoPlay && consumeAction("punch"))) {
      startHeroAttack(p, "punch");
    }

    const canMove = p.hurtTimer <= 0;
    const speed = (p.megazord ? 1.08 : p.morph ? 1.58 : 1.25) * (p.attackTimer > 0 ? 0.72 : 1);

    moveActor(p, canMove ? move.x : 0, canMove ? move.y * 0.72 : 0, speed, step, 0.24);
    if (Math.abs(p.vx) > 0.05) p.facing = Math.sign(p.vx);

    p.vz -= GRAVITY * step;
    p.z += p.vz * step;
    if (p.z <= 0) {
      p.z = 0;
      p.vz = 0;
    }

    p.x = clamp(p.x, 35, WORLD_W - 65);
    if (state.arenaLockX) p.x = Math.min(p.x, state.arenaLockX);
    p.y = clamp(p.y, FLOOR_MIN, FLOOR_MAX);
    pushOutObstacles(p);
    p.x = clamp(p.x, 35, WORLD_W - 65);
    if (state.arenaLockX) p.x = Math.min(p.x, state.arenaLockX);
    p.y = clamp(p.y, FLOOR_MIN, FLOOR_MAX);
    updateWalkCycle(p, oldX, oldY);
  }

  function getAutoPilotIntent(hero) {
    const intent = {
      move: { x: 0, y: 0 },
      punch: false,
      special: false,
      morph: false,
      jump: false,
    };

    if (state.mode === "bossTransform") {
      const falling = state.projectiles.find((projectile) => projectile.kind === "fallingPower" && Math.abs(projectile.x - hero.x) < 42 && projectile.y < screenY(hero.x, hero.y));
      if (falling) {
        intent.move.x = falling.x < hero.x ? 1 : -1;
        intent.move.y = hero.y > 204 ? -1 : 1;
      } else {
        intent.move.x = 0;
        intent.move.y = 0;
      }
      return intent;
    }

    if (!hero.morph && (hero.power >= 100 || state.bossVulnerable)) {
      intent.morph = true;
    }

    const heart = chooseAutoHeart(hero);
    if (heart) {
      steerToward(intent, hero, heart.x, getHeartPickupY(heart), 8, 7);
      return intent;
    }

    const enemy = chooseAutoEnemy(hero);
    if (enemy) {
      const dx = enemy.x - hero.x;
      const dy = enemy.y - hero.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const idealRange = enemy.kind === "boss" ? 32 : 24;
      const goalX = enemy.x - Math.sign(dx || hero.facing || 1) * idealRange;
      steerToward(intent, hero, goalX, enemy.y, 8, 5);

      if (absDx < (hero.megazord ? 56 : 38) && absDy < 24) intent.punch = true;
      if ((hero.megazord || hero.morph || hero.power >= 45) && absDx < 90 && absDy < 42) intent.special = true;
      if (!state.bossVulnerable && enemy.kind === "boss" && absDx < 42 && absDy < 24) intent.special = false;
      return avoidAutoObstacle(hero, intent, enemy);
    }

    const barrel = chooseAutoBarrel(hero);
    if (barrel) {
      steerToward(intent, hero, barrel.x - Math.sign(barrel.x - hero.x || 1) * 26, barrel.y, 8, 7);
      if (Math.abs(barrel.x - hero.x) < 38 && Math.abs(barrel.y - hero.y) < 28) {
        intent.punch = true;
      }
      return intent;
    }

    const nextX = state.arenaLockX ? Math.min(state.arenaLockX - 22, hero.x + 80) : hero.x + 90;
    steerToward(intent, hero, nextX, 211, 9, 12);
    return avoidAutoObstacle(hero, intent, null);
  }

  function chooseAutoHeart(hero) {
    if (hero.hp >= hero.maxHp) return null;

    let best = null;
    let bestScore = Infinity;
    for (const item of state.items) {
      if (item.type !== "heart" || item.collected) continue;
      const aheadBonus = item.x >= hero.x - 18 ? -35 : 35;
      const score = Math.abs(item.x - hero.x) + Math.abs(getHeartPickupY(item) - hero.y) * 1.4 + aheadBonus;
      if (score < bestScore && Math.abs(item.x - hero.x) < 360) {
        best = item;
        bestScore = score;
      }
    }

    return best;
  }

  function chooseAutoEnemy(hero) {
    let best = null;
    let bestScore = Infinity;

    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      const dx = Math.abs(enemy.x - hero.x);
      const dy = Math.abs(enemy.y - hero.y);
      const aheadBonus = enemy.x >= hero.x - 35 ? -80 : 35;
      const bossBonus = enemy.kind === "boss" ? -120 : 0;
      const score = dx + dy * 1.8 + aheadBonus + bossBonus;
      if (score < bestScore) {
        best = enemy;
        bestScore = score;
      }
    }

    return best;
  }

  function chooseAutoBarrel(hero) {
    let best = null;
    let bestScore = Infinity;

    for (const obstacle of state.obstacles) {
      if (!obstacle.breakable || obstacle.broken) continue;
      const dx = obstacle.x - hero.x;
      const dy = Math.abs(obstacle.y - hero.y);
      if (dx < -20 || dx > 180) continue;
      const score = dx + dy * 2;
      if (score < bestScore) {
        best = obstacle;
        bestScore = score;
      }
    }

    return best;
  }

  function steerToward(intent, actor, x, y, deadX, deadY) {
    const dx = x - actor.x;
    const dy = y - actor.y;
    intent.move.x = Math.abs(dx) > deadX ? Math.sign(dx) : 0;
    intent.move.y = Math.abs(dy) > deadY ? Math.sign(dy) : 0;
  }

  function avoidAutoObstacle(hero, intent, activeTarget) {
    if (Math.abs(intent.move.x) < 0.1) return intent;

    for (const obstacle of state.obstacles) {
      if (!obstacle.solid || obstacle.broken) continue;
      if (activeTarget && activeTarget.id === obstacle.id) continue;

      const ahead = (obstacle.x - hero.x) * Math.sign(intent.move.x);
      const yClose = Math.abs(obstacle.y - hero.y) < obstacle.ry + 18;
      if (ahead > 4 && ahead < obstacle.rx + 48 && yClose) {
        intent.move.y = obstacle.y > 206 ? -1 : 1;
        if (!obstacle.breakable && Math.abs(hero.vx) < 0.05) intent.jump = true;
        break;
      }
    }

    return intent;
  }

  function moveActor(actor, dirX, dirY, speed, step, accel = 0.2) {
    const length = Math.hypot(dirX, dirY);
    const nx = length > 1 ? dirX / length : dirX;
    const ny = length > 1 ? dirY / length : dirY;
    const easing = Math.min(1, accel * step);
    actor.vx += (nx * speed - actor.vx) * easing;
    actor.vy += (ny * speed - actor.vy) * easing;
    actor.x += actor.vx * step;
    actor.y += actor.vy * step;
  }

  function updateWalkCycle(actor, oldX, oldY) {
    const distance = Math.hypot(actor.x - oldX, (actor.y - oldY) * 1.35);
    actor.moving = distance > 0.045 && actor.z <= 1.5;
    if (actor.moving) {
      actor.walkCycle += distance * 0.48;
    }
  }

  function pushOutObstacles(actor) {
    for (const obstacle of state.obstacles) {
      if (!obstacle.solid || obstacle.broken) continue;
      const dx = actor.x - obstacle.x;
      const dy = actor.y - obstacle.y;
      const rx = obstacle.rx + (actor.kind === "enemy" ? 9 : 10);
      const ry = obstacle.ry + 8;

      if (Math.abs(dx) >= rx || Math.abs(dy) >= ry) continue;

      const pushX = rx - Math.abs(dx);
      const pushY = ry - Math.abs(dy);
      if (pushX < pushY) {
        actor.x += Math.sign(dx || 1) * pushX;
        actor.vx *= -0.12;
      } else {
        actor.y += Math.sign(dy || 1) * pushY;
        actor.vy *= -0.12;
      }
    }
  }

  function startHeroAttack(hero, type) {
    if (hero.attackCooldown > 0 || hero.hurtTimer > 0) return;

    if (type === "special" && hero === state.player && !hero.megazord) {
      const cost = hero.morph ? 18 : 35;
      hero.power = Math.max(0, hero.power - cost);
    }

    hero.attackType = type;
    hero.attackTimer = type === "special" ? (hero.megazord ? 36 : 28) : 16;
    hero.attackCooldown = type === "special" ? (hero.megazord ? 46 : 34) : 17;
    hero.attackHit = false;
    playLayeredSfx(type === "special" ? ["special", hero.morph ? "morph" : "hit"] : ["punch"]);

    if (type === "special") {
      if (hero.megazord) {
        spawnZordBeam(hero);
      }

      const color = hero.morph ? rangerColor(hero) : "#78dfff";
      for (let i = 0; i < 8; i += 1) {
        addParticle({
          type: "bolt",
          x: hero.x + hero.facing * (18 + i * 7),
          y: hero.y - 28 + ((i % 3) - 1) * 8,
          vx: hero.facing * (1.4 + i * 0.04),
          vy: ((i % 2) - 0.5) * 0.6,
          color,
          size: 3,
          life: 22,
          maxLife: 22,
        });
      }
    }
  }

  function spawnZordBeam(hero) {
    state.projectiles.push({
      kind: "zordBeam",
      owner: "hero",
      x: hero.x + hero.facing * 44,
      y: hero.y - 10,
      vx: hero.facing * 5.6,
      vy: 0,
      life: 82,
      radius: 18,
      damage: 9,
      facing: hero.facing,
      pierce: 3,
      color: "#a7ff7a",
    });
    state.shake = Math.max(state.shake, 8);
  }

  function resolveHeroAttack(hero) {
    hero.attackHit = true;
    const type = hero.attackType;
    const isSpecial = type === "special";
    const range = hero.megazord ? (isSpecial ? 220 : 72) : isSpecial ? (hero.morph ? 122 : 92) : (hero.morph ? 56 : 46);
    const yRange = hero.megazord ? 70 : isSpecial ? 54 : 36;
    const damage = hero.megazord ? (isSpecial ? 9 : 3) : isSpecial ? (hero.morph ? 5 : 3) : (hero.morph ? 2 : 1);
    const targets = state.enemies.filter((enemy) => !enemy.dead);
    let hit = false;

    for (const enemy of targets) {
      const dx = (enemy.x - hero.x) * hero.facing;
      const dy = Math.abs(enemy.y - hero.y);
      const verticalOk = dy <= yRange || isSpecial;
      const frontOk = isSpecial ? dx > -12 && dx < range : dx > 0 && dx < range;

      if (frontOk && verticalOk) {
        hurtEnemy(enemy, damage, hero);
        hit = true;
      }
    }

    for (const obstacle of state.obstacles) {
      if (!obstacle.breakable || obstacle.broken) continue;
      const dx = (obstacle.x - hero.x) * hero.facing;
      const dy = Math.abs(obstacle.y - hero.y);
      const frontOk = isSpecial ? dx > -16 && dx < range : dx > -5 && dx < range + 4;
      if (frontOk && dy < yRange + 12) {
        hurtObstacle(obstacle, damage, hero);
        hit = true;
      }
    }

    if (hit) playSfx("hit");
  }

  function updateAllies(step) {
    for (const ally of state.allies) {
      const oldX = ally.x;
      const oldY = ally.y;
      let moveX = 0;
      let moveY = 0;

      if (ally.arrivalTimer > 0) {
        ally.arrivalTimer -= step;
        ally.z = Math.max(0, ally.z - 2.4 * step);
        ally.walkCycle += 0.3 * step;
      }

      if (ally.invuln > 0) ally.invuln -= step;
      if (ally.hurtTimer > 0) ally.hurtTimer -= step;
      if (ally.attackCooldown > 0) ally.attackCooldown -= step;
      if (ally.attackTimer > 0) {
        ally.attackTimer -= step;
        if (!ally.attackHit && ally.attackTimer < (ally.attackType === "special" ? 16 : 9)) {
          resolveHeroAttack(ally);
        }
      }

      const target = nearestEnemy(ally, 135);
      if (target && ally.hurtTimer <= 0) {
        const dx = target.x - ally.x;
        const dy = target.y - ally.y;
        ally.facing = dx >= 0 ? 1 : -1;

        if (Math.abs(dx) > 24) moveX = Math.sign(dx);
        if (Math.abs(dy) > 8) moveY = Math.sign(dy) * 0.58;

        if (Math.abs(dx) < (ally.hasHammer ? 86 : 35) && Math.abs(dy) < 30 && ally.attackCooldown <= 0) {
          startHeroAttack(ally, ally.hasHammer || ally.morph ? "special" : "punch");
        }
      } else {
        const goalX = state.player.x + ally.followOffset;
        const goalY = clamp(state.player.y + (ally.heroId === getEarlyAllyId() ? 12 : -8), FLOOR_MIN, FLOOR_MAX);
        const dx = goalX - ally.x;
        const dy = goalY - ally.y;

        if (Math.abs(dx) > 8) {
          moveX = Math.sign(dx) * 0.82;
          ally.facing = Math.sign(dx);
        }
        if (Math.abs(dy) > 4) moveY = Math.sign(dy) * 0.52;
      }

      moveActor(ally, moveX, moveY, ally.speed, step, 0.18);
      ally.x = clamp(ally.x, 20, WORLD_W - 40);
      ally.y = clamp(ally.y, FLOOR_MIN, FLOOR_MAX);
      pushOutObstacles(ally);
      ally.x = clamp(ally.x, 20, WORLD_W - 40);
      ally.y = clamp(ally.y, FLOOR_MIN, FLOOR_MAX);
      catchUpAlly(ally);
      updateWalkCycle(ally, oldX, oldY);
    }
  }

  function catchUpAlly(ally) {
    const gap = state.player.x - ally.x;
    if (gap < 230 && gap > -170) return;

    ally.x = clamp(state.player.x + ally.followOffset, 20, WORLD_W - 40);
    ally.y = clamp(state.player.y + (ally.heroId === getEarlyAllyId() ? 12 : -8), FLOOR_MIN, FLOOR_MAX);
    ally.vx = 0;
    ally.vy = 0;
    burst(ally.x, ally.y - 24, ally.heroId === getEarlyAllyId() ? "#b9894d" : "#fff5bd", 8);
  }

  function updateSpawns() {
    const p = state.player;
    for (const wave of state.waves) {
      if (!wave.spawned && p.x >= wave.trigger) spawnWave(wave);
    }

    if (!state.nicoJoined && p.x > state.nicoNpc.x - 58) {
      joinNico();
    }

    if (!state.bossActive && p.x > 3700) {
      spawnBoss();
    }
  }

  function updateEnemies(step) {
    for (const enemy of state.enemies) {
      if (enemy.dead) {
        enemy.deathTimer -= step;
        continue;
      }

      const oldX = enemy.x;
      const oldY = enemy.y;
      if (enemy.invuln > 0) enemy.invuln -= step;
      if (enemy.hurtTimer > 0) enemy.hurtTimer -= step;
      if (enemy.flash > 0) enemy.flash -= step;
      if (enemy.attackCooldown > 0) enemy.attackCooldown -= step;

      const target = nearestHero(enemy);
      if (!target) continue;

      if (enemy.kind === "boss" && !state.bossVulnerable && !state.dramaTriggered) {
        updatePreThomasBossThreat(enemy, target, step);
      }

      if (enemy.attackTimer > 0) {
        enemy.attackTimer -= step;
        if (enemy.transformed && !enemy.attackHit && enemy.attackTimer < 18) {
          enemy.attackHit = true;
          spawnBossPower(enemy, target);
        } else if (!enemy.attackHit && enemy.attackTimer < 10) {
          enemy.attackHit = true;
          const dx = Math.abs(target.x - enemy.x);
          const dy = Math.abs(target.y - enemy.y);
          if (dx < enemy.range + 8 && dy < 26) {
            damageHero(target, enemy.damage, enemy);
          }
        }
        moveActor(enemy, 0, 0, enemy.speed, step, 0.2);
        updateWalkCycle(enemy, oldX, oldY);
        continue;
      }

      if (enemy.hurtTimer > 0) {
        moveActor(enemy, 0, 0, enemy.speed, step, 0.2);
        updateWalkCycle(enemy, oldX, oldY);
        continue;
      }

      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      enemy.facing = dx >= 0 ? 1 : -1;
      const inRange = Math.abs(dx) < enemy.range && Math.abs(dy) < (enemy.transformed ? 34 : 24);
      const powerRange = enemy.transformed && Math.abs(dx) < 240 && Math.abs(dy) < 52;
      let moveX = 0;
      let moveY = 0;

      if ((inRange || powerRange) && enemy.attackCooldown <= 0) {
        enemy.attackTimer = enemy.kind === "boss" ? (enemy.transformed ? 34 : 24) : 18;
        enemy.attackCooldown = enemy.kind === "boss" ? (enemy.transformed ? 72 : 44) : 58 + Math.random() * 24;
        enemy.attackHit = false;
        if (enemy.kind === "boss" && !state.bossVulnerable) state.shake = 6;
      } else if (!inRange) {
        const speed = enemy.speed * (enemy.kind === "boss" && !state.bossVulnerable ? 1.05 : 1);
        if (Math.abs(dx) > enemy.range - 5) moveX = Math.sign(dx);
        if (Math.abs(dy) > 7) moveY = Math.sign(dy) * 0.5;
        moveActor(enemy, moveX, moveY, speed, step, 0.16);
      } else {
        moveActor(enemy, 0, 0, enemy.speed, step, 0.2);
      }

      enemy.y = clamp(enemy.y, FLOOR_MIN, FLOOR_MAX);
      if (enemy.kind !== "boss") pushOutObstacles(enemy);
      enemy.y = clamp(enemy.y, FLOOR_MIN, FLOOR_MAX);
      updateWalkCycle(enemy, oldX, oldY);
    }

    state.enemies = state.enemies.filter((enemy) => !enemy.dead || enemy.deathTimer > -25 || enemy.kind === "boss");
  }

  function updatePreThomasBossThreat(enemy, target, step) {
    enemy.preThomasCooldown -= step;
    if (enemy.preThomasCooldown > 0 || enemy.offscreen || enemy.dead) return;

    const earlyAlly = state.allies.find((ally) => ally.heroId === getEarlyAllyId());
    const targets = [state.player, earlyAlly].filter(Boolean);
    for (const hero of targets) {
      spawnPreThomasStun(enemy, hero);
    }

    enemy.preThomasCooldown = 118;
    enemy.attackCooldown = Math.max(enemy.attackCooldown, 34);
    enemy.flash = 18;
    state.shake = Math.max(state.shake, 8);
    setDialogue("Vilao", `${heroName(target.heroId)}, correr nao vai bastar.`, 125);
  }

  function spawnPreThomasStun(enemy, hero) {
    const dx = hero.x - enemy.x;
    const dy = hero.y - enemy.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    state.projectiles.push({
      kind: "stunPower",
      owner: "enemy",
      targetId: hero.id,
      x: enemy.x - enemy.facing * 26,
      y: enemy.y - 28,
      vx: (dx / length) * 1.45,
      vy: (dy / length) * 1.45,
      life: 168,
      radius: 18,
      damage: 0,
      homing: 0.11,
    });
    playLayeredSfx(["bossPower", "thunder"]);
  }

  function nearestHero(enemy) {
    const heroes = [state.player, ...state.allies].filter((hero) => hero.hp > 0);
    let best = null;
    let bestDist = Infinity;

    for (const hero of heroes) {
      const dist = Math.hypot(hero.x - enemy.x, (hero.y - enemy.y) * 1.6);
      if (dist < bestDist) {
        best = hero;
        bestDist = dist;
      }
    }

    return best;
  }

  function spawnBossPower(enemy, target) {
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y - 22;
    const length = Math.max(1, Math.hypot(dx, dy));
    const speed = 2.15;
    state.projectiles.push({
      kind: "bossPower",
      x: enemy.x - enemy.facing * 28,
      y: enemy.y - 44,
      vx: (dx / length) * speed,
      vy: (dy / length) * speed,
      life: 130,
      radius: 15,
      damage: 1,
    });
    state.shake = Math.max(state.shake, 7);
    playLayeredSfx(["bossPower", "special"]);
    for (let i = 0; i < 10; i += 1) {
      addParticle({
        x: enemy.x - enemy.facing * 22,
        y: enemy.y - 44,
        vx: -enemy.facing * (0.4 + i * 0.05),
        vy: ((i % 5) - 2) * 0.18,
        color: "#ff72c7",
        size: 2 + (i % 3),
        life: 24,
        maxLife: 24,
      });
    }
  }

  function updateProjectiles(step) {
    for (const projectile of state.projectiles) {
      projectile.life -= step;
      updateProjectileMotion(projectile, step);

      if (projectile.owner === "hero") {
        resolveHeroProjectile(projectile);
        continue;
      }

      for (const hero of [state.player, ...state.allies]) {
        if (hero.hp <= 0) continue;
        if (projectile.kind !== "stunPower" && hero.invuln > 0) continue;
        const dx = hero.x - projectile.x;
        const dy = projectile.kind === "fallingPower"
          ? screenY(hero.x, hero.y - 34) - projectile.y
          : projectile.kind === "stunPower"
            ? hero.y - projectile.y
            : hero.y - (projectile.y + 34);
        if (Math.hypot(dx, dy) < projectile.radius + 12) {
          projectile.life = 0;
          if (projectile.kind === "stunPower") {
            triggerPreThomasStun(hero, projectile);
            break;
          }
          damageHero(hero, projectile.damage, { facing: Math.sign(projectile.vx) || -1 });
          burst(projectile.x, projectile.y, "#ff72c7", 18);
          break;
        }
      }
    }

    state.projectiles = state.projectiles.filter((projectile) => projectile.life > 0);
  }

  function updateProjectileMotion(projectile, step) {
    if (projectile.kind === "stunPower") {
      const target = findHeroByEntityId(projectile.targetId) || state.player;
      if (target) {
        const dx = target.x - projectile.x;
        const dy = target.y - projectile.y;
        const length = Math.max(1, Math.hypot(dx, dy));
        const speed = 2.15;
        const steer = Math.min(1, projectile.homing * step);
        projectile.vx += ((dx / length) * speed - projectile.vx) * steer;
        projectile.vy += ((dy / length) * speed - projectile.vy) * steer;
      }

      if (Math.random() < 0.28 * step) {
        addParticle({
          x: projectile.x,
          y: projectile.y - 18,
          vx: (Math.random() - 0.5) * 0.55,
          vy: -0.2 - Math.random() * 0.35,
          color: "#bff8ff",
          size: 2,
          life: 20,
          maxLife: 20,
        });
      }
    }

    projectile.x += projectile.vx * step;
    projectile.y += projectile.vy * step;
  }

  function findHeroByEntityId(id) {
    return [state.player, ...state.allies].find((hero) => hero.id === id) || null;
  }

  function triggerPreThomasStun(hero, projectile) {
    if (state.dramaTriggered || state.bossVulnerable || state.mode !== "playing") return;

    const earlyAlly = ensureNicoAlly();
    for (const target of [state.player, earlyAlly]) {
      target.hp = Math.max(1, Math.min(target.hp, 2));
      target.hurtTimer = 96;
      target.invuln = 0;
      burst(target.x, target.y - 28, "#bff8ff", 18);
      addFloater("PARALISADO", target.x, target.y - 62, "#bff8ff");
    }

    burst(projectile.x, projectile.y - 18, "#ff72c7", 28);
    state.shake = 18;
    startDrama();
  }

  function resolveHeroProjectile(projectile) {
    if (projectile.life <= 0) return;
    projectile.hitIds ||= [];

    for (const enemy of state.enemies) {
      if (enemy.dead || projectile.hitIds.includes(enemy.id)) continue;
      const dx = (enemy.x - projectile.x) * (projectile.facing || Math.sign(projectile.vx) || 1);
      const dy = Math.abs(enemy.y - projectile.y);
      const rangeX = projectile.kind === "zordBeam" ? 42 : 23;
      const rangeY = projectile.kind === "zordBeam" ? 58 : 34;
      if (dx > -rangeX && dx < rangeX && dy < rangeY) {
        projectile.hitIds.push(enemy.id);
        hurtEnemy(enemy, projectile.damage, { facing: projectile.facing || Math.sign(projectile.vx) || 1 });
        burst(projectile.x, projectile.y - 22, projectile.color || "#9ff2ff", projectile.kind === "zordBeam" ? 22 : 12);
        projectile.pierce = (projectile.pierce || 1) - 1;
        if (projectile.pierce <= 0) projectile.life = 0;
        return;
      }
    }

    for (const obstacle of state.obstacles) {
      if (!obstacle.breakable || obstacle.broken) continue;
      if (Math.abs(obstacle.x - projectile.x) < obstacle.rx + projectile.radius && Math.abs(obstacle.y - projectile.y) < obstacle.ry + 24) {
        hurtObstacle(obstacle, projectile.damage, { facing: projectile.facing || Math.sign(projectile.vx) || 1 });
        projectile.life = 0;
        return;
      }
    }
  }

  function nearestEnemy(hero, radius) {
    let best = null;
    let bestDist = radius;

    for (const enemy of state.enemies) {
      if (enemy.dead) continue;
      const dist = Math.hypot(enemy.x - hero.x, (enemy.y - hero.y) * 1.4);
      if (dist < bestDist) {
        best = enemy;
        bestDist = dist;
      }
    }

    return best;
  }

  function hurtEnemy(enemy, damage, hero) {
    if (enemy.dead || enemy.invuln > 0) return;

    if (enemy.kind === "boss" && !state.bossVulnerable) {
      enemy.flash = 12;
      state.shake = 5;
      addFloater("INVENCÍVEL", enemy.x, enemy.y - 70, "#bff8ff");
      burst(enemy.x - enemy.facing * 12, enemy.y - 34, "#bff8ff", 8);
      return;
    }

    enemy.hp -= damage;
    enemy.invuln = enemy.kind === "boss" ? 5 : 9;
    enemy.hurtTimer = enemy.kind === "boss" ? 8 : 12;
    enemy.x += hero.facing * (enemy.kind === "boss" ? 2 : 9);
    enemy.flash = 8;
    burst(enemy.x, enemy.y - 28, enemy.kind === "boss" ? "#b48cff" : "#ffe36d", enemy.kind === "boss" ? 8 : 6);

    if (enemy.hp <= 0) {
      if (enemy.kind === "boss" && enemy.phase < 3) {
        transformBoss(enemy);
        return;
      }
      killEnemy(enemy, hero);
    }
  }

  function transformBoss(enemy) {
    state.mode = "bossTransform";
    state.bossTransformTimer = 0;
    state.bossNextPhase = enemy.phase + 1;
    enemy.offscreen = true;
    enemy.invuln = 999;
    enemy.hurtTimer = 0;
    enemy.attackTimer = 0;
    enemy.attackCooldown = 999;
    enemy.y = 80;
    state.shake = 22;
    state.projectiles = [];
    setDialogue("Vilão", state.bossNextPhase === 2 ? "Vocês só quebraram minha armadura!" : "Chega. Agora eu desperto todo o meu poder!", 210);
    playLayeredSfx(["transform", "thunder", "bossPower"]);
    burst(enemy.x, enemy.y - 50, "#ff72c7", 58);
    lightningStrike(enemy.x);
    lightningStrike(enemy.x + 42);
  }

  function applyBossPhase(enemy, phase) {
    enemy.phase = phase;
    enemy.transformed = phase >= 2;
    enemy.offscreen = false;
    enemy.y = 207;
    enemy.x = clamp(state.cameraX + (phase === 3 ? 418 : 398), 80, WORLD_W - 70);
    enemy.facing = -1;
    enemy.hp = phase === 2 ? 60 : 82;
    enemy.maxHp = enemy.hp;
    enemy.speed = phase === 2 ? 0.62 : 0.52;
    enemy.range = phase === 2 ? 58 : 66;
    enemy.damage = phase === 3 ? 2 : 1;
    enemy.invuln = 85;
    enemy.attackCooldown = 100;
    enemy.flash = 85;
    state.shake = 24;
    setDialogue("Vilão", phase === 2 ? "Forma dois. Tentem acompanhar!" : "Forma final. O céu vai cair sobre vocês!", 190);
    burst(enemy.x, enemy.y - 58, "#ff72c7", phase === 2 ? 46 : 68);
    lightningStrike(enemy.x);
  }

  function updateBossTransform(step) {
    state.time += step / 60;
    state.bossTransformTimer += step;
    state.shake = Math.max(0, 10 + Math.sin(state.time * 16) * 4);

    updatePlayer(step);
    updateAllies(step);

    const boss = state.boss || state.enemies.find((enemy) => enemy.kind === "boss");
    if (boss) {
      boss.x = state.cameraX + W + 180;
      boss.y = 70;
      boss.offscreen = true;
    }

    if (state.bossTransformTimer > 45 && Math.random() < 0.16 * step) {
      spawnFallingBossPower();
    }

    if (nearBossTransformFrame(75, step)) setDialogue(heroName(state.player.heroId), "Desvia dos poderes!", 120);
    if (nearBossTransformFrame(165, step)) setDialogue(heroName(getEarlyAllyId()), "Ele esta voltando mais forte!", 130);

    updateProjectiles(step);
    updateParticles(step);
    updateFloaters(step);
    updateCamera(step);

    if (state.bossTransformTimer > 245 && boss) {
      applyBossPhase(boss, state.bossNextPhase);
      state.mode = "playing";
      state.shake = 0;
    }
  }

  function nearBossTransformFrame(frame, step) {
    return state.bossTransformTimer >= frame && state.bossTransformTimer - step < frame;
  }

  function spawnFallingBossPower() {
    state.projectiles.push({
      kind: "fallingPower",
      x: state.cameraX + 30 + Math.random() * (W - 60),
      y: -22,
      vx: (Math.random() - 0.5) * 0.24,
      vy: 2.2 + Math.random() * 0.9,
      life: 160,
      radius: 14,
      damage: 1,
    });
  }

  function hurtObstacle(obstacle, damage, hero) {
    obstacle.hp -= damage;
    obstacle.wobble = 14;
    obstacle.x += hero.facing * 1.5;
    burst(obstacle.x, obstacle.y - 24, "#e7c064", 7);

    if (obstacle.hp > 0) return;

    obstacle.broken = true;
    obstacle.solid = false;
    obstacle.breakTimer = 52;
    burst(obstacle.x, obstacle.y - 23, "#c58644", 20);
    playLayeredSfx(["barrel", "hit"]);

    if (Math.random() < 0.7) {
      spawnHeart(obstacle.x, obstacle.y - 25);
    }
  }

  function spawnHeart(x, y) {
    state.items.push({
      id: `heart-${state.time}-${state.items.length}`,
      kind: "item",
      type: "heart",
      x,
      y,
      life: 620,
      bob: 0,
      collected: false,
    });
  }

  function killEnemy(enemy) {
    enemy.dead = true;
    enemy.deathTimer = enemy.kind === "boss" ? 220 : 38;
    burst(enemy.x, enemy.y - 30, enemy.kind === "boss" ? "#ff72c7" : "#f7d359", enemy.kind === "boss" ? 42 : 18);

    if (enemy.kind === "boss") {
      startBossDeath(enemy);
      return;
    }

    state.player.power = clamp(state.player.power + (enemy.enemyType === "brute" ? 28 : 20), 0, 100);
    addFloater("+PODER", enemy.x, enemy.y - 42, "#fff1a3");
  }

  function startBossDeath(enemy) {
    state.mode = "bossDeath";
    state.bossDeathTimer = 150;
    state.shake = 24;
    state.dialogue = null;
    state.dialogueTimer = 0;
    enemy.dead = true;
    enemy.deathTimer = 150;
    enemy.attackTimer = 0;
    enemy.attackCooldown = 999;
    state.projectiles = [];
    state.zordBeamTimer = 120;
    setDialogue(heroName(getHeroById("thomas") ? "thomas" : getLateAllyId()), "Zorde verde, agora!", 120);
    playLayeredSfx(["boom", "thunder"]);
    addFloater("BOOM!", enemy.x, enemy.y - 82, "#fff7a8");
  }

  function updateBossDeath(step) {
    state.time += step / 60;
    state.bossDeathTimer -= step;
    if (state.zordBeamTimer > 0) state.zordBeamTimer -= step;
    if (state.dialogueTimer > 0) state.dialogueTimer -= step;
    if (state.dialogueTimer <= 0) state.dialogue = null;
    state.shake = Math.max(0, state.shake - step * 0.08);

    if (state.boss && state.bossDeathTimer > 20) {
      state.boss.deathTimer = state.bossDeathTimer;
      if (Math.random() < 0.34 * step) {
        const x = state.boss.x + (Math.random() - 0.5) * 74;
        const y = state.boss.y - 48 + (Math.random() - 0.5) * 46;
        burst(x, y, Math.random() > 0.5 ? "#ff72c7" : "#fff1a3", 22);
        playLayeredSfx(["boom", "hit"]);
      }
    }

    updateParticles(step);
    updateFloaters(step);
    updateCamera(step);

    if (state.bossDeathTimer <= 0) {
      if (state.boss) state.boss.dead = true;
      state.enemies = state.enemies.filter((enemy) => enemy.kind !== "boss");
      state.boss = null;
      state.bossActive = false;
      startEnding();
    }
  }

  function damageHero(hero, amount, source) {
    if (hero.invuln > 0 || !["playing", "bossTransform"].includes(state.mode)) return;

    hero.hp -= amount;
    hero.invuln = hero.heroId === "chris" ? 56 : 38;
    hero.hurtTimer = 16;
    hero.x += source.facing * 8;
    state.shake = Math.max(state.shake, 6);
    playSfx("hurt");
    burst(hero.x, hero.y - 26, "#ff6a6a", 7);

    if (
      hero === state.player &&
      state.bossActive &&
      !state.bossVulnerable &&
      !state.dramaTriggered &&
      hero.hp <= 2
    ) {
      hero.hp = Math.max(1, hero.hp);
      startDrama();
      return;
    }

    if (hero !== state.player && hero.hp <= 0) {
      hero.hp = 1;
      return;
    }

    if (hero === state.player && hero.hp <= 0) {
      startDeath();
    }
  }

  function startDeath() {
    state.mode = "dying";
    state.deathTimer = 118;
    setDialogue(heroName(state.player.heroId), "De volta do comeco. Agora vai.", 110);
    state.bgmDuckMul = 0.35 / 0.62;
    applyBgmVolumes();
  }

  function updateDeath(step) {
    state.time += step / 60;
    state.deathTimer -= step;
    state.shake = Math.max(0, state.shake - step);
    updateParticles(step);
    updateFloaters(step);
    updateCamera(step);

    if (state.deathTimer <= 0) {
      resetLevel();
      state.mode = "playing";
      applyBgmVolumes();
      playAudio(mapAudio);
    }
  }

  function startDrama() {
    state.mode = "drama";
    state.dramaTriggered = true;
    state.dramaTimer = 0;
    state.dramaStep = 0;
    state.hammerThrow = null;
    state.projectiles = [];
    state.shake = 8;
    setupPreThomasThreat();
    setDialogue("Vilão", "Vocês lutaram bem... agora eu vou finalizar os dois.", 190);
    playSfx("thunder");
  }

  function setupPreThomasThreat() {
    const boss = state.boss || state.enemies.find((enemy) => enemy.kind === "boss");
    const base = clamp((boss?.x || state.player.x + 420) - 420, 0, WORLD_W - W);
    const nico = ensureNicoAlly();

    state.cameraX = base;
    normalizeHeroForParty(state.player, base + 92, 220, 1);
    normalizeHeroForParty(nico, base + 45, 226, 1);
    state.player.hp = Math.max(1, state.player.hp);
    nico.hp = Math.max(1, nico.hp);
    state.player.hurtTimer = 80;
    nico.hurtTimer = 80;

    if (boss) {
      boss.x = base + 395;
      boss.y = 207;
      boss.facing = -1;
      boss.vx = 0;
      boss.vy = 0;
      boss.attackTimer = 0;
      boss.attackCooldown = 999;
      boss.flash = 0;
    }
  }

  function updateDrama(step) {
    state.time += step / 60;
    state.dramaTimer += step;
    state.shake = Math.max(state.shake * 0.96, 3 + Math.sin(state.time * 18) * 1.5);
    updateParticles(step);
    updateFloaters(step);
    updateHammerThrow(step);
    updateThomasArrival(step);
    updateCamera(step);

    if (state.dramaTimer > 70 && state.dramaStep < 1) {
      state.dramaStep = 1;
      setDialogue(heroName(getEarlyAllyId()), `${heroName(state.player.heroId)}... ele e forte demais!`, 135);
    }

    if (state.dramaTimer > 150 && state.dramaStep < 2) {
      state.dramaStep = 2;
      startHammerThrow();
      setDialogue(heroName(getLateAllyId()), "Larga eles. Agora.", 140);
      lightningStrike(state.player.x + 160);
      playLayeredSfx(["thunder", "bossPower"]);
    }

    if (state.dramaTimer > 270 && state.dramaStep < 3) {
      state.dramaStep = 3;
      joinThomas();
      setupBossShowdown();
      setDialogue(heroName(getLateAllyId()), "Ninguem estraga aniversario de familia.", 170);
      lightningStrike(state.player.x + 82);
      lightningStrike(state.player.x + 180);
      lightningStrike((state.boss?.x || state.player.x + 250) - 20);
      state.shake = 26;
      playLayeredSfx(["land", "thunder"]);
    }

    if (state.dramaTimer > 420 && state.dramaStep < 4) {
      state.dramaStep = 4;
      state.player.hp = state.player.maxHp;
      morphHero(state.player, true);
      for (const ally of state.allies) morphHero(ally, true);
      state.bossVulnerable = true;
      if (state.boss) {
        state.boss.hp = state.boss.maxHp;
        state.boss.invuln = 75;
      }
      setDialogue(heroName(state.player.heroId), "Agora e nosso!", 150);
    }

    if (state.dramaTimer > 610) {
      state.mode = "playing";
      state.shake = 0;
      setDialogue(heroName(getEarlyAllyId()), "Juntos ate o fim!", 140);
    }
  }

  function updateThomasArrival(step) {
    const thomas = state.allies.find((ally) => ally.heroId === getLateAllyId()) || state.allies.find((ally) => ally.arrivalTimer > 0);
    if (!thomas || thomas.arrivalTimer <= 0) return;

    thomas.arrivalTimer -= step;
    thomas.z = Math.max(0, thomas.z - 2.8 * step);
    thomas.walkCycle += 0.28 * step;

    if (thomas.z <= 0 && !thomas.landed) {
      thomas.landed = true;
      state.shake = 12;
      if (state.boss && !state.boss.dead) {
        state.boss.x = Math.min(WORLD_W - 70, state.boss.x + 42);
        state.boss.flash = 26;
        burst(state.boss.x, state.boss.y - 44, "#ff72c7", 24);
        addFloater("WHAM!", state.boss.x, state.boss.y - 78, "#fff7a8");
      }
      burst(thomas.x, thomas.y - 14, "#fff5bd", 18);
      lightningStrike(thomas.x);
      playSfx("thunder");
    }
  }

  function startHammerThrow() {
    const boss = state.boss || state.enemies.find((enemy) => enemy.kind === "boss");
    state.hammerThrow = {
      x: state.cameraX - 35,
      y: 82,
      startX: state.cameraX - 35,
      startY: 82,
      targetX: (boss?.x || state.cameraX + 390) - 42,
      targetY: (boss?.y || 207) - 58,
      t: 0,
      hit: false,
    };
  }

  function updateHammerThrow(step) {
    const hammer = state.hammerThrow;
    if (!hammer || hammer.hit) return;

    hammer.t += 0.018 * step;
    const t = clamp(hammer.t, 0, 1);
    const arc = Math.sin(t * Math.PI) * 58;
    hammer.x = hammer.startX + (hammer.targetX - hammer.startX) * t;
    hammer.y = hammer.startY + (hammer.targetY - hammer.startY) * t - arc;

    addParticle({
      x: hammer.x,
      y: hammer.y,
      vx: -0.6,
      vy: 0.15,
      color: "#8eefff",
      size: 2,
      life: 16,
      maxLife: 16,
    });

    if (t >= 1) {
      hammer.hit = true;
      const boss = state.boss || state.enemies.find((enemy) => enemy.kind === "boss");
      if (boss) {
        boss.x = Math.min(WORLD_W - 70, boss.x + 115);
        boss.flash = 36;
        boss.attackCooldown = 120;
        burst(boss.x, boss.y - 46, "#ff72c7", 34);
        addFloater("WHAM!", boss.x, boss.y - 82, "#fff7a8");
      }
      state.shake = 30;
      lightningStrike(hammer.targetX);
      playLayeredSfx(["land", "thunder", "hit"]);
    }
  }

  function setupBossShowdown() {
    const boss = state.boss || state.enemies.find((enemy) => enemy.kind === "boss");
    const base = clamp((boss?.x || state.player.x + 430) - 430, 0, WORLD_W - W);
    const nico = ensureNicoAlly();
    const lateId = getLateAllyId();
    const thomas = state.allies.find((ally) => ally.heroId === lateId) || createHero(lateId, base + 230, 204);
    thomas.followOffset = 42;

    if (!state.allies.includes(thomas)) state.allies.push(thomas);

    state.cameraX = base;
    state.player.x = base + 170;
    state.player.y = 213;
    state.player.facing = 1;
    state.player.vx = 0;
    state.player.vy = 0;

    nico.x = base + 120;
    nico.y = 224;
    nico.facing = 1;
    nico.vx = 0;
    nico.vy = 0;

    thomas.x = base + 225;
    thomas.y = 205;
    thomas.z = Math.max(thomas.z || 0, 82);
    thomas.arrivalTimer = Math.max(thomas.arrivalTimer || 0, 92);
    thomas.facing = 1;
    thomas.vx = 0;
    thomas.vy = 0;
    thomas.hasHammer = thomas.heroId === "thomas";

    if (boss) {
      boss.x = base + 430;
      boss.y = 207;
      boss.facing = -1;
      boss.vx = 0;
      boss.vy = 0;
      boss.attackCooldown = 80;
      boss.flash = 26;
    }

    state.arenaLockX = base + 442;
    burst(base + 225, 178, "#fff5bd", 22);
    burst(base + 410, 170, "#ff72c7", 18);
  }

  function lightningStrike(x) {
    for (let i = 0; i < 7; i += 1) {
      addParticle({
        type: "lightning",
        x: x + ((i * 17) % 42) - 21,
        y: 18 + i * 17,
        vx: 0,
        vy: 0.2,
        color: i % 2 ? "#fffbe8" : "#89eaff",
        size: 4,
        life: 18 + i * 2,
        maxLife: 28,
      });
    }
  }

  function startEnding() {
    state.mode = "ending";
    state.autoPlay = false;
    document.body.classList.remove("playing");
    document.body.classList.remove("auto-playing");
    state.endingTimer = 0;
    state.shake = 12;
    state.dialogue = null;
    state.dialogueTimer = 0;
    state.endingLastBeat = -1;
    stopAudio(mapAudio);
    finalAudio.loop = false;
    finalAudio.currentTime = 0;
    playAudio(finalAudio);
    prepareEndingParty();
    playSfx("firework");
    setupFamily();
  }

  function prepareEndingParty() {
    const base = clamp(state.player.x - 170, 0, WORLD_W - W);
    const nico = ensureNicoAlly();
    const lateId = getLateAllyId();
    let thomas = state.allies.find((ally) => ally.heroId === lateId);
    if (!thomas) {
      thomas = createHero(lateId, state.player.x + 58, state.player.y - 4);
      thomas.followOffset = 42;
      thomas.hasHammer = thomas.heroId === "thomas";
      state.allies.push(thomas);
    }

    state.cameraX = base;
    normalizeHeroForParty(nico, base + 150, 224, 1);
    normalizeHeroForParty(state.player, base + 248, 213, 1);
    normalizeHeroForParty(thomas, base + 356, 211, 1);
    for (const hero of [state.player, ...state.allies]) hero.holdingClara = false;
    state.arenaLockX = null;
  }

  function normalizeHeroForParty(hero, x, y, facing) {
    hero.x = x;
    hero.y = y;
    hero.z = 0;
    hero.vx = 0;
    hero.vy = 0;
    hero.vz = 0;
    hero.facing = facing;
    hero.morph = false;
    hero.megazord = false;
    hero.attackTimer = 0;
    hero.attackCooldown = 0;
    hero.hurtTimer = 0;
    hero.invuln = 0;
    hero.hp = hero.maxHp;
    hero.moving = false;
  }

  function setupFamily() {
    const base = state.cameraX;
    const chris = getBirthdayHero();
    const early = getHeroById(getEarlyAllyId());
    const late = getHeroById(getLateAllyId());
    state.family = [
      {
        id: "clara",
        name: "Clara",
        startX: base + 520,
        x: base + 520,
        targetX: chris.x + 20,
        y: 218,
        delay: 36,
        hidden: false,
        line: "Papai, obrigada por me salvar!",
        walkCycle: 0,
        moving: false,
      },
      {
        id: "laura",
        name: "Laura",
        startX: base + 590,
        x: base + 590,
        targetX: chris.x + 38,
        y: 213,
        delay: 110,
        hidden: false,
        line: "Feliz aniversário, amor!",
        walkCycle: 0,
        moving: false,
      },
      {
        id: "osvaldo",
        name: "Osvaldo",
        startX: base + 640,
        x: base + 640,
        targetX: base + 54,
        y: 214,
        delay: 164,
        hidden: false,
        line: "Orgulho de você, filho!",
        walkCycle: 0,
        moving: false,
      },
      {
        id: "ivone",
        name: "Ivone",
        startX: base + 700,
        x: base + 700,
        targetX: base + 92,
        y: 212,
        delay: 218,
        hidden: false,
        line: "Que seu dia seja lindo!",
        walkCycle: 0,
        moving: false,
      },
      {
        id: "camile",
        name: "Camille",
        startX: base + 760,
        x: base + 760,
        targetX: late?.x + 38 || base + 394,
        y: 207,
        delay: 272,
        hidden: false,
        line: "Que a Força esteja com você. Feliz aniversário!",
        walkCycle: 0,
        moving: false,
      },
      {
        id: "evelin",
        name: "Evelin",
        startX: base + 820,
        x: base + 820,
        targetX: early?.x + 34 || base + 184,
        y: 210,
        delay: 326,
        hidden: false,
        line: "Chris, que festa linda. Parabéns!",
        walkCycle: 0,
        moving: false,
      },
    ];
  }

  function getEndingSongTime() {
    try {
      if (!finalAudio.paused && Number.isFinite(finalAudio.currentTime)) {
        return Math.max(0, finalAudio.currentTime);
      }
    } catch (_) {}
    return state.endingTimer / 60;
  }

  function syncEndingFireworks() {
    if (state.endingTimer < 155) return;
    const songT = getEndingSongTime() + FINAL_BEAT_OFFSET_SEC;
    const period = 60 / FINAL_BPM;
    const beat = Math.floor(songT / period);
    if (beat <= state.endingLastBeat) return;
    const colors = ["#ffed84", "#ff5d73", "#7cf0ff", "#a7ff7a", "#ffffff", "#ffb8e8"];
    const cam = state.cameraX;
    for (let b = state.endingLastBeat + 1; b <= beat; b += 1) {
      const phase = b % 6;
      const x1 = cam + 64 + (b * 47) % 278;
      const y1 = 32 + (phase * 11) % 58;
      burst(x1, y1, colors[b % colors.length], 17 + (b % 4) * 2);
      if (b % 4 === 0) {
        burst(cam + 148 + (b % 8) * 14, 36, "#fffef0", 26);
        burst(cam + 278 + (b % 5) * 9, 42, colors[(b + 2) % colors.length], 21);
      }
    }
    if (beat % 2 === 0) playSfx("firework");
    if (beat % 4 === 0) playSfx("firework");
    state.endingLastBeat = beat;
  }

  function updateEnding(step) {
    state.time += step / 60;
    state.endingTimer += step;
    state.shake = Math.max(0, state.shake - step * 0.05);
    updateParticles(step);
    updateFloaters(step);
    updateCamera(step);

    for (const person of state.family) {
      const oldX = person.x;
      const t = clamp((state.endingTimer - person.delay) / 90, 0, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      person.x = person.startX + (person.targetX - person.startX) * ease;
      const distance = Math.abs(person.x - oldX);
      person.moving = distance > 0.04;
      if (person.moving) person.walkCycle += distance * 0.48;
      if (!person.moving && t >= 1) {
        person.moving = true;
        person.walkCycle += 0.06 * step;
      }
      if (person.id === "clara" && t >= 0.95) {
        person.hidden = true;
        getBirthdayHero().holdingClara = true;
      }
    }

    for (const hero of [state.player, ...state.allies]) {
      hero.walkCycle += 0.08 * step;
      hero.moving = false;
      hero.morph = false;
      hero.megazord = false;
    }

    if (nearFrame(68, step)) setDialogue("Clara", "Papai, obrigada por me salvar!", 190);
    if (nearFrame(162, step)) setDialogue("Laura", "Feliz aniversário, amor!", 170);
    if (nearFrame(248, step)) setDialogue("Osvaldo", "Parabéns, campeão!", 155);
    if (nearFrame(322, step)) setDialogue("Ivone", "Saúde, alegria e muito amor!", 170);
    if (nearFrame(398, step)) setDialogue("Camille", "Que a Força esteja com você. Feliz aniversário!", 180);
    if (nearFrame(488, step)) setDialogue("Nico", "Chris, essa fase foi nossa!", 155);
    if (nearFrame(538, step)) setDialogue("Evelin", "Chris, você brilhou. Feliz aniversário!", 165);
    if (nearFrame(612, step)) setDialogue("Thomas", "Missão completa. Agora é comemorar!", 170);
    if (nearFrame(692, step)) setDialogue("Chris", "Melhor presente é todo mundo junto!", 180);
    if (nearFrame(778, step)) setDialogue("Clara", "Papai, você é meu herói!", 170);

    if (state.dialogueTimer > 0) state.dialogueTimer -= step;
    if (state.dialogueTimer <= 0) state.dialogue = null;

    syncEndingFireworks();

    if (state.endingTimer > 195 && Math.random() < 0.045 * step) {
      addParticle({
        x: state.player.x - 70 + Math.random() * 220,
        y: 84 + Math.random() * 30,
        vx: (Math.random() - 0.5) * 0.8,
        vy: 0.5 + Math.random() * 0.8,
        color: ["#fff1a3", "#ff72c7", "#7cf0ff", "#a7ff7a"][Math.floor(Math.random() * 4)],
        size: 2,
        life: 92,
        maxLife: 92,
      });
    }

    if (state.endingTimer > 980 && !state.finaleOverlayShown) {
      state.finaleOverlayShown = true;
      endScreen.classList.add("active");
    }
  }

  function nearFrame(frame, step) {
    return state.endingTimer >= frame && state.endingTimer - step < frame;
  }

  function updateParticles(step) {
    for (const p of state.particles) {
      p.life -= step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.vy += (p.type === "spark" ? 0.02 : 0) * step;
    }

    state.particles = state.particles.filter((p) => p.life > 0);
  }

  function updateFloaters(step) {
    for (const floater of state.floaters) {
      floater.life -= step;
      floater.y -= 0.35 * step;
    }

    state.floaters = state.floaters.filter((floater) => floater.life > 0);
  }

  function updateObstacles(step) {
    for (const obstacle of state.obstacles) {
      if (obstacle.wobble > 0) obstacle.wobble -= step;
      if (obstacle.breakable && obstacle.broken) obstacle.breakTimer -= step;
    }

    state.obstacles = state.obstacles.filter((obstacle) => !obstacle.broken || obstacle.breakTimer > -45);
  }

  function updateItems(step) {
    const player = state.player;

    for (const item of state.items) {
      item.life -= step;
      item.bob += 0.11 * step;
      if (item.type !== "heart" || item.collected) continue;

      const close = Math.abs(player.x - item.x) < 30 && Math.abs(player.y - getHeartPickupY(item)) < 38;
      if (close) {
        item.collected = true;
        if (player.hp < player.maxHp) {
          player.hp = Math.min(player.maxHp, player.hp + 1);
          addFloater("+VIDA", player.x, player.y - 55, "#ffb7c9");
        }
        burst(item.x, item.y - 14, "#ff6e8d", 16);
        playSfx("heart");
      }
    }

    state.items = state.items.filter((item) => item.life > 0 && !item.collected);
  }

  function getHeartPickupY(item) {
    return item.y + 22;
  }

  function updateCamera(step) {
    const target = clamp(state.player.x - 170, 0, WORLD_W - W);
    state.cameraX += (target - state.cameraX) * Math.min(1, 0.08 * step);
  }

  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    if (state.shake > 0) {
      const amount = Math.min(5, state.shake);
      ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
    }

    drawWorld(state.mode === "title");

    if (state.mode !== "title") {
      drawCharacters();
      drawHammerThrow();
      drawParticles();
      drawFloaters();
      drawHud();
      drawDialogue();
    } else {
      drawTitlePreview();
      drawParticles();
    }

    if (state.mode === "drama") {
      drawDramaOverlay();
    }

    if (state.mode === "dying") {
      drawDeathOverlay();
    }

    if (state.mode === "ending") {
      drawEndingText();
    }

    ctx.restore();
  }

  function drawWorld(preview = false) {
    const cam = state.cameraX;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    if (state.mode === "ending") {
      sky.addColorStop(0, "#11142e");
      sky.addColorStop(0.55, "#1f3159");
      sky.addColorStop(1, "#665f78");
    } else {
      sky.addColorStop(0, "#79d8ff");
      sky.addColorStop(0.45, "#c5f4ff");
      sky.addColorStop(1, "#f2e68b");
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    if (state.mode === "ending") drawMoon(398 - cam * 0.05, 38);
    else drawSun(398 - cam * 0.05, 38);
    for (const cloud of scenery.clouds) drawCloud(cloud.x - cam * 0.18, cloud.y, cloud.scale);

    drawParallaxBuildings(cam);
    drawDistantHills(cam);
    drawGreenZordBackdrop(cam);

    ctx.fillStyle = "#4bb866";
    ctx.fillRect(0, 138, W, 46);
    ctx.fillStyle = "#2f9a58";
    ctx.fillRect(0, 166, W, 10);

    for (const tree of scenery.trees) drawTree(tree.x - cam * 0.62, tree.y, tree.tone);

    drawSlopedStreet(cam);
    drawRoadDetails(cam);
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    for (let x = -((cam * 1.1) % 48); x < W; x += 48) {
      const worldX = x + cam;
      ctx.fillRect(Math.floor(x), 209 + getStageYOffset(worldX), 24, 3);
    }

    for (const detail of scenery.details) {
      const x = detail.x - cam;
      if (x < -10 || x > W + 10) continue;
      const y = detail.y + getStageYOffset(detail.x);
      ctx.fillStyle = detail.color;
      ctx.fillRect(Math.floor(x), y, 3, 3);
      ctx.fillRect(Math.floor(x + 3), y + 1, 2, 2);
    }

    if (!preview) {
      drawStageSigns(cam);
    }
  }

  function drawSun(x, y) {
    ctx.fillStyle = "#ffdb68";
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(x - 30, y - 2, 60, 4);
    ctx.fillRect(x - 21, y + 10, 42, 3);
  }

  function getStageYOffset(x) {
    const segments = [
      [0, 520, 0, 0],
      [520, 900, 0, -18],
      [900, 1220, -18, -18],
      [1220, 1600, -18, 10],
      [1600, 2020, 10, 10],
      [2020, 2440, 10, -12],
      [2440, 2860, -12, -12],
      [2860, 3260, -12, 16],
      [3260, 3620, 16, 4],
      [3620, WORLD_W, 4, 4],
    ];

    for (const [start, end, from, to] of segments) {
      if (x >= start && x <= end) {
        const t = clamp((x - start) / Math.max(1, end - start), 0, 1);
        const smooth = t * t * (3 - 2 * t);
        return from + (to - from) * smooth;
      }
    }

    return 0;
  }

  function screenY(worldX, y) {
    return y + getStageYOffset(worldX);
  }

  function drawSlopedStreet(cam) {
    const step = 18;
    const samples = [];
    for (let sx = -step; sx <= W + step; sx += step) {
      const worldX = sx + cam;
      samples.push({ x: sx, off: getStageYOffset(worldX) });
    }

    fillSlopedBand(samples, 172, 182, "#d6bc72");
    fillSlopedBand(samples, 181, 186, "#8f7b63");
    fillSlopedBand(samples, 186, 244, "#7e8b78");
    fillSlopedBand(samples, 238, 248, "#657765");

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const sample of samples) {
      const y = 186 + sample.off;
      if (sample.x === samples[0].x) ctx.moveTo(sample.x, y);
      else ctx.lineTo(sample.x, y);
    }
    ctx.stroke();
  }

  function fillSlopedBand(samples, top, bottom, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(samples[0].x, top + samples[0].off);
    for (const sample of samples) ctx.lineTo(sample.x, top + sample.off);
    for (let i = samples.length - 1; i >= 0; i -= 1) {
      const sample = samples[i];
      ctx.lineTo(sample.x, bottom + sample.off);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawRoadDetails(cam) {
    const roadGrad = ctx.createLinearGradient(0, 186, 0, 248);
    roadGrad.addColorStop(0, "rgba(255,255,255,0.12)");
    roadGrad.addColorStop(0.45, "rgba(0,0,0,0)");
    roadGrad.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = roadGrad;
    for (let x = 0; x < W; x += 12) {
      const off = getStageYOffset(cam + x);
      ctx.fillRect(x, 186 + off, 12, 62);
    }

    ctx.fillStyle = "rgba(46, 53, 49, 0.22)";
    for (let x = -((cam * 0.9) % 31); x < W; x += 31) {
      const worldX = x + cam;
      const y = 190 + getStageYOffset(worldX) + ((Math.floor(worldX / 31) * 17) % 44);
      ctx.fillRect(Math.floor(x), y, 1 + (x & 2), 1);
    }

    ctx.strokeStyle = "rgba(42, 48, 45, 0.46)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i += 1) {
      const x = Math.floor(((i * 137 - cam * 0.95) % (W + 80)) - 40);
      const worldX = x + cam;
      const y = 196 + getStageYOffset(worldX) + ((i * 29) % 36);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 16, y + 3);
      ctx.lineTo(x + 29, y - 1);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(255, 240, 190, 0.28)";
    for (let x = -((cam * 1.1) % 44); x < W; x += 44) {
      const worldX = x + cam;
      ctx.fillRect(Math.floor(x), 176 + getStageYOffset(worldX), 21, 3);
    }

    ctx.fillStyle = "rgba(42, 33, 30, 0.12)";
    for (let x = -((cam * 1.25) % 54); x < W; x += 54) {
      const worldX = x + cam;
      const off = getStageYOffset(worldX);
      ctx.fillRect(Math.floor(x), 238 + off, 34, 2);
      ctx.fillRect(Math.floor(x + 8), 241 + off, 19, 1);
    }
  }

  function drawMoon(x, y) {
    ctx.fillStyle = "#f2f0cf";
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#11142e";
    ctx.beginPath();
    ctx.arc(x + 8, y - 4, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 22; i += 1) {
      const sx = (i * 67) % W;
      const sy = 14 + ((i * 31) % 92);
      ctx.fillRect(sx, sy, i % 3 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
    }
  }

  function drawCloud(x, y, scale) {
    const wrapX = ((x % (WORLD_W * 0.18 + 240)) + (WORLD_W * 0.18 + 240)) % (WORLD_W * 0.18 + 240) - 120;
    ctx.save();
    ctx.translate(Math.floor(wrapX), Math.floor(y + Math.sin(state.time * 0.7 + x) * 1.5));
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.fillRect(0, 10, 54, 14);
    ctx.fillRect(10, 2, 22, 16);
    ctx.fillRect(28, 5, 34, 18);
    ctx.fillStyle = "rgba(118,185,225,0.22)";
    ctx.fillRect(6, 22, 48, 3);
    ctx.restore();
  }

  function drawParallaxBuildings(cam) {
    for (const building of scenery.buildings) {
      const x = building.x - cam * 0.38;
      const wrap = ((x % (WORLD_W * 0.38 + 180)) + (WORLD_W * 0.38 + 180)) % (WORLD_W * 0.38 + 180) - 110;
      const y = 138 - building.h;
      ctx.fillStyle = building.color;
      ctx.fillRect(Math.floor(wrap), y, building.w, building.h);
      ctx.fillStyle = "rgba(255,245,170,0.62)";
      for (let wx = 7; wx < building.w - 5; wx += 14) {
        for (let wy = 9; wy < building.h - 7; wy += 15) {
          if ((wx + wy + building.w) % 3 !== 0) ctx.fillRect(Math.floor(wrap + wx), y + wy, 5, 5);
        }
      }
      ctx.fillStyle = "rgba(0,0,0,0.13)";
      ctx.fillRect(Math.floor(wrap), y + building.h - 5, building.w, 5);
    }
  }

  function drawDistantHills(cam) {
    ctx.fillStyle = "#67b879";
    for (let i = 0; i < 8; i += 1) {
      const x = i * 190 - (cam * 0.24) % 190;
      ctx.beginPath();
      ctx.moveTo(x - 70, 139);
      ctx.lineTo(x + 35, 92 + (i % 3) * 9);
      ctx.lineTo(x + 150, 139);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawGreenZordBackdrop(cam) {
    const show = state.player?.megazord || (state.boss && state.boss.phase >= 3) || state.mode === "bossDeath";
    if (!show) return;

    const anchor = state.player?.megazord ? state.player.x : state.boss?.x || cam + 365;
    const x = Math.round(anchor - cam - 35);
    const y = 92;
    ctx.save();
    ctx.globalAlpha = state.mode === "bossDeath" ? 0.86 : 0.52;
    ctx.fillStyle = "#153f33";
    ctx.fillRect(x - 52, y + 40, 104, 54);
    ctx.fillStyle = "#1f9a5b";
    ctx.fillRect(x - 42, y + 20, 84, 52);
    ctx.fillStyle = "#d8c86d";
    ctx.fillRect(x - 30, y + 10, 60, 18);
    ctx.fillStyle = "#0f241f";
    ctx.fillRect(x - 22, y + 27, 44, 13);
    ctx.fillStyle = "#ff4040";
    ctx.fillRect(x - 16, y + 31, 8, 4);
    ctx.fillRect(x + 8, y + 31, 8, 4);
    ctx.fillStyle = "#1f9a5b";
    ctx.fillRect(x - 66, y + 50, 18, 38);
    ctx.fillRect(x + 48, y + 50, 18, 38);
    ctx.fillStyle = "#d8c86d";
    ctx.fillRect(x - 72, y + 84, 30, 9);
    ctx.fillRect(x + 42, y + 84, 30, 9);

    if (state.mode === "bossDeath" && state.bossDeathTimer > 60) {
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = "rgba(124,255,154,0.55)";
      ctx.beginPath();
      ctx.moveTo(x, y + 38);
      ctx.lineTo(W + 40, y + 22);
      ctx.lineTo(W + 40, y + 58);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e8ffe8";
      ctx.fillRect(x + 18, y + 41, W, 5);
    }

    ctx.restore();
  }

  function drawTree(x, y, tone) {
    const wind = Math.sin(state.time * 1.8 + x * 0.05) * 2;
    if (x < -40 || x > W + 40) return;
    ctx.fillStyle = "#7b5535";
    ctx.fillRect(Math.floor(x + 13), y - 25, 8, 30);
    ctx.fillStyle = tone;
    ctx.fillRect(Math.floor(x + wind), y - 54, 34, 20);
    ctx.fillRect(Math.floor(x + 6 + wind), y - 66, 24, 22);
    ctx.fillRect(Math.floor(x - 5 + wind), y - 42, 44, 17);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(Math.floor(x + 4 + wind), y - 61, 14, 4);
  }

  function drawStageSigns(cam) {
    const signs = [
      { x: 920, text: heroName(getEarlyAllyId()).toUpperCase() },
      { x: 2420, text: "FINAL" },
    ];

    for (const sign of signs) {
      const x = sign.x - cam;
      if (x < -80 || x > W + 80) continue;
      ctx.fillStyle = "#6b3a24";
      ctx.fillRect(x + 36, 137, 5, 37);
      ctx.fillStyle = "#f3d06d";
      ctx.fillRect(x, 124, 77, 22);
      ctx.strokeStyle = "#6b3a24";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, 124, 77, 22);
      drawPixelText(sign.text, x + 38, 139, 9, "#532818", "center");
    }
  }

  function drawObstacle(obstacle) {
    const x = Math.round(obstacle.x - state.cameraX);
    const y = Math.round(screenY(obstacle.x, obstacle.y));
    if (x < -90 || x > W + 90) return;

    const wobble = obstacle.wobble > 0 ? Math.sin(state.time * 26) * 2 : 0;
    ctx.save();
    ctx.translate(x + wobble, y);

    if (obstacle.type === "manhole") {
      ctx.fillStyle = "#303847";
      ctx.beginPath();
      ctx.ellipse(0, 0, 21, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#778296";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(-13, -2, 26, 2);
      ctx.fillRect(-6, -5, 2, 9);
      ctx.fillRect(5, -5, 2, 9);
    }

    if (obstacle.type === "trash") {
      drawShadow(0, 1, 14);
      ctx.fillStyle = "#2f735e";
      ctx.fillRect(-12, -27, 24, 26);
      ctx.fillStyle = "#3f9278";
      ctx.fillRect(-15, -31, 30, 6);
      ctx.fillStyle = "#174436";
      ctx.fillRect(-9, -22, 4, 17);
      ctx.fillRect(5, -22, 4, 17);
      ctx.fillStyle = "#bfe6d8";
      ctx.fillRect(-7, -35, 14, 4);
    }

    if (obstacle.type === "rocks") {
      drawShadow(0, 1, 19);
      ctx.fillStyle = "#6f7075";
      ctx.fillRect(-18, -12, 16, 12);
      ctx.fillRect(-4, -18, 18, 18);
      ctx.fillRect(10, -10, 14, 10);
      ctx.fillStyle = "#96989e";
      ctx.fillRect(-12, -10, 7, 3);
      ctx.fillRect(2, -16, 8, 3);
    }

    if (obstacle.type === "car") {
      drawShadow(0, 3, 44);
      ctx.fillStyle = "#222735";
      ctx.fillRect(-43, -15, 86, 15);
      ctx.fillStyle = obstacle.color || "#4c93c9";
      ctx.fillRect(-40, -29, 80, 20);
      ctx.fillRect(-20, -42, 38, 18);
      ctx.fillStyle = "#afe5ff";
      ctx.fillRect(-14, -38, 14, 10);
      ctx.fillRect(3, -38, 14, 10);
      ctx.fillStyle = "#171923";
      ctx.fillRect(-31, -8, 16, 13);
      ctx.fillRect(17, -8, 16, 13);
      ctx.fillStyle = "#f8ef9a";
      ctx.fillRect(33, -24, 6, 5);
    }

    if (obstacle.type === "barrel") {
      drawShadow(0, 1, 14);
      if (obstacle.broken) {
        const alpha = clamp((obstacle.breakTimer || 0) / 52, 0, 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#9b5a2d";
        ctx.fillRect(-15, -8, 13, 8);
        ctx.fillRect(2, -11, 16, 9);
        ctx.fillStyle = "#e2b05c";
        ctx.fillRect(-8, -15, 7, 4);
      } else {
        ctx.fillStyle = "#9b5a2d";
        ctx.fillRect(-13, -29, 26, 28);
        ctx.fillStyle = "#c87935";
        ctx.fillRect(-11, -25, 22, 20);
        ctx.fillStyle = "#5f3a26";
        ctx.fillRect(-14, -30, 28, 5);
        ctx.fillRect(-14, -16, 28, 4);
        ctx.fillRect(-14, -4, 28, 5);
        if (obstacle.hp < obstacle.maxHp) {
          ctx.fillStyle = "#3a2118";
          ctx.fillRect(-4, -22, 3, 12);
          ctx.fillRect(3, -15, 3, 10);
        }
      }
    }

    ctx.restore();
  }

  function drawItem(item) {
    if (item.type !== "heart") return;
    const x = Math.round(item.x - state.cameraX);
    const y = Math.round(screenY(item.x, item.y) + Math.sin(item.bob) * 3);
    if (x < -40 || x > W + 40) return;

    const alpha = clamp(item.life / 80, 0.35, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ff5f82";
    ctx.fillRect(x - 6, y - 5, 5, 5);
    ctx.fillRect(x + 1, y - 5, 5, 5);
    ctx.fillRect(x - 8, y, 16, 6);
    ctx.fillRect(x - 5, y + 6, 10, 5);
    ctx.fillRect(x - 2, y + 11, 4, 4);
    ctx.fillStyle = "#ffd5df";
    ctx.fillRect(x - 4, y - 3, 3, 2);
    ctx.restore();
  }

  function drawProjectile(projectile) {
    const x = Math.round(projectile.x - state.cameraX);
    const isFalling = projectile.kind === "fallingPower";
    const isStun = projectile.kind === "stunPower";
    const isZordBeam = projectile.kind === "zordBeam";
    const y = Math.round(isFalling ? projectile.y : isStun || isZordBeam ? screenY(projectile.x, projectile.y) - (isZordBeam ? 48 : 34) : projectile.y - 34);
    if (x < -50 || x > W + 50) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = clamp(projectile.life / 18, 0.35, 1);

    if (isZordBeam) {
      ctx.fillStyle = "rgba(167,255,122,0.35)";
      ctx.fillRect(-18, -11, 72, 22);
      ctx.fillStyle = "#e8ffe8";
      ctx.fillRect(-10, -3, 62, 6);
      ctx.restore();
      return;
    }

    ctx.fillStyle = isFalling ? "rgba(255, 240, 120, 0.34)" : isStun ? "rgba(191, 248, 255, 0.32)" : "rgba(255, 114, 199, 0.38)";
    ctx.beginPath();
    ctx.arc(0, 0, isStun ? 22 : 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isFalling ? "#ffed84" : isStun ? "#bff8ff" : "#ff72c7";
    ctx.beginPath();
    ctx.arc(0, 0, isStun ? 12 : 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff1fa";
    ctx.fillRect(-4, -2, 8, 4);
    if (isFalling || isStun) {
      ctx.strokeStyle = isStun ? "#ff72c7" : "#ff72c7";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -24);
      ctx.lineTo(0, -4);
      ctx.lineTo(10, -25);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHammerThrow() {
    const hammer = state.hammerThrow;
    if (!hammer || hammer.hit) return;
    const x = Math.round(hammer.x - state.cameraX);
    const y = Math.round(hammer.y);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(state.time * 18);
    ctx.fillStyle = "#7a4b2b";
    ctx.fillRect(-2, -13, 4, 26);
    ctx.fillStyle = "#d7dce6";
    ctx.fillRect(-14, -20, 28, 13);
    ctx.fillStyle = "#f5f7ff";
    ctx.fillRect(-10, -19, 8, 3);
    ctx.strokeStyle = "#8eefff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, -20);
    ctx.lineTo(28, -33);
    ctx.lineTo(23, -19);
    ctx.lineTo(39, -27);
    ctx.stroke();
    ctx.restore();
  }

  function drawCharacters() {
    const actors = [];
    if (state.nicoNpc && !state.nicoJoined) {
      actors.push({ ...state.nicoNpc, kind: "npc", heroId: state.nicoNpc.heroId || getEarlyAllyId(), z: 0, hp: 1, facing: -1, walkCycle: state.time * 4, moving: true });
    }
    actors.push(...state.obstacles.map((obstacle) => ({ ...obstacle, kind: "obstacle" })));
    actors.push(...state.items.map((item) => ({ ...item, kind: "item" })));
    actors.push(...state.projectiles.map((projectile) => ({ ...projectile, kind: "projectile", y: projectile.y + 34 })));
    actors.push(...state.enemies);
    actors.push(state.player, ...state.allies);
    actors.push(...state.family.map((person) => ({ ...person, kind: "family", z: 0, hp: 1, facing: -1 })));
    actors.sort((a, b) => a.y - b.y);

    for (const actor of actors) {
      if (actor.kind === "enemy" || actor.kind === "boss") drawEnemy(actor);
      if (actor.kind === "hero" || actor.kind === "npc") drawHero(actor);
      if (actor.kind === "family") drawFamily(actor);
      if (actor.kind === "obstacle") drawObstacle(actor);
      if (actor.kind === "item") drawItem(actor);
      if (actor.kind === "projectile") drawProjectile(actor);
    }
  }

  function drawHero(hero) {
    const x = Math.round(hero.x - state.cameraX);
    const y = Math.round(screenY(hero.x, hero.y));
    if (x < -70 || x > W + 70) return;
    const pose = walkPose(hero);

    drawShadow(x, y, hero.megazord ? 32 : hero.heroId === "thomas" ? 20 : 17);
    ctx.save();
    ctx.translate(x, Math.round(y - hero.z - pose.bob));
    ctx.scale(hero.facing || 1, 1);

    if (hero.invuln > 0 && Math.floor(hero.invuln / 4) % 2 === 0) {
      ctx.globalAlpha = 0.55;
    }

    if (hero.megazord) drawMiniMegazord(hero);
    else if (hero.morph) drawRanger(hero);
    else drawCivilian(hero);

    if (state.mode === "ending") {
      drawCelebratePose(hero);
      if (hero.heroId === "chris" && hero.holdingClara) drawCarriedClara(hero);
    }

    if (hero.attackTimer > 0) drawAttackPose(hero);
    if (hero.hasHammer) drawThorHammer(hero);
    ctx.restore();

    if (hero.kind === "npc" && !state.nicoJoined) {
      drawNameTag(heroName(hero.heroId), x, y - 58, "#fff1a3");
    }
  }

  function walkPose(actor) {
    const cycle = actor.walkCycle || 0;
    const active = actor.moving || actor.kind === "npc";
    const leg = active ? Math.sin(cycle) : 0;
    const arm = active ? Math.sin(cycle + Math.PI) : 0;
    const bob = active && (actor.z || 0) <= 1 ? Math.abs(Math.sin(cycle)) * 1.4 : 0;
    return {
      leg: Math.round(leg * 4),
      arm: Math.round(arm * 3),
      bob,
    };
  }

  function drawCivilian(hero) {
    if (hero.heroId === "nico") {
      drawBody("#20232b", "#2a5ea6", "#f1c27d", "#b9894d", hero);
      ctx.fillStyle = "#b9894d";
      ctx.fillRect(-9, -48, 18, 8);
      ctx.fillRect(-12, -42, 5, 7);
      ctx.fillRect(8, -42, 5, 7);
      return;
    }

    if (hero.heroId === "thomas") {
      drawBody("#f4f3e8", "#313947", "#d79c68", "#e6c64b", hero);
      ctx.fillStyle = "#fff5bd";
      ctx.fillRect(-7, -32, 14, 4);
      ctx.fillStyle = "#e6c64b";
      ctx.fillRect(-13, -49, 6, 22);
      ctx.fillRect(7, -49, 6, 22);
      ctx.fillRect(-7, -36, 14, 4);
      ctx.fillRect(-5, -34, 10, 4);
      return;
    }

    drawBody("#f8f8ef", "#2265b6", "#c98f61", "#2f2320", hero);
    ctx.fillStyle = "#1f1918";
    ctx.fillRect(-10, -49, 20, 7);
    ctx.fillRect(-9, -44, 4, 4);
    ctx.fillRect(5, -44, 4, 3);
    ctx.fillStyle = "#614131";
    ctx.fillRect(-7, -35, 4, 2);
    ctx.fillRect(3, -35, 5, 2);
    ctx.fillStyle = "#2b9955";
    ctx.fillRect(3, -27, 8, 3);
    ctx.fillRect(8, -29, 3, 2);
  }

  function drawCelebratePose(hero) {
    const finale = state.endingTimer > 560;
    const waveAmp = finale ? 4.4 : 3;
    const waveSpd = finale ? 10.5 : 8;
    const wave = Math.round(Math.sin(state.time * waveSpd + hero.id) * waveAmp);
    const sleeve = hero.heroId === "chris" ? "#f8f8ef" : hero.heroId === "nico" ? "#20232b" : "#f4f3e8";
    const skin = hero.heroId === "nico" ? "#f1c27d" : hero.heroId === "thomas" ? "#d79c68" : "#c98f61";

    if (hero.heroId === "chris" && hero.holdingClara) return;

    ctx.fillStyle = sleeve;
    ctx.fillRect(-20, -42 + wave, 6, 17);
    ctx.fillRect(14, -42 - wave, 6, 17);
    ctx.fillStyle = skin;
    ctx.fillRect(-21, -47 + wave, 8, 6);
    ctx.fillRect(13, -47 - wave, 8, 6);
  }

  function drawCarriedClara() {
    ctx.fillStyle = "#ff8db7";
    ctx.fillRect(5, -46, 17, 13);
    ctx.fillStyle = "#ffd56a";
    ctx.fillRect(6, -35, 14, 8);
    ctx.fillStyle = "#d99b6d";
    ctx.fillRect(8, -56, 13, 11);
    ctx.fillStyle = "#6b4428";
    ctx.fillRect(7, -60, 16, 7);
    ctx.fillStyle = "#f8f8ef";
    ctx.fillRect(0, -41, 18, 7);
    ctx.fillStyle = "#c98f61";
    ctx.fillRect(17, -39, 8, 6);
    ctx.fillStyle = "#ffb8d0";
    ctx.fillRect(19, -44, 5, 5);
    ctx.fillStyle = "#ffd5ea";
    ctx.fillRect(15, -44, 4, 3);
  }

  function drawBody(shirt, pants, skin, hair, actor = {}) {
    const pose = walkPose(actor);
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(-13, -5, 26, 4);

    ctx.fillStyle = pants;
    ctx.fillRect(-11 + pose.leg, -18, 8, 18);
    ctx.fillRect(3 - pose.leg, -18, 8, 18);
    ctx.fillStyle = "#202638";
    ctx.fillRect(-12 + pose.leg, -2, 10, 4);
    ctx.fillRect(2 - pose.leg, -2, 11, 4);

    ctx.fillStyle = shirt;
    ctx.fillRect(-13, -34, 26, 18);
    ctx.fillStyle = skin;
    ctx.fillRect(-18, -31 + pose.arm, 6, 15);
    ctx.fillRect(12, -31 - pose.arm, 6, 15);
    ctx.fillRect(-9, -48, 18, 16);
    ctx.fillStyle = hair;
    ctx.fillRect(-10, -52, 20, 7);
    ctx.fillStyle = "#1c1820";
    ctx.fillRect(-5, -42, 3, 2);
    ctx.fillRect(4, -42, 3, 2);
  }

  function drawMiniMegazord(hero) {
    const pose = walkPose(hero);
    const leg = Math.round(pose.leg * 0.7);

    ctx.fillStyle = "#17362f";
    ctx.fillRect(-17 + leg, -24, 12, 24);
    ctx.fillRect(5 - leg, -24, 12, 24);
    ctx.fillStyle = "#d8c86d";
    ctx.fillRect(-20 + leg, -2, 16, 5);
    ctx.fillRect(4 - leg, -2, 16, 5);

    ctx.fillStyle = "#1f9a5b";
    ctx.fillRect(-24, -58, 48, 36);
    ctx.fillStyle = "#2fbd72";
    ctx.fillRect(-18, -66, 36, 13);
    ctx.fillStyle = "#d8c86d";
    ctx.fillRect(-15, -72, 30, 9);
    ctx.fillStyle = "#111d21";
    ctx.fillRect(-13, -62, 26, 8);
    ctx.fillStyle = "#ff4040";
    ctx.fillRect(-10, -60, 6, 3);
    ctx.fillRect(4, -60, 6, 3);
    ctx.fillStyle = "#e8ffe8";
    ctx.fillRect(-10, -48, 20, 5);
    ctx.fillStyle = "#d8c86d";
    ctx.fillRect(-23, -39, 46, 5);

    ctx.fillStyle = "#1f9a5b";
    ctx.fillRect(-34, -53 + pose.arm, 10, 30);
    ctx.fillRect(24, -53 - pose.arm, 10, 30);
    ctx.fillStyle = "#d8c86d";
    ctx.fillRect(-37, -26 + pose.arm, 16, 7);
    ctx.fillRect(21, -26 - pose.arm, 16, 7);

    if (hero.attackTimer > 0) {
      ctx.fillStyle = "rgba(167,255,122,0.42)";
      ctx.fillRect(20, -49, 86, 12);
      ctx.fillStyle = "#e8ffe8";
      ctx.fillRect(25, -45, 72, 4);
    }
  }

  function drawRanger(hero) {
    const color = rangerColor(hero);
    const trim = hero.heroId === "thomas" ? "#d6b45b" : "#ffffff";
    const pose = walkPose(hero);
    ctx.fillStyle = color;
    ctx.fillRect(-11 + pose.leg, -18, 8, 18);
    ctx.fillRect(3 - pose.leg, -18, 8, 18);
    ctx.fillRect(-14, -35, 28, 20);
    ctx.fillStyle = "#1a1e2b";
    ctx.fillRect(-12 + pose.leg, -2, 10, 4);
    ctx.fillRect(2 - pose.leg, -2, 10, 4);
    ctx.fillStyle = trim;
    ctx.fillRect(-9, -31, 18, 4);
    ctx.fillRect(-5, -35, 10, 20);
    ctx.fillStyle = color;
    ctx.fillRect(-8, -33, 16, 5);
    ctx.fillStyle = "#2d3144";
    ctx.fillRect(-17, -32 + pose.arm, 5, 16);
    ctx.fillRect(12, -32 - pose.arm, 5, 16);
    ctx.fillStyle = color;
    ctx.fillRect(-18, -36 + pose.arm, 6, 8);
    ctx.fillRect(12, -36 - pose.arm, 6, 8);
    ctx.fillStyle = color;
    ctx.fillRect(-11, -53, 22, 19);
    ctx.fillStyle = trim;
    ctx.fillRect(-10, -52, 20, 4);
    ctx.fillStyle = "#202432";
    ctx.fillRect(-8, -46, 16, 5);
    ctx.fillStyle = "#9ef4ff";
    ctx.fillRect(-6, -45, 12, 2);
    if (hero.heroId === "thomas") {
      ctx.fillStyle = "#d6b45b";
      ctx.fillRect(-13, -35, 5, 20);
      ctx.fillRect(8, -35, 5, 20);
    }
  }

  function drawAttackPose(hero) {
    const special = hero.attackType === "special";
    const color = hero.morph ? rangerColor(hero) : "#ffe0b2";
    const swing = hero.attackType === "special" ? (28 - hero.attackTimer) / 28 : (16 - hero.attackTimer) / 16;
    const reach = special ? 32 + Math.sin(swing * Math.PI) * 18 : 18 + Math.sin(swing * Math.PI) * 12;
    ctx.fillStyle = special ? "#fff6a2" : color;
    ctx.fillRect(13, -33, reach, special ? 5 : 7);

    if (!special) {
      ctx.fillStyle = "#fff1d0";
      ctx.fillRect(25 + reach * 0.45, -38, 11, 11);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, -42);
      ctx.lineTo(34 + reach * 0.45, -40);
      ctx.moveTo(13, -24);
      ctx.lineTo(38 + reach * 0.42, -25);
      ctx.stroke();
    }

    if (special) {
      ctx.strokeStyle = hero.morph ? rangerColor(hero) : "#8eefff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(30, -38);
      ctx.lineTo(50, -29);
      ctx.lineTo(38, -24);
      ctx.lineTo(66, -16);
      ctx.stroke();
      ctx.fillStyle = hero.morph ? "rgba(255,255,255,0.55)" : "rgba(142,239,255,0.55)";
      ctx.fillRect(32, -34, 52, 4);
      ctx.fillRect(45, -25, 38, 3);
    }
  }

  function drawThorHammer(hero) {
    const pose = walkPose(hero);
    const attacking = hero.attackTimer > 0;

    ctx.save();
    ctx.translate(attacking ? 34 : 19, attacking ? -35 : -28 - pose.arm);
    ctx.rotate(attacking ? -0.55 : -0.18);
    ctx.fillStyle = "#7a4b2b";
    ctx.fillRect(-2, 0, 4, 23);
    ctx.fillStyle = "#d7dce6";
    ctx.fillRect(-12, -8, 24, 12);
    ctx.fillStyle = "#8992a4";
    ctx.fillRect(-15, -5, 3, 7);
    ctx.fillRect(12, -5, 3, 7);
    ctx.fillStyle = "#f5f7ff";
    ctx.fillRect(-8, -7, 7, 3);
    ctx.strokeStyle = "#8eefff";
    ctx.lineWidth = 2;
    if (attacking || state.mode === "drama") {
      ctx.beginPath();
      ctx.moveTo(13, -8);
      ctx.lineTo(24, -18);
      ctx.lineTo(20, -6);
      ctx.lineTo(35, -13);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnemy(enemy) {
    const x = Math.round(enemy.x - state.cameraX);
    const y = Math.round(screenY(enemy.x, enemy.y));
    if (x < -90 || x > W + 90) return;
    const pose = walkPose(enemy);

    drawShadow(x, y, enemy.kind === "boss" ? (enemy.transformed ? 42 : 29) : 17);
    ctx.save();
    ctx.translate(x, Math.round(y - enemy.z - pose.bob));
    ctx.scale(enemy.facing || 1, 1);

    if (enemy.dead) ctx.globalAlpha = enemy.kind === "boss" ? clamp(enemy.deathTimer / 120, 0, 1) : clamp(enemy.deathTimer / 35, 0.2, 1);
    if (enemy.flash > 0 && Math.floor(enemy.flash / 2) % 2 === 0) ctx.globalAlpha = 0.6;

    if (enemy.kind === "boss") drawBoss(enemy);
    else drawMob(enemy);

    ctx.restore();

    if (enemy.kind === "boss" && state.bossActive) drawBossBar(enemy);
  }

  function drawMob(enemy) {
    const brute = enemy.enemyType === "brute";
    const runner = enemy.enemyType === "runner";
    const body = brute ? "#7e6c95" : runner ? "#667aa2" : "#85858d";
    const accent = brute ? "#bb5b91" : runner ? "#75e1df" : "#d2d2d2";
    const scale = brute ? 1.16 : 1;
    const pose = walkPose(enemy);
    ctx.save();
    ctx.scale(scale, scale);
    ctx.fillStyle = "#3f3f4b";
    ctx.fillRect(-10 + pose.leg, -17, 7, 17);
    ctx.fillRect(3 - pose.leg, -17, 7, 17);
    ctx.fillStyle = body;
    ctx.fillRect(-13, -35, 26, 20);
    ctx.fillStyle = "#5a5468";
    ctx.fillRect(-18, -31 + pose.arm, 5, 14);
    ctx.fillRect(13, -31 - pose.arm, 5, 14);
    ctx.fillStyle = body;
    ctx.fillRect(-10, -50, 20, 16);
    ctx.fillStyle = accent;
    ctx.fillRect(-6, -44, 12, 3);
    if (enemy.attackTimer > 0) {
      ctx.fillStyle = "#ddd2ff";
      ctx.fillRect(13, -31, 16, 6);
    }
    ctx.restore();
  }

  function drawBoss(enemy) {
    const pose = walkPose(enemy);
    const phase3 = enemy.phase >= 3;
    const big = enemy.transformed;
    ctx.save();
    if (phase3) ctx.scale(1.55, 1.55);
    else if (big) ctx.scale(1.32, 1.32);
    ctx.fillStyle = "#3e235c";
    ctx.fillRect(-19 + pose.leg, -21, 13, 21);
    ctx.fillRect(6 - pose.leg, -21, 13, 21);
    ctx.fillStyle = phase3 ? "#d83dc3" : big ? "#b02fb0" : "#8d3192";
    ctx.fillRect(-24, -50, 48, 30);
    ctx.fillStyle = phase3 ? "#7b1a98" : big ? "#67228a" : "#4d236b";
    ctx.fillRect(-30, -46 + pose.arm, 8, 24);
    ctx.fillRect(22, -46 - pose.arm, 8, 24);
    ctx.fillStyle = "#1a1528";
    ctx.fillRect(-15, -62, 30, 18);
    ctx.fillStyle = "#b7f05f";
    ctx.fillRect(-11, -57, 22, 5);
    ctx.fillStyle = "#e9d77a";
    ctx.fillRect(-19, -66, 8, 8);
    ctx.fillRect(11, -66, 8, 8);
    ctx.fillStyle = "#5df0c3";
    ctx.fillRect(-10, -42, 20, 8);
    if (big) {
      ctx.fillStyle = "#ff72c7";
      ctx.fillRect(-32, -55, 8, 12);
      ctx.fillRect(24, -55, 8, 12);
      ctx.fillStyle = phase3 ? "rgba(255,237,132,0.62)" : "rgba(255,114,199,0.5)";
      ctx.fillRect(-35, -31, 70, 4);
      ctx.fillRect(-28, -26, 56, 3);
      if (phase3) {
        ctx.fillRect(-42, -38, 84, 3);
        ctx.fillRect(-38, -18, 76, 3);
      }
    }

    if (enemy.attackTimer > 0) {
      ctx.fillStyle = "#ff72c7";
      ctx.fillRect(20, -43, big ? 38 : 26, 8);
      ctx.fillRect(big ? 51 : 39, -48, 8, 18);
    }
    ctx.restore();
  }

  function drawFamily(person) {
    if (person.hidden) return;
    const x = Math.round(person.x - state.cameraX);
    const y = Math.round(screenY(person.x, person.y));
    if (x < -70 || x > W + 70) return;
    const pose = walkPose(person);
    drawShadow(x, y, person.id === "clara" ? 10 : 15);
    ctx.save();
    ctx.translate(x, Math.round(y - pose.bob));
    ctx.scale(person.id === "clara" ? 0.72 : 1, person.id === "clara" ? 0.72 : 1);

    if (person.id === "clara") {
      drawBody("#ff8db7", "#ffd56a", "#d99b6d", "#7b4a2c", person);
    } else if (person.id === "laura") {
      drawBody("#9bdbff", "#653f86", "#d39a6b", "#6d4029", person);
      ctx.fillStyle = "#6d4029";
      ctx.fillRect(-13, -48, 7, 17);
      ctx.fillRect(8, -48, 7, 17);
    } else if (person.id === "osvaldo") {
      drawBody("#7bd188", "#405575", "#d39a6b", "#70513e", person);
      ctx.fillStyle = "#d39a6b";
      ctx.fillRect(-8, -52, 16, 6);
      ctx.fillStyle = "#70513e";
      ctx.fillRect(-13, -43, 5, 9);
      ctx.fillRect(8, -43, 5, 9);
    } else if (person.id === "camile") {
      drawBody("#5b4637", "#2b2c36", "#d39a6b", "#6d4029", person);
      ctx.fillStyle = "#7a5b42";
      ctx.fillRect(-15, -35, 30, 22);
      ctx.fillStyle = "#efe4c8";
      ctx.fillRect(-8, -33, 16, 17);
      ctx.fillStyle = "#4a3025";
      ctx.fillRect(-13, -49, 7, 18);
      ctx.fillRect(7, -49, 7, 18);
      ctx.fillRect(-10, -52, 20, 7);
      ctx.fillStyle = "#2b1b16";
      ctx.fillRect(-6, -18, 12, 4);
      drawPinkLightsaber(person);
    } else if (person.id === "evelin") {
      drawBody("#faf1ea", "#c06484", "#e8b596", "#5c4033", person);
      ctx.fillStyle = "#5c4033";
      ctx.fillRect(-11, -53, 22, 10);
      ctx.fillRect(-13, -47, 7, 20);
      ctx.fillRect(7, -47, 7, 20);
      ctx.fillStyle = "#4a3020";
      ctx.fillRect(-8, -41, 16, 3);
      ctx.fillStyle = "#6d4c38";
      ctx.fillRect(-6, -36, 12, 4);
    } else {
      drawBody("#f2a66e", "#7c5f90", "#d39a6b", "#7a452f", person);
      ctx.fillStyle = "#7a452f";
      ctx.fillRect(-12, -49, 24, 9);
    }

    ctx.restore();
    drawNameTag(person.name, x, y - (person.id === "clara" ? 43 : 58), "#ffffff");
  }

  function drawPinkLightsaber(person) {
    const pose = walkPose(person);
    const glow = 0.45 + Math.sin(state.time * 10) * 0.18;

    ctx.save();
    ctx.translate(18, -31 - pose.arm);
    ctx.rotate(-0.22);
    ctx.fillStyle = "#2f323c";
    ctx.fillRect(-2, 14, 5, 11);
    ctx.fillStyle = "#f7d7ff";
    ctx.globalAlpha = glow;
    ctx.fillRect(-5, -30, 11, 45);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ff70d7";
    ctx.fillRect(-2, -30, 5, 45);
    ctx.fillStyle = "#ffd6f3";
    ctx.fillRect(-1, -28, 2, 40);
    ctx.restore();
  }

  function drawShadow(x, y, width) {
    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.beginPath();
    ctx.ellipse(x, y + 1, width, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawNameTag(text, x, y, color) {
    ctx.font = "8px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#1b1d2d";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawBossBar(enemy) {
    if (!state.bossActive || enemy.dead) return;
    const x = 132;
    const y = 10;
    const w = 194;
    const pct = clamp(enemy.hp / enemy.maxHp, 0, 1);
    ctx.fillStyle = "rgba(22,18,35,0.78)";
    ctx.fillRect(x - 3, y - 3, w + 6, 17);
    ctx.fillStyle = "#3a1328";
    ctx.fillRect(x, y, w, 11);
    ctx.fillStyle = state.bossVulnerable ? "#e24b91" : "#7cecff";
    ctx.fillRect(x, y, Math.floor(w * pct), 11);
    const label = enemy.transformed ? "VILAO FINAL" : state.bossVulnerable ? "VILAO" : "???";
    drawPixelText(label, x + w / 2, y + 9, 8, "#ffffff", "center");
  }

  function drawParticles() {
    for (const p of state.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      const x = Math.round(p.x - state.cameraX);
      const y = Math.round(p.y);
      ctx.globalAlpha = alpha;

      if (p.type === "lightning") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(x, y - 80);
        ctx.lineTo(x + 12, y - 48);
        ctx.lineTo(x - 6, y - 22);
        ctx.lineTo(x + 10, y + 12);
        ctx.stroke();
      } else if (p.type === "bolt") {
        ctx.fillStyle = p.color;
        ctx.fillRect(x, y, p.size * 3, p.size);
        ctx.fillRect(x + p.size, y - p.size, p.size, p.size * 3);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(x, y, p.size, p.size);
      }

      ctx.globalAlpha = 1;
    }
  }

  function drawFloaters() {
    ctx.textAlign = "center";
    for (const floater of state.floaters) {
      const alpha = clamp(floater.life / floater.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      drawPixelText(floater.text, floater.x - state.cameraX, floater.y, 8, floater.color, "center");
      ctx.globalAlpha = 1;
    }
  }

  function drawHud() {
    const p = state.player;
    if (!p) return;

    ctx.fillStyle = "rgba(16,18,37,0.76)";
    ctx.fillRect(7, 8, 112, 29);
    drawPixelText(heroName(p.heroId).toUpperCase(), 13, 19, 8, "#fff3ae", "left");

    for (let i = 0; i < p.maxHp; i += 1) {
      ctx.fillStyle = i < p.hp ? "#ef3b42" : "#2f3243";
      ctx.fillRect(13 + i * 15, 23, 11, 9);
      ctx.strokeStyle = "#fff2b3";
      ctx.lineWidth = 1;
      ctx.strokeRect(13 + i * 15, 23, 11, 9);
    }

    ctx.fillStyle = "rgba(16,18,37,0.76)";
    ctx.fillRect(7, 41, 112, 17);
    ctx.fillStyle = "#2d3956";
    ctx.fillRect(13, 47, 92, 5);
    ctx.fillStyle = p.power >= 100 ? "#fff27a" : "#6ee7ff";
    ctx.fillRect(13, 47, Math.floor(92 * (p.power / 100)), 5);
    drawPixelText(p.megazord ? "ZORDE" : p.morph ? "RANGER" : "PODER", 109, 53, 7, "#ffffff", "right");

    if (canUseAutoToggle()) {
      const b = HUD_AUTO_BUTTON;
      ctx.fillStyle = state.autoPlay ? "rgba(40,92,126,0.86)" : "rgba(16,18,37,0.68)";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = state.autoPlay ? "#9ff2ff" : "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      drawPixelText("AUTO", b.x + b.w / 2, b.y + 19, 7, state.autoPlay ? "#fff1a3" : "#9ff2ff", "center");
    }
  }

  function drawDialogue() {
    if (!state.dialogue) return;
    const boxW = 315;
    const boxX = (W - boxW) / 2;
    const boxY = state.mode === "ending" ? H - 52 : state.bossActive ? 31 : 14;
    ctx.fillStyle = "rgba(15,18,33,0.82)";
    ctx.fillRect(boxX, boxY, boxW, 38);
    ctx.strokeStyle = "#fff0a4";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX + 1, boxY + 1, boxW - 2, 36);
    drawPixelText(state.dialogue.name, boxX + 10, boxY + 13, 8, "#80f1ff", "left");
    drawWrappedText(state.dialogue.text, boxX + 10, boxY + 25, boxW - 20, 10, "#ffffff");
  }

  function drawTitlePreview() {
    if (state.titleArmed) {
      drawPixelText("A FASE VAI COMEÇAR", W / 2, H - 34, 12, "#fff1a3", "center");
    }
  }

  function drawDramaOverlay() {
    ctx.fillStyle = `rgba(10, 9, 28, ${0.18 + Math.sin(state.time * 18) * 0.08})`;
    ctx.fillRect(0, 0, W, H);
    if (state.dramaTimer < 150) {
      drawPixelText("A TEMPESTADE RESPONDE...", W / 2, 84, 12, "#bff8ff", "center");
    }
  }

  function drawDeathOverlay() {
    const alpha = clamp(1 - state.deathTimer / 118, 0, 0.56);
    ctx.fillStyle = `rgba(6, 7, 16, ${alpha})`;
    ctx.fillRect(0, 0, W, H);
    drawPixelText("REINICIANDO", W / 2, 117, 15, "#fff1a3", "center");
  }

  function drawEndingText() {
    if (state.endingTimer < 105) return;
    const finale = state.endingTimer > 560;
    const pulse = Math.sin(state.time * (finale ? 10 : 8)) * (finale ? 3 : 2);
    drawOutlinedText("PARABENS CHRIS", W / 2, 36 + pulse, finale ? 26 : 23, "#fff7b5", "#b42036");
    if (state.endingTimer > 185) {
      ctx.globalAlpha = 0.88 + Math.sin(state.time * 6) * 0.07;
      drawPixelText("FAMILIA JUNTA NO MELHOR FINAL", W / 2, 66 + pulse * 0.35, 8, "#bfefff", "center");
      ctx.globalAlpha = 1;
    }

    if (state.endingTimer > 310) {
      const scroll = (state.endingTimer - 310) * 0.12;
      for (let i = 0; i < ENDING_CREDITS.length; i += 1) {
        const y = H + 28 - scroll + i * 28;
        if (y > -14 && y < H + 36) {
          const sz = i === 0 ? 9 : i >= ENDING_CREDITS.length - 1 ? 8 : 7;
          const col = i % 2 === 0 ? "#eef1ff" : "#cad6ff";
          drawPixelText(ENDING_CREDITS[i], W / 2, y, sz, col, "center");
        }
      }
    }
  }

  function drawWrappedText(text, x, y, maxWidth, lineHeight, color) {
    ctx.font = "10px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = color;
    const words = text.split(" ");
    let line = "";
    let lineY = y;

    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, lineY);
        line = word;
        lineY += lineHeight;
      } else {
        line = test;
      }
    }

    ctx.fillText(line, x, lineY);
  }

  function drawOutlinedText(text, x, y, size, fill, stroke) {
    ctx.font = `${size}px Impact, Arial Black, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = Math.max(3, Math.floor(size / 6));
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function drawPixelText(text, x, y, size, color, align = "left") {
    ctx.font = `${size}px Arial Black, Arial, sans-serif`;
    ctx.textAlign = align;
    ctx.lineWidth = Math.max(2, Math.floor(size / 4));
    ctx.strokeStyle = "rgba(28, 17, 37, 0.9)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function rangerColor(hero) {
    if (hero.heroId === "nico") return "#151720";
    if (hero.heroId === "thomas") return "#1f9a5b";
    return "#d42735";
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  window.addEventListener("keydown", (event) => {
    const code = event.code;

    if (code === "Escape") {
      if (state.settingsOpen) {
        closeSettings();
        event.preventDefault();
        return;
      }
      if (canPauseGameplay()) {
        toggleUserPause();
        event.preventDefault();
        return;
      }
    }

    if (code === "KeyO") {
      toggleSettings();
      event.preventDefault();
      return;
    }

    if (code === "KeyP") {
      if (canPauseGameplay()) {
        toggleUserPause();
        event.preventDefault();
        return;
      }
    }

    if (shouldPauseGameUpdates()) {
      if (code in moveKeys || code in keyMap || code === "Space") {
        event.preventDefault();
      }
      return;
    }

    if (code in moveKeys || code in keyMap || code === "Space") event.preventDefault();

    if (state.mode === "title" && (code === "Enter" || code === "Space")) {
      titleButton.click();
      return;
    }

    if (state.mode === "ending" && state.finaleOverlayShown && (code === "Enter" || code === "Space")) {
      replayButton.click();
      return;
    }

    controls.keys.add(code);
    const action = keyMap[code] || (code === "Space" ? "jump" : null);
    if (action) pressAction(action);
  });

  window.addEventListener("keyup", (event) => {
    controls.keys.delete(event.code);
    const action = keyMap[event.code] || (event.code === "Space" ? "jump" : null);
    if (action) releaseAction(action);
  });

  function beginGameFromTitle() {
    unlockAudio();
    state.pendingAutoPlay = false;
    tryStartIntroFromBeginning(false);
    playSfx("morph");
    startLevel(false);
  }

  function returnToTitle() {
    unlockAudio();
    stopAudio(finalAudio);
    stopAudio(mapAudio);
    resetLevel();
    state.mode = "title";
    state.titleArmed = false;
    state.autoStartAt = 0;
    state.autoPlay = false;
    state.pendingAutoPlay = false;
    state.titleTime = 0;
    state.time = 0;
    document.body.classList.remove("playing");
    document.body.classList.remove("auto-playing");
    endScreen.classList.remove("active");
    titleScreen.classList.add("active");
    titleButton.textContent = "INICIAR";
    tryStartIntroFromBeginning(true);
    kickIntroAutoplay();
  }

  titleButton.addEventListener("click", () => {
    beginGameFromTitle();
  });

  replayButton.addEventListener("click", () => {
    startLevel(false);
  });

  if (settingMusicToggle) {
    settingMusicToggle.addEventListener("click", () => toggleMusicEnabled());
  }
  if (settingVolDown) settingVolDown.addEventListener("click", () => bumpVolume(-0.05));
  if (settingVolUp) settingVolUp.addEventListener("click", () => bumpVolume(0.05));
  if (settingOpacityDown) settingOpacityDown.addEventListener("click", () => bumpTouchOpacity(-0.05));
  if (settingOpacityUp) settingOpacityUp.addEventListener("click", () => bumpTouchOpacity(0.05));
  if (settingsCloseButton) {
    settingsCloseButton.addEventListener("click", () => {
      unlockAudio();
      closeSettings();
      clearActionEdges();
    });
  }
  if (selectButton) {
    selectButton.addEventListener("click", (event) => {
      event.preventDefault();
      onSelectButton();
    });
  }
  if (startButton) {
    startButton.addEventListener("click", (event) => {
      event.preventDefault();
      onStartButton();
    });
  }

  menuButton.addEventListener("click", () => {
    returnToTitle();
  });

  fullscreenButton.addEventListener("click", () => {
    const root = document.getElementById("game-shell");
    if (!document.fullscreenElement) {
      root.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  function canUseAutoToggle() {
    return state.mode === "playing" || state.mode === "drama" || state.mode === "bossTransform";
  }

  function getCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    };
  }

  function hitHudAutoButton(point) {
    const b = HUD_AUTO_BUTTON;
    return point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h;
  }

  function toggleAutoPlay() {
    if (!canUseAutoToggle()) return;
    if (shouldPauseGameUpdates()) return;
    setAutoPlay(!state.autoPlay);
    addFloater(state.autoPlay ? "AUTO" : "MANUAL", state.player.x, state.player.y - 64, "#9ff2ff");
    playSfx(state.autoPlay ? "special" : "menu");
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!canUseAutoToggle()) return;
    if (!hitHudAutoButton(getCanvasPoint(event))) return;
    event.preventDefault();
    toggleAutoPlay();
  });

  stickZone.addEventListener("pointerdown", (event) => {
    if (shouldPauseGameUpdates()) return;
    stickPointer = event.pointerId;
    stickZone.setPointerCapture(stickPointer);
    updateStick(event);
  });

  stickZone.addEventListener("pointermove", (event) => {
    if (shouldPauseGameUpdates()) return;
    if (event.pointerId === stickPointer) updateStick(event);
  });

  function clearStick() {
    stickPointer = null;
    controls.touchX = 0;
    controls.touchY = 0;
    stickKnob.style.transform = "translate(-50%, -50%)";
  }

  stickZone.addEventListener("pointerup", clearStick);
  stickZone.addEventListener("pointercancel", clearStick);

  function updateStick(event) {
    event.preventDefault();
    const rect = stickZone.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const max = rect.width * 0.31;
    const length = Math.hypot(dx, dy);
    const limited = length > max ? max / length : 1;
    const lx = dx * limited;
    const ly = dy * limited;
    controls.touchX = clamp(dx / max, -1, 1);
    controls.touchY = clamp(dy / max, -1, 1);
    stickKnob.style.transform = `translate(calc(-50% + ${lx}px), calc(-50% + ${ly}px))`;
  }

  for (const button of document.querySelectorAll(".action-button")) {
    const action = button.dataset.action;
    button.addEventListener("pointerdown", (event) => {
      if (shouldPauseGameUpdates()) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      button.classList.add("pressed");
      pressAction(action);
    });
    const release = () => {
      button.classList.remove("pressed");
      releaseAction(action);
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  }

  function loop(tick) {
    const step = state.lastTick ? clamp((tick - state.lastTick) / 16.6667, 0.2, 2.4) : 1;
    state.lastTick = tick;

    if (!shouldPauseGameUpdates()) {
      if (state.mode === "title") updateTitle(step);
      else if (state.mode === "playing") updatePlaying(step);
      else if (state.mode === "drama") updateDrama(step);
      else if (state.mode === "bossTransform") updateBossTransform(step);
      else if (state.mode === "bossDeath") updateBossDeath(step);
      else if (state.mode === "dying") updateDeath(step);
      else if (state.mode === "ending") updateEnding(step);
    }

    draw();
    requestAnimationFrame(loop);
  }

  resetLevel();
  state.mode = "title";
  refreshSettingsPanel();
  tryStartIntroFromBeginning(true);
  kickIntroAutoplay();

  introAudio.addEventListener("canplay", kickIntroAutoplay, { once: true });
  introAudio.addEventListener("loadeddata", kickIntroAutoplay, { once: true });
  window.addEventListener("load", kickIntroAutoplay);

  let introAutoplayTries = 0;
  const introAutoplayInterval = window.setInterval(() => {
    if (state.mode !== "title") {
      window.clearInterval(introAutoplayInterval);
      return;
    }
    if (!introAudio.paused) {
      window.clearInterval(introAutoplayInterval);
      return;
    }
    introAutoplayTries += 1;
    if (introAutoplayTries > 35) {
      window.clearInterval(introAutoplayInterval);
      return;
    }
    kickIntroAutoplay();
  }, 180);

  window.addEventListener("pointerdown", kickIntroAutoplay, { passive: true });
  window.addEventListener("keydown", kickIntroAutoplay, { passive: true });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "visible") kickIntroAutoplay();
    },
    { passive: true }
  );

  requestAnimationFrame(loop);
})();
