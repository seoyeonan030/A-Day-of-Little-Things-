/** 오늘은 조금 다른 하루: 횡스크롤 동네 탐험 */

const canvas = document.getElementById('viewport');
const ctx = canvas.getContext('2d');
const endingBackdrop = document.createElement('canvas');
endingBackdrop.width = canvas.width;
endingBackdrop.height = canvas.height;
const endingBackdropContext = endingBackdrop.getContext('2d');
const endingUI = {
  view: 'summary',
  showEndTitle: false,
  savedEnding: null,
  mapWallColor: null,
  scrollTop: 110,
  scrollBottom: 276,
  contentHeight: 574,
  scrollY: 0,
  scrollTargetY: 0,
  dragStartY: null,
  dragStartScroll: 0,
};

const VIEW_ZOOM = 1;
const GROUND_Y = canvas.height;
const PLAYER_BASE_Y = GROUND_Y;
const RABBIT_PLUSH_DROP = 4.5;
const PLANTER_SHIFT = 112;
const PLANTER_RAISE = 48;
const PLANTER_DROP = 48;
const FLOWER_CENTER = 274.75;
const FLOWER_CENTER_TOP = 210;
const WINDOW_COLOR = '#dedede';
const GUARD_WINDOW_COLOR = '#d5edfa';

function getWindowColor(defaultColor) {
  return defaultColor;
}

function getMapWallColor(defaultColor) {
  return endingUI.mapWallColor || defaultColor;
}
const BUS_STOP_LEFT_SHIFT = 40;
const BUS_WIDTH = 697;
const BUS_STOP_POSITION = 920 - BUS_STOP_LEFT_SHIFT - BUS_WIDTH;
const BUS_STOP_DEPART_POSITION = 960 - (BUS_STOP_POSITION + BUS_WIDTH);

// Game State
const gameState = { globalSaturation: 0 };

// Keyboard Controls State
const keys = {
  left: false,
  right: false,
  speedBoost: false,
};

// Camera
const camera = {
  x: 0,
  y: 0,
  width: canvas.width / VIEW_ZOOM,
  height: canvas.height / VIEW_ZOOM,
  update(targetX, worldWidth, frameScale = 1) {
    const desiredX = targetX - this.width / 2;
    this.x += (desiredX - this.x) * (1 - Math.pow(0.9, frameScale));
    this.x = Math.max(0, Math.min(worldWidth - this.width, this.x));
  }
};

// Particle Engine
const particles = [];
function createParticle(x, y, vx, vy, color, size, life, type = 'generic') {
  particles.push({ x, y, vx, vy, color, size, life, maxLife: life, type });
}

// Scene Transition Manager
const sceneTransition = {
  active: false,
  alpha: 0,
  state: 'idle', // 'out' | 'in'
  targetScene: null,
  targetX: 100,

  start(targetSceneId, spawnX) {
    if (this.active) return;
    this.active = true;
    this.state = 'out';
    this.alpha = 0;
    this.targetScene = targetSceneId;
    this.targetX = spawnX;
    window.soundEngine.playFootstep();
  },

  update(deltaSeconds = 1 / 60) {
    if (!this.active) return;

    if (this.state === 'out') {
      this.alpha += 10.4 * deltaSeconds;
      if (this.alpha >= 1) {
        this.alpha = 1;
        changeScene(this.targetScene, this.targetX);
        this.state = 'in';
      }
    } else if (this.state === 'in') {
      this.alpha -= 10.4 * deltaSeconds;
      if (this.alpha <= 0) {
        this.alpha = 0;
        this.active = false;
        this.state = 'idle';
      }
    }
  },

  draw(ctx) {
    if (!this.active && this.alpha <= 0) return;
    ctx.save();
    ctx.fillStyle = `rgba(14, 16, 22, ${this.alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
};

// Player Object
const player = {
  x: 680,
  y: PLAYER_BASE_Y,
  width: 36,
  height: 72,
  vx: 0,
  speed: 1.95,
  facing: 1, // 1: right, -1: left
  walkPhase: 0,
  idlePhase: 0,
  state: 'IDLE', // IDLE, WALK
  sitting: null,
  stepCooldown: 0,

  update(currentScene, deltaSeconds = 1 / 60) {
    const frameScale = Math.min(deltaSeconds * 60, 3);
    this.idlePhase += 0.035 * frameScale;

    if (sceneTransition.active || (currentScene.id === 'elevator' && elevatorRide.startedAt !== null) ||
      (busArrival.state === 'departing' &&
        (currentScene.id === 'bus_stop' || busArrival.departureTarget === currentScene.id)) ||
        (currentScene.id === 'bus' && busJourney.state === 'moving') ||
        (currentScene.id === 'bus_stop' && busArrival.state === 'arriving')) {
      this.vx = 0;
      return;
    }

    if (this.sitting) {
      if (!keys.left && !keys.right) {
        this.vx = 0;
        return;
      }
      standPlayerUp();
    }

    if (keys.left && !keys.right) {
      this.vx = -this.speed * (keys.speedBoost ? 6 : 1);
      this.facing = -1;
      this.state = 'WALK';
      this.walkPhase += 0.12 * frameScale;
      this.handleFootsteps(frameScale);
    } else if (keys.right && !keys.left) {
      this.vx = this.speed * (keys.speedBoost ? 6 : 1);
      this.facing = 1;
      this.state = 'WALK';
      this.walkPhase += 0.12 * frameScale;
      this.handleFootsteps(frameScale);
    } else {
      this.vx = 0;
      this.state = 'IDLE';
    }

    this.x += this.vx * frameScale;

    // Boundary Transitions
    if (currentScene.leftExit && this.x <= 25) {
      sceneTransition.start(currentScene.leftExit.target, currentScene.leftExit.spawnX);
    } else if (currentScene.rightExit && this.x >= currentScene.width - 25) {
      sceneTransition.start(currentScene.rightExit.target, currentScene.rightExit.spawnX);
    } else {
      const minX = currentScene.leftExit ? 20 : 35;
      const maxX = currentScene.rightExit ? currentScene.width - 20 : currentScene.width - 35;
      this.x = Math.max(minX, Math.min(maxX, this.x));
    }
  },

  handleFootsteps(frameScale = 1) {
    this.stepCooldown -= frameScale;
    if (this.stepCooldown <= 0) {
      window.soundEngine.playFootstep();
      this.stepCooldown = 26;
    }
  },

  draw(ctx) {
    const scale = 3.8;
    const elevatorElapsed = currentSceneId === 'elevator' && elevatorRide.startedAt !== null
      ? performance.now() - elevatorRide.startedAt
      : -1;
    if (elevatorElapsed >= 2350) return;
    const elevatorArrivalElapsed = currentSceneId === 'elevator' && elevatorArrival.startedAt !== null
      ? performance.now() - elevatorArrival.startedAt
      : -1;
    if (elevatorArrivalElapsed >= 0 && elevatorArrivalElapsed < 1600) return;
    const activityMotion = gameFlow.mode === 'dialogue' ? gameFlow.activityMotion : null;
    if (this.sitting) {
      drawPlayerSittingCharacter(ctx, this.x, this.sitting.seatY, this.facing, this.sitting.seatId, activityMotion, gameFlow.hasRabbitPlush);
      return;
    }
    const bob = (this.state === 'WALK')
      ? Math.abs(Math.sin(this.walkPhase)) * 2.2
      : Math.sin(this.idlePhase) * 1.0;
    if (this.state === 'IDLE' && !activityMotion) {
      drawPlayerStandingCharacter(ctx, this.x, this.y, this.facing, bob, gameFlow.hasRabbitPlush);
      return;
    }

    ctx.save();
    ctx.translate(this.x, this.y - scale * (1.5 + bob));
    ctx.scale(this.facing * scale, scale);

    const gait = this.state === 'WALK' ? Math.sin(this.walkPhase * 0.5) : 0;
    const legSwing = gait * 0.32;
    const armSwing = -gait * 0.28;
    const bodyWidth = 4;
    const legWidth = bodyWidth;
    const armWidth = 3.3;
    ctx.fillStyle = '#ffffff';

    const drawLimb = (x, y, length, width, angle, withFoot = false) => {
      ctx.save();
      ctx.translate(x, y + bob);
      ctx.rotate(angle);
      ctx.fillRect(-width / 2, 0, width, length);
      if (withFoot) {
        ctx.fillRect(-width / 2, length - 1, width + 3, 2.5);
      }
      ctx.restore();
    };

    drawLimb(-0.5, -14, 15, legWidth, -legSwing, true);
    if (activityMotion === 'flower') {
      ctx.save();
      ctx.translate(-0.5, -14 + bob);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-2, -25, bodyWidth, 25);
      ctx.fillRect(-2, -36, 8.5, 11);
      ctx.fillRect(0, -21, armWidth, 18);
      ctx.restore();
    } else {
      drawLimb(-2.5, -35, 18, armWidth, armSwing);
      ctx.fillRect(-2.5, -39 + bob, bodyWidth, 25);
      if (gameFlow.hasRabbitPlush) {
        ctx.fillStyle = '#f2a6c4';
        ctx.fillRect(1.75, -36 + bob + RABBIT_PLUSH_DROP, 1.5, 2.5);
        ctx.fillRect(1.5, -38 + bob + RABBIT_PLUSH_DROP, 1, 2);
        ctx.fillRect(3.5, -38 + bob + RABBIT_PLUSH_DROP, 1, 2);
        ctx.fillStyle = '#ffffff';
      }
      ctx.fillRect(-2.5, -50 + bob, 8.5, 11);
      if (activityMotion === 'guard') {
        drawLimb(1, -35, 18, armWidth, -2.3 + Math.sin(performance.now() / 120) * 0.3);
      } else if (activityMotion === 'cat') {
        drawLimb(1, -35, 24, armWidth, -0.9 + Math.sin(performance.now() / 120) * 0.12);
      } else if (activityMotion === 'dishes') {
        drawLimb(1, -35, 19, armWidth, -0.8 + Math.sin(performance.now() / 130) * 0.22);
      } else {
        drawLimb(1, -35, 18, armWidth, -armSwing);
      }
    }
    drawLimb(-0.5, -14, 15, legWidth, legSwing, true);

    ctx.restore();
  }
};

const scenes = {
  home: {
    id: 'home',
    name: '방',
    width: 960,
    leftExit: null,
    rightExit: { target: 'living_room', spawnX: 70 },
  },
  living_room: {
    id: 'living_room',
    name: '부엌',
    width: 960,
    leftExit: { target: 'home', spawnX: 900 },
    rightExit: { target: 'apartment_hallway', spawnX: 480 },
  },
  apartment_hallway: {
    id: 'apartment_hallway',
    name: '888호 아파트 복도',
    width: 960,
    leftExit: { target: 'living_room', spawnX: 900 },
    rightExit: { target: 'elevator', spawnX: 70 },
  },
  elevator: {
    id: 'elevator',
    name: '엘리베이터 8층',
    width: 960,
    leftExit: { target: 'apartment_hallway', spawnX: 900 },
    rightExit: null,
  },
  home_front: {
    id: 'home_front',
    name: '아파트 화단',
    width: 960,
    leftExit: { target: 'elevator', spawnX: 480 },
    rightExit: { target: 'bus_stop', spawnX: 70 },
  },
  bus_stop: {
    id: 'bus_stop',
    name: '버스 정류장',
    width: 960,
    leftExit: { target: 'home_front', spawnX: 900 },
    rightExit: { target: 'street', spawnX: 70 },
  },
  bus: {
    id: 'bus',
    name: '버스 안',
    width: 960,
    leftExit: null,
    rightExit: null,
  },
  refrigerator: {
    id: 'refrigerator',
    name: ' ',
    width: 960,
    leftExit: null,
    rightExit: null,
  },
  street: {
    id: 'street',
    name: '학원가',
    width: 960,
    leftExit: { target: 'bus_stop', spawnX: 900 },
    rightExit: { target: 'school', spawnX: 70 },
  },
  sea: {
    id: 'sea',
    name: '바다',
    width: 960,
    leftExit: null,
    rightExit: null,
  },
  school: {
    id: 'school',
    name: '학교 외부',
    width: 960,
    leftExit: { target: 'street', spawnX: 900 },
    rightExit: null,
  },
  school_board: {
    id: 'school_board',
    name: '교실 내부',
    width: 960,
    leftExit: { target: 'school', spawnX: 722 },
    rightExit: null,
  },
};

const TASK_PROGRESS_KEY = 'slightly-different-day-ending-unlocks-v2';

const gameFlow = {
  completed: new Set(),
  catTreats: false,
  hasRabbitPlush: false,
  grandmaState: 'none',
  grandmaTalkStep: 0,
  choiceKind: null,
  dialogueSequence: null,
  ateToday: false,
  cerealEver: false,
  fridgeEver: false,
  visitedSchool: false,
  dishesPrompted: false,
  day: 1,
  mode: null,
  selectedEnding: null,
  finale: null,
  runTaskIds: new Set(),
  hiddenSeaProgress: false,
  hiddenConfessionProgress: false,
  unlockedTaskIds: loadUnlockedTaskIds(),
  hiddenConfessionActive: false,
  nearby: null,
  monitorTask: null,
};

const kindnessTaskIds = new Set([
  'dishes', 'stone', 'apartment_door_887', 'guard', 'cat_pet', 'cat_feed', 'grandma_seat', 'desks_align',
]);
const foodEndingTaskIds = new Set(['cat_treats', 'cereal', 'cat_feed', 'apartment_door_887', 'pocha_snack']);
const natureEndingTaskIds = new Set(['cactus', 'window', 'flower', 'tree_leaves', 'bus_window']);
const greetingEndingTaskIds = new Set(['apartment_door_887', 'cactus', 'guard', 'cat_pet', 'grandma_seat']);

function showEnding(endingId) {
  const ending = endingDefinitions[endingId];
  if (!ending) return;
  endingUI.showEndTitle = false;
  endingUI.mapWallColor = ending.background;
  const hiddenTaskId = endingId === 'hidden_sea' ? 'hidden_sea' : endingId === 'hidden_confession' ? 'friend_confession' : null;
  if (hiddenTaskId) gameFlow.runTaskIds.add(hiddenTaskId);
  for (const taskId of gameFlow.runTaskIds) gameFlow.unlockedTaskIds.add(taskId);
  persistUnlockedTaskIds();
  endingUI.view = 'summary';
  endingUI.scrollY = 0;
  endingUI.scrollTargetY = 0;
  gameFlow.selectedEnding = endingId;
  gameFlow.finale = { ...ending, taskIds: [...gameFlow.runTaskIds] };
  endingUI.savedEnding = { id: endingId, finale: { ...ending, taskIds: [...gameFlow.runTaskIds] } };
  gameFlow.mode = 'finale';
}

function evaluateTaskEnding() {
  if (gameFlow.selectedEnding) return;
  const runTasks = gameFlow.runTaskIds;
  const generalTasks = [...runTasks].filter(id => !id.startsWith('monitor_') && id !== 'friend_confession');
  const total = generalTasks.length;
  const hasAll = set => [...set].every(id => runTasks.has(id));

  if (total === 5 && hasAll(foodEndingTaskIds)) gameFlow.selectedEnding = 'food_kindness';
  else if (total === 5 && hasAll(natureEndingTaskIds)) gameFlow.selectedEnding = 'nature_happiness';
  else if (total === 5 && hasAll(greetingEndingTaskIds)) gameFlow.selectedEnding = 'greetings';
  else if (total === 5 && [...kindnessTaskIds].filter(id => runTasks.has(id)).length >= 3) gameFlow.selectedEnding = 'kindness';
  else if (total === 5 && generalTasks.filter(id => !kindnessTaskIds.has(id)).length >= 3) gameFlow.selectedEnding = 'self_happiness';
}

function getTaskProgressColor() {
  const runTasks = gameFlow.runTaskIds;
  const alternateEndings = [
    [foodEndingTaskIds, endingDefinitions.food_kindness.background],
    [natureEndingTaskIds, endingDefinitions.nature_happiness.background],
    [greetingEndingTaskIds, endingDefinitions.greetings.background],
  ];
  const alternateMatch = alternateEndings.find(([taskIds]) =>
    [...taskIds].filter(taskId => runTasks.has(taskId)).length >= 4
  );
  if (alternateMatch) return alternateMatch[1];

  const generalTasks = [...runTasks].filter(id =>
    !id.startsWith('monitor_') && id !== 'friend_confession' && id !== 'hidden_sea'
  );
  const kindnessCount = generalTasks.filter(id => kindnessTaskIds.has(id)).length;
  const selfHappinessCount = generalTasks.length - kindnessCount;
  if (kindnessCount >= 3) return endingDefinitions.kindness.background;
  if (selfHappinessCount >= 3) return endingDefinitions.self_happiness.background;
  return gameFlow.selectedEnding === 'self_happiness'
    ? endingDefinitions.self_happiness.background
    : endingDefinitions.kindness.background;
}

function drawTaskProgress(ctx) {
  const generalTasks = [...gameFlow.runTaskIds].filter(id =>
    !id.startsWith('monitor_') && id !== 'friend_confession' && id !== 'hidden_sea'
  );
  const taskCount = Math.min(generalTasks.length, 5);
  const taskColor = getTaskProgressColor();
  const taskStartX = 12;
  const rowY = 12;
  const cellSize = 14;
  const bedFrameColor = '#555555';
  const cactusPotColor = '#7d7d7d';
  const progressLineWidth = 1;
  const cornerRadius = 2.5;
  const taskBarWidth = cellSize * 5;

  ctx.save();
  ctx.lineWidth = progressLineWidth;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(taskStartX, rowY, taskBarWidth, cellSize, cornerRadius);
  ctx.clip();
  for (let index = 0; index < 5; index++) {
    const x = taskStartX + index * cellSize;
    ctx.fillStyle = index < taskCount ? taskColor : 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(x, rowY, cellSize, cellSize);
  }
  for (let index = 1; index < 5; index++) {
    ctx.strokeStyle = cactusPotColor;
    ctx.beginPath();
    ctx.moveTo(taskStartX + index * cellSize + 0.5, rowY);
    ctx.lineTo(taskStartX + index * cellSize + 0.5, rowY + cellSize);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = bedFrameColor;
  ctx.lineWidth = progressLineWidth;
  ctx.beginPath();
  ctx.roundRect(taskStartX + 0.5, rowY + 0.5, taskBarWidth - 1, cellSize - 1, cornerRadius);
  ctx.stroke();

  const hiddenStartX = taskStartX + 5 * cellSize + 10;
  const hiddenProgress = [gameFlow.hiddenSeaProgress, gameFlow.hiddenConfessionProgress];
  const hiddenColors = [endingDefinitions.hidden_sea.background, endingDefinitions.hidden_confession.background];
  hiddenProgress.forEach((isComplete, index) => {
    const x = hiddenStartX + index * (cellSize + 8);
    ctx.fillStyle = isComplete ? hiddenColors[index] : 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.roundRect(x, rowY, cellSize, cellSize, cornerRadius);
    ctx.fill();
    ctx.strokeStyle = bedFrameColor;
    ctx.beginPath();
    ctx.roundRect(x + 0.5, rowY + 0.5, cellSize - 1, cellSize - 1, cornerRadius);
    ctx.stroke();
  });
  ctx.restore();
}

function completeTask(taskId) {
  gameFlow.completed.add(taskId);
  gameFlow.runTaskIds.add(taskId);
  evaluateTaskEnding();
}

function isPostEndingReplayMode() {
  return Boolean(endingUI.savedEnding && !gameFlow.finale && !endingUI.showEndTitle);
}

function replayTaskIdForActivity(activity) {
  const taskIds = endingUI.savedEnding?.finale.taskIds || [];
  const activityTaskIds = {
    fridge: ['cat_treats'],
    bus_seat_left: ['grandma_seat'],
    school_break_friend: ['friend_confession'],
    monitor: ['monitor_chat', 'monitor_email'],
  };
  const candidates = activityTaskIds[activity.id] || [activity.id];
  return candidates.find(taskId => taskIds.includes(taskId)) || null;
}

function isPostEndingUtilityActivity(activity) {
  return ['seat', 'apartmentDoor', 'stairDoor', 'homeFrontExit', 'schoolDoor', 'elevatorDoor', 'boardBus', 'leaveBus']
    .includes(activity.kind);
}

function selectHiddenEnding(endingId) {
  gameFlow.selectedEnding = endingId;
}
let lastFlowFrame = performance.now();
const busArrival = { state: 'waiting', x: -697, idleSince: null, departureTarget: null };
const elevatorRide = { startedAt: null, startX: 0, destination: null };
const elevatorArrival = { startedAt: null, pendingDestination: null };
const busJourney = { state: 'boarding', stopIndex: 0, sceneryOffset: 0, movingUntil: 0, stopStartedAt: null };
const busStops = ['학교', '바다'];
const taskCatalog = [
  ['bed', '이불 정리', '#f5d9e4'], ['window', '창문 열기', '#d5edfa'], ['cactus', '선인장 돌보기', '#83c978'],
  ['monitor_chat', '메시지 보내기', '#96a4c4'], ['monitor_email', '메일 보내기', '#96a4c4'],
  ['cat_treats', '고양이 간식', '#efc99d'], ['cereal', '시리얼 먹기', '#69c65a'], ['dishes', '설거지', '#9aacc8'],
  ['apartment_door_887', '이웃에게 인사', '#e2b8d5'], ['stone', '돌 치우기', '#93b181'], ['stairs_door', '계단 내려가기', '#e2b8d5'],
  ['flower', '꽃 향기 맡기', '#b9a2c7'], ['guard', '경비실 인사', '#739bb5'], ['tree_leaves', '나뭇잎 잡기', '#719d79'],
  ['cat_pet', '고양이 쓰다듬기', '#d99b69'], ['cat_feed', '고양이 밥 주기', '#d99b69'], ['bus_window', '창밖 구경', '#d5edfa'],
  ['grandma_seat', '자리 양보', '#8aa9a0'], ['stationery_game', '문방구 게임', '#d5edfa'],
  ['poem', '서점 창문 읽기', '#d5edfa'], ['piano_sound', '피아노 듣기', '#d5edfa'], ['pocha_snack', '간식 사 먹기', '#d5edfa'],
  ['school_sign', '팻말 세우기', '#b1c8b3'], ['presentation', '발표하기', '#718b76'], ['desks_align', '책상 정리', '#9aaf99'],
];
const hiddenTaskCatalog = [
  ['hidden_sea', '바다 도착', '#8eb8c9'],
  ['friend_confession', '친구에게 고백', '#d99eb5'],
];

function loadUnlockedTaskIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(TASK_PROGRESS_KEY) || '[]');
    return new Set(Array.isArray(saved) ? saved.filter(id => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function persistUnlockedTaskIds() {
  try {
    localStorage.setItem(TASK_PROGRESS_KEY, JSON.stringify([...gameFlow.unlockedTaskIds]));
  } catch {
    // Storage can be unavailable for local files in restricted browser contexts.
  }
}

const endingDefinitions = {
  hidden_sea: { title: '히든 엔딩-1. 일탈: 바다에 간 하루', description: '매일 반복되던 일상에서 벗어나 바다를 찾았다. 잔잔한 파도 소리를 들으며 가만히 바다를 바라보았다.', background: '#8eb8c9', panel: '#e5f1f0', accent: '#3e788b' },
  hidden_confession: { title: '히든 엔딩-2. 마음을 전하는 하루: 숨겨왔던 마음을 보여준 하루', description: '오랫동안 마음속에 담아두고 외면했던 마음을 꺼내, 용기를 내어 말을 걸어보았다.', background: '#d99eb5', panel: '#fff0f4', accent: '#a94f78' },
  kindness: { title: '엔딩-1: 불어나는 행복', description: '작은 배려와 다정한 인사가 주변 사람들의 하루까지 환하게 만들었다.', background: '#e4c59d', panel: '#fff5e6', accent: '#b57845' },
  self_happiness: { title: '엔딩-2: 온전한 나만의', description: '다른 누구도 아닌, 오롯이 나의 행복에 집중한 하루를 보냈다.', background: '#b9b0d5', panel: '#f4f0ff', accent: '#71629b' },
  food_kindness: { title: '엔딩-3: 넉넉한 마음', description: '작은 간식과 따뜻한 마음이 이웃과 고양이에게까지 전해졌다. 넉넉한 인심만큼 넉넉한 행복을 느낀 하루였다.', background: '#e0b278', panel: '#fff3de', accent: '#a96838' },
  nature_happiness: { title: '엔딩-4: 자연과 함께', description: '바쁜 걸음을 잠시 멈추고 주변의 작은 풍경을 바라보았다. 자연 속에서 평범한 순간의 소중함을 발견한 하루였다.', background: '#9ab9a0', panel: '#edf6e9', accent: '#527b58' },
  greetings: { title: '엔딩-5: 인사로 전하는', description: '따뜻한 말 한마디와 사소한 배려가 주변을 환하게 밝혔다. 다정함은 나눌수록 더 커지는 법이다.', background: '#e0a6a0', panel: '#fff0eb', accent: '#a95755' },
};

const sceneActivities = {
  home: [
    { id: 'bed', x: 150, bounds: { x: 0, y: 198, width: 290, height: 122 }, label: '이불 정리하기', text: '침대 이불을 가지런히 정리했다. 하루를 깔끔하게 시작할 수 있을 것 같다.' },
    { id: 'window', x: 460, bounds: { x: 367, y: 74, width: 187, height: 123 }, label: '창문 열고 바람 맞기', text: '창문을 열고 시원한 바람을 맞았다. 기분이 상쾌해졌다.' },
    { id: 'cactus', x: 763, bounds: { x: 742, y: 144, width: 42, height: 64 }, label: '선인장에게 말 걸기', text: '선인장에게 말을 걸어본다. 오늘도 잘 갔다올게!.' },
    { id: 'monitor', x: 890, bounds: { x: 850, y: 126, width: 80, height: 84 }, label: '모니터 과제 하기', kind: 'monitor' },
  ],
  bus: [
    { id: 'bus_window', x: 650, bounds: { x: 576, y: 62, width: 150, height: 100 }, label: '버스 창밖 구경하기', text: '버스 창밖으로 지나가는 풍경을 구경했다. 마음이 한결 가벼워진다.' },
    { id: 'bus_exit', x: 846, bounds: { x: 758, y: 58, width: 176, height: 262 }, label: '버스에서 내리기', kind: 'leaveBus' },
    { id: 'bus_seat_left', x: 81, bounds: { x: 56, y: 177, width: 50, height: 143 }, label: '버스 자리에 앉기', kind: 'busSeat', seatX: 81, seatY: 248 },
  ],
  living_room: [
    { id: 'kitchen_chair', x: 573, bounds: { x: 548, y: 177, width: 50, height: 143 }, label: '의자에 앉기', kind: 'seat', seatX: 573, seatY: 248 },
    { id: 'cereal', x: 663, bounds: { x: 642, y: 192, width: 42, height: 16 }, label: '시리얼 먹기', kind: 'seatedTask', seatId: 'kitchen_chair', text: '학교에 가기 전 시리얼을 챙겨 먹는다. 든든하게 하루를 시작할 수 있을 것 같다.' },
    { id: 'fridge', x: 55, bounds: { x: 0, y: 70, width: 111, height: 250 }, label: '고양이 간식 챙기기', kind: 'fridge' },
    { id: 'dishes', x: 185, bounds: { x: 133, y: 165, width: 99, height: 27 }, label: '설거지하기', kind: 'dishes', text: '사용한 그릇을 깨끗이 씻는다. 부엌이 한결 산뜻해졌다.' },
  ],
  apartment_hallway: [
    { id: 'apartment_door_887', x: 295, bounds: { x: 279, y: 222, width: 39, height: 100 }, label: '이웃집 아이에게 인사하기', kind: 'neighborChild' },
    { id: 'apartment_door_888', x: 480, bounds: { x: 420, y: 84, width: 120, height: 236 }, label: '888호 들어가기', kind: 'apartmentDoor' },
  ],
  elevator: [
    { id: 'elevator_door', x: 480, bounds: { x: 358, y: 84, width: 244, height: 236 }, label: '엘리베이터 타기', kind: 'elevatorDoor' },
    { id: 'stairs_door', x: 839, bounds: { x: 779, y: 84, width: 120, height: 236 }, label: '계단으로 내려가기', kind: 'stairDoor' },
    { id: 'stone', x: 180, bounds: { x: 168, y: 296, width: 24, height: 24 }, label: '돌멩이 치우기', text: '엘리베이터 앞에 돌멩이가 있다. 누가 걸려 넘어지지 않게 돌을 치워야겠다.' },
  ],
  home_front: [
    { id: 'flower', x: FLOWER_CENTER + PLANTER_SHIFT, bounds: { x: FLOWER_CENTER + PLANTER_SHIFT - 14, y: FLOWER_CENTER_TOP - PLANTER_RAISE + PLANTER_DROP, width: 28, height: 264 - FLOWER_CENTER_TOP }, label: '꽃 향기 맡기', text: '꽃 향기를 맡아본다. 생각보다 좋은 냄새가 난다. 기분이 조금 좋아진 것 같다.' },
    { id: 'guard', x: 852, bounds: { x: 764, y: 88, width: 176, height: 138 * 0.7 }, label: '경비 아저씨와 인사하기', text: '먼저 인사를 건넨다. 안녕하세요. 평소보다 기분 좋게 길을 나선다.' },
  ],
  bus_stop: [
    { id: 'bus_stop_bench', x: 650 - BUS_STOP_LEFT_SHIFT, bounds: { x: 585 - BUS_STOP_LEFT_SHIFT, y: 255, width: 260, height: 65 }, label: '정류장 의자에 앉기', kind: 'seat', seatX: 650 - BUS_STOP_LEFT_SHIFT, seatY: 255 },
    { id: 'tree_leaves', x: 137.5, bounds: { x: 68.5, y: 50, width: 138, height: 270 }, label: '나뭇잎 잡기', text: '높은 나뭇잎을 잡아보았다.' },
    { id: 'cat_pet', x: 391, bounds: { x: 360, y: 272, width: 63, height: 48 }, label: '고양이 쓰다듬기', kind: 'catTask' },
    { id: 'cat_feed', x: 391, bounds: { x: 360, y: 272, width: 63, height: 48 }, label: '고양이에게 간식 주기', kind: 'catTask' },
  ],
  street: [
    { id: 'stationery_game', x: 210, bounds: { x: 168, y: 208, width: 64, height: 112 }, label: '문방구 게임하기', text: '오랜만에 문방구 앞 게임기를 플레이했다. 잠시나마 즐거운 시간을 보냈다.' },
    { id: 'poem', x: 430, bounds: { x: 300, y: 98, width: 165, height: 198 }, label: '서점 창문 바라보기', text: '서점 창문 너머로 시의 한 구절을 읽었다. 마음이 한결 차분해진다.' },
    { id: 'piano_sound', x: 625, bounds: { x: 540, y: 118, width: 165, height: 178 }, label: '피아노 소리에 몸 맡기기', text: '들려오는 피아노 소리에 몸을 맡겼다. 나도 모르게 몸이 리듬에 맞춰 움직였다.' },
    { id: 'pocha_snack', x: 850, bounds: { x: 750, y: 85, width: 190, height: 235 }, label: '포장마차에서 간식 사먹기', text: '포장마차에서 간식을 사먹었다. 배가 불러 기분이 좋다.' },
  ],
  sea: [],
  school: [
    { id: 'school_main_door', x: 722, bounds: { x: 600, y: 84, width: 244, height: 236 }, label: '학교 안으로 들어가기', kind: 'schoolDoor' },
    { id: 'school_sign', x: 292, bounds: { x: 230, y: 220, width: 120, height: 100 }, label: '쓰러진 학교 팻말 세우기', text: '쓰러진 학교 팻말을 다시 세웠다. 학교가 한결 깔끔해 보인다.' },
  ],
  school_board: [
    { id: 'school_break_friend', x: 809.625, bounds: { x: 764, y: 134, width: 56, height: 186 }, label: '친구와 이야기하기', kind: 'schoolBreakFriend' },
    { id: 'presentation', x: 480, bounds: { x: 186, y: 36, width: 588, height: 139 }, label: '선생님 앞에서 발표하기', text: '선생님: 준비한 내용을 들려줄래요? 발표를 마치자 선생님이 잘했다고 칭찬했다.' },
    { id: 'desks_align', x: 150, bounds: { x: 60, y: 216, width: 180.75, height: 104 }, label: '어질러진 책상 줄 맞추기', text: '맨 왼쪽 책상을 정리해 모든 책상을 줄 맞춰 놓았다. 교실이 한결 깔끔해 보인다.' },
  ],
};

// Current Active Scene (START AT HOME!)
let currentSceneId = 'home';
let currentScene = scenes[currentSceneId];

function changeScene(sceneId, spawnX) {
  if (!scenes[sceneId]) return;
  const previousSceneId = currentSceneId;
  const disembarkingBus = sceneId === 'bus_stop' && previousSceneId === 'bus' && busArrival.departureTarget !== null;
  if (sceneId === 'bus' && previousSceneId === 'bus_stop' && busArrival.state === 'departing') {
    setFlowMode(null);
  }
  currentSceneId = sceneId;
  currentScene = scenes[sceneId];
  elevatorRide.startedAt = null;
  elevatorRide.destination = null;
  elevatorArrival.startedAt = elevatorArrival.pendingDestination === sceneId ? performance.now() : null;
  elevatorArrival.pendingDestination = null;
  if (sceneId === 'bus') {
    busJourney.state = 'boarding';
    busJourney.stopIndex = 0;
    busJourney.sceneryOffset = 0;
    busJourney.stopStartedAt = null;
  }
  if (sceneId === 'school') {
    gameFlow.visitedSchool = true;
  }
  if (sceneId === 'sea') {
    selectHiddenEnding('hidden_sea');
    showEnding('hidden_sea');
  }
  if (sceneId === 'bus_stop') {
    if (!disembarkingBus) {
      busArrival.state = 'waiting';
      busArrival.x = -BUS_WIDTH;
      busArrival.departureTarget = null;
    }
    busArrival.idleSince = null;
  }
  player.x = spawnX;
  if (sceneId === 'apartment_hallway' && previousSceneId === 'living_room') player.x = 480;
  player.y = PLAYER_BASE_Y;
  player.state = 'IDLE';
  player.sitting = null;

  if (sceneId === 'refrigerator') {
    resetRefrigeratorPuzzle();
    setFlowMode('puzzle');
  } else if (sceneId === 'living_room' && previousSceneId === 'refrigerator' && gameFlow.catTreats) {
    gameFlow.dialogue = '냉장고에 있는 고양이 간식을 챙겼다.';
    gameFlow.activityMotion = null;
    setFlowMode('dialogue');
  }

  if (sceneId === 'home' && gameFlow.hiddenConfessionActive) {
    gameFlow.dialogue = '집에 돌아와서도 친구와 대화를 이어갔다. 모니터를 켜서 답장을 보내자.';
    gameFlow.activityMotion = null;
    setFlowMode('dialogue');
  } else if (sceneId === 'home' && gameFlow.visitedSchool && gameFlow.selectedEnding) {
    showEnding(gameFlow.selectedEnding);
  }
  if (sceneId === 'home' && gameFlow.visitedSchool) {
    gameFlow.visitedSchool = false;
    gameFlow.day++;
    gameFlow.ateToday = false;
    gameFlow.completed.delete('cereal');
    if (!gameFlow.hiddenConfessionActive) gameFlow.runTaskIds = new Set();
  }

  // Update Location Badge HUD
  const locBadge = document.getElementById('location-badge');
  if (locBadge) locBadge.textContent = `📍 ${currentScene.name}`;

  // Center camera
  camera.x = Math.max(0, Math.min(currentScene.width - camera.width, player.x - camera.width / 2));
}

function currentActivities() {
  if (endingUI.showEndTitle || gameFlow.mode === 'finale' || endingUI.savedEnding) {
    return [];
  }
  const activities = (sceneActivities[currentSceneId] || []).filter(activity => {
    if (isPostEndingReplayMode()) {
      return replayTaskIdForActivity(activity) !== null || isPostEndingUtilityActivity(activity);
    }
    if (activity.id === 'monitor' && !gameFlow.hiddenConfessionActive) return false;
    if (activity.id === 'fridge') return !gameFlow.completed.has('cat_treats');
    if (activity.id === 'cereal') return player.sitting?.seatId === 'kitchen_chair';
    if (activity.id === 'cat_pet') return !gameFlow.completed.has('cat_pet');
    if (activity.id === 'cat_feed') return gameFlow.completed.has('cat_pet') && !gameFlow.completed.has('cat_feed');
    if (activity.id === 'bus_seat_left') return busJourney.state === 'boarding' && !player.sitting;
    return true;
  });
  if (gameFlow.hiddenConfessionActive && currentSceneId === 'home') {
    return activities.filter(activity => activity.id === 'monitor');
  }
  if (currentSceneId === 'bus_stop' && busArrival.state === 'arriving') return [];
  if (currentSceneId === 'bus_stop' && busArrival.state === 'stopped') {
    return [{ id: 'arrived_bus', x: busArrival.x + BUS_WIDTH / 2, bounds: { x: busArrival.x, y: 48, width: BUS_WIDTH, height: 272 }, label: '버스 타기', kind: 'boardBus' }];
  }
  return activities;
}

function setFlowMode(mode, dialogueDuration = 1500) {
  gameFlow.mode = mode;
  if (mode !== 'monitorTyping') {
    hideMonitorTaskInput();
  }
  if (mode === 'dialogue') gameFlow.dialogueUntil = performance.now() + dialogueDuration;
  keys.left = false;
  keys.right = false;
  keys.speedBoost = false;
}

let monitorTaskInput = null;

function normalizeMonitorText(text) {
  return text.normalize('NFC');
}

function isMonitorTaskCorrect(value, target) {
  return normalizeMonitorText(value) === normalizeMonitorText(target);
}

function getMonitorTaskDiff(expectedText, actualText) {
  const expected = Array.from(normalizeMonitorText(expectedText));
  const actual = Array.from(normalizeMonitorText(actualText));
  const distances = Array.from({ length: expected.length + 1 }, () => Array(actual.length + 1).fill(0));

  for (let expectedIndex = expected.length; expectedIndex >= 0; expectedIndex--) {
    distances[expectedIndex][actual.length] = expected.length - expectedIndex;
  }
  for (let actualIndex = actual.length; actualIndex >= 0; actualIndex--) {
    distances[expected.length][actualIndex] = actual.length - actualIndex;
  }
  for (let expectedIndex = expected.length - 1; expectedIndex >= 0; expectedIndex--) {
    for (let actualIndex = actual.length - 1; actualIndex >= 0; actualIndex--) {
      distances[expectedIndex][actualIndex] = expected[expectedIndex] === actual[actualIndex]
        ? distances[expectedIndex + 1][actualIndex + 1]
        : 1 + Math.min(
          distances[expectedIndex + 1][actualIndex + 1],
          distances[expectedIndex + 1][actualIndex],
          distances[expectedIndex][actualIndex + 1],
        );
    }
  }

  const expectedErrors = Array(expected.length).fill(false);
  const actualErrors = Array(actual.length).fill(false);
  let expectedIndex = 0;
  let actualIndex = 0;
  while (expectedIndex < expected.length || actualIndex < actual.length) {
    if (expectedIndex < expected.length && actualIndex < actual.length && expected[expectedIndex] === actual[actualIndex]) {
      expectedIndex++;
      actualIndex++;
      continue;
    }

    const currentDistance = distances[expectedIndex][actualIndex];
    if (expectedIndex < expected.length && actualIndex < actual.length &&
        currentDistance === 1 + distances[expectedIndex + 1][actualIndex + 1]) {
      expectedErrors[expectedIndex++] = true;
      actualErrors[actualIndex++] = true;
    } else if (actualIndex < actual.length &&
        currentDistance === 1 + distances[expectedIndex][actualIndex + 1]) {
      actualErrors[actualIndex++] = true;
    } else {
      expectedErrors[expectedIndex++] = true;
    }
  }

  return { expected, actual, expectedErrors, actualErrors };
}

function drawMonitorDiffText(context, text, errorFlags, x, y, maxWidth) {
  context.save();
  context.beginPath();
  context.rect(x, y - 12, maxWidth, 24);
  context.clip();
  let drawX = x;
  for (let index = 0; index < text.length; index++) {
    context.fillStyle = errorFlags[index] ? '#ff7777' : '#ffffff';
    context.fillText(text[index], drawX, y);
    drawX += context.measureText(text[index]).width;
  }
  context.restore();
}

function ensureMonitorTaskInput() {
  if (!monitorTaskInput) {
    monitorTaskInput = document.getElementById('monitor-task-input');
  }
  if (!monitorTaskInput) {
    const container = document.getElementById('game-container') || document.body;
    monitorTaskInput = document.createElement('input');
    monitorTaskInput.type = 'text';
    monitorTaskInput.id = 'monitor-task-input';
    monitorTaskInput.setAttribute('aria-label', '모니터 과제 입력');
    monitorTaskInput.setAttribute('autocomplete', 'off');
    monitorTaskInput.setAttribute('autocorrect', 'off');
    monitorTaskInput.setAttribute('autocapitalize', 'off');
    monitorTaskInput.setAttribute('spellcheck', 'false');
    monitorTaskInput.placeholder = '여기에 입력하세요…';
    container.appendChild(monitorTaskInput);
  }

  if (!monitorTaskInput._initialized) {
    monitorTaskInput._initialized = true;
    monitorTaskInput.addEventListener('input', () => {
      if (gameFlow.mode === 'monitorTyping' && gameFlow.monitorTask) {
        gameFlow.monitorTask.value = monitorTaskInput.value;
        if (gameFlow.monitorTask.error) {
          gameFlow.monitorTask.error = false;
          gameFlow.monitorTask.diff = null;
          monitorTaskInput.classList.remove('error');
        }
        if (isMonitorTaskCorrect(gameFlow.monitorTask.value, gameFlow.monitorTask.target)) {
          completeMonitorTask();
        }
      }
    });
    monitorTaskInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMonitorTask();
      } else if (event.key === 'Enter') {
        if (event.isComposing) return;
        event.preventDefault();
        if (gameFlow.monitorTask && isMonitorTaskCorrect(monitorTaskInput.value, gameFlow.monitorTask.target)) {
          completeMonitorTask();
        } else if (gameFlow.monitorTask) {
          gameFlow.monitorTask.error = true;
          gameFlow.monitorTask.diff = getMonitorTaskDiff(gameFlow.monitorTask.target, monitorTaskInput.value);
          monitorTaskInput.classList.add('error');
        }
      } else if (event.key === 'Tab') {
        event.preventDefault();
      }
    });
  }
  return monitorTaskInput;
}

function updateMonitorInputPosition() {
  const input = monitorTaskInput || document.getElementById('monitor-task-input');
  if (!input || !canvas) return;
  const container = document.getElementById('game-container');
  if (!container) return;
  const canvasRect = canvas.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const scale = canvasRect.width / 960;
  const canvasX = canvasRect.left - containerRect.left;
  const canvasY = canvasRect.top - containerRect.top;

  const left = canvasX + 108 * scale;
  const top = canvasY + 174 * scale;
  const width = 744 * scale;
  const height = 52 * scale;
  const fontSize = Math.max(12, Math.round(14 * scale));
  const paddingX = Math.round(14 * scale);

  input.style.left = `${left}px`;
  input.style.top = `${top}px`;
  input.style.width = `${width}px`;
  input.style.height = `${height}px`;
  input.style.fontSize = `${fontSize}px`;
  input.style.padding = `0 ${paddingX}px`;
}

function focusMonitorTaskInput() {
  const input = ensureMonitorTaskInput();
  input.value = '';
  input.classList.remove('error');
  input.style.display = 'block';
  updateMonitorInputPosition();
  input.focus();
}

function hideMonitorTaskInput() {
  const input = monitorTaskInput || document.getElementById('monitor-task-input');
  if (input) {
    input.blur();
    input.value = '';
    input.classList.remove('error');
    input.style.display = 'none';
  }
}

function completeMonitorTask() {
  if (!gameFlow.monitorTask || !isMonitorTaskCorrect(gameFlow.monitorTask.value, gameFlow.monitorTask.target)) return;
  completeTask(`monitor_${gameFlow.monitorTask.type}`);
  gameFlow.monitorTask.phase = 'success';
  hideMonitorTaskInput();
  if (gameFlow.hiddenConfessionActive) {
    gameFlow.hiddenConfessionActive = false;
    selectHiddenEnding('hidden_confession');
    showEnding('hidden_confession');
  } else {
    setFlowMode('monitorSuccess');
  }
}

function closeMonitorTask() {
  hideMonitorTaskInput();
  gameFlow.monitorTask = null;
  setFlowMode(null);
}

function standPlayerUp() {
  player.sitting = null;
}

function beginBusTravel(duration = 7500) {
  gameFlow.choiceKind = null;
  gameFlow.mode = null;
  gameFlow.dialogue = null;
  gameFlow.activityMotion = null;
  busJourney.state = 'moving';
  busJourney.movingUntil = performance.now() + duration;
  busJourney.stopStartedAt = null;
}

function disembarkBus(destination) {
  setFlowMode(null);
  player.sitting = null;
  busArrival.departureTarget = destination;
  busArrival.state = 'departing';
  busArrival.x = BUS_STOP_DEPART_POSITION;
  sceneTransition.start(destination, 70);
}

function chooseBusPrompt(answer) {
  const choice = gameFlow.choiceKind;
  gameFlow.choiceKind = null;
  if (choice === 'grandma') {
    if (!answer) {
      gameFlow.grandmaState = 'declined';
      beginBusTravel();
      return;
    }
    gameFlow.grandmaState = 'seatedTalking';
    gameFlow.grandmaTalkStep = 1;
    player.sitting = null;
    player.x = 200;
    player.y = PLAYER_BASE_Y;
    player.facing = -1;
    player.state = 'IDLE';
    gameFlow.dialogue = '할머니: 자리를 양보해줘서 고맙구나. 다리가 조금 아팠단다.';
    setFlowMode('dialogue', 30000);
    return;
  }
  if (choice === 'cat') {
    if (answer) {
      if (gameFlow.catTreats) {
        completeTask('cat_feed');
        gameFlow.catTreats = false;
        gameFlow.dialogue = '고양이에게 간식을 건넸다. 고양이가 맛있게 먹는다.';
        gameFlow.activityMotion = 'cat';
      } else {
        gameFlow.dialogue = '오늘은 간식을 못 가져왔어. 미안해, 야옹아.';
        gameFlow.activityMotion = null;
      }
    } else {
      completeTask('cat_pet');
      gameFlow.dialogue = '고양이를 조심스럽게 쓰다듬었다.';
      gameFlow.activityMotion = 'cat';
    }
    setFlowMode('dialogue');
    return;
  }
  if (choice === 'leave_school') {
    if (answer) {
      disembarkBus('school');
    } else {
      gameFlow.hiddenSeaProgress = true;
      gameFlow.choiceKind = 'confirm_leave';
      gameFlow.dialogue = '정말 내리지 않겠습니까?';
      setFlowMode('choice');
    }
    return;
  }
  if (choice === 'confirm_leave') {
    if (answer) {
      beginBusTravel(15000);
    } else {
      gameFlow.choiceKind = 'leave_school';
      gameFlow.dialogue = '학교에 내리시겠습니까?';
      setFlowMode('choice');
    }
  }
}

function startTaskDialogue(taskId, lines, replay = false) {
  gameFlow.dialogueSequence = { taskId, lines, index: 0, replay };
  gameFlow.dialogue = lines[0];
  gameFlow.activityMotion = null;
  setFlowMode('dialogue', 3600000);
}

function interactWith(activity) {
  if (isPostEndingReplayMode()) {
    if (replayTaskIdForActivity(activity)) {
      replayCompletedTaskDialogue(activity);
      return;
    }
    if (!isPostEndingUtilityActivity(activity)) return;
  }
  if (gameFlow.hiddenConfessionActive && activity.id !== 'monitor') return;
  window.soundEngine.playInteractionSelect();

  if (activity.kind === 'catTask') {
    gameFlow.choiceKind = 'cat';
    gameFlow.dialogue = '고양이에게 어떻게 할까?';
    setFlowMode('choice');
    return;
  }

  if (activity.id === 'apartment_door_887') {
    startTaskDialogue('apartment_door_887', [
      '아이: 안녕하세요! 어디 가요?',
      '나: 나는 학교에 가는 길이야. 너는 어디 가니?',
      '아이: 저는 유치원에 가요! 오늘은 유치원에서 그림을 그릴 거예요. 너무너무 신나요.',
      '나: 그래, 재밌겠다. (쫑알쫑알 말을 거는 옆집 아이가 귀엽다. 주머니를 뒤져 사탕을 하나 꺼냈다.) 자 이거 줄게.',
    ]);
    return;
  }

  if (activity.kind === 'schoolBreakFriend') {
    player.facing = -1;
    startTaskDialogue('friend_confession', [
      '나: 안녕! 혹시 나 알아? 나 작년에도 같은 반이었는데...',
      '친구: 당연히 알지!',
      '서로의 취향과 관심사 등 사소한 이야기를 나눴다.',
      '나: ... 괜찮다면 연락처 알려줄래?',
      '친구: 좋아!.',
      '서로의 연락처를 교환했다.',
    ]);
    return;
  }

  if (activity.id === 'presentation') {
    player.facing = 1;
    startTaskDialogue('presentation', [
      '선생님: 준비한 발표를 들려줄래요?',
      '나: 오늘은 익숙한 하루 속에서 발견한 작은 친절을 이야기하겠습니다.',
      '나: 먼저 인사하고 주변을 살피니 평범한 하루도 조금 달라졌습니다.',
      '선생님: 차분하고 좋은 발표였어요. 잘 들었습니다.',
    ]);
    return;
  }

  if (activity.id === 'stairs_door') {
    if (!gameFlow.completed.has('stairs_door')) {
      completeTask('stairs_door');
      gameFlow.dialogue = '계단으로 내려왔더니 숨이 찼다. 별것 아니지만 건강해진 느낌이다.';
      gameFlow.activityMotion = null;
      setFlowMode('dialogue');
    } else {
      setFlowMode(null);
    }
    sceneTransition.start('home_front', 70);
    return;
  }

  if (activity.id === 'stone') {
    completeTask('stone');
    gameFlow.dialogue = activity.text;
    gameFlow.activityMotion = null;
    setFlowMode('dialogue');
    return;
  }

  if (activity.id === 'dishes' && !gameFlow.dishesPrompted) {
    gameFlow.dishesPrompted = true;
    gameFlow.dialogue = '부모님이 하실 테니까 굳이 안 해도 될 것 같다.';
    gameFlow.activityMotion = null;
    setFlowMode('dialogue');
    return;
  }

  if (activity.kind === 'monitor') {
    if (gameFlow.hiddenConfessionActive) {
      gameFlow.monitorTask = {
        type: 'chat',
        phase: 'typing',
        value: '',
        target: '오늘 너와 이야기할 수 있어서 정말 기뻤어. 내일도 또 얘기할 수 있을까?',
        error: false,
      };
      setFlowMode('monitorTyping');
      focusMonitorTaskInput();
      return;
    }
    gameFlow.monitorTask = { phase: 'select', type: null, target: '', value: '', error: false };
    setFlowMode('monitorMenu');
    return;
  }

  if (activity.kind === 'seat') {
    setFlowMode(null);
    player.x = activity.seatX;
    player.y = PLAYER_BASE_Y;
    player.facing = activity.facing || 1;
    player.state = 'IDLE';
    player.sitting = { seatY: activity.seatY, seatId: activity.id };
    if (currentSceneId === 'bus_stop' && activity.id === 'bus_stop_bench') {
      busArrival.state = 'arriving';
      busArrival.idleSince = null;
    }
    return;
  }

  if (activity.kind === 'busSeat') {
    player.x = activity.seatX;
    player.y = PLAYER_BASE_Y;
    player.facing = 1;
    player.state = 'IDLE';
    player.sitting = { seatY: activity.seatY, seatId: activity.id };
    if (gameFlow.completed.has('grandma_seat')) {
      busJourney.state = 'moving';
      busJourney.movingUntil = performance.now() + 7500;
      return;
    }
    busJourney.state = 'stopped';
    gameFlow.grandmaState = 'waiting';
    gameFlow.grandmaStartedAt = performance.now();
    gameFlow.dialogue = null;
    gameFlow.activityMotion = null;
    gameFlow.mode = 'grandmaWaiting';
    return;
  }

  if (activity.kind === 'fridge') {
    setFlowMode(null);
    sceneTransition.start('refrigerator', 55);
    return;
  }

  if (activity.kind === 'homeFrontExit') {
    setFlowMode(null);
    sceneTransition.start('home_front', 70);
    return;
  }

  if (activity.kind === 'stairDoor') {
    setFlowMode(null);
    sceneTransition.start('home_front', 70);
    return;
  }

  if (activity.kind === 'apartmentDoor') {
    setFlowMode(null);
    sceneTransition.start('living_room', 900);
    return;
  }

  if (activity.kind === 'schoolDoor') {
    setFlowMode(null);
    const enteringSchool = currentSceneId === 'school';
    sceneTransition.start(enteringSchool ? 'school_board' : 'school', enteringSchool ? 70 : 722);
    return;
  }

  if (activity.kind === 'elevatorDoor') {
    setFlowMode(null);
    player.sitting = null;
    sceneTransition.start('home_front', 70);
    return;
  }

  if (activity.kind === 'boardBus') {
    player.sitting = null;
    setFlowMode('bus_departure');
    busArrival.state = 'departing';
    return;
  }

  if (activity.kind === 'leaveBus') {
    if (currentSceneId !== 'bus' || busJourney.state !== 'stopped') return;
    if (busJourney.stopIndex === 1) {
      gameFlow.choiceKind = 'leave_school';
      gameFlow.dialogue = '학교에 내리시겠습니까?';
      setFlowMode('choice');
      return;
    }
    disembarkBus('sea');
    return;
  }

  if (activity.kind === 'happy') {
    setFlowMode('calm');
    gameFlow.calmTime = 2.5;
    gameFlow.calmText = activity.text;
    gameFlow.calmId = activity.id;
    return;
  }

  if (activity.kind === 'friend') {
    setFlowMode('typing');
    gameFlow.typing = { target: 'GO', value: '' };
    return;
  }

  completeTask(activity.id);
  if (activity.id === 'cereal') {
    gameFlow.ateToday = true;
    gameFlow.cerealEver = true;
  }
  gameFlow.dialogue = activity.text;
  if (activity.id === 'cereal') window.soundEngine.playCrunchEvent();
  if (activity.id === 'dishes') window.soundEngine.playDishwashingEvent();
  gameFlow.activityMotion = ['flower', 'guard', 'cereal', 'dishes'].includes(activity.id) ? activity.id : null;
  if (gameFlow.activityMotion) {
    player.facing = activity.x >= player.x ? 1 : -1;
    if (activity.id === 'dishes') {
      player.x = 218;
      player.facing = -1;
    }
  }
  setFlowMode('dialogue');
}

function replayCompletedTaskDialogue(activity) {
  const taskId = replayTaskIdForActivity(activity);
  if (!taskId) return;
  window.soundEngine.playInteractionSelect();

  const dialogueSequences = {
    apartment_door_887: [
      '아이: 안녕하세요! 어디 가요?',
      '나: 나는 학교에 가는 길이야. 너는 어디 가니?',
      '아이: 저는 유치원에 가요! 오늘은 유치원에서 그림을 그릴 거예요. 너무너무 신나요.',
      '나: 그래, 재밌겠다. (쫑알쫑알 말을 거는 옆집 아이가 귀엽다. 주머니를 뒤져 사탕을 하나 꺼냈다.) 자 이거 줄게.',
    ],
    friend_confession: [
      '나: 안녕! 혹시 나 알아? 나 작년에도 같은 반이었는데...',
      '친구: 당연히 알지!',
      '서로의 취향과 관심사 등 사소한 이야기를 나눴다.',
      '나: ... 괜찮다면 연락처 알려줄래?',
      '친구: 좋아!.',
      '서로의 연락처를 교환했다.',
    ],
    presentation: [
      '선생님: 준비한 발표를 들려줄래요?',
      '나: 오늘은 익숙한 하루 속에서 발견한 작은 친절을 이야기하겠습니다.',
      '나: 먼저 인사하고 주변을 살피니 평범한 하루도 조금 달라졌습니다.',
      '선생님: 차분하고 좋은 발표였어요. 잘 들었습니다.',
    ],
  };

  if (dialogueSequences[taskId]) {
    startTaskDialogue(taskId, dialogueSequences[taskId], true);
    return;
  }

  const replayMessages = {
    cat_treats: '냉장고에서 고양이 간식을 챙겼다.',
    cat_pet: '고양이를 조심스럽게 쓰다듬었다.',
    cat_feed: '고양이에게 간식을 건넸다. 고양이가 맛있게 먹는다.',
    stairs_door: '계단으로 내려왔더니 숨이 찼다. 별것 아니지만 건강해진 느낌이다.',
    grandma_seat: '할머니께 자리를 양보하고 분홍 토끼 인형을 선물로 받았다.',
    monitor_chat: '친구에게 메시지를 보냈다.',
    monitor_email: '친구에게 메일을 보냈다.',
  };
  const message = replayMessages[taskId] || activity.text;
  if (!message) return;
  gameFlow.dialogue = taskId === 'flower' || activity.kind === 'happy'
    ? `${message} 마음이 조금 가벼워진다. 천천히 집으로 돌아가자.`
    : message;
  gameFlow.activityMotion = null;
  setFlowMode('dialogue');
}

function handleGameFlowKey(event) {
  if (!gameFlow.mode) return false;

  if (gameFlow.mode === 'monitorMenu') {
    if (event.key === 'Escape') {
      closeMonitorTask();
    } else if (event.key === '1' || event.key === '2') {
      const type = event.key === '1' ? 'chat' : 'email';
      gameFlow.monitorTask = {
        type,
        phase: 'typing',
        value: '',
        target: type === 'chat'
          ? '나도 예전부터 너랑 친해지고 싶었어. 오늘 얘기해서 좋았고, 내일도 또 얘기할 수 있으면 좋겠어!'
          : '좋아. 내일보자!.',
        error: false,
      };
      setFlowMode('monitorTyping');
      focusMonitorTaskInput();
    }
    event.preventDefault();
    return true;
  }

  if (gameFlow.mode === 'monitorTyping') {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMonitorTask();
    } else if (event.key === 'Enter') {
      if (event.isComposing) return true;
      event.preventDefault();
      if (gameFlow.monitorTask && isMonitorTaskCorrect(gameFlow.monitorTask.value, gameFlow.monitorTask.target)) {
        completeMonitorTask();
      } else if (gameFlow.monitorTask) {
        gameFlow.monitorTask.error = true;
        gameFlow.monitorTask.diff = getMonitorTaskDiff(gameFlow.monitorTask.target, gameFlow.monitorTask.value);
        const input = monitorTaskInput || document.getElementById('monitor-task-input');
        input?.classList.add('error');
      }
    } else if (event.key === 'Tab') {
      event.preventDefault();
    }
    return true;
  }

  if (gameFlow.mode === 'monitorSuccess') {
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      closeMonitorTask();
    }
    return true;
  }

  if (gameFlow.mode === 'typing') {
    if (/^[a-z]$/i.test(event.key)) {
      const expected = gameFlow.typing.target[gameFlow.typing.value.length];
      if (event.key.toUpperCase() === expected) {
        gameFlow.typing.value += expected;
        if (gameFlow.typing.value === gameFlow.typing.target) {
          gameFlow.selectedEnding = 'different';
          gameFlow.dialogue = '친구와 함께 낯선 길을 걸어본다. 익숙한 동네에 새로운 풍경이 열린다.';
          setFlowMode('dialogue');
        }
      } else {
        gameFlow.typing.value = '';
      }
    }
    event.preventDefault();
    return true;
  }

  if (gameFlow.mode === 'choice') {
    event.preventDefault();
    return true;
  }

  if (gameFlow.mode === 'dialogue') {
    if (event.code === 'Space' || event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (gameFlow.dialogueSequence) {
        gameFlow.dialogueSequence.index++;
        if (gameFlow.dialogueSequence.index >= gameFlow.dialogueSequence.lines.length) {
          const taskId = gameFlow.dialogueSequence.taskId;
          const isReplay = gameFlow.dialogueSequence.replay;
          gameFlow.dialogueSequence = null;
          gameFlow.dialogue = null;
          gameFlow.activityMotion = null;
          if (!isReplay) completeTask(taskId);
          if (taskId === 'friend_confession' && !isReplay) gameFlow.hiddenConfessionProgress = true;
          setFlowMode(null);
          if (taskId === 'friend_confession' && !isReplay) {
            gameFlow.hiddenConfessionActive = true;
            gameFlow.selectedEnding = null;
            sceneTransition.start('home', 680);
          }
        } else {
          gameFlow.dialogue = gameFlow.dialogueSequence.lines[gameFlow.dialogueSequence.index];
          setFlowMode('dialogue', 3600000);
        }
        return true;
      }
      if (gameFlow.grandmaState === 'approach') {
        gameFlow.choiceKind = 'grandma';
        gameFlow.dialogue = '할머니께 자리를 양보할까?';
        setFlowMode('choice');
        return true;
      }
      if (gameFlow.grandmaState === 'seatedTalking') {
        if (gameFlow.grandmaTalkStep === 1) {
          gameFlow.grandmaTalkStep = 2;
          gameFlow.dialogue = '할머니: 고맙다. 이건 선물이란다.';
        } else {
          gameFlow.grandmaState = 'gifted';
          gameFlow.hasRabbitPlush = true;
          completeTask('grandma_seat');
          player.sitting = null;
          player.x = 200;
          player.y = PLAYER_BASE_Y;
          player.facing = -1;
          player.state = 'IDLE';
          gameFlow.dialogue = '할머니가 분홍 토끼 인형을 건넸다. 인형을 받아 셔츠 앞주머니에 반쯤 넣었다.';
          gameFlow.grandmaTalkStep = 0;
          busJourney.state = 'moving';
          busJourney.movingUntil = performance.now() + 7500;
        }
        setFlowMode('dialogue', 12000);
        return true;
      }
      gameFlow.dialogue = null;
      gameFlow.activityMotion = null;
      setFlowMode(null);
    }
    event.preventDefault();
    return true;
  }

  if (gameFlow.mode === 'finale') {
    if (endingUI.view === 'collection' && (event.key === 'ArrowDown' || event.key === 'PageDown')) {
      endingUI.scrollTargetY = Math.min(endingScrollMax(), endingUI.scrollTargetY + 56);
    } else if (endingUI.view === 'collection' && (event.key === 'ArrowUp' || event.key === 'PageUp')) {
      endingUI.scrollTargetY = Math.max(0, endingUI.scrollTargetY - 56);
    } else if (endingUI.view === 'collection' && event.key === 'Home') {
      endingUI.scrollTargetY = 0;
    } else if (endingUI.view === 'collection' && event.key === 'End') {
      endingUI.scrollTargetY = endingScrollMax();
    } else if (event.key === 'Escape') {
      if (endingUI.view === 'collection') {
        endingUI.view = 'summary';
        endingUI.scrollY = 0;
        endingUI.scrollTargetY = 0;
      }
    }
    event.preventDefault();
    return true;
  }

  event.preventDefault();
  return true;
}

function updateGameFlow(deltaSeconds) {
  if (currentSceneId === 'elevator' && elevatorArrival.startedAt !== null) {
    if (performance.now() - elevatorArrival.startedAt < 3200) {
      player.state = 'IDLE';
      gameFlow.nearby = null;
      return;
    }
    elevatorArrival.startedAt = null;
  }

  if (currentSceneId === 'elevator' && elevatorRide.startedAt !== null) {
    const elapsed = performance.now() - elevatorRide.startedAt;
    player.state = 'IDLE';
    gameFlow.nearby = null;
    if (elapsed >= 3950 && !sceneTransition.active) {
      const destination = elevatorRide.destination;
      elevatorArrival.pendingDestination = destination;
      sceneTransition.start(destination, 480);
    }
    return;
  }

  if (gameFlow.mode === 'grandmaWaiting' && performance.now() - gameFlow.grandmaStartedAt >= 4000) {
    gameFlow.grandmaState = 'entering';
    gameFlow.grandmaStartedAt = performance.now();
    gameFlow.dialogue = null;
    gameFlow.mode = 'grandmaEntering';
  }

  if (gameFlow.mode === 'grandmaEntering' && performance.now() - gameFlow.grandmaStartedAt >= 3600) {
    gameFlow.grandmaState = 'approach';
    gameFlow.grandmaStartedAt = performance.now();
    gameFlow.dialogue = '할머니가 버스 문에서 다가와 앞에 섰다. 할머니가 서 계신다. 자리를 비켜드릴까?';
    setFlowMode('dialogue', 30000);
  }

  if (gameFlow.mode === 'dialogue' && !gameFlow.dialogueSequence && performance.now() >= gameFlow.dialogueUntil) {
    gameFlow.mode = null;
    gameFlow.dialogue = null;
    gameFlow.activityMotion = null;
  }

  if (gameFlow.mode === 'calm') {
    gameFlow.calmTime -= deltaSeconds;
    if (gameFlow.calmTime <= 0) {
      completeTask(gameFlow.calmId);
      gameFlow.dialogue = `${gameFlow.calmText} 마음이 조금 가벼워진다. 천천히 집으로 돌아가자.`;
      setFlowMode('dialogue');
    }
  }

  if (!gameFlow.mode && !gameFlow.finale &&
      ['kindness', 'self_happiness', 'food_kindness', 'nature_happiness', 'greetings'].includes(gameFlow.selectedEnding)) {
    showEnding(gameFlow.selectedEnding);
  }

  if (currentSceneId === 'bus') {
    if (busJourney.state === 'moving') {
      busJourney.sceneryOffset = (busJourney.sceneryOffset + 120 * deltaSeconds) % 600;
      if (performance.now() >= busJourney.movingUntil) {
        busJourney.state = 'stopped';
        const stopName = busStops[Math.min(busJourney.stopIndex, busStops.length - 1)];
        busJourney.stopIndex = Math.min(busJourney.stopIndex + 1, busStops.length);
        gameFlow.dialogue = `이번 정류장은 ${stopName} 정류장입니다.`;
        gameFlow.activityMotion = null;
        setFlowMode('dialogue', 4500);
        busJourney.stopStartedAt = performance.now();
      }
    }
  }

  if (currentSceneId === 'bus_stop') {
    if (busArrival.state === 'arriving') {
      const stopX = BUS_STOP_POSITION;
      busArrival.x = Math.min(stopX, busArrival.x + 380 * deltaSeconds);
      if (busArrival.x >= stopX) busArrival.state = 'stopped';
    } else if (busArrival.state === 'waiting') {
      busArrival.idleSince = null;
    }
  }
  const busIsLeavingCurrentScene = busArrival.state === 'departing' &&
    (currentSceneId === 'bus_stop' || busArrival.departureTarget === currentSceneId);
  if (busIsLeavingCurrentScene && !sceneTransition.active) {
      busArrival.x = Math.min(currentScene.width, busArrival.x + 380 * deltaSeconds);
      if (busArrival.x >= currentScene.width) {
        if (currentSceneId === busArrival.departureTarget) {
          busArrival.state = 'waiting';
          busArrival.departureTarget = null;
        } else {
          const destination = busArrival.departureTarget || 'bus';
          busArrival.departureTarget = null;
          sceneTransition.start(destination, destination === 'bus' ? 100 : 70);
        }
      }
  }

  gameFlow.nearby = null;
  if (!gameFlow.mode && currentSceneId === 'bus_stop' && busArrival.state === 'stopped') {
    gameFlow.nearby = currentActivities()[0] || null;
  } else if (currentSceneId === 'bus_stop' && busArrival.state === 'arriving') {
    return;
  } else if (!gameFlow.mode && player.sitting && currentSceneId === 'living_room') {
    gameFlow.nearby = currentActivities().find(activity => activity.kind === 'seatedTask' && !gameFlow.completed.has(activity.id)) || null;
  } else if (!gameFlow.mode && player.sitting && currentSceneId === 'bus') {
    gameFlow.nearby = currentActivities().find(activity => activity.id === 'bus_window' && Math.abs(player.x - activity.x) < 82) || null;
  } else if (!gameFlow.mode && player.sitting?.seatId === 'bus_stop_bench' && currentSceneId === 'bus_stop') {
    gameFlow.nearby = currentActivities().find(activity => activity.kind === 'catTask') || null;
  } else if (!gameFlow.mode && !player.sitting) {
    let nearestDistance = 82;
    for (const activity of currentActivities()) {
      if (gameFlow.completed.has(activity.id) && !['stairs_door', 'school_main_door'].includes(activity.id)) continue;
      const distance = Math.abs(player.x - activity.x);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        gameFlow.nearby = activity;
      }
    }
  }
}

function drawNearbyActivityHighlight(ctx) {
  const activity = gameFlow.nearby;
  const bounds = activity?.bounds;
  if (!bounds) return;

  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 5;

  if (activity.id === 'bed') {
    ctx.beginPath();
    ctx.moveTo(0, 198);
    ctx.lineTo(15, 198);
    ctx.lineTo(15, 238);
    ctx.lineTo(290, 238);
    ctx.lineTo(290, 298);
    ctx.lineTo(270, 298);
    ctx.lineTo(270, 320);
    ctx.lineTo(255, 320);
    ctx.lineTo(255, 298);
    ctx.lineTo(35, 298);
    ctx.lineTo(35, 320);
    ctx.lineTo(20, 320);
    ctx.lineTo(20, 298);
    ctx.lineTo(0, 298);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'window') {
    const paneWidth = 82;
    const paneHeight = 123;
    const windowLeft = 460.5 - (paneWidth * 2 + ROOM_WINDOW_PANE_GAP) / 2;
    ctx.strokeRect(windowLeft, 74, paneWidth, paneHeight);
    ctx.strokeRect(windowLeft + paneWidth + ROOM_WINDOW_PANE_GAP, 74, paneWidth, paneHeight);
  } else if (activity.id === 'monitor') {
    ctx.beginPath();
    ctx.moveTo(850, 126);
    ctx.lineTo(930, 126);
    ctx.lineTo(930, 192);
    ctx.lineTo(897, 192);
    ctx.lineTo(897, 206);
    ctx.lineTo(911, 206);
    ctx.lineTo(911, 210);
    ctx.lineTo(869, 210);
    ctx.lineTo(869, 206);
    ctx.lineTo(883, 206);
    ctx.lineTo(883, 192);
    ctx.lineTo(850, 192);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'bus_exit') {
    ctx.strokeRect(758, 58, 86, 262);
    ctx.strokeRect(848, 58, 86, 262);
  } else if (activity.id.startsWith('bus_seat_')) {
    ctx.translate(bounds.x, 0);
    ctx.beginPath();
    ctx.moveTo(0, 177);
    ctx.lineTo(8, 177);
    ctx.lineTo(8, 248);
    ctx.lineTo(50, 248);
    ctx.lineTo(50, 264);
    ctx.lineTo(8, 264);
    ctx.lineTo(8, 320);
    ctx.lineTo(0, 320);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'kitchen_chair') {
    ctx.translate(bounds.x - 548, 0);
    ctx.beginPath();
    ctx.moveTo(548, 177);
    ctx.lineTo(556, 177);
    ctx.lineTo(556, 248);
    ctx.lineTo(598, 248);
    ctx.lineTo(598, 320);
    ctx.lineTo(590, 320);
    ctx.lineTo(590, 256);
    ctx.lineTo(556, 256);
    ctx.lineTo(556, 320);
    ctx.lineTo(548, 320);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'bus_stop_bench') {
    ctx.translate(-BUS_STOP_LEFT_SHIFT, 0);
    ctx.beginPath();
    ctx.moveTo(585, 255);
    ctx.lineTo(845, 255);
    ctx.lineTo(845, 320);
    ctx.lineTo(835, 320);
    ctx.lineTo(835, 265);
    ctx.lineTo(595, 265);
    ctx.lineTo(595, 320);
    ctx.lineTo(585, 320);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'cereal') {
    ctx.beginPath();
    ctx.moveTo(642, 192);
    ctx.lineTo(684, 192);
    ctx.lineTo(678, 208);
    ctx.lineTo(648, 208);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'dishes') {
    ctx.beginPath();
    ctx.moveTo(133, 187);
    ctx.lineTo(180, 187);
    ctx.lineTo(180, 165);
    ctx.lineTo(201, 165);
    ctx.lineTo(201, 175);
    ctx.lineTo(196, 175);
    ctx.lineTo(196, 170);
    ctx.lineTo(185, 170);
    ctx.lineTo(185, 187);
    ctx.lineTo(232, 187);
    ctx.lineTo(232, 192);
    ctx.lineTo(133, 192);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'cactus') {
    ctx.beginPath();
    ctx.moveTo(742, GROUND_Y - 144);
    ctx.lineTo(757, GROUND_Y - 144);
    ctx.lineTo(757, GROUND_Y - 156);
    ctx.lineTo(749, GROUND_Y - 156);
    ctx.lineTo(749, GROUND_Y - 171);
    ctx.lineTo(754, GROUND_Y - 171);
    ctx.lineTo(754, GROUND_Y - 161);
    ctx.lineTo(757, GROUND_Y - 161);
    ctx.lineTo(757, GROUND_Y - 176);
    ctx.lineTo(769, GROUND_Y - 176);
    ctx.lineTo(769, GROUND_Y - 154);
    ctx.lineTo(773, GROUND_Y - 154);
    ctx.lineTo(773, GROUND_Y - 164);
    ctx.lineTo(778, GROUND_Y - 164);
    ctx.lineTo(778, GROUND_Y - 149);
    ctx.lineTo(769, GROUND_Y - 149);
    ctx.lineTo(769, GROUND_Y - 144);
    ctx.lineTo(784, GROUND_Y - 144);
    ctx.lineTo(778, GROUND_Y - 112);
    ctx.lineTo(748, GROUND_Y - 112);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'apartment_door_887') {
    ctx.beginPath();
    ctx.moveTo(285.5, 222);
    ctx.lineTo(317.8, 222);
    ctx.lineTo(317.8, 243);
    ctx.lineTo(300.7, 243);
    ctx.lineTo(300.7, 250);
    ctx.lineTo(305.1, 250);
    ctx.lineTo(305.1, 285);
    ctx.lineTo(300.7, 285);
    ctx.lineTo(300.7, 290);
    ctx.lineTo(300.7, 319);
    ctx.lineTo(312.1, 322);
    ctx.lineTo(285.5, 322);
    ctx.lineTo(285.5, 290);
    ctx.lineTo(285.5, 285);
    ctx.lineTo(279.2, 285);
    ctx.lineTo(279.2, 251);
    ctx.lineTo(285.5, 251);
    ctx.lineTo(285.5, 243);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'elevator_door') {
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  } else if (activity.id === 'flower') {
    ctx.translate(PLANTER_SHIFT + FLOWER_CENTER - 330, PLANTER_DROP - PLANTER_RAISE + FLOWER_CENTER_TOP - 198);
    ctx.beginPath();
    ctx.moveTo(326, 198);
    ctx.lineTo(334, 198);
    ctx.lineTo(334, 204);
    ctx.lineTo(342, 204);
    ctx.lineTo(342, 212);
    ctx.lineTo(338, 212);
    ctx.lineTo(338, 218);
    ctx.lineTo(322, 218);
    ctx.lineTo(322, 212);
    ctx.lineTo(318, 212);
    ctx.lineTo(318, 204);
    ctx.lineTo(326, 204);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(328, 216);
    ctx.lineTo(328, 462 - FLOWER_CENTER_TOP);
    ctx.lineTo(332, 462 - FLOWER_CENTER_TOP);
    ctx.lineTo(332, 216);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(328, 240);
    ctx.lineTo(320, 236);
    ctx.lineTo(318, 240);
    ctx.lineTo(328, 244);
    ctx.closePath();
    ctx.moveTo(332, 234);
    ctx.lineTo(340, 230);
    ctx.lineTo(342, 234);
    ctx.lineTo(332, 238);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'tree_leaves') {
    ctx.beginPath();
    ctx.moveTo(68.5, 50);
    ctx.lineTo(206.5, 50);
    ctx.lineTo(206.5, 188);
    ctx.lineTo(149.5, 188);
    ctx.lineTo(149.5, 320);
    ctx.lineTo(125.5, 320);
    ctx.lineTo(125.5, 188);
    ctx.lineTo(68.5, 188);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'cat_pet' || activity.id === 'cat_feed') {
    ctx.beginPath();
    ctx.moveTo(366, 286);
    ctx.lineTo(366, 304);
    ctx.lineTo(410, 304);
    ctx.lineTo(410, 298);
    ctx.lineTo(423, 298);
    ctx.lineTo(423, 278);
    ctx.lineTo(421, 278);
    ctx.lineTo(421, 272);
    ctx.lineTo(415, 272);
    ctx.lineTo(415, 278);
    ctx.lineTo(411, 278);
    ctx.lineTo(402, 286);
    ctx.lineTo(411, 272);
    ctx.lineTo(405, 272);
    ctx.lineTo(405, 278);
    ctx.lineTo(402, 278);
    ctx.lineTo(402, 286);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(360, 278);
    ctx.lineTo(372, 278);
    ctx.lineTo(372, 283);
    ctx.lineTo(365, 283);
    ctx.lineTo(365, 292);
    ctx.lineTo(360, 292);
    ctx.closePath();
    ctx.stroke();
    for (const legX of [372, 384, 400, 412]) ctx.strokeRect(legX, 300, 6, 20);
  } else if (activity.id === 'friend') {
    ctx.beginPath();
    ctx.moveTo(459, 210);
    ctx.lineTo(480, 210);
    ctx.lineTo(480, 230);
    ctx.lineTo(477, 230);
    ctx.lineTo(477, 236);
    ctx.lineTo(491, 236);
    ctx.lineTo(491, 242);
    ctx.lineTo(477, 242);
    ctx.lineTo(477, 264);
    ctx.lineTo(480, 304);
    ctx.lineTo(472, 304);
    ctx.lineTo(468, 264);
    ctx.lineTo(466, 264);
    ctx.lineTo(466, 304);
    ctx.lineTo(458, 304);
    ctx.lineTo(458, 264);
    ctx.lineTo(462, 242);
    ctx.lineTo(448, 242);
    ctx.lineTo(448, 236);
    ctx.lineTo(462, 236);
    ctx.lineTo(462, 230);
    ctx.lineTo(459, 230);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'school_break_friend') {
    ctx.beginPath();
    ctx.moveTo(786.8, 134.6);
    ctx.lineTo(819.1, 134.6);
    ctx.lineTo(819.1, 263.8);
    ctx.lineTo(790.6, 263.8);
    ctx.lineTo(790.6, 310.5);
    ctx.lineTo(790.6, 320);
    ctx.lineTo(764, 320);
    ctx.lineTo(764, 310.5);
    ctx.lineTo(775.4, 310.5);
    ctx.lineTo(775.4, 260);
    ctx.lineTo(777.3, 248.6);
    ctx.lineTo(797.1, 248.6);
    ctx.lineTo(797.1, 187.8);
    ctx.lineTo(803.9, 187.8);
    ctx.lineTo(803.9, 176.4);
    ctx.lineTo(786.8, 176.4);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'presentation') {
    ctx.strokeRect(177.75, 28.23, 604.5, 155.54);
    ctx.strokeRect(186, 36.48, 588, 139.04);
  } else if (activity.id === 'desks_align') {
    const deskX = 60;
    const chairCenterX = deskX + 90.375;
    ctx.beginPath();
    ctx.rect(deskX, 216, 180.75, 11);
    ctx.rect(deskX + 14, 227, 11, 93);
    ctx.rect(deskX + 155.75, 227, 11, 93);
    ctx.rect(chairCenterX - 26, 220, 8, 32);
    ctx.rect(chairCenterX - 25, 252, 50, 8);
    ctx.rect(chairCenterX - 21, 260, 7, 60);
    ctx.rect(chairCenterX + 14, 260, 7, 60);
    ctx.stroke();
  } else if (activity.id === 'football') {
    ctx.strokeRect(706, 286, 15, 15);
  } else if (activity.id === 'stationery_game') {
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  } else if (activity.id === 'poem') {
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  } else if (activity.id === 'piano_sound') {
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  } else if (activity.id === 'arrived_bus') {
    ctx.strokeRect(busArrival.x, 48, 697, 272);
  } else {
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  }
  ctx.restore();
}

function drawCenterMessage(ctx, message, subtitle = '', backgroundOpacity = 0.5) {
  const panelWidth = 680;
  const panelHeight = subtitle ? 92 : 72;
  const panelX = (canvas.width - panelWidth) / 2;
  const panelY = canvas.height - panelHeight - ROOM_WINDOW_PANE_GAP;
  ctx.fillStyle = `rgba(41, 41, 41, ${backgroundOpacity})`;
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = '14px sans-serif';
  ctx.fillText(message, canvas.width / 2, panelY + (subtitle ? 38 : 43), panelWidth - 48);
  if (subtitle) {
    ctx.fillStyle = '#d0d0d0';
    ctx.font = '12px sans-serif';
    ctx.fillText(subtitle, canvas.width / 2, panelY + 66, panelWidth - 48);
  }
}

function drawMonitorTaskOverlay(ctx) {
  const task = gameFlow.monitorTask;
  const taskDiff = task.error ? task.diff : null;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#bdbdbd';
  ctx.fillRect(76, 20, 808, 280);
  ctx.fillStyle = '#25292d';
  ctx.fillRect(84, 28, 792, 264);
  ctx.fillStyle = '#45545b';
  ctx.fillRect(84, 28, 792, 32);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 14px sans-serif';

  if (gameFlow.mode === 'monitorMenu') {
    ctx.fillText('모니터 · 연락 방법 선택', 108, 44);
    ctx.font = '14px sans-serif';
    ctx.fillText('학교에서 먼저 말을 걸었던 같은 반 친구에게 연락해 보자.', 112, 100);
    ctx.fillText('[1] 채팅으로 메시지 주고받기', 112, 148);
    ctx.fillText('[2] 메일 보내기', 112, 184);
    ctx.fillStyle = '#c4cbd0';
    ctx.font = '12px sans-serif';
    ctx.fillText('숫자 1 또는 2를 누르세요 · Esc 닫기', 112, 250);
    return;
  }

  if (gameFlow.mode === 'monitorSuccess') {
    ctx.fillText(task.type === 'chat' ? '채팅 · 대화 완료' : '메일 · 발송 완료', 108, 44);
    ctx.font = '13px sans-serif';
    if (task.type === 'chat') {
      ctx.fillText('나: ' + task.target, 112, 120, 728);
      ctx.fillStyle = '#a9d8bd';
      ctx.fillText('친구: 나도 좋아! 내일 학교에서 또 이야기하자.', 112, 166, 728);
    } else {
      ctx.fillText('받는 사람: 같은 반 친구', 112, 112);
      ctx.fillText('보낸 내용: ' + task.target, 112, 150, 728);
      ctx.fillStyle = '#a9d8bd';
      ctx.fillText('메일을 보냈다.', 112, 190);
    }
    ctx.fillStyle = '#c4cbd0';
    ctx.font = '12px sans-serif';
    ctx.fillText('Enter 또는 Esc를 눌러 닫기', 112, 254);
    return;
  }

  ctx.fillText(task.type === 'chat' ? '채팅 · 같은 반 친구' : '메일 작성', 108, 44);
  ctx.font = '12px sans-serif';
  if (task.type === 'chat') {
    ctx.fillStyle = '#b7c3c8';
    ctx.fillText('친구: 오늘 학교에서 먼저 말 걸어줘서 반가웠어!', 112, 86, 728);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('보낼 문장 그대로 입력:', 112, 124);
  } else {
    ctx.fillStyle = '#b7c3c8';
    ctx.fillText('받는 사람: 같은 반 친구     제목: 오늘 학교에서 못한 이야기', 112, 86, 728);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('메일 내용 그대로 입력:', 112, 124);
  }
  if (taskDiff) {
    drawMonitorDiffText(ctx, taskDiff.expected, taskDiff.expectedErrors, 112, 146, 728);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillText(task.target, 112, 146, 728);
  }
  ctx.fillStyle = '#f1f1f1';
  ctx.fillRect(108, 174, 744, 52);
  ctx.fillStyle = '#282d30';
  ctx.fillRect(112, 178, 736, 44);
  ctx.fillStyle = task.error ? '#ffaaaa' : '#c4cbd0';
  ctx.fillText(task.error ? '문장이 정확히 일치하지 않습니다. 고쳐서 다시 입력하세요.' : '문장을 완벽하게 입력하면 자동으로 완료됩니다 · Esc 닫기', 112, 258, 728);
}

function drawTaskIllustration(ctx, taskId, centerX, centerY, color) {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const fillRect = (x, y, width, height) => ctx.fillRect(x, y, width, height);
  const line = (...points) => {
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let index = 2; index < points.length; index += 2) ctx.lineTo(points[index], points[index + 1]);
    ctx.stroke();
  };

  switch (taskId) {
    case 'bed':
      fillRect(-18, -5, 36, 16); fillRect(-18, 11, 4, 8); fillRect(14, 11, 4, 8);
      ctx.fillStyle = '#ffffff'; fillRect(-14, -2, 11, 8); break;
    case 'window':
      ctx.strokeRect(-17, -17, 34, 34); line(0, -17, 0, 17); line(-17, 0, 17, 0); break;
    case 'cactus':
      fillRect(-5, -12, 10, 25); fillRect(-13, -3, 8, 5); fillRect(-13, -10, 5, 12); fillRect(5, 2, 8, 5); fillRect(8, -5, 5, 12); fillRect(-13, 14, 26, 6); break;
    case 'monitor_chat':
      ctx.beginPath(); ctx.roundRect(-17, -13, 34, 24, 5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-7, 11); ctx.lineTo(-12, 18); ctx.lineTo(1, 11); ctx.fill();
      line(-9, -5, 9, -5); line(-9, 2, 5, 2); break;
    case 'monitor_email':
      ctx.fillRect(-18, -13, 36, 26); line(-18, -12, 0, 2, 18, -12); line(-18, 12, -5, 0); line(18, 12, 5, 0); break;
    case 'cat_treats':
    case 'cat_feed':
      ctx.beginPath(); ctx.moveTo(-18, 2); ctx.lineTo(18, 2); ctx.lineTo(13, 15); ctx.lineTo(-13, 15); ctx.closePath(); ctx.fill();
      line(-20, 1, 20, 1); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-7, -7, 3, 0, Math.PI * 2); ctx.arc(2, -12, 3, 0, Math.PI * 2); ctx.arc(10, -5, 3, 0, Math.PI * 2); ctx.fill(); break;
    case 'cereal':
      ctx.beginPath(); ctx.moveTo(-17, -2); ctx.lineTo(17, -2); ctx.lineTo(12, 14); ctx.lineTo(-12, 14); ctx.closePath(); ctx.fill();
      line(-18, -3, 18, -3); ctx.fillStyle = '#fff2bf'; fillRect(-10, -12, 4, 8); fillRect(-1, -17, 4, 13); fillRect(8, -10, 4, 6); break;
    case 'dishes':
      ctx.beginPath(); ctx.ellipse(0, 4, 18, 12, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 4, 10, 6, 0, 0, Math.PI * 2); ctx.stroke(); line(12, -17, 18, -10, 12, -4); break;
    case 'apartment_door_887':
      ctx.strokeRect(-12, -18, 24, 37); ctx.beginPath(); ctx.arc(2, -8, 5, Math.PI, 0); ctx.stroke(); fillRect(-3, -2, 10, 17); fillRect(6, 5, 2, 2); break;
    case 'stone':
      ctx.beginPath(); ctx.moveTo(-17, 11); ctx.lineTo(-12, -3); ctx.lineTo(-3, -14); ctx.lineTo(12, -10); ctx.lineTo(18, 8); ctx.closePath(); ctx.fill(); break;
    case 'stairs_door':
      line(-16, 15, -16, -14, -3, -14, -3, -4, 8, -4, 8, 6, 18, 6, 18, 15); break;
    case 'flower':
      line(0, 1, 0, 18); line(0, 10, -10, 5); line(0, 13, 10, 7);
      ctx.beginPath(); ctx.arc(0, -7, 5, 0, Math.PI * 2); ctx.arc(-8, -7, 5, 0, Math.PI * 2); ctx.arc(8, -7, 5, 0, Math.PI * 2); ctx.arc(0, -15, 5, 0, Math.PI * 2); ctx.fill(); break;
    case 'guard':
      fillRect(-19, -13, 38, 28); fillRect(-23, -18, 46, 6); ctx.fillStyle = '#ffffff'; fillRect(-13, -8, 26, 13); break;
    case 'tree_leaves':
      fillRect(-4, 0, 8, 19); ctx.beginPath(); ctx.arc(0, -8, 15, 0, Math.PI * 2); ctx.arc(-11, 0, 9, 0, Math.PI * 2); ctx.arc(11, 0, 9, 0, Math.PI * 2); ctx.fill(); break;
    case 'cat_pet':
      ctx.beginPath(); ctx.moveTo(-16, -2); ctx.lineTo(-17, -16); ctx.lineTo(-7, -10); ctx.lineTo(7, -10); ctx.lineTo(17, -16); ctx.lineTo(16, 3); ctx.quadraticCurveTo(0, 18, -16, 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-7, -1, 2, 0, Math.PI * 2); ctx.arc(7, -1, 2, 0, Math.PI * 2); ctx.fill(); break;
    case 'bus_window':
      fillRect(-19, -15, 38, 29); ctx.fillStyle = '#ffffff'; fillRect(-15, -11, 30, 21); ctx.fillStyle = color; fillRect(-12, 1, 8, 6); fillRect(0, -5, 8, 12); break;
    case 'grandma_seat':
      line(-15, 12, 15, 12); line(-12, 12, -12, 18); line(12, 12, 12, 18); ctx.beginPath(); ctx.arc(-3, -10, 5, 0, Math.PI * 2); ctx.fill(); fillRect(-9, -4, 13, 15); ctx.fillStyle = '#db7889'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('♥', 7, -7); break;
    case 'stationery_game':
      fillRect(-13, -19, 26, 38); ctx.fillStyle = '#ffffff'; fillRect(-9, -14, 18, 19); fillRect(-5, 9, 10, 4); break;
    case 'poem':
      ctx.beginPath(); ctx.moveTo(-18, -12); ctx.quadraticCurveTo(-7, -16, 0, -9); ctx.quadraticCurveTo(8, -16, 18, -12); ctx.lineTo(18, 15); ctx.quadraticCurveTo(6, 9, 0, 16); ctx.quadraticCurveTo(-8, 9, -18, 15); ctx.closePath(); ctx.fill(); line(0, -9, 0, 14); break;
    case 'piano_sound':
      fillRect(-19, -13, 38, 27); ctx.fillStyle = '#ffffff'; fillRect(-16, 3, 32, 8); ctx.fillStyle = color;
      for (let keyX = -11; keyX <= 9; keyX += 10) fillRect(keyX, 2, 3, 6); break;
    case 'pocha_snack':
      line(-17, -8, -13, -18, 13, -18, 17, -8); fillRect(-17, -8, 34, 5); fillRect(-14, -3, 4, 17); fillRect(10, -3, 4, 17); line(-18, 13, 18, 13);
      ctx.beginPath(); ctx.arc(-11, 18, 4, 0, Math.PI * 2); ctx.arc(11, 18, 4, 0, Math.PI * 2); ctx.fill(); break;
    case 'school_sign':
      fillRect(-17, -15, 34, 20); line(0, 5, 0, 19); line(-9, 19, 9, 19); line(-10, -8, 10, -8); break;
    case 'presentation':
      fillRect(-18, -15, 36, 25); ctx.fillStyle = '#ffffff'; line(-12, -8, 11, -8); line(-12, -1, 5, -1); line(-12, 6, 8, 6); line(-10, 10, -10, 18); line(10, 10, 10, 18); break;
    case 'desks_align':
      fillRect(-19, -7, 38, 7); line(-14, 0, -14, 17); line(14, 0, 14, 17); fillRect(-8, -17, 16, 8); break;
    case 'hidden_sea':
      line(-19, -5, -11, -10, -3, -5, 5, -10, 13, -5, 19, -9); line(-19, 5, -11, 0, -3, 5, 5, 0, 13, 5, 19, 1); line(-19, 15, -11, 10, -3, 15, 5, 10, 13, 15, 19, 11); break;
    case 'friend_confession':
      ctx.beginPath(); ctx.moveTo(0, 15); ctx.bezierCurveTo(-25, 0, -12, -16, 0, -7); ctx.bezierCurveTo(12, -16, 25, 0, 0, 15); ctx.fill(); break;
  }
  ctx.restore();
}

function endingScrollMax() {
  const contentHeight = Math.ceil(taskCatalog.length / 5) * 92 + 16 + 18 + 68;
  return Math.max(0, contentHeight - (endingUI.scrollBottom - endingUI.scrollTop));
}

function updateEndingScroll(deltaSeconds) {
  if (gameFlow.mode !== 'finale' || endingUI.view !== 'collection') return;
  const maxScroll = endingScrollMax();
  endingUI.scrollTargetY = Math.max(0, Math.min(maxScroll, endingUI.scrollTargetY));
  const follow = Math.min(0.18, deltaSeconds * 3.5);
  endingUI.scrollY += (endingUI.scrollTargetY - endingUI.scrollY) * follow;
  if (Math.abs(endingUI.scrollTargetY - endingUI.scrollY) < 0.2) endingUI.scrollY = endingUI.scrollTargetY;
}

function drawNavigationArrow(ctx, x, y, angle, color = '#343a35') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(16, 16);
  ctx.moveTo(0, 10);
  ctx.lineTo(0, 0);
  ctx.lineTo(10, 0);
  ctx.stroke();
  ctx.restore();
}

function drawEndingOverlay(ctx) {
  const ending = gameFlow.finale;
  if (!ending) return;
  const panelX = 140;
  const panelY = 16;
  const panelWidth = 680;
  const panelHeight = 288;

  ctx.save();
  ctx.fillStyle = ending.panel;
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1);

  const tabY = 22;
  const tabHeight = 28;
  ctx.strokeStyle = '#243a40';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(172, tabY + 14);
  ctx.lineTo(154, tabY + 14);
  ctx.lineTo(161, tabY + 7);
  ctx.moveTo(154, tabY + 14);
  ctx.lineTo(161, tabY + 21);
  ctx.stroke();

  if (endingUI.view === 'summary') {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#171a18';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(ending.title, canvas.width / 2, 74, 620);
    ctx.fillStyle = '#353a36';
    ctx.font = '12px sans-serif';
    ctx.fillText(ending.description, canvas.width / 2, 98, 620);

    ctx.fillStyle = '#262a27';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('이번 회차 과제', canvas.width / 2, 124);
    const currentTaskMap = new Map([...taskCatalog, ...hiddenTaskCatalog].map(([id, title]) => [id, title]));
    const currentTaskColors = new Map([...taskCatalog, ...hiddenTaskCatalog].map(([id, title, color]) => [id, color]));
    const currentTasks = (ending.taskIds || []).filter(id => currentTaskMap.has(id)).slice(0, 5);
    const iconSize = 54;
    currentTasks.forEach((id, index) => {
      const centerX = canvas.width / 2 + (index - (currentTasks.length - 1) / 2) * 82;
      const iconY = 138;
      ctx.fillStyle = currentTaskColors.get(id);
      ctx.fillRect(centerX - iconSize / 2, iconY, iconSize, iconSize);
      drawTaskIllustration(ctx, id, centerX, iconY + iconSize / 2, '#ffffff');
      ctx.fillStyle = '#171a18';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText(currentTaskMap.get(id), centerX, 204, 80);
    });
    if (!currentTasks.length) {
      ctx.fillStyle = '#414642';
      ctx.font = '11px sans-serif';
      ctx.fillText('이번 회차 완료 과제가 없습니다', canvas.width / 2, 160);
    }

    ctx.fillStyle = '#d2d2ce';
    ctx.fillRect(380, 226, 200, 36);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(380.5, 226.5, 199, 35);
    ctx.fillStyle = '#202321';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('과제 도감 보기', 480, 244);
  } else {
    // Collection View
    const viewportX = 170;
    const viewportWidth = 620;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#343a35';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('과제 도감', canvas.width / 2, 72);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#545b55';
    ctx.font = '10px sans-serif';
    ctx.fillText(`${gameFlow.unlockedTaskIds.size} / ${taskCatalog.length + hiddenTaskCatalog.length} 해금`, 780, 72);

    endingUI.scrollTop = 86;
    endingUI.scrollBottom = 284;

    ctx.save();
    ctx.beginPath();
    ctx.rect(viewportX, endingUI.scrollTop, viewportWidth, endingUI.scrollBottom - endingUI.scrollTop);
    ctx.clip();
    ctx.translate(0, endingUI.scrollTop - endingUI.scrollY);
    const iconSize = 54;
    const columnWidth = 112;
    const gridWidth = columnWidth * 5;
    const gridLeft = (canvas.width - gridWidth) / 2;
    taskCatalog.forEach(([id, title, color], index) => {
      const row = Math.floor(index / 5);
      const column = index % 5;
      const centerX = gridLeft + column * columnWidth + columnWidth / 2;
      const iconY = row * 88;
      const unlocked = gameFlow.unlockedTaskIds.has(id);
      ctx.fillStyle = unlocked ? color : '#b5b5b5';
      ctx.fillRect(centerX - iconSize / 2, iconY, iconSize, iconSize);
      if (unlocked) {
        drawTaskIllustration(ctx, id, centerX, iconY + iconSize / 2, '#ffffff');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = '#202321';
        ctx.fillText(title, centerX, iconY + 66, columnWidth - 6);
      } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 32px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('?', centerX, iconY + iconSize / 2 + 1);
      }
    });

    const hiddenY = Math.ceil(taskCatalog.length / 5) * 88 + 14;
    ctx.textAlign = 'left';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = '#737d75';
    ctx.fillText('히든 과제', 180, hiddenY + 4);
    hiddenTaskCatalog.forEach(([id, title, color], index) => {
      const cardWidth = 290;
      const cardX = 180 + index * 300;
      const cardY = hiddenY + 16;
      const unlocked = gameFlow.unlockedTaskIds.has(id);
      ctx.fillStyle = '#ededeb';
      ctx.fillRect(cardX, cardY, cardWidth, 64);
      ctx.fillStyle = unlocked ? color : '#b5b5b5';
      ctx.fillRect(cardX + 6, cardY + 6, 52, 52);
      if (unlocked) {
        drawTaskIllustration(ctx, id, cardX + 32, cardY + 32, '#ffffff');
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = '#202321';
        ctx.fillText(title, cardX + 70, cardY + 32, cardWidth - 80);
      } else {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 30px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('?', cardX + 32, cardY + 33);
      }
    });
    ctx.restore();

    const maxScroll = endingScrollMax();
    if (maxScroll > 0) {
      const trackX = 796;
      const trackY = endingUI.scrollTop;
      const trackHeight = endingUI.scrollBottom - endingUI.scrollTop;
      const thumbHeight = Math.max(22, trackHeight * trackHeight / (trackHeight + maxScroll));
      const thumbY = trackY + (trackHeight - thumbHeight) * endingUI.scrollY / maxScroll;
      ctx.fillStyle = 'rgba(85, 99, 88, 0.16)';
      ctx.fillRect(trackX, trackY, 2, trackHeight);
      ctx.fillStyle = 'rgba(85, 99, 88, 0.66)';
      ctx.fillRect(trackX, thumbY, 2, thumbHeight);
    }
  }
  ctx.restore();
}

function drawEndTitle(ctx) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 36px sans-serif';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  ctx.fillText('-THE END-', canvas.width / 2, 115);
  ctx.shadowColor = 'transparent';

  const buttonY = 202;
  const buttonHeight = 42;
  const buttonWidth = 180;

  ctx.fillStyle = '#e5f1f0';
  ctx.fillRect(290, buttonY, buttonWidth, buttonHeight);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(290.5, buttonY + 0.5, buttonWidth - 1, buttonHeight - 1);
  ctx.fillStyle = '#243a40';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('게임 새로하기', 380, buttonY + buttonHeight / 2);

  ctx.fillStyle = '#e5f1f0';
  ctx.fillRect(490, buttonY, buttonWidth, buttonHeight);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(490.5, buttonY + 0.5, buttonWidth - 1, buttonHeight - 1);
  ctx.fillStyle = '#243a40';
  ctx.fillText('과제 보기', 580, buttonY + buttonHeight / 2);

  ctx.restore();
}

function drawFlowOverlay(ctx) {
  if (['monitorMenu', 'monitorTyping', 'monitorSuccess'].includes(gameFlow.mode)) {
    drawMonitorTaskOverlay(ctx);
    return;
  }
  if (gameFlow.mode === 'choice') {
    ctx.save();
    ctx.translate(camera.x, 0);
    const panelWidth = 640;
    const panelHeight = 150;
    const panelX = (canvas.width - panelWidth) / 2;
    const panelY = (canvas.height - panelHeight) / 2;
    ctx.fillStyle = 'rgba(32, 35, 38, 0.94)';
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(gameFlow.dialogue || '', canvas.width / 2, panelY + 42, panelWidth - 40);
    ctx.fillStyle = '#527c62';
    ctx.fillRect(panelX + 112, panelY + 82, 176, 46);
    ctx.fillStyle = '#956a77';
    ctx.fillRect(panelX + 352, panelY + 82, 176, 46);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(gameFlow.choiceKind === 'cat' ? '밥 주기' : '예', panelX + 200, panelY + 105);
    ctx.fillText(gameFlow.choiceKind === 'cat' ? '쓰다듬기' : '아니오', panelX + 440, panelY + 105);
    ctx.restore();
    return;
  }
  if (gameFlow.mode === 'typing') {
    drawCenterMessage(ctx, '친구의 제안에 답해보자', `${gameFlow.typing.value}▯   GO 입력`);
    return;
  }
  if (gameFlow.mode === 'calm') {
    drawCenterMessage(ctx, gameFlow.calmText, `잠시 바라본다 · ${Math.ceil(gameFlow.calmTime)}초`);
    return;
  }
  if (gameFlow.mode === 'dialogue') {
    const stopAnnouncement = currentSceneId === 'bus' && busJourney.state === 'stopped' && gameFlow.dialogue?.startsWith('이번 정류장은 ');
    const terminalAnnouncement = stopAnnouncement && busJourney.stopIndex === busStops.length;
    const subtitle = terminalAnnouncement ? '이번 정류장이 종점입니다.' : '';
    drawCenterMessage(ctx, gameFlow.dialogue, subtitle, 0.15);
    return;
  }
  if (gameFlow.mode === 'finale' && gameFlow.finale) {
    return;
  }
}

function updateAndDrawParticles(ctx) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.life--;

    const alpha = particle.life / particle.maxLife;

    if (particle.type === 'heart') {
      ctx.fillStyle = particle.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(particle.x - 3, particle.y - 3, 6, 6);
    } else if (particle.type === 'petal') {
      ctx.fillStyle = particle.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(particle.x - 2.5, particle.y - 2.5, 5, 4);
    } else if (particle.type === 'speed') {
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(particle.x + particle.vx * 6, particle.y);
      ctx.stroke();
    } else {
      ctx.fillStyle = particle.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(particle.x - 1.5, particle.y - 1.5, 3, 3);
    }

    if (particle.life <= 0) {
      particles.splice(i, 1);
    }
  }
  ctx.globalAlpha = 1.0;
}

function traceCactus(ctx) {
  ctx.beginPath();
  ctx.moveTo(757, GROUND_Y - 176);
  ctx.lineTo(769, GROUND_Y - 176);
  ctx.lineTo(769, GROUND_Y - 154);
  ctx.lineTo(773, GROUND_Y - 154);
  ctx.lineTo(773, GROUND_Y - 164);
  ctx.lineTo(778, GROUND_Y - 164);
  ctx.lineTo(778, GROUND_Y - 149);
  ctx.lineTo(769, GROUND_Y - 149);
  ctx.lineTo(769, GROUND_Y - 144);
  ctx.lineTo(757, GROUND_Y - 144);
  ctx.lineTo(757, GROUND_Y - 156);
  ctx.lineTo(749, GROUND_Y - 156);
  ctx.lineTo(749, GROUND_Y - 171);
  ctx.lineTo(754, GROUND_Y - 171);
  ctx.lineTo(754, GROUND_Y - 161);
  ctx.lineTo(757, GROUND_Y - 161);
  ctx.closePath();
}

const ROOM_WINDOW_PANE_GAP = 11 * 0.75;

function drawRoomFurniture(ctx) {
  const paneWidth = 82;
  const paneHeight = 123;
  const paneGap = ROOM_WINDOW_PANE_GAP;
  const windowCenterX = 460.5;
  const windowTop = 74;
  const windowLeft = windowCenterX - (paneWidth * 2 + paneGap) / 2;

  const windowDone = gameFlow.completed.has('window');
  const bedDone = gameFlow.completed.has('bed');
  ctx.fillStyle = windowDone ? GUARD_WINDOW_COLOR : WINDOW_COLOR;
  ctx.fillRect(windowLeft, windowTop, paneWidth, paneHeight);
  ctx.fillRect(windowLeft + paneWidth + paneGap, windowTop, paneWidth, paneHeight);

  ctx.fillStyle = bedDone ? '#ffffff' : '#d8d8d8';
  ctx.fillRect(15, GROUND_Y - 82, 275, 47);
  ctx.fillStyle = bedDone ? '#f5d9e4' : '#888888';
  ctx.fillRect(107, GROUND_Y - 82, 183, 47);
  ctx.fillStyle = bedDone ? '#e8b6c8' : '#555555';
  ctx.fillRect(0, GROUND_Y - 122, 15, 97);
  ctx.fillRect(0, GROUND_Y - 35, 290, 13);
  ctx.fillRect(20, GROUND_Y - 22, 15, 22);
  ctx.fillRect(255, GROUND_Y - 22, 15, 22);

  ctx.fillStyle = gameFlow.completed.has('cactus') ? '#f6e8aa' : '#555555';
  ctx.fillRect(719, GROUND_Y - 112, 241, 18);
  ctx.fillRect(719, GROUND_Y - 94, 11, 94);
  ctx.fillRect(949, GROUND_Y - 94, 11, 94);

  ctx.fillStyle = gameFlow.completed.has('cactus') ? '#96a4c4' : '#888888';
  ctx.fillRect(850, GROUND_Y - 194, 80, 66);
  ctx.fillStyle = gameFlow.completed.has('cactus') ? '#969696' : '#333333';
  ctx.fillRect(856, GROUND_Y - 188, 68, 54);
  ctx.fillStyle = gameFlow.completed.has('cactus') ? '#96a4c4' : '#888888';
  ctx.fillRect(883, GROUND_Y - 134, 14, 20);
  ctx.fillRect(869, GROUND_Y - 114, 42, 4);

  ctx.fillStyle = gameFlow.completed.has('cactus') ? '#a0d98f' : '#555555';
  traceCactus(ctx);
  ctx.fill();

  ctx.fillStyle = gameFlow.completed.has('cactus') ? '#f7c7d8' : '#7d7d7d';
  ctx.beginPath();
  ctx.moveTo(742, GROUND_Y - 144);
  ctx.lineTo(784, GROUND_Y - 144);
  ctx.lineTo(778, GROUND_Y - 112);
  ctx.lineTo(748, GROUND_Y - 112);
  ctx.closePath();
  ctx.fill();
}

function drawOutdoorBackground(ctx, scene) {
  const wall = getMapWallColor('#858585');
  const mid = '#666666';
  const dark = '#484848';
  const light = '#dddddd';

  if (scene.id === 'home_front') {
    ctx.fillStyle = getMapWallColor('#b5b5b5');
    ctx.fillRect(0, 0, 960, 320);

    // A narrow apartment block sits beneath a canopy along the top edge.
    const guardDone = gameFlow.completed.has('guard');
    const stairsDone = gameFlow.completed.has('stairs_door');
    ctx.fillStyle = stairsDone ? '#e2b8d5' : wall;
    ctx.fillRect(0, 28, 75, 292);
    const canopyColor = stairsDone ? '#ba8cab' : mid;
    ctx.fillStyle = canopyColor;
    ctx.fillRect(0, 0, 155, 32);
    ctx.fillStyle = canopyColor;
    ctx.fillRect(0, 30, 155, 4);

    // The planter stays monochrome until its flower task is complete.
    ctx.save();
    ctx.translate(PLANTER_SHIFT, PLANTER_DROP);
    const flowerDone = gameFlow.completed.has('flower');
    ctx.fillStyle = flowerDone ? '#806c50' : '#777777';
    ctx.fillRect(58, 264 - PLANTER_RAISE, 431.5, 56 + PLANTER_RAISE - PLANTER_DROP);
    ctx.fillStyle = flowerDone ? '#719d79' : '#999999';
    ctx.fillRect(63, 133, 423.5, 131 - PLANTER_RAISE);
    ctx.translate(0, -PLANTER_RAISE);
    const flowerPlants = [
      { x: 108.25, top: 222 }, { x: 163.75, top: 210 },
      { x: 219.25, top: 222 }, { x: FLOWER_CENTER, top: FLOWER_CENTER_TOP },
      { x: 330.25, top: 222 }, { x: 385.75, top: 210 },
      { x: 441.25, top: 222 },
    ];
    for (const plant of flowerPlants) {
      const leafColor = flowerDone ? '#4e7952' : '#666666';
      const petalColor = flowerDone ? '#b9a2c7' : '#b0b0b0';
      ctx.fillStyle = leafColor;
      ctx.fillRect(plant.x - 2, plant.top + 16, 4, 264 - plant.top - 16);
      ctx.fillRect(plant.x - 12, plant.top + 38, 12, 4);
      ctx.fillRect(plant.x + 2, plant.top + 31, 12, 4);
      ctx.fillStyle = petalColor;
      ctx.fillRect(plant.x - 10, plant.top + 6, 8, 8);
      ctx.fillRect(plant.x - 4, plant.top, 8, 8);
      ctx.fillRect(plant.x + 4, plant.top + 6, 8, 8);
      ctx.fillRect(plant.x - 4, plant.top + 12, 8, 8);
      ctx.fillStyle = flowerDone ? '#f6e8aa' : '#d0d0d0';
      ctx.fillRect(plant.x - 2, plant.top + 7, 4, 4);
    }
    ctx.restore();

    // Guard booth is flush with the right edge and the screen bottom.
    ctx.fillStyle = guardDone ? '#739bb5' : '#777777';
    ctx.fillRect(744, 0, 216, 320);
    ctx.fillStyle = guardDone ? '#517892' : wall;
    ctx.fillRect(760, 40, 184, 32);
    ctx.fillStyle = light;
    ctx.font = 'bold 15px sans-serif';
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillText('경비실', 852, 62);
    ctx.restore();
    ctx.fillStyle = guardDone ? GUARD_WINDOW_COLOR : WINDOW_COLOR;
    ctx.fillRect(764, 88, 176, 138 * 0.7);
    return;
  }

  if (scene.id === 'bus_stop') {
    ctx.fillStyle = getMapWallColor('#b5b5b5');
    ctx.fillRect(0, 0, 960, 320);
    const busStopDone = gameFlow.completed.has('cat_feed');
    const treeDone = gameFlow.completed.has('tree_leaves');
    const catPet = gameFlow.completed.has('cat_pet');
    ctx.save();
    ctx.translate(-20 - BUS_STOP_LEFT_SHIFT, 0);
    ctx.fillStyle = busStopDone ? '#f6e8aa' : '#999999';
    ctx.fillRect(530, 80, 410, 240);
    ctx.fillStyle = busStopDone ? '#829f87' : '#858585';
    ctx.fillRect(530, 80, 410, 34);
    ctx.fillRect(530, 114, 34 / 3, 206);
    ctx.fillRect(940 - 34 / 3, 114, 34 / 3, 206);
    ctx.fillStyle = busStopDone ? '#d8be96' : mid;
    ctx.fillRect(605, 255, 260, 10);
    ctx.fillRect(605, 265, 10, 55);
    ctx.fillRect(855, 265, 10, 55);
    ctx.fillStyle = light;
    ctx.save();
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('집', 610, 97);
    ctx.fillText('정류장', 735, 97);
    ctx.fillText('학교', 860, 97);
    for (const arrowX of [674, 804]) {
      ctx.beginPath();
      ctx.moveTo(arrowX - 4.33, 92);
      ctx.lineTo(arrowX + 4.33, 97);
      ctx.lineTo(arrowX - 4.33, 102);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();

    ctx.fillStyle = treeDone ? '#806c50' : '#666666';
    ctx.fillRect(125.5, 176, 24, 144);
    ctx.fillStyle = treeDone ? '#a0d98f' : '#858585';
    ctx.fillRect(68.5, 50, 138, 138);

    const catHeadDrop = gameFlow.mode === 'dialogue' && gameFlow.activityMotion === 'cat'
      ? Math.round((1 + Math.sin(performance.now() / 160)) * 2)
      : 0;
    ctx.fillStyle = catPet ? '#efc99d' : '#484848';
    ctx.fillRect(366, 286, 44, 18);
    ctx.fillRect(360, 282, 5, 10);
    ctx.fillRect(360, 278, 12, 5);
    ctx.fillRect(402, 278 + catHeadDrop, 21, 20 - catHeadDrop);
    ctx.fillRect(405, 272 + catHeadDrop, 6, 9);
    ctx.fillRect(415, 272 + catHeadDrop, 6, 9);
    ctx.fillRect(372, 300, 6, 20);
    ctx.fillRect(384, 300, 6, 20);
    ctx.fillRect(400, 300, 6, 20);
    ctx.fillRect(412, 300, 6, 20);
    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(416, 286 + catHeadDrop, 3, 2);
    return;
  }

  if (scene.id === 'sea') {
    ctx.fillStyle = '#101b33';
    ctx.fillRect(0, 0, 960, 320);
    ctx.fillStyle = '#e6e8df';
    for (const [starX, starY, starSize] of [
      [84, 34, 3], [162, 76, 2], [248, 25, 2], [326, 62, 3],
      [414, 38, 2], [502, 82, 3], [596, 29, 2], [674, 67, 2],
      [766, 32, 3], [852, 78, 2], [918, 42, 2], [722, 98, 2],
      [284, 96, 2], [548, 54, 2], [126, 101, 2],
    ]) {
      ctx.fillRect(starX, starY, starSize, starSize);
    }
    ctx.fillStyle = '#9bafb1';
    ctx.fillRect(0, 116, 960, 32);
    ctx.fillStyle = '#78949b';
    ctx.fillRect(0, 148, 960, 132);
    ctx.fillStyle = '#a4b5b3';
    ctx.globalAlpha = 0.55;
    const waveTime = performance.now() / 1000;
    for (const [startX, waveY, waveWidth, speed] of [
      [24, 166, 42, 24], [176, 190, 58, 18], [342, 158, 36, 27],
      [508, 218, 64, 20], [704, 180, 46, 25], [858, 246, 52, 17],
      [98, 254, 34, 22], [420, 194, 48, 16], [632, 238, 38, 28],
      [792, 212, 56, 19],
    ]) {
      const waveX = (startX + waveTime * speed) % 960;
      for (const repeatOffset of [-960, 0, 960]) {
        ctx.fillRect(waveX + repeatOffset, waveY, waveWidth, 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#b8b0a0';
    ctx.fillRect(0, 280, 960, 40);
    return;
  }

  if (scene.id === 'school') {
    ctx.fillStyle = getMapWallColor('#b5b5b5');
    ctx.fillRect(0, 0, 960, 320);

    const signRaised = gameFlow.completed.has('school_sign');
    ctx.fillStyle = signRaised ? '#91aa96' : '#858585';
    ctx.fillRect(410, 40, 550, 280);

    ctx.fillStyle = signRaised ? '#b1c8b3' : '#999999';
    ctx.fillRect(600, 84, 120, 236);
    ctx.fillRect(724, 84, 120, 236);
    ctx.fillStyle = signRaised ? '#d0dfcf' : '#b0b0b0';
    ctx.fillRect(710, 196.9025, 5, 47.04);
    ctx.fillRect(729, 196.9025, 5, 47.04);

    ctx.fillStyle = signRaised ? '#719078' : '#666666';
    if (signRaised) {
      ctx.fillRect(246, 232, 5, 88);
      ctx.fillRect(333, 232, 5, 88);
      ctx.fillRect(246, 184, 92, 48);
    } else {
      ctx.fillRect(230, 288, 120, 8);
      ctx.fillRect(286, 265, 8, 28);
      ctx.save();
      ctx.translate(291, 280);
      ctx.rotate(-0.15);
      ctx.fillRect(-46, -24, 92, 48);
      ctx.restore();
    }
    ctx.fillStyle = '#dddddd';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('매일 학교', 292, 208);

    return;
  }

  if (scene.id === 'school_board') {
    ctx.fillStyle = getMapWallColor('#b5b5b5');
    ctx.fillRect(0, 0, 960, 320);
    const presentationDone = gameFlow.completed.has('presentation');
    const desksAligned = gameFlow.completed.has('desks_align');
    ctx.fillStyle = presentationDone ? '#91aa96' : '#888888';
    ctx.fillRect(177.75, 28.23, 604.5, 155.54);
    ctx.fillStyle = presentationDone ? '#718b76' : '#777777';
    ctx.fillRect(186, 36.48, 588, 139.04);

    ctx.fillStyle = desksAligned ? '#9aaf99' : '#777777';
    for (const deskX of [60, 240.75, 538.5, 719.25]) {
      ctx.fillRect(deskX, 216, 180.75, 11);
    }
    ctx.fillStyle = desksAligned ? '#a6bdc2' : '#999999';
    for (const deskX of [60, 240.75, 538.5, 719.25]) {
      ctx.fillRect(deskX + 14, 227, 11, 93);
      ctx.fillRect(deskX + 155.75, 227, 11, 93);
    }
    ctx.fillStyle = '#dedede';
    for (const deskX of [60, 240.75, 538.5, 719.25]) {
      const chairCenterX = deskX + 90.375;
      ctx.fillRect(chairCenterX - 25, 252, 50, 8);
      ctx.fillRect(chairCenterX - 21, 260, 7, 60);
      ctx.fillRect(chairCenterX + 14, 260, 7, 60);
      ctx.fillRect(deskX < 500 ? chairCenterX - 26 : chairCenterX + 18, 220, 8, 32);
    }
    const seatedClassmates = [[60, 1], [240.75, 1], [719.25, -1]];
    for (const [deskX, facing] of seatedClassmates) {
      drawSeatedCharacter(ctx, deskX + 90.375, 260, facing);
    }
    return;
  }

  if (scene.id === 'street') {
    ctx.fillStyle = getMapWallColor('#b5b5b5');
    ctx.fillRect(0, 0, 960, 320);
    const stationeryDone = gameFlow.completed.has('stationery_game');
    const bookstoreDone = gameFlow.completed.has('poem');
    const pianoDone = gameFlow.completed.has('piano_sound');
    const pochaDone = gameFlow.completed.has('pocha_snack');

    ctx.fillStyle = stationeryDone ? '#9ebca4' : wall;
    ctx.fillRect(20, 76, 230, 244);
    ctx.fillStyle = stationeryDone ? '#78987f' : mid;
    ctx.fillRect(50, 84, 170, 32);
    ctx.fillStyle = light;
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('문방구', 135, 100);
    ctx.fillStyle = getWindowColor(stationeryDone ? GUARD_WINDOW_COLOR : WINDOW_COLOR);
    ctx.fillRect(50, 124, 170, 98);
    ctx.fillStyle = '#c9c9c9';
    ctx.fillRect(168, 208, 64, 112);
    ctx.fillStyle = '#3d4549';
    ctx.fillRect(174, 216, 52, 48);
    ctx.fillStyle = '#a9bd9e';
    ctx.fillRect(178, 220, 44, 29);
    ctx.fillStyle = '#dedede';
    ctx.fillRect(184, 292, 28, 6);

    ctx.fillStyle = bookstoreDone ? '#9ebca4' : wall;
    ctx.fillRect(270, 48, 225, 272);
    ctx.fillStyle = bookstoreDone ? '#78987f' : mid;
    ctx.fillRect(297, 56, 171, 34);
    ctx.fillStyle = light;
    ctx.fillText('서점', 382, 73);
    ctx.fillStyle = getWindowColor(bookstoreDone ? GUARD_WINDOW_COLOR : WINDOW_COLOR);
    ctx.fillRect(300, 98, 165, 198);

    ctx.fillStyle = pianoDone ? '#9ebca4' : wall;
    ctx.fillRect(515, 68, 215, 252);
    ctx.fillStyle = pianoDone ? '#78987f' : mid;
    ctx.fillRect(537, 76, 171, 34);
    ctx.fillStyle = light;
    ctx.fillText('피아노 학원', 622, 93);
    ctx.fillStyle = getWindowColor(pianoDone ? GUARD_WINDOW_COLOR : WINDOW_COLOR);
    ctx.fillRect(540, 118, 165, 178);

    ctx.fillStyle = pochaDone ? '#967e61' : mid;
    ctx.fillRect(775, 85, 140, 32);
    ctx.fillStyle = light;
    ctx.fillText('포장마차', 845, 101);
    ctx.fillStyle = pochaDone ? '#967e61' : dark;
    ctx.fillRect(754, 123, 182, 18);
    ctx.fillStyle = pochaDone ? '#d9c29d' : '#d5b9a0';
    ctx.fillRect(754, 141, 182, 10);
    ctx.fillStyle = pochaDone ? '#b9a184' : '#858585';
    ctx.fillRect(772, 151, 8, 79);
    ctx.fillRect(910, 151, 8, 79);
    ctx.fillStyle = getWindowColor(pochaDone ? GUARD_WINDOW_COLOR : WINDOW_COLOR);
    ctx.fillRect(780, 157, 130, 61);
    ctx.fillStyle = pochaDone ? '#967e61' : dark;
    ctx.fillRect(758, 218, 178, 12);
    ctx.fillStyle = pochaDone ? '#b9a184' : '#858585';
    ctx.fillRect(778, 230, 140, 61);
    ctx.fillStyle = pochaDone ? '#967e61' : dark;
    for (const wheelX of [808, 888]) {
      ctx.beginPath();
      ctx.arc(wheelX, 305, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pochaDone ? '#d9c29d' : '#b9a98e';
      ctx.beginPath();
      ctx.arc(wheelX, 305, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pochaDone ? '#967e61' : dark;
    }
    return;
  }

}

function drawOutdoorForeground(ctx, scene) {
  const busVisible = busArrival.state !== 'waiting' &&
    (scene.id === 'bus_stop' || scene.id === busArrival.departureTarget);
  if (busVisible) {
    ctx.fillStyle = '#777777';
    ctx.fillRect(busArrival.x, 48, BUS_WIDTH, 272);
    ctx.fillStyle = WINDOW_COLOR;
    for (let windowIndex = 0; windowIndex < 4; windowIndex++) {
      ctx.fillRect(busArrival.x + 46 + windowIndex * 153, 85, 124, 70);
    }
    ctx.fillStyle = '#484848';
    ctx.fillRect(busArrival.x + 66, 230, 90, 90);
    ctx.fillRect(busArrival.x + 541, 230, 90, 90);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(busArrival.x + 66 + (90 - 30) / 2, 230 + (90 - 30) / 2, 30, 30);
    ctx.fillRect(busArrival.x + 541 + (90 - 30) / 2, 230 + (90 - 30) / 2, 30, 30);
    ctx.fillStyle = '#dedede';
    ctx.fillRect(busArrival.x + 675, 203, 22, 32);
  }
  if (scene.id === 'home_front' && player.facing === -1) {
    ctx.fillStyle = gameFlow.completed.has('stairs_door') ? '#e2b8d5' : '#858585';
    ctx.fillRect(0, 34, 75, 286);
  }
}

function drawPlayerSittingCharacter(ctx, x, seatY, facing, seatId, activityMotion, hasRabbitPlush) {
  const scale = 3.8;
  const torsoLength = seatId === 'bus_stop_bench' ? 15 : 22;
  ctx.save();
  ctx.translate(x, seatY);
  ctx.scale(facing * scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-2.5, -torsoLength - 11, 8.5, 11);
  ctx.fillRect(-2.5, -torsoLength, 4, torsoLength);
  if (activityMotion === 'cat') {
    const strokeOffset = Math.sin(performance.now() / 120) * 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.3;
    ctx.beginPath();
    ctx.moveTo(1, -torsoLength + 3);
    ctx.lineTo(13, -10);
    ctx.lineTo(25 + strokeOffset, -7);
    ctx.stroke();
  } else if (hasRabbitPlush) {
    ctx.fillStyle = '#f2a6c4';
    ctx.fillRect(1.75, -torsoLength + 4 + RABBIT_PLUSH_DROP, 1.5, 2.5);
    ctx.fillRect(1.5, -torsoLength + 1 + RABBIT_PLUSH_DROP, 1, 2);
    ctx.fillRect(3.5, -torsoLength + 1 + RABBIT_PLUSH_DROP, 1, 2);
    ctx.fillStyle = '#ffffff';
  } else if (activityMotion === 'cereal') {
    const spoonProgress = (1 + Math.cos(performance.now() / 240)) / 2;
    const handX = 7 + 14 * spoonProgress;
    const handY = -26 + 12 * spoonProgress;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.3;
    ctx.beginPath();
    ctx.moveTo(1, -19);
    ctx.lineTo(8, -14);
    ctx.lineTo(handX, handY);
    ctx.stroke();
    ctx.strokeStyle = '#777777';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.lineTo(handX + 3, handY + 1);
    ctx.stroke();
    ctx.fillStyle = '#777777';
    ctx.fillRect(handX + 2.5, handY, 2, 2);
    ctx.fillStyle = '#ffffff';
  } else {
    ctx.fillRect(0, -torsoLength + 3, 3.3, torsoLength - 6);
  }
  ctx.fillRect(-2.5, -3, 11, 4);
  ctx.fillRect(5, 0, 4, (GROUND_Y - seatY) / scale);
  ctx.fillRect(5, (GROUND_Y - seatY) / scale - 2.5, 7, 2.5);
  ctx.restore();
}

function drawPlayerStandingCharacter(ctx, x, y, facing, bob, hasRabbitPlush, verticalScale = 3.8) {
  const scale = 3.8;
  const drawLimb = (limbX, limbY, length, width, angle, withFoot = false) => {
    ctx.save();
    ctx.translate(limbX, limbY + bob);
    ctx.rotate(angle);
    ctx.fillRect(-width / 2, 0, width, length);
    if (withFoot) ctx.fillRect(-width / 2, length - 1, width + 3, 2.5);
    ctx.restore();
  };

  ctx.save();
  ctx.translate(x, y - verticalScale * (1.5 + bob));
  ctx.scale(facing * scale, verticalScale);
  ctx.fillStyle = '#ffffff';
  drawLimb(-0.5, -14, 15, 4, 0, true);
  drawLimb(-2.5, -35, 18, 3.3, 0);
  ctx.fillRect(-2.5, -39 + bob, 4, 25);
  if (hasRabbitPlush) {
    ctx.fillStyle = '#f2a6c4';
    ctx.fillRect(1.75, -36 + bob + RABBIT_PLUSH_DROP, 1.5, 2.5);
    ctx.fillRect(1.5, -38 + bob + RABBIT_PLUSH_DROP, 1, 2);
    ctx.fillRect(3.5, -38 + bob + RABBIT_PLUSH_DROP, 1, 2);
    ctx.fillStyle = '#ffffff';
  }
  ctx.fillRect(-2.5, -50 + bob, 8.5, 11);
  drawLimb(1, -35, 18, 3.3, 0);
  drawLimb(-0.5, -14, 15, 4, 0, true);
  ctx.restore();
}

function drawSeatedCharacter(ctx, x, y, facing) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * 3.8, 3.8);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-2.5, -33, 8.5, 11);
  ctx.fillRect(-2.5, -22, 4, 22);
  ctx.fillRect(0, -19, 3.3, 16);
  ctx.fillRect(-2.5, -3, 11, 4);
  ctx.fillRect(5, 0, 4, (GROUND_Y - y) / 3.8);
  ctx.fillRect(5, (GROUND_Y - y) / 3.8 - 2.5, 7, 2.5);
  ctx.restore();
}

function drawGrandmaStanding(ctx, x, y) {
  drawPlayerStandingCharacter(ctx, x, y, -1, 0, false);
}

function drawSceneBackground(ctx, scene) {
  ctx.fillStyle = getMapWallColor('#b5b5b5');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (scene.id === 'refrigerator') {
    drawRefrigeratorPuzzle(ctx);
  } else if (scene.id === 'bus') {
    ctx.fillStyle = '#969696';
    ctx.fillRect(0, 0, 960, 320);
    const busWindowDone = gameFlow.completed.has('bus_window');
    const sceneryColors = ['#a8c9bc', '#efc98b', '#c5b3d8', '#e7a59a', '#91b8d1'];
    for (let windowIndex = 0; windowIndex < 4; windowIndex++) {
      const windowX = 36 + windowIndex * 180;
      ctx.save();
      ctx.beginPath();
      ctx.rect(windowX, 62, 150, 100);
      ctx.clip();
      ctx.fillStyle = getWindowColor(busWindowDone ? GUARD_WINDOW_COLOR : WINDOW_COLOR);
      ctx.fillRect(windowX, 62, 150, 100);
      for (let buildingIndex = -1; buildingIndex < 15; buildingIndex++) {
        const buildingX = buildingIndex * 120 - busJourney.sceneryOffset;
        ctx.fillStyle = busWindowDone
          ? sceneryColors[(buildingIndex + sceneryColors.length) % sceneryColors.length]
          : '#b7b7b7';
        ctx.fillRect(buildingX, 112 - (buildingIndex % 3 + 1) * 10, 70, 82);
      }
      ctx.restore();
    }
    const grandmaSeatComplete = gameFlow.completed.has('grandma_seat');
    const seatXs = [56, 236, 416];
    seatXs.forEach((seatX, seatIndex) => {
      ctx.fillStyle = grandmaSeatComplete ? '#8aa9a0' : '#555555';
      ctx.fillRect(seatX, 177, 8, 71);
      ctx.fillRect(seatX, 248, 50, 16);
      ctx.fillRect(seatX, 264, 8, 56);
    });
    for (const seatX of seatXs.slice(1)) drawSeatedCharacter(ctx, seatX + 25, 248, 1);

    if (gameFlow.grandmaState === 'entering') {
      const elapsed = performance.now() - gameFlow.grandmaStartedAt;
      const progress = Math.min(elapsed / 3600, 1);
      const grandmaX = 850 + (200 - 850) * progress;
      drawGrandmaStanding(ctx, grandmaX, GROUND_Y);
    } else if (gameFlow.grandmaState === 'approach') {
      drawGrandmaStanding(ctx, 200, GROUND_Y);
    } else if (['seatedTalking', 'gifted'].includes(gameFlow.grandmaState)) {
      drawPlayerSittingCharacter(ctx, 81, 248, 1, 'bus_seat_left', null, false);
    }
    ctx.fillStyle = '#bdbdbd';
    ctx.fillRect(758, 58, 86, 262);
    ctx.fillRect(848, 58, 86, 262);
    ctx.fillStyle = '#777777';
    ctx.fillRect(758, 177, 176, 6);
  } else if (scene.id === 'home') {
    drawRoomFurniture(ctx);
  } else if (scene.id === 'living_room') {
    ctx.fillStyle = gameFlow.fridgeEver ? '#efc99d' : '#dedede';
    ctx.fillRect(0, 70, 111, 250);
    const dishesDone = gameFlow.completed.has('dishes');
    const cerealDone = gameFlow.completed.has('cereal');
    const sinkBodyColor = dishesDone ? '#9aacc8' : '#777777';
    ctx.fillStyle = sinkBodyColor;
    ctx.fillRect(111, 70, 286, 66);
    ctx.fillRect(111, 202, 286, 118);
    ctx.fillStyle = dishesDone ? '#ffffff' : '#d8d8d8';
    ctx.fillRect(111, 190, 286, 12);
    ctx.fillStyle = sinkBodyColor;
    ctx.fillRect(133, 187, 99, 5);
    ctx.fillStyle = sinkBodyColor;
    ctx.fillRect(180, 165, 5, 22);
    ctx.fillRect(180, 165, 21, 5);
    ctx.fillRect(196, 165, 5, 10);
    ctx.fillRect(264, 190, 123, 5);
    if (gameFlow.mode === 'dialogue' && gameFlow.activityMotion === 'dishes') {
      ctx.fillStyle = '#b7dfe6';
      ctx.fillRect(197, 175, 3, 12);
      ctx.fillRect(191, 183 + Math.round(Math.sin(performance.now() / 100) * 2), 4, 3);
    }
    ctx.fillStyle = gameFlow.fridgeEver ? '#d78945' : '#b0b0b0';
    ctx.fillRect(92, 130.7275, 5, 31.36);
    ctx.fillRect(92, 196.9025, 5, 47.04);
    ctx.fillStyle = '#c9c9c9';
    ctx.fillRect(144.7, 128.5, 26.6, 2.5);
    ctx.fillRect(240.7, 128.5, 26.6, 2.5);
    ctx.fillRect(335.7, 128.5, 26.6, 2.5);
    ctx.fillRect(172, 247.49, 2.5, 23.52);
    ctx.fillRect(190.5, 247.49, 2.5, 23.52);
    ctx.fillRect(308.2, 214, 33.6, 2.5);
    ctx.fillRect(308.2, 253, 33.6, 2.5);
    ctx.fillRect(308.2, 292, 33.6, 2.5);
    ctx.fillStyle = cerealDone ? '#f6e8aa' : '#dedede';
    ctx.fillRect(610, GROUND_Y - 112, 241, 18);
    ctx.fillRect(610, GROUND_Y - 94, 11, 94);
    ctx.fillRect(840, GROUND_Y - 94, 11, 94);
    ctx.fillStyle = cerealDone ? '#f6e8aa' : '#dedede';
    ctx.fillRect(548, 177, 8, 79);
    ctx.fillRect(548, 248, 50, 8);
    ctx.fillRect(548, 256, 8, 64);
    ctx.fillRect(590, 256, 8, 64);
    ctx.fillRect(905, 177, 8, 79);
    ctx.fillRect(863, 248, 50, 8);
    ctx.fillRect(863, 256, 8, 64);
    ctx.fillRect(905, 256, 8, 64);
    ctx.fillStyle = cerealDone ? '#f2c9d8' : '#999999';
    ctx.fillRect(712, 148, 42, 60);
    ctx.fillStyle = '#dddddd';
    ctx.save();
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('씨리얼', 733, 182);
    ctx.restore();
    ctx.fillStyle = cerealDone ? '#c5e8a9' : '#777777';
    ctx.beginPath();
    ctx.moveTo(642, GROUND_Y - 128);
    ctx.lineTo(684, GROUND_Y - 128);
    ctx.lineTo(678, GROUND_Y - 112);
    ctx.lineTo(648, GROUND_Y - 112);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = gameFlow.fridgeEver ? '#d78945' : '#b0b0b0';
    ctx.fillRect(0, 174, 111, 2);
    ctx.fillStyle = dishesDone ? '#657792' : '#6d6d6d';
    ctx.fillRect(205, 70, 2, 66);
    ctx.fillRect(301, 70, 2, 66);
    ctx.fillRect(182, 202, 2, 118);
    ctx.fillRect(253, 202, 2, 118);
    ctx.fillRect(254, 241, 143, 2);
    ctx.fillRect(254, 280, 143, 2);
  } else if (scene.id === 'elevator') {
    ctx.fillStyle = '#777777';
    ctx.font = '900 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('8층', 480, 50);

    const rideElapsed = elevatorRide.startedAt === null
      ? -1
      : performance.now() - elevatorRide.startedAt;
    const arrivalElapsed = elevatorArrival.startedAt === null
      ? -1
      : performance.now() - elevatorArrival.startedAt;
    const openProgress = arrivalElapsed >= 0
      ? arrivalElapsed < 1100
        ? arrivalElapsed / 1100
        : arrivalElapsed < 2100
          ? 1
          : arrivalElapsed < 3200
            ? 1 - (arrivalElapsed - 2100) / 1100
            : 0
      : rideElapsed < 750
        ? 0
        : rideElapsed < 1850
          ? (rideElapsed - 750) / 1100
          : rideElapsed < 2850
            ? 1
            : rideElapsed < 3950
              ? 1 - (rideElapsed - 2850) / 1100
              : 0;
    if (openProgress > 0) {
      ctx.fillStyle = '#666666';
      ctx.fillRect(358, 84, 244, 236);
    }
    const doorWidth = 120 * (1 - openProgress);
    const elevatorDoorDone = gameFlow.completed.has('stone');
    ctx.fillStyle = elevatorDoorDone ? '#d8be96' : '#999999';
    if (doorWidth > 0) {
      ctx.fillRect(358, 84, doorWidth, 236);
      ctx.fillRect(602 - doorWidth, 84, doorWidth, 236);
    }
    ctx.fillStyle = '#777777';
    ctx.fillRect(310, 191, 18, 18);
    ctx.fillStyle = rideElapsed >= 0 && scene.id === 'elevator' ? '#484848' : '#777777';
    ctx.fillRect(310, 213, 18, 18);
    const stairsDone = gameFlow.completed.has('stairs_door');
    ctx.fillStyle = stairsDone ? '#e2b8d5' : '#999999';
    ctx.fillRect(779, 84, 120, 236);
    ctx.fillStyle = stairsDone ? '#ba8cab' : '#777777';
    ctx.fillRect(876, 216, 8, 8);
    ctx.fillStyle = stairsDone ? '#ba8cab' : '#858585';
    ctx.fillRect(791, 106, 96, 32);
    ctx.save();
    ctx.fillStyle = '#dddddd';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('계단', 839, 122);
    ctx.restore();
    if (!gameFlow.completed.has('stone')) {
      ctx.fillStyle = '#777777';
      ctx.fillRect(168, 296, 24, 24);
      ctx.fillStyle = '#999999';
      ctx.fillRect(172, 298, 13, 5);
    }
  } else if (scene.id === 'apartment_hallway') {
    const neighborVisited = gameFlow.completed.has('apartment_door_887');
    const guardVisited = gameFlow.completed.has('guard');
    for (const [doorX, unitNumber] of [[130, '887호'], [420, '888호'], [710, '889호']]) {
      const doorDoneColor = neighborVisited
        ? '#e2b8d5'
        : doorX === 420 && guardVisited
          ? GUARD_WINDOW_COLOR
          : '#999999';
      const doorDetailColor = neighborVisited
        ? '#ba8cab'
        : doorX === 420 && guardVisited
          ? '#78a4ad'
          : '#858585';
      ctx.fillStyle = doorDoneColor;
      ctx.fillRect(doorX, 84, 120, 236);
      ctx.fillStyle = doorDetailColor;
      ctx.fillRect(doorX + 12, 106, 96, 32);
      ctx.save();
      ctx.fillStyle = '#dddddd';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(unitNumber, doorX + 60, 128);
      ctx.fillStyle = doorDetailColor;
      ctx.fillRect(doorX + 97, 216, 8, 8);
      ctx.restore();
    }
    drawPlayerStandingCharacter(ctx, 295, GROUND_Y, 1, 0, false, 1.9);
  } else {
    drawOutdoorBackground(ctx, scene);
  }
}

let showShortcutHelp = false;
let shortcutHelpPage = 0;
const shortcutHelpPageCount = 5;
const DEBUG_PASSWORD = 'ekfmsgkfn';
let debugAccessEnabled = false;
let debugPasswordPromptOpen = false;
let debugPasswordValue = '';
let debugPasswordError = false;

function taskNames(taskIds) {
  const names = new Map(taskCatalog.map(([id, name]) => [id, name]));
  return [...taskIds].map(id => names.get(id)).join('  ·  ');
}

function drawShortcutHelp(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(25, 25, 25, 0.88)';
  ctx.fillRect(20, 16, 920, shortcutHelpPage === 0 ? 180 : 288);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  if (shortcutHelpPage > 0) {
    drawNavigationArrow(ctx, 40, 36, -Math.PI / 4, '#ffffff');
  }
  if (shortcutHelpPage < shortcutHelpPageCount - 1) {
    drawNavigationArrow(ctx, 920, 36, 3 * Math.PI / 4, '#ffffff');
  }
  ctx.fillStyle = '#bdbdbd';
  ctx.textAlign = 'center';
  ctx.font = '11px sans-serif';
  ctx.fillText(`${shortcutHelpPage + 1} / ${shortcutHelpPageCount}`, 480, 36);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  if (shortcutHelpPage > 0) {
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(['', '일반 엔딩', '나만의 행복 과제', '지정 과제 엔딩', '히든 엔딩'][shortcutHelpPage], 76, 36);
    ctx.font = '12px sans-serif';
    if (shortcutHelpPage === 1) {
      ctx.fillText('일반 과제 5개를 완료하고 학교에 다녀온 뒤 집으로 돌아오면 엔딩이 나옵니다.', 36, 76);
      ctx.fillText('다정한 하루: 배려 과제 3개 이상', 36, 108);
      ctx.fillText('나만의 행복: 배려 과제가 아닌 일반 과제 3개 이상', 36, 140);
      ctx.fillStyle = '#bdbdbd';
      ctx.fillText('배려 과제', 36, 182);
      ctx.fillText(taskNames([...kindnessTaskIds].slice(0, 4)), 36, 208);
      ctx.fillText(taskNames([...kindnessTaskIds].slice(4)), 36, 232);
      ctx.fillText('지정 과제 조합은 일반 엔딩보다 우선합니다. 모니터 과제는 일반 과제 수에 포함되지 않습니다.', 36, 268);
    } else if (shortcutHelpPage === 2) {
      const personalTasks = taskCatalog.filter(([id]) => !kindnessTaskIds.has(id) && !id.startsWith('monitor_'));
      ctx.fillText('아래 과제 중 3개 이상을 포함해 일반 과제 5개를 완료하세요.', 36, 76);
      ctx.fillStyle = '#d5d5d5';
      for (let index = 0; index < personalTasks.length; index += 4) {
        ctx.fillText(personalTasks.slice(index, index + 4).map(([, name]) => name).join('  ·  '), 36, 112 + index / 4 * 30);
      }
      ctx.fillStyle = '#bdbdbd';
      ctx.fillText('지정 과제 조합은 나만의 행복보다 우선합니다.', 36, 270);
    } else if (shortcutHelpPage === 3) {
      const groups = [
        ['넉넉한 마음', foodEndingTaskIds],
        ['자연과 함께', natureEndingTaskIds],
        ['먼저 건넨 인사', greetingEndingTaskIds],
      ];
      groups.forEach(([title, ids], index) => {
        const top = 72 + index * 68;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(title, 36, top);
        ctx.fillStyle = '#d5d5d5';
        ctx.font = '12px sans-serif';
        ctx.fillText(taskNames(ids), 36, top + 24);
      });
      ctx.fillStyle = '#bdbdbd';
      ctx.fillText('각 엔딩의 과제 5개를 모두 완료한 뒤 학교에 다녀와 집으로 돌아오세요.', 36, 274);
    } else {
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('바다에 도착한 날', 36, 80);
      ctx.font = '12px sans-serif';
      ctx.fillText('버스를 타고 학교 다음 정류장인 바다에 도착합니다.', 36, 106);
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('서로의 마음', 36, 154);
      ctx.font = '12px sans-serif';
      ctx.fillText('교실의 친구와 대화한 뒤 집으로 돌아와 모니터 과제를 완료합니다.', 36, 180);
      ctx.fillStyle = '#bdbdbd';
      ctx.fillText('히든 엔딩은 일반 과제 완료 수와 관계없이 열립니다.', 36, 232);
    }
    ctx.restore();
    return;
  }
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('맵 바로 이동', 36, 36);
  ctx.font = '13px sans-serif';
  const mapShortcuts = [
    '1 방', '2 부엌', '3 아파트 복도', '4 엘리베이터와 계단', '5 아파트 화단',
    '6 버스 정류장', '7 버스 내부', '8 학원가', '9 학교 외부', '0 바다',
  ];
  mapShortcuts.forEach((label, index) => {
    const column = Math.floor(index / 5);
    const row = index % 5;
    ctx.fillText(label, 36 + column * 190, 60 + row * 22);
  });
  ctx.fillStyle = '#bdbdbd';
  ctx.fillText('Shift 이동 속도 높이기', 430, 60);
  ctx.fillText('R 정류장: 버스 부르기 / 버스 안: 학교로 이동', 430, 104);
  ctx.fillText('냉장고 퍼즐은 부엌에서 상호작용', 430, 126);
  ctx.fillText('Tab 안내 닫기', 430, 148);
  ctx.restore();
}

function drawDebugPasswordPrompt(ctx) {
  const panelWidth = 360;
  const panelHeight = 104;
  const panelX = (canvas.width - panelWidth) / 2;
  const panelY = (canvas.height - panelHeight) / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(25, 25, 25, 0.94)';
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.strokeStyle = '#d5d5d5';
  ctx.lineWidth = 1;
  ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('개발자 암호', panelX + 18, panelY + 22);
  ctx.fillStyle = '#101010';
  ctx.fillRect(panelX + 18, panelY + 40, panelWidth - 36, 28);
  ctx.strokeStyle = debugPasswordError ? '#ff7777' : '#aaaaaa';
  ctx.strokeRect(panelX + 18.5, panelY + 40.5, panelWidth - 37, 27);
  ctx.fillStyle = '#ffffff';
  ctx.font = '14px monospace';
  ctx.fillText(`${'*'.repeat(debugPasswordValue.length)}▏`, panelX + 26, panelY + 54);
  ctx.fillStyle = debugPasswordError ? '#ff9999' : '#bdbdbd';
  ctx.font = '11px sans-serif';
  ctx.fillText(debugPasswordError ? '암호가 올바르지 않습니다.' : 'Enter 확인 · Esc 취소', panelX + 18, panelY + 84);
  ctx.restore();
}

// Main Game Loop
function gameLoop() {
  const now = performance.now();
  const deltaSeconds = Math.min((now - lastFlowFrame) / 1000, 0.05);
  lastFlowFrame = now;

  const isPostEnding = Boolean(endingUI.showEndTitle || gameFlow.mode === 'finale' || endingUI.savedEnding);
  if (isPostEnding) {
    keys.left = false;
    keys.right = false;
    keys.speedBoost = false;
    player.vx = 0;
    player.state = 'IDLE';
  } else {
    player.update(currentScene, deltaSeconds);
    camera.update(player.x, currentScene.width, Math.min(deltaSeconds * 60, 3));
  }
  sceneTransition.update(deltaSeconds);
  updateGameFlow(deltaSeconds);
  updateEndingScroll(deltaSeconds);

  // Render Frame
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.scale(VIEW_ZOOM, VIEW_ZOOM);
  ctx.translate(-camera.x, 0);

  drawSceneBackground(ctx, currentScene);

  // 2. Player Character
  if (currentSceneId !== 'refrigerator' && !(currentSceneId === 'bus_stop' && busArrival.state === 'departing' && busArrival.departureTarget === null)) {
    player.draw(ctx);
  }
  drawOutdoorForeground(ctx, currentScene);
  drawNearbyActivityHighlight(ctx);

  // 4. Particle Effects
  updateAndDrawParticles(ctx);
  drawFlowOverlay(ctx);

  ctx.restore();

  // Screen Fade Transition
  sceneTransition.draw(ctx);

  if (isPostEnding) {
    endingBackdropContext.clearRect(0, 0, endingBackdrop.width, endingBackdrop.height);
    endingBackdropContext.drawImage(canvas, 0, 0);
    ctx.save();
    ctx.filter = 'blur(6px)';
    ctx.drawImage(endingBackdrop, -6, -6, canvas.width + 12, canvas.height + 12);
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(18, 22, 26, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (endingUI.showEndTitle) {
      drawEndTitle(ctx);
    } else if (gameFlow.mode === 'finale' && gameFlow.finale) {
      drawEndingOverlay(ctx);
    }
  } else {
    drawTaskProgress(ctx);
    if (debugPasswordPromptOpen) drawDebugPasswordPrompt(ctx);
    else if (debugAccessEnabled && showShortcutHelp) drawShortcutHelp(ctx);
  }

  requestAnimationFrame(gameLoop);
}

// Keyboard & Pointer Event Handlers
canvas.addEventListener('pointerdown', event => {
  window.soundEngine?.ensureResume?.();
  if (gameFlow.mode === 'monitorTyping') {
    const input = monitorTaskInput || document.getElementById('monitor-task-input');
    input?.focus();
    return;
  }
  if (endingUI.showEndTitle) {
    const rectangle = canvas.getBoundingClientRect();
    const pointerX = (event.clientX - rectangle.left) * canvas.width / rectangle.width;
    const pointerY = (event.clientY - rectangle.top) * canvas.height / rectangle.height;
    if (pointerY >= 202 && pointerY <= 244) {
      if (pointerX >= 290 && pointerX <= 470) {
        window.location.reload();
        return;
      }
      if (pointerX >= 490 && pointerX <= 670) {
        if (endingUI.savedEnding) {
          gameFlow.selectedEnding = endingUI.savedEnding.id;
          gameFlow.finale = { ...endingUI.savedEnding.finale, taskIds: [...endingUI.savedEnding.finale.taskIds] };
        }
        endingUI.showEndTitle = false;
        endingUI.view = 'summary';
        endingUI.scrollY = 0;
        endingUI.scrollTargetY = 0;
        gameFlow.mode = 'finale';
        return;
      }
    }
    return;
  }
  if (showShortcutHelp) {
    const rectangle = canvas.getBoundingClientRect();
    const pointerX = (event.clientX - rectangle.left) * canvas.width / rectangle.width;
    const pointerY = (event.clientY - rectangle.top) * canvas.height / rectangle.height;
    if (pointerY >= 16 && pointerY <= 56) {
      if (pointerX >= 20 && pointerX <= 76 && shortcutHelpPage > 0) shortcutHelpPage--;
      else if (pointerX >= 884 && pointerX <= 940 && shortcutHelpPage < shortcutHelpPageCount - 1) shortcutHelpPage++;
    }
    return;
  }
  if (gameFlow.mode === 'finale') {
    const rectangle = canvas.getBoundingClientRect();
    const pointerX = (event.clientX - rectangle.left) * canvas.width / rectangle.width;
    const pointerY = (event.clientY - rectangle.top) * canvas.height / rectangle.height;

    // Top tab bar clicks (y: 22 to 52)
    if (pointerY >= 22 && pointerY <= 50) {
      if (pointerX >= 148 && pointerX <= 178) {
        if (gameFlow.finale && gameFlow.selectedEnding) {
          endingUI.savedEnding = {
            id: gameFlow.selectedEnding,
            finale: { ...gameFlow.finale, taskIds: [...gameFlow.finale.taskIds] },
          };
        }
        endingUI.showEndTitle = true;
        return;
      }
    }

    if (endingUI.view === 'summary') {
      if (pointerY >= 224 && pointerY <= 264 && pointerX >= 380 && pointerX <= 580) {
        endingUI.view = 'collection';
        endingUI.scrollY = 0;
        endingUI.scrollTargetY = 0;
        return;
      }
    } else if (endingUI.view === 'collection') {
      if (pointerY >= endingUI.scrollTop && pointerY <= endingUI.scrollBottom) {
        endingUI.dragStartY = pointerY;
        endingUI.dragStartScroll = endingUI.scrollTargetY;
        canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
      }
    }
    return;
  }
  if (gameFlow.mode !== 'choice' || event.button !== 0) return;
  const rectangle = canvas.getBoundingClientRect();
  const clickX = (event.clientX - rectangle.left) * canvas.width / rectangle.width;
  const clickY = (event.clientY - rectangle.top) * canvas.height / rectangle.height;
  const panelX = (canvas.width - 640) / 2;
  const panelY = (canvas.height - 150) / 2;
  if (clickY < panelY + 82 || clickY > panelY + 128) return;
  if (clickX >= panelX + 112 && clickX <= panelX + 288) chooseBusPrompt(true);
  else if (clickX >= panelX + 352 && clickX <= panelX + 528) chooseBusPrompt(false);
  event.preventDefault();
});

canvas.addEventListener('pointermove', event => {
  if (gameFlow.mode !== 'finale' || endingUI.view !== 'collection' || endingUI.dragStartY === null) return;
  const rectangle = canvas.getBoundingClientRect();
  const pointerY = (event.clientY - rectangle.top) * canvas.height / rectangle.height;
  endingUI.scrollTargetY = Math.max(0, Math.min(endingScrollMax(), endingUI.dragStartScroll + endingUI.dragStartY - pointerY));
  event.preventDefault();
});

function finishEndingScrollDrag(event) {
  if (endingUI.dragStartY === null) return;
  endingUI.dragStartY = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}

canvas.addEventListener('pointerup', finishEndingScrollDrag);
canvas.addEventListener('pointercancel', finishEndingScrollDrag);

canvas.addEventListener('wheel', event => {
  if (gameFlow.mode !== 'finale' || endingUI.view !== 'collection') return;
  const wheelDistance = event.deltaY * canvas.height / canvas.getBoundingClientRect().height * 0.35;
  endingUI.scrollTargetY = Math.max(0, Math.min(endingScrollMax(), endingUI.scrollTargetY + wheelDistance));
  event.preventDefault();
}, { passive: false });

function updateAudioToggleIcon(isMuted) {
  const audioIcon = document.getElementById('audio-icon');
  if (audioIcon) audioIcon.textContent = isMuted ? '🔇' : '🔊';
}

window.addEventListener('keydown', (e) => {
  window.soundEngine.ensureResume();
  if (!debugPasswordPromptOpen && (e.key === 'm' || e.key === 'M')) {
    if (!e.repeat) updateAudioToggleIcon(window.soundEngine.toggleMute());
    return;
  }

  const isPostEnding = Boolean(endingUI.showEndTitle || gameFlow.mode === 'finale' || endingUI.savedEnding);
  if (isPostEnding) {
    if (gameFlow.mode === 'finale' && !endingUI.showEndTitle) {
      if (endingUI.view === 'collection' && (e.key === 'ArrowDown' || e.key === 'PageDown')) {
        endingUI.scrollTargetY = Math.min(endingScrollMax(), endingUI.scrollTargetY + 56);
        e.preventDefault();
        return;
      }
      if (endingUI.view === 'collection' && (e.key === 'ArrowUp' || e.key === 'PageUp')) {
        endingUI.scrollTargetY = Math.max(0, endingUI.scrollTargetY - 56);
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        endingUI.showEndTitle = true;
        return;
      }
    }
    e.preventDefault();
    return;
  }
  if (debugPasswordPromptOpen) {
    e.preventDefault();
    if (e.repeat) return;
    if (e.key === 'Enter') {
      if (e.isComposing) return;
      if (debugPasswordValue.toLowerCase() === DEBUG_PASSWORD) {
        debugAccessEnabled = true;
        debugPasswordPromptOpen = false;
        debugPasswordValue = '';
        debugPasswordError = false;
        showShortcutHelp = true;
        shortcutHelpPage = 0;
      } else {
        debugPasswordValue = '';
        debugPasswordError = true;
      }
    } else if (e.key === 'Escape') {
      debugPasswordPromptOpen = false;
      debugPasswordValue = '';
      debugPasswordError = false;
    } else if (e.key === 'Backspace') {
      debugPasswordValue = debugPasswordValue.slice(0, -1);
      debugPasswordError = false;
    } else if (/^Key[A-Z]$/.test(e.code)) {
      debugPasswordValue += e.code.slice(3).toLowerCase();
      debugPasswordError = false;
    } else if (e.key.length === 1) {
      debugPasswordValue += e.key;
      debugPasswordError = false;
    }
    return;
  }
  if (gameFlow.mode === 'choice') {
    handleGameFlowKey(e);
    return;
  }
  if (['monitorMenu', 'monitorTyping', 'monitorSuccess'].includes(gameFlow.mode)) {
    handleGameFlowKey(e);
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    if (!e.repeat) {
      keys.left = false;
      keys.right = false;
      keys.speedBoost = false;
      if (debugAccessEnabled) {
        showShortcutHelp = !showShortcutHelp;
        if (showShortcutHelp) shortcutHelpPage = 0;
      } else {
        debugPasswordPromptOpen = true;
        debugPasswordValue = '';
        debugPasswordError = false;
      }
    }
    return;
  }
  if (debugAccessEnabled && showShortcutHelp && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    if (!e.repeat) shortcutHelpPage = Math.max(0, Math.min(shortcutHelpPageCount - 1, shortcutHelpPage + (e.key === 'ArrowRight' ? 1 : -1)));
    return;
  }
  if (debugAccessEnabled && !sceneTransition.active && /^[0-9]$/.test(e.key)) {
    e.preventDefault();
    if (e.repeat) return;
    const mapOrder = ['home', 'living_room', 'apartment_hallway', 'elevator', 'home_front', 'bus_stop', 'bus', 'street', 'school'];
    const targetScene = e.key === '0' ? 'sea' : mapOrder[Number(e.key) - 1];
    if (targetScene) {
      const spawnPositions = { home: 680, living_room: 480, apartment_hallway: 480, elevator: 480, home_front: 480, bus_stop: 350, bus: 100, street: 480, school: 480, sea: 480 };
      gameFlow.mode = null;
      gameFlow.dialogue = null;
      gameFlow.activityMotion = null;
      sceneTransition.start(targetScene, spawnPositions[targetScene]);
    }
    return;
  }
  if (debugAccessEnabled && !sceneTransition.active && (e.key === 'r' || e.key === 'R') && currentSceneId === 'bus_stop') {
    e.preventDefault();
    if (e.repeat) return;
    if (busArrival.state === 'departing') {
      if (busArrival.departureTarget !== null) return;
      busArrival.x = currentScene.width;
      sceneTransition.start('bus', 100);
      return;
    }
    busArrival.state = 'stopped';
    busArrival.x = BUS_STOP_POSITION;
    busArrival.idleSince = null;
    gameFlow.dialogue = null;
    gameFlow.activityMotion = null;
    setFlowMode(null);
    updateGameFlow(0);
    return;
  }
  if (currentSceneId === 'bus_stop' && busArrival.state === 'arriving') {
    e.preventDefault();
    return;
  }
  if (busArrival.state === 'departing' &&
      (currentSceneId === 'bus_stop' || busArrival.departureTarget === currentSceneId)) {
    e.preventDefault();
    return;
  }
  if (currentSceneId === 'bus_stop' && busArrival.state === 'waiting') {
    busArrival.idleSince = null;
  }

  if (e.key === 'x' || e.key === 'X') {
    e.preventDefault();
    if (e.repeat) return;
    gameFlow.completed.clear();
    gameFlow.runTaskIds.clear();
    gameFlow.catTreats = false;
    gameFlow.dishesPrompted = false;
    gameFlow.ateToday = false;
    gameFlow.cerealEver = false;
    gameFlow.fridgeEver = false;
    gameFlow.visitedSchool = false;
    gameFlow.hiddenConfessionActive = false;
    gameFlow.hasRabbitPlush = false;
    gameFlow.grandmaState = 'none';
    gameFlow.grandmaTalkStep = 0;
    gameFlow.choiceKind = null;
    gameFlow.dialogueSequence = null;
    gameFlow.day = 1;
    gameFlow.selectedEnding = null;
    gameFlow.finale = null;
    endingUI.showEndTitle = false;
    gameFlow.dialogue = null;
    gameFlow.typing = null;
    gameFlow.calmTime = 0;
    gameFlow.calmText = null;
    gameFlow.calmId = null;
    gameFlow.monitorTask = null;
    hideMonitorTaskInput();
    setFlowMode(null);
    if (currentSceneId === 'refrigerator') sceneTransition.start('living_room', 100);
    updateGameFlow(0);
    return;
  }

  if (handleGameFlowKey(e)) return;
  if (gameFlow.mode) return;

  if (currentSceneId === 'bus' && busJourney.state === 'moving') {
    e.preventDefault();
    return;
  }

  if ((e.code === 'Space' || e.key === ' ') && gameFlow.nearby?.kind === 'boardBus') {
    e.preventDefault();
    interactWith(gameFlow.nearby);
    gameFlow.nearby = null;
    return;
  }

  if ((e.code === 'Space' || e.key === ' ') && player.sitting) {
    e.preventDefault();
    if (gameFlow.nearby?.kind === 'boardBus' || gameFlow.nearby?.id === 'cat' || gameFlow.nearby?.id === 'bus_window' || gameFlow.nearby?.kind === 'seatedTask') {
      const activity = gameFlow.nearby;
      gameFlow.nearby = null;
      interactWith(activity);
    } else {
      standPlayerUp();
    }
    return;
  }

  if ((e.code === 'Space' || e.key === ' ') && gameFlow.nearby) {
    e.preventDefault();
    const activity = gameFlow.nearby;
    gameFlow.nearby = null;
    interactWith(activity);
    return;
  }

  // Prevent default scroll when space is pressed inside the game
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
  }

  // Horizontal Movement
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    e.preventDefault();
    keys.left = true;
  }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    e.preventDefault();
    keys.right = true;
  }
  if (debugAccessEnabled && e.key === 'Shift') {
    keys.speedBoost = true;
  }

});

window.addEventListener('keyup', (e) => {
  const isPostEnding = Boolean(endingUI.showEndTitle || gameFlow.mode === 'finale' || endingUI.savedEnding);
  if (isPostEnding) {
    keys.left = false;
    keys.right = false;
    keys.speedBoost = false;
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    keys.left = false;
  }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    keys.right = false;
  }
  if (e.key === 'Shift') {
    keys.speedBoost = false;
  }
});


// UI Buttons (Null-safe)
const audioToggle = document.getElementById('audio-toggle');
if (audioToggle) {
  audioToggle.addEventListener('click', () => {
    const isMuted = window.soundEngine.toggleMute();
    updateAudioToggleIcon(isMuted);
  });
}

// Responsive Aspect Ratio Scaling
function handleResize() {
  const container = document.getElementById('game-container');
  const targetAspect = 3;
  let w = container.clientWidth;
  let h = container.clientHeight;

  if (w / h > targetAspect) {
    w = h * targetAspect;
  } else {
    h = w / targetAspect;
  }

  const scale = Math.min(0.8, 1280 / w, 426.67 / h);
  w *= scale;
  h *= scale;

  h = Math.floor(h);
  w = h * targetAspect;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  updateMonitorInputPosition();
}

window.addEventListener('resize', handleResize);
handleResize();

// Start Game Loop
requestAnimationFrame(gameLoop);
