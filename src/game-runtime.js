import { MapEventService } from './systems/map-event-service.js';
import { createExpeditionSeed, createSeededRandom, generateRandomPlacements } from './systems/map-generation.js';
import {
  canEnemySeePlayer,
  directionFromDelta,
  directionToward,
  getVisionCells,
  hasLineOfSight,
  rotateDirection,
  stableDirection
} from './systems/grid-vision.js';
import {
  directionAngle,
  seededFogJitter,
  shouldDrawGridEdge,
  visionPalette,
  visionTone
} from './systems/map-visuals.js';
import {
  addMonsterMeat,
  applyEnvironmentalPollution,
  consumeLeastCorruptedMeat,
  normalizeMonsterMeat
} from './systems/madness-resources.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const keyOf = (x, y) => `${x},${y}`;
const clone = (value) => structuredClone(value);

const FORMAL_ART_FILES = {
  ground: './assets/art/terrain-ground.svg', obstacle: './assets/art/terrain-obstacle.svg',
  player: './assets/art/player.svg', enemy: './assets/art/enemy.svg', nest: './assets/art/nest.svg',
  corpse: './assets/art/corpse.svg', extract: './assets/art/extract.svg', fog: './assets/art/fog.svg',
  facing: './assets/art/facing-arrow.svg', alert: './assets/art/alert.svg'
};

function createFormalArt(onReady) {
  const assets = {};
  if (typeof Image === 'undefined') return assets;
  for (const [key, src] of Object.entries(FORMAL_ART_FILES)) {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => onReady?.();
    image.src = src;
    assets[key] = image;
  }
  return assets;
}

function drawImageCover(ctx, image, x, y, width, height, alpha = 1) {
  if (!image?.complete || !image.naturalWidth) return false;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sw = width / scale, sh = height / scale;
  const sx = (image.naturalWidth - sw) / 2, sy = (image.naturalHeight - sh) / 2;
  ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height); ctx.restore();
  return true;
}


export class GridExplorationRuntime {
  constructor(canvas, config, save, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.art = createFormalArt(() => this.render());
    this.config = config;
    this.save = save;
    this.callbacks = callbacks;
    this.mapConfig = config.maps[0];
    this.viewWidth = Math.min(20, this.mapConfig.width);
    this.viewHeight = Math.min(20, this.mapConfig.height);
    this.tileSize = Math.floor(760 / Math.max(this.viewWidth, this.viewHeight));
    this.canvas.width = this.viewWidth * this.tileSize;
    this.canvas.height = this.viewHeight * this.tileSize;
    this.running = false;
    this.inputPaused = false;
    this.mode = 'OUTDOOR_EXPLORATION';
    this.turn = 0;
    this.message = '雾中没有声音。每一步都会让世界向前。';
    this.expeditionStart = null;
    this.environmentElapsedMs = 0;
    this.lastEnvironmentTickAt = null;
    this.environmentTimer = null;
    this.resistanceDepletedNotified = false;
    this.pageHidden = false;
    this.sceneMadness = 0;
    this.boundKeyDown = (event) => this.onKeyDown(event);
    this.boundClick = (event) => this.onCanvasClick(event);
  }

  start() {
    this.tiles = this.createTiles();
    const snapshot = this.save.activeExpedition?.mapId === this.mapConfig.id
      ? this.save.activeExpedition
      : null;
    this.seed = snapshot?.seed != null
      ? snapshot.seed
      : createExpeditionSeed(this.mapConfig);
    this.random = createSeededRandom(`${this.seed}:runtime`, snapshot?.randomState);
    this.player = {
      x: this.mapConfig.playerSpawn.x, y: this.mapConfig.playerSpawn.y,
      health: clamp(this.save.health ?? this.config.player.health, 1, this.config.global.maxHealth), hunger: this.config.player.hunger,
      madness: this.save.madness,
      madnessResistance: this.save.madnessResistance ?? this.config.player.initialMadnessResistance,
      loot: { monsterMeat: [] }, dead: false
    };
    this.monsters = this.spawnMonsters();
    this.corpses = [];
    this.battle = null;
    this.visitedTiles = new Set([keyOf(this.player.x, this.player.y)]);
    this.seenSpawnerIds = new Set();
    this.eventService = new MapEventService(this.config, this.random);
    this.restoreExpedition();
    this.expeditionStart = this.save.activeExpedition?.expeditionStart || {
      madness: this.player.madness,
      enemiesKilled: this.save.enemiesKilled || 0,
      nestsDestroyed: this.save.nestsDestroyed || 0,
      monsterMeatConsumed: this.save.totalMonsterMeatConsumed || 0
    };
    this.running = true;
    addEventListener('keydown', this.boundKeyDown);
    this.canvas.addEventListener('click', this.boundClick);
    this.resumeEnvironmentClock();
    this.updateVision();
    this.persistExpedition();
    this.render();
  }

  stop() {
    this.running = false;
    clearInterval(this.environmentTimer);
    this.environmentTimer = null;
    removeEventListener('keydown', this.boundKeyDown);
    this.canvas.removeEventListener('click', this.boundClick);
  }

  setPageHidden(hidden, now = Date.now()) {
    if (!this.running) return;
    if (hidden) {
      const elapsed = this.lastEnvironmentTickAt ? Math.max(0, now - this.lastEnvironmentTickAt) : 0;
      if (elapsed > 0) this.advanceEnvironmentTime(elapsed, false);
      this.pageHidden = true;
      this.lastEnvironmentTickAt = null;
      clearInterval(this.environmentTimer);
      this.environmentTimer = null;
      this.persistExpedition();
      return;
    }
    this.pageHidden = false;
    this.resumeEnvironmentClock(now);
  }

  createTiles() {
    const obstacles = new Set(this.mapConfig.obstacles.map((item) => keyOf(item.x, item.y)));
    const tiles = [];
    for (let y = 0; y < this.mapConfig.height; y += 1) {
      for (let x = 0; x < this.mapConfig.width; x += 1) {
        const blocked = obstacles.has(keyOf(x, y));
        tiles.push({ x, y, terrainId: blocked ? 'obstacle' : 'ground', walkable: !blocked, visibility: 'unexplored', rememberedContent: null });
      }
    }
    return tiles;
  }

  spawnMonsters() {
    const monsters = [];
    const monsterIds = new Set(this.config.monsters.map((item) => item.id));
    const randomSpawns = generateRandomPlacements(this.mapConfig, monsterIds, this.seed, this.mapConfig.monsterSpawns || []);
    [...(this.mapConfig.monsterSpawns || []), ...randomSpawns].forEach((spawn) => {
      const config = this.config.monsters.find((item) => item.id === spawn.monsterId);
      if (!config) return;
      for (let index = 0; index < spawn.count; index += 1) {
        const position = this.findFreeSpawn(spawn.x, spawn.y, index, monsters);
        if (!position) continue;
        const monster = {
          id: `${config.id}-${monsters.length}`, config, x: position.x, y: position.y,
          homeX: position.x, homeY: position.y, health: config.health,
          state: config.canWander ? 'Wander' : 'Idle', cooldownTurns: 0,
          alertTurns: 0, intent: null, spawnedByMonsterId: null,
          facing: stableDirection(`${this.seed}:${config.id}:${position.x},${position.y}`),
          lastSeenPlayerPosition: null,
          spawnTurnsLeft: config.spawnConfig?.initialDelayTurns ?? 0, spawnedTotal: 0
        };
        monsters.push(monster);
      }
    });
    return monsters;
  }

  findFreeSpawn(x, y, index, existing) {
    const offsets = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1]];
    for (let cursor = index; cursor < offsets.length + index; cursor += 1) {
      const offset = offsets[cursor % offsets.length];
      const candidate = { x: clamp(x + offset[0], 0, this.mapConfig.width - 1), y: clamp(y + offset[1], 0, this.mapConfig.height - 1) };
      const reserved = (candidate.x === this.mapConfig.playerSpawn.x && candidate.y === this.mapConfig.playerSpawn.y)
        || Boolean(this.extractionAt(candidate.x, candidate.y));
      if (this.tileAt(candidate.x, candidate.y)?.walkable && !reserved && !existing.some((item) => item.x === candidate.x && item.y === candidate.y)) return candidate;
    }
    return null;
  }

  tileAt(x, y) { return this.tiles?.[y * this.mapConfig.width + x]; }
  monsterAt(x, y) { return this.monsters.find((item) => item.x === x && item.y === y); }
  corpseAt(x, y) { return this.corpses.find((item) => item.x === x && item.y === y && !item.harvested); }

  contentAt(x, y) {
    const monster = this.monsterAt(x, y);
    const corpse = this.corpseAt(x, y);
    return {
      enemy: monster ? {
        id: monster.id, name: monster.config.name, color: monster.config.color, state: monster.state,
        facing: monster.facing, visionEnabled: Boolean(monster.config.vision?.enabled),
        isSpawner: Boolean(monster.config.spawnConfig?.enabled)
      } : null,
      corpse: corpse ? { id: corpse.id, name: corpse.config.name, harvested: corpse.harvested } : null,
      extract: this.extractionAt(x, y)
    };
  }

  extractionAt(x, y) { return (this.mapConfig.extractionPoints || [this.mapConfig.extractPoint]).find((point) => point.x === x && point.y === y) || null; }

  updateVision() {
    const fog = this.mapConfig.fogOfWar;
    this.seenSpawnerIds ??= new Set();
    this.tiles.forEach((tile) => {
      if (tile.visibility === 'visible') tile.visibility = 'explored';
      const dx = Math.abs(tile.x - this.player.x), dy = Math.abs(tile.y - this.player.y);
      const inRange = fog.shape === 'manhattan' ? dx + dy <= fog.visionRadius : Math.max(dx, dy) <= fog.visionRadius;
      const visible = !fog.enabled || (inRange && (!fog.terrainBlocksVision
        || hasLineOfSight(this.player, tile, (x, y) => !this.tileAt(x, y)?.walkable)));
      if (visible) {
        tile.visibility = 'visible';
        tile.rememberedContent = clone(this.contentAt(tile.x, tile.y));
      }
    });
    for (const spawner of this.monsters.filter((monster) => monster.config.spawnConfig?.enabled)) {
      if (this.tileAt(spawner.x, spawner.y)?.visibility !== 'visible' || this.seenSpawnerIds.has(spawner.id)) continue;
      this.seenSpawnerIds.add(spawner.id);
      this.notify('nest-sighted', spawner, `你在雾中发现了${spawner.config.name}。它仍在蠕动。`);
      this.callbacks.onMilestone?.('first_nest');
    }
  }

  onKeyDown(event) {
    if (!this.running || this.inputPaused) return;
    if (this.mode === 'BATTLE') {
      if (this.callbacks.onBattleKey?.(event.key)) event.preventDefault();
      return;
    }
    if (this.mode !== 'OUTDOOR_EXPLORATION') return;
    const moves = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
    const move = moves[event.key.toLowerCase()];
    if (move) { event.preventDefault(); this.movePlayer(...move); }
    if (event.key.toLowerCase() === 'e') { event.preventDefault(); this.interact(); }
  }

  onCanvasClick(event) {
    if (this.mode !== 'OUTDOOR_EXPLORATION') return;
    const rect = this.canvas.getBoundingClientRect();
    const camera = this.getCamera();
    const x = camera.x + Math.floor((event.clientX - rect.left) * this.canvas.width / rect.width / this.tileSize);
    const y = camera.y + Math.floor((event.clientY - rect.top) * this.canvas.height / rect.height / this.tileSize);
    if (manhattan(this.player, { x, y }) === 1) this.movePlayer(x - this.player.x, y - this.player.y);
  }

  movePlayer(dx, dy) {
    if (!this.running || this.inputPaused || this.mode !== 'OUTDOOR_EXPLORATION') return false;
    const target = { x: this.player.x + dx, y: this.player.y + dy };
    const tile = this.tileAt(target.x, target.y);
    if (!tile?.walkable) { this.setMessage('那里无法通行。'); return false; }
    const monster = this.monsterAt(target.x, target.y);
    if (monster) { this.startBattle(monster, 'player'); return true; }
    this.player.x = target.x; this.player.y = target.y;
    this.callbacks.onAudioEvent?.('move');
    const firstVisit = !this.visitedTiles.has(keyOf(target.x, target.y));
    this.visitedTiles.add(keyOf(target.x, target.y));
    this.advanceMapTurn('move');
    this.callbacks.onMilestone?.('fog_of_war');
    if (this.extractionAt(this.player.x, this.player.y)) this.callbacks.onMilestone?.('first_extraction');
    if (this.mode === 'OUTDOOR_EXPLORATION' && firstVisit) this.tryMapEvent();
    return true;
  }

  tryMapEvent() {
    if (!this.callbacks.onMapEvent) return;
    const event = this.eventService.tryTrigger({ firstVisit: true, step: this.turn, madness: this.player.madness, hunger: this.player.hunger, seenEventIds: this.save.seenEventIds || [] });
    if (!event) return;
    this.mode = 'MAP_EVENT';
    this.persistExpedition();
    this.callbacks.onMapEvent?.(event, (choice) => this.resolveMapEvent(event, choice));
  }

  resolveMapEvent(event, choice) {
    if (this.mode !== 'MAP_EVENT') return;
    const effects = this.eventService.effectsFor(choice), messages = [];
    effects.forEach((effect) => {
      if (effect.type === 'health') { this.player.health = clamp(this.player.health + effect.value, 0, this.config.global.maxHealth); messages.push(`生命 ${effect.value >= 0 ? '+' : ''}${effect.value}`); }
      if (effect.type === 'hunger' && effect.value > 0) { this.player.hunger = clamp(this.player.hunger + effect.value, 0, this.config.global.maxHunger); messages.push(`饥饿 +${effect.value}`); }
      if (effect.type === 'madness') { this.changeMadness(effect.value); messages.push(`疯狂 ${effect.value >= 0 ? '+' : ''}${effect.value}`); }
      if (effect.type === 'safeFood') { this.save.safeFood += effect.value; messages.push(`获得储备粮 ×${effect.value}`); if (effect.value > 0) this.callbacks.onAudioEvent?.('item'); }
      if (effect.type === 'monsterMeat') { const amount = Math.min(effect.value, this.config.player.inventoryCapacity - this.player.loot.monsterMeat.length); this.player.loot.monsterMeat = addMonsterMeat(this.player.loot.monsterMeat, amount, this.config.monsterMeat.maxMadness, `event-${this.turn}`); messages.push(`获得异变肉块 ×${amount}`); if (amount > 0) { this.callbacks.onMilestone?.('monster_meat'); this.callbacks.onAudioEvent?.('item'); } }
      if (effect.type === 'message') messages.push(effect.value);
    });
    if (event.oncePerSave && !(this.save.seenEventIds || []).includes(event.id)) this.save.seenEventIds.push(event.id);
    this.mode = 'OUTDOOR_EXPLORATION';
    const turns = effects.filter((effect) => effect.type === 'advanceTurn').reduce((sum, effect) => sum + effect.value, 0);
    for (let index = 0; index < turns && this.mode === 'OUTDOOR_EXPLORATION'; index += 1) this.advanceMapTurn('wait', false);
    const finish = () => { this.setMessage(messages.join(' · ') || '你决定不再停留。'); this.updateVision(); this.persistExpedition(); this.render(); };
    if (this.callbacks.onMapEventResult) this.callbacks.onMapEventResult(messages, finish); else finish();
  }

  wait() {
    if (this.mode !== 'OUTDOOR_EXPLORATION') return;
    this.setMessage('你停下来观察雾中的动静。');
    this.advanceMapTurn('wait');
  }

  getOutdoorItems() {
    return this.config.foods.filter((item) => item.allowOutdoor).map((item) => ({
      ...item,
      count: item.id === 'monster_meat' ? this.player.loot.monsterMeat.length : 0,
      currentMadness: item.id === 'monster_meat' && this.player.loot.monsterMeat.length
        ? Math.min(...this.player.loot.monsterMeat.map((meat) => meat.currentMadness))
        : 0
    }));
  }

  useOutdoorItem(itemId) {
    if (!this.running || this.mode !== 'OUTDOOR_EXPLORATION') return { ok: false, message: '现在无法使用道具。' };
    const item = this.config.foods.find((food) => food.id === itemId && food.allowOutdoor);
    if (!item) return { ok: false, message: '这个道具不能在户外使用。' };
    if (item.id !== 'monster_meat' || this.player.loot.monsterMeat.length <= 0) return { ok: false, message: '背包里没有可用的异变肉块。' };
    const eaten = this.eatMonsterMeat();
    this.setMessage(`你吃下${item.name}：生命 +${item.healthRestore}，饥饿 +${item.hungerRestore}，疯狂 +${eaten.currentMadness}。`);
    this.advanceMapTurn('wait');
    return { ok: true, item, hunger: this.player.hunger, madness: this.player.madness, meatMadness: eaten.currentMadness };
  }

  interact() {
    if (this.mode !== 'OUTDOOR_EXPLORATION') return;
    const corpse = this.corpseAt(this.player.x, this.player.y);
    if (corpse) return this.harvest(corpse);
    if (this.extractionAt(this.player.x, this.player.y)) return this.extract();
    this.setMessage('这个格子没有可以交互的对象。');
    this.render();
  }

  getInteraction() {
    const corpse = this.corpseAt(this.player.x, this.player.y);
    if (corpse) {
      const full = this.player.loot.monsterMeat.length >= this.config.player.inventoryCapacity;
      const turns = Math.max(1, corpse.config.harvestTurns);
      return { type: 'harvest', label: full ? '背包已满' : `切割（${turns} 回合）`, enabled: !full, tone: 'danger' };
    }
    if (this.extractionAt(this.player.x, this.player.y)) {
      const turns = Math.max(1, this.extractionAt(this.player.x, this.player.y)?.requiredTurns || 1);
      return { type: 'extract', label: `撤离（${turns} 回合）`, enabled: true, tone: 'gold' };
    }
    return { type: null, label: '暂无交互', enabled: false, tone: 'muted' };
  }

  harvest(corpse) {
    const turns = Math.max(1, corpse.config.harvestTurns);
    this.setMessage(`开始切割，需要 ${turns} 个地图回合。`);
    for (let index = 0; index < turns && this.mode === 'OUTDOOR_EXPLORATION'; index += 1) this.advanceMapTurn('harvest', false);
    if (this.mode !== 'OUTDOOR_EXPLORATION') return;
    const gear = this.getEquipmentStats();
    const free = this.config.player.inventoryCapacity - this.player.loot.monsterMeat.length;
    const amount = Math.min(free, Math.max(1, Math.floor(corpse.config.meatYield * this.config.player.harvestYieldMultiplier * gear.harvestYield)));
    corpse.harvested = true;
    this.player.loot.monsterMeat = addMonsterMeat(this.player.loot.monsterMeat, amount, this.config.monsterMeat.maxMadness, `harvest-${corpse.id}`);
    this.save.corpsesHarvested = (this.save.corpsesHarvested || 0) + 1;
    this.callbacks.onMilestone?.('monster_meat');
    this.callbacks.onAudioEvent?.('harvest');
    this.callbacks.onAudioEvent?.('item');
    this.setMessage(`切割完成，获得 ${amount} 份异变肉块。`);
    this.updateVision(); this.persistExpedition(); this.render();
  }

  extract() {
    const turns = Math.max(1, this.extractionAt(this.player.x, this.player.y)?.requiredTurns || 1);
    this.setMessage(`开始撤离，需要守住 ${turns} 个地图回合。`);
    this.callbacks.onAudioEvent?.('extract');
    for (let index = 0; index < turns && this.mode === 'OUTDOOR_EXPLORATION'; index += 1) this.advanceMapTurn('wait', false);
    if (this.mode === 'OUTDOOR_EXPLORATION') this.succeedExpedition();
  }

  advanceMapTurn(type, render = true) {
    this.turn += 1;
    this.consumeHunger(type);
    if (this.player.health <= 0) return this.failExpedition();
    const enemies = [...this.monsters];
    for (const monster of enemies) {
      if (this.mode !== 'OUTDOOR_EXPLORATION') break;
      this.updateMonster(monster);
    }
    if (this.mode === 'OUTDOOR_EXPLORATION') this.updateSpawners();
    this.updateVision();
    this.persistExpedition();
    if (render) this.render();
  }

  resumeEnvironmentClock(now = Date.now()) {
    this.lastEnvironmentTickAt = now;
    clearInterval(this.environmentTimer);
    this.environmentTimer = setInterval(() => {
      const current = Date.now();
      const elapsed = current - this.lastEnvironmentTickAt;
      this.lastEnvironmentTickAt = current;
      if (!this.running || this.inputPaused || this.pageHidden || this.mode !== 'OUTDOOR_EXPLORATION') return;
      this.advanceEnvironmentTime(elapsed);
    }, 250);
  }

  advanceEnvironmentTime(elapsedMs, persist = true) {
    const rules = this.mapConfig.environmentMadness;
    if (!this.running || this.inputPaused || this.pageHidden || this.mode !== 'OUTDOOR_EXPLORATION' || !rules?.enabled) return 0;
    const intervalMs = Math.max(1, rules.intervalSeconds * 1000);
    this.environmentElapsedMs += Math.max(0, elapsedMs || 0);
    const settlements = Math.floor(this.environmentElapsedMs / intervalMs);
    if (!settlements) {
      if (persist) this.persistExpedition();
      return 0;
    }
    this.environmentElapsedMs -= settlements * intervalMs;
    const beforeMadness = this.player.madness;
    const beforeResistance = this.player.madnessResistance;
    const result = applyEnvironmentalPollution(this.player, rules.amount * settlements, this.config.global.maxMadness);
    const blocked = result.blocked;
    const overflow = result.overflow;
    this.save.highestMadness = Math.max(this.save.highestMadness || 0, this.player.madness);
    if (this.player.madness !== beforeMadness) this.callbacks.onMadnessChange?.(beforeMadness, this.player.madness);
    if (!this.resistanceDepletedNotified && this.player.madnessResistance <= 0 && (beforeResistance > 0 || overflow > 0)) {
      this.resistanceDepletedNotified = true;
      this.callbacks.onAudioEvent?.('resistance_depleted');
      this.setMessage('疯狂抗性已经耗尽，环境污染开始侵蚀你的精神。');
    } else {
      this.setMessage(overflow > 0
        ? `雾蚀穿透抗性：疯狂 +${Math.round(overflow * 100) / 100}。`
        : `雾蚀被疯狂抗性抵消：抗性 -${Math.round(blocked * 100) / 100}。`);
    }
    if (persist) {
      this.persistExpedition();
      this.render();
    }
    return settlements;
  }

  persistExpedition() {
    if ((!this.running && this.turn > 0) || !this.visitedTiles || !this.tiles || !this.monsters || !this.corpses) return;
    this.save.activeExpedition = {
      mapId: this.mapConfig.id, seed: this.seed, turn: this.turn, expeditionStart: clone(this.expeditionStart),
      player: clone(this.player),
      monsters: this.monsters.map((item) => ({ ...item, configId: item.config.id, config: undefined })),
      corpses: this.corpses.map((item) => ({ ...item, configId: item.config.id, config: undefined })),
      visitedTiles: [...this.visitedTiles],
      seenSpawnerIds: [...(this.seenSpawnerIds || [])],
      environmentMadness: {
        elapsedMs: this.environmentElapsedMs,
        resistanceDepletedNotified: this.resistanceDepletedNotified
      },
      sceneMadness: this.sceneMadness,
      randomState: this.random?.getState?.(),
      mapEventState: this.eventService ? {
        triggered: [...this.eventService.triggered],
        count: this.eventService.count,
        lastStep: this.eventService.lastStep
      } : undefined,
      tileMemory: this.tiles.filter((tile) => tile.visibility !== 'unexplored').map((tile) => ({ x: tile.x, y: tile.y, visibility: tile.visibility, rememberedContent: tile.rememberedContent }))
    };
    this.callbacks.onSave?.(this.save);
  }

  restoreExpedition() {
    const snapshot = this.save.activeExpedition;
    if (!snapshot?.player || snapshot.mapId !== this.mapConfig.id) return;
    this.turn = snapshot.turn || 0;
    this.player = { ...this.player, ...clone(snapshot.player), loot: { ...this.player.loot, ...clone(snapshot.player.loot || {}) } };
    this.player.loot.monsterMeat = normalizeMonsterMeat(this.player.loot.monsterMeat, this.config.monsterMeat.maxMadness, 'restored-outdoor-meat');
    this.player.madnessResistance ??= this.save.madnessResistance ?? this.config.player.initialMadnessResistance;
    this.environmentElapsedMs = snapshot.environmentMadness?.elapsedMs || 0;
    this.resistanceDepletedNotified = Boolean(snapshot.environmentMadness?.resistanceDepletedNotified);
    this.lastEnvironmentTickAt = Date.now();
    this.sceneMadness = snapshot.sceneMadness || 0;
    if (Array.isArray(snapshot.monsters)) {
      this.monsters = snapshot.monsters.map((item) => {
        const config = this.config.monsters.find((candidate) => candidate.id === item.configId);
        return {
          ...item,
          config,
          facing: item.facing || (item.lastMove
            ? directionFromDelta(item.lastMove.x || 0, item.lastMove.y || 0)
            : stableDirection(`${snapshot.seed ?? this.seed}:${item.id}:${item.x},${item.y}`)),
          lastSeenPlayerPosition: item.lastSeenPlayerPosition || null,
          spawnTurnsLeft: item.spawnTurnsLeft ?? config?.spawnConfig?.initialDelayTurns ?? 0,
          spawnedTotal: item.spawnedTotal ?? 0
        };
      }).filter((item) => item.config);
    }
    if (Array.isArray(snapshot.corpses)) {
      this.corpses = snapshot.corpses.map((item) => ({ ...item, config: this.config.monsters.find((config) => config.id === item.configId) })).filter((item) => item.config);
    }
    if (Array.isArray(snapshot.visitedTiles)) this.visitedTiles = new Set(snapshot.visitedTiles);
    const rememberedSpawnerIds = (snapshot.tileMemory || []).map((memory) => memory.rememberedContent?.enemy).filter((enemy) => enemy?.isSpawner).map((enemy) => enemy.id);
    this.seenSpawnerIds = new Set(snapshot.seenSpawnerIds || rememberedSpawnerIds);
    this.random?.setState?.(snapshot.randomState);
    if (this.eventService && snapshot.mapEventState) {
      this.eventService.triggered = new Set(snapshot.mapEventState.triggered || []);
      this.eventService.count = snapshot.mapEventState.count ?? 0;
      this.eventService.lastStep = snapshot.mapEventState.lastStep ?? -Infinity;
    }
    for (const memory of snapshot.tileMemory || []) {
      const tile = this.tileAt(memory.x, memory.y);
      if (tile) Object.assign(tile, memory);
    }
    this.message = `已恢复外出记录 · Seed ${this.seed}`;
  }

  consumeHunger(type) {
    if (type !== 'move') return;
    this.player.hunger = clamp(this.player.hunger - (this.config.global.hungerCostPerMove || 0), 0, this.config.global.maxHunger);
    if (this.player.hunger <= 0) this.player.health = clamp(this.player.health - this.config.global.starvationDamagePerAction, 0, this.config.global.maxHealth);
  }

  updateMonster(monster) {
    const cfg = monster.config;
    monster.intent = null;
    if (monster.health <= 0 || cfg.spawnConfig?.enabled) return;
    monster.facing ||= stableDirection(`${this.seed}:${monster.id}:${monster.x},${monster.y}`);
    this.orientMonsterForState(monster);
    if (monster.cooldownTurns > 0) {
      monster.cooldownTurns -= 1;
      if (monster.cooldownTurns === 0) monster.state = cfg.canWander ? 'Wander' : 'Idle';
      return;
    }
    const playerDistance = manhattan(monster, this.player);
    const homeDistance = manhattan(monster, { x: monster.homeX, y: monster.homeY });
    const seesPlayer = this.monsterSeesPlayer(monster);
    if (seesPlayer) monster.lastSeenPlayerPosition = { x: this.player.x, y: this.player.y };
    if (cfg.hostile && cfg.canChase && seesPlayer && homeDistance <= cfg.maxHomeDistance && !['Alert', 'Chase', 'AttackIntent'].includes(monster.state)) {
      monster.state = 'Alert';
      monster.alertTurns = Math.max(1, cfg.alertDuration || 1);
      this.notify('alert', monster, '附近的怪物似乎察觉到了你的存在。');
      return;
    }
    if (monster.state === 'Alert') {
      monster.alertTurns -= 1;
      if (monster.alertTurns <= 0) {
        monster.state = 'Chase';
        this.notify('chase', monster, `危险！${cfg.name}正在接近。`);
      } else return;
    }
    if (['Chase', 'AttackIntent'].includes(monster.state) && (playerDistance > cfg.maxChaseDistance || homeDistance > cfg.maxHomeDistance)) monster.state = cfg.returnHome ? 'Return' : 'Idle';
    const random = this.random || Math.random;
    if (!cfg.canMove || random() > cfg.actionChance) return;
    let target = null;
    if (['Chase', 'AttackIntent'].includes(monster.state)) target = this.bestStepToward(monster, monster.lastSeenPlayerPosition || this.player);
    else if (monster.state === 'Return') {
      target = this.bestStepToward(monster, { x: monster.homeX, y: monster.homeY });
      if (homeDistance === 0) monster.state = cfg.canWander ? 'Wander' : 'Idle';
    } else if (cfg.canWander) {
      monster.state = 'Wander';
      const choices = this.neighbors(monster.x, monster.y).filter((tile) =>
        manhattan(tile, { x: monster.homeX, y: monster.homeY }) <= cfg.wanderRadius
        && (tile.x !== this.player.x || tile.y !== this.player.y));
      target = choices[Math.floor(random() * choices.length)];
    }
    if (!target) return;
    if (target.x === this.player.x && target.y === this.player.y) {
      if (monster.state !== 'AttackIntent') {
        monster.state = 'AttackIntent';
        monster.intent = { action: 'attackPlayer', dx: this.player.x - monster.x, dy: this.player.y - monster.y };
        this.notify('attack-intent', monster, '它盯上你了。下一回合将会接敌。');
        return;
      }
      return this.startBattle(monster, 'enemy');
    }
    if (!this.monsterAt(target.x, target.y)) {
      const previous = { x: monster.x, y: monster.y };
      monster.x = target.x; monster.y = target.y;
      monster.lastMove = { x: target.x - previous.x, y: target.y - previous.y };
      monster.facing = directionFromDelta(monster.lastMove.x, monster.lastMove.y, monster.facing);
      if (cfg.vision?.canDetectAfterMove && this.monsterSeesPlayer(monster)) {
        monster.lastSeenPlayerPosition = { x: this.player.x, y: this.player.y };
        if (cfg.hostile && cfg.canChase && !['Alert', 'Chase', 'AttackIntent'].includes(monster.state)) {
          monster.state = 'Alert';
          monster.alertTurns = Math.max(1, cfg.alertDuration || 1);
          this.notify('alert', monster, '附近的怪物似乎察觉到了你的存在。');
        }
      }
    }
  }

  monsterSeesPlayer(monster) {
    return canEnemySeePlayer(monster, this.player, {
      width: this.mapConfig.width,
      height: this.mapConfig.height,
      tileAt: (x, y) => this.tileAt(x, y)
    });
  }

  orientMonsterForState(monster) {
    const cfg = monster.config;
    if (!cfg.vision?.enabled || !cfg.vision.canRotateBeforeMove) return;
    if (['Alert', 'Cooldown'].includes(monster.state) && monster.lastSeenPlayerPosition) {
      monster.facing = directionToward(monster, monster.lastSeenPlayerPosition, monster.facing);
      return;
    }
    if (['Chase', 'AttackIntent'].includes(monster.state)) {
      monster.facing = directionToward(monster, monster.lastSeenPlayerPosition || this.player, monster.facing);
      return;
    }
    if (monster.state === 'Return') {
      const step = this.bestStepToward(monster, { x: monster.homeX, y: monster.homeY });
      if (step) monster.facing = directionToward(monster, step, monster.facing);
      return;
    }
    if ((monster.state === 'Idle' || monster.state === 'Wander') && cfg.vision.rotateWhenIdle) {
      const random = this.random || Math.random;
      const turn = ['left', 'keep', 'right'][Math.floor(random() * 3)];
      monster.facing = rotateDirection(monster.facing, turn);
    }
  }

  updateSpawners() {
    for (const spawner of [...this.monsters]) {
      const cfg = spawner.config.spawnConfig;
      if (!cfg?.enabled || spawner.health <= 0) continue;
      spawner.spawnTurnsLeft ??= cfg.initialDelayTurns ?? 0;
      spawner.spawnedTotal ??= 0;
      spawner.spawnTurnsLeft -= 1;
      if (spawner.spawnTurnsLeft > 0) continue;
      spawner.spawnTurnsLeft = Math.max(1, cfg.intervalTurns);
      const children = this.monsters.filter((item) => item.spawnedByMonsterId === spawner.id);
      if (children.length >= cfg.maxAliveChildren) continue;
      if (cfg.maxTotalChildren != null && spawner.spawnedTotal >= cfg.maxTotalChildren) continue;
      const childConfig = this.config.monsters.find((item) => item.id === cfg.monsterConfigId);
      const position = childConfig ? this.findSpawnerPosition(spawner, cfg) : null;
      if (!position) continue;
      const child = {
        id: `${childConfig.id}-spawned-${this.turn}-${spawner.spawnedTotal}`, config: childConfig,
        x: position.x, y: position.y, homeX: cfg.childHomeLinkedToSpawner ? spawner.x : position.x,
        homeY: cfg.childHomeLinkedToSpawner ? spawner.y : position.y, health: childConfig.health,
        state: childConfig.canWander ? 'Wander' : 'Idle', cooldownTurns: 0, alertTurns: 0, intent: null,
        facing: stableDirection(`${this.seed}:${childConfig.id}:${position.x},${position.y}:${spawner.spawnedTotal}`),
        lastSeenPlayerPosition: null,
        spawnedByMonsterId: spawner.id, spawnTurnsLeft: childConfig.spawnConfig?.initialDelayTurns ?? 0, spawnedTotal: 0
      };
      this.monsters.push(child);
      spawner.spawnedTotal += 1;
      this.notify('spawn', spawner, '巢穴中爬出了新的生物。');
    }
  }

  findSpawnerPosition(spawner, cfg) {
    const candidates = [];
    for (let y = Math.max(0, spawner.y - cfg.spawnRadiusMax); y <= Math.min(this.mapConfig.height - 1, spawner.y + cfg.spawnRadiusMax); y += 1) {
      for (let x = Math.max(0, spawner.x - cfg.spawnRadiusMax); x <= Math.min(this.mapConfig.width - 1, spawner.x + cfg.spawnRadiusMax); x += 1) {
        const distance = manhattan(spawner, { x, y });
        if (distance < cfg.spawnRadiusMin || distance > cfg.spawnRadiusMax) continue;
        if (!this.tileAt(x, y)?.walkable || this.monsterAt(x, y) || (x === this.player.x && y === this.player.y) || this.extractionAt(x, y)) continue;
        if (!cfg.spawnOnVisibleTile && this.tileAt(x, y).visibility === 'visible') continue;
        candidates.push({ x, y });
      }
    }
    const random = this.random || Math.random;
    return candidates.length ? candidates[Math.floor(random() * candidates.length)] : null;
  }

  notify(type, monster, message) {
    const enabled = type === 'nest-sighted'
      || (type === 'attack-intent' ? this.config.ui.showAttackIntent : this.config.ui.showEnemyAlert);
    if (!enabled) return;
    this.setMessage(message);
    if (['alert', 'chase', 'attack-intent'].includes(type)) this.callbacks.onMilestone?.('enemy_alert');
    this.callbacks.onNotice?.({ type, message, enemy: monster.config.name });
  }

  neighbors(x, y) {
    return [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => this.tileAt(x + dx, y + dy)).filter((tile) => tile?.walkable);
  }

  bestStepToward(entity, target) {
    return this.neighbors(entity.x, entity.y).filter((tile) => !this.monsterAt(tile.x, tile.y)).sort((a, b) => manhattan(a, target) - manhattan(b, target))[0] || null;
  }

  startBattle(monster, initiator) {
    if (this.mode !== 'OUTDOOR_EXPLORATION') return;
    this.mode = this.config.battle.battleTransition ? 'BATTLE_TRANSITION' : 'BATTLE';
    this.callbacks.onMilestone?.('first_battle');
    const playerSpeed = this.config.player.speed || 0;
    const enemySpeed = monster.config.speed || 0;
    const enemyFirst = this.config.battle.useSpeedOrder
      ? enemySpeed > playerSpeed
      : initiator === 'enemy' && this.config.battle.initiatorActsFirst;
    this.battle = { monster, initiator, round: 1, defending: false, enemyFirst, playerTurn: false,
      log: [`遭遇 ${monster.config.name}。`, `速度：你 ${playerSpeed} / 敌人 ${enemySpeed}，${enemyFirst ? '敌人' : '你'}先行动。`] };
    const enter = () => {
      if (!this.battle) return;
      this.mode = 'BATTLE';
      if (enemyFirst) {
        this.battle.log.push('敌人正在行动…');
        this.enemyAttack();
        if (this.player.health <= 0) return this.loseBattle();
      }
      this.battle.playerTurn = true;
      this.emitBattle();
    };
    if (this.config.battle.battleTransition && this.callbacks.onBattleTransition) {
      this.callbacks.onBattleTransition({ enemy: monster.config.name, color: monster.config.color }, enter);
    } else enter();
  }

  battleAction(action) {
    if (this.inputPaused || this.mode !== 'BATTLE' || !this.battle || !this.battle.playerTurn) return;
    this.battle.playerTurn = false;
    if (action === 'attack') {
      const damage = Math.max(1, this.getAttackDamage() - (this.battle.monster.config.defense || 0));
      const beforeHealth = this.battle.monster.health;
      this.battle.monster.health = Math.max(0, this.battle.monster.health - damage);
      const actualDamage = beforeHealth - this.battle.monster.health;
      this.absorbCombatDamage(actualDamage);
      this.battle.log.push(`你造成 ${actualDamage} 点伤害。`);
      if (this.battle.monster.health <= 0) return this.winBattle();
    } else if (action === 'defend') {
      this.battle.defending = true;
      this.battle.log.push('你收紧架势，准备承受攻击。');
    } else if (action === 'eat') {
      if (!this.config.battle.allowFoodInBattle || this.player.loot.monsterMeat.length <= 0) {
        this.battle.log.push('没有可以在战斗中食用的怪物肉。'); return this.emitBattle();
      }
      const eaten = this.eatMonsterMeat();
      this.battle.log.push(`你吞下异变肉块，恢复 ${this.config.foods.find((item) => item.id === 'monster_meat').healthRestore} 点生命，疯狂 +${eaten.currentMadness}。`);
    } else if (action === 'escape') {
      const random = this.random || Math.random;
      if (random() <= this.config.battle.baseEscapeChance) return this.escapeBattle();
      this.battle.log.push('逃跑失败。');
      if (!this.config.battle.failedEscapeEnemyAttack) return this.finishBattleRound();
    }
    if (!this.battle.enemyFirst) this.enemyAttack();
    this.finishBattleRound();
  }

  enemyAttack() {
    if ((this.battle.monster.config.attack || 0) <= 0) {
      this.battle.log.push(`${this.battle.monster.config.name}正在蠕动。`);
      this.battle.defending = false;
      return;
    }
    const gear = this.getEquipmentStats();
    const wasDefending = this.battle.defending;
    const reduction = wasDefending ? this.config.battle.defenseDamageReduction : 0;
    const raw = Math.max(1, this.battle.monster.config.attack - gear.defense);
    const damage = Math.max(1, Math.round(raw * (1 - reduction)));
    const beforeHealth = this.player.health;
    this.player.health = Math.max(0, this.player.health - damage);
    const actualDamage = beforeHealth - this.player.health;
    this.callbacks.onAudioEvent?.(wasDefending ? 'defend' : 'hurt');
    this.absorbCombatDamage(actualDamage);
    this.battle.log.push(`${this.battle.monster.config.name}造成 ${actualDamage} 点伤害。`);
    this.battle.defending = false;
  }

  finishBattleRound() {
    this.consumeHunger('battle');
    if (this.player.health <= 0) return this.loseBattle();
    this.battle.round += 1;
    if (this.battle.enemyFirst) {
      this.battle.log.push('敌人正在行动…');
      this.enemyAttack();
      if (this.player.health <= 0) return this.loseBattle();
    }
    this.battle.playerTurn = true;
    this.emitBattle();
  }

  winBattle() {
    const monster = this.battle.monster;
    this.monsters = this.monsters.filter((item) => item !== monster);
    this.save.enemiesKilled = (this.save.enemiesKilled || 0) + 1;
    if (monster.config.spawnConfig?.enabled) this.save.nestsDestroyed = (this.save.nestsDestroyed || 0) + 1;
    this.corpses.push({ id: `corpse-${monster.id}`, x: monster.x, y: monster.y, config: monster.config, harvested: false });
    if (this.config.battle.victoryPlayerMovesIntoEnemyTile) { this.player.x = monster.x; this.player.y = monster.y; }
    const finish = () => {
      this.mode = 'OUTDOOR_EXPLORATION'; this.battle = null;
      this.setMessage(monster.config.spawnConfig?.enabled ? '巢穴停止了蠕动。尸体可以切割。' : `${monster.config.name}倒下了。尸体就在脚下，可以切割。`);
      this.callbacks.onMilestone?.('first_harvest');
      this.updateVision(); this.persistExpedition(); this.render();
    };
    if (this.callbacks.onBattleResult) this.callbacks.onBattleResult({ type: 'victory', title: `击败 ${monster.config.name}`, detail: '尸体已留下，可以进行切割。' }, finish);
    else finish();
  }

  loseBattle() {
    const finish = () => { this.battle = null; this.failExpedition('combat'); };
    if (this.callbacks.onBattleResult) this.callbacks.onBattleResult({ type: 'defeat', title: '外出失败', detail: '你倒在了雾中。' }, finish);
    else finish();
  }

  escapeBattle() {
    const monster = this.battle.monster;
    monster.cooldownTurns = monster.config.disengageCooldownTurns;
    monster.state = 'Cooldown';
    const finish = () => {
      this.mode = 'OUTDOOR_EXPLORATION'; this.battle = null;
      this.setMessage(`你逃回接敌前的位置，${monster.config.name}暂时没有追来。`);
      this.updateVision(); this.persistExpedition(); this.render();
    };
    if (this.callbacks.onBattleResult) this.callbacks.onBattleResult({ type: 'escaped', title: '逃跑成功', detail: '敌人暂时失去了战斗意志。' }, finish);
    else finish();
  }

  emitBattle() {
    if (this.player.health <= 0) return this.loseBattle();
    this.callbacks.onBattle?.(this.getBattleView(), (action) => this.battleAction(action));
  }

  eatMonsterMeat() {
    const food = this.config.foods.find((item) => item.id === 'monster_meat');
    const consumed = consumeLeastCorruptedMeat(this.player.loot.monsterMeat);
    if (!consumed.meat) return null;
    this.player.loot.monsterMeat = consumed.remaining;
    this.save.totalMonsterMeatConsumed = (this.save.totalMonsterMeatConsumed || 0) + 1;
    this.player.health = clamp(this.player.health + food.healthRestore, 0, this.config.global.maxHealth);
    this.player.hunger = clamp(this.player.hunger + food.hungerRestore, 0, this.config.global.maxHunger);
    this.changeMadness(consumed.meat.currentMadness);
    return consumed.meat;
  }

  absorbCombatDamage(amount) {
    this.sceneMadness = Math.round((this.sceneMadness + Math.max(0, amount || 0)) * 10000) / 10000;
  }

  changeMadness(value) {
    const before = this.player.madness;
    this.player.madness = clamp(this.player.madness + value, 0, this.config.global.maxMadness);
    this.save.highestMadness = Math.max(this.save.highestMadness || 0, this.player.madness);
    this.callbacks.onMadnessChange?.(before, this.player.madness);
  }

  getEquipmentStats() {
    return this.config.equipment.filter((item) => item.defaultEquipped).reduce((stats, item) => ({
      attack: stats.attack + (item.attack || 0), defense: stats.defense + (item.defense || 0),
      harvestYield: stats.harvestYield * (item.harvestYieldMultiplier || 1)
    }), { attack: 0, defense: 0, harvestYield: 1 });
  }

  getMadnessStage() {
    return this.config.madnessStages.find((stage) => this.player.madness >= stage.min && this.player.madness <= stage.max) || this.config.madnessStages.at(-1);
  }

  getAttackDamage() {
    const gear = this.getEquipmentStats();
    return Math.round((this.config.player.baseAttack + gear.attack) * this.getMadnessStage().attackMultiplier);
  }

  getBattleView() {
    return {
      round: this.battle.round, initiator: this.battle.initiator,
      phase: this.battle.playerTurn ? 'player' : 'enemy',
      player: {
        health: Math.round(this.player.health), maxHealth: this.config.global.maxHealth,
        hunger: Math.round(this.player.hunger), madness: Math.round(this.player.madness * 100) / 100,
        madnessResistance: Math.round(this.player.madnessResistance * 100) / 100,
        attack: this.getAttackDamage(), speed: this.config.player.speed,
        meat: this.player.loot.monsterMeat.length,
        meatMadness: this.player.loot.monsterMeat.length ? Math.min(...this.player.loot.monsterMeat.map((meat) => meat.currentMadness)) : 0
      },
      enemy: { name: this.battle.monster.config.name, health: this.battle.monster.health, maxHealth: this.battle.monster.config.health, attack: this.battle.monster.config.attack, speed: this.battle.monster.config.speed, color: this.battle.monster.config.color },
      actions: this.config.battle.playerActions,
      log: this.battle.log.slice(-5)
    };
  }

  getHud() {
    return { health: Math.round(this.player.health), hunger: Math.round(this.player.hunger), madness: Math.round(this.player.madness * 100) / 100, madnessResistance: Math.round(this.player.madnessResistance * 100) / 100, madnessState: this.getMadnessStage().state, attack: this.getAttackDamage(), meat: this.player.loot.monsterMeat.length, sceneMadness: this.sceneMadness, turn: this.turn, message: this.message, position: `${this.player.x},${this.player.y}`, interaction: this.getInteraction() };
  }

  setMessage(message) { this.message = message; }

  succeedExpedition() {
    const summary = this.getExpeditionSummary();
    const returnedMeat = this.player.loot.monsterMeat.length;
    this.save.monsterMeat = [...this.save.monsterMeat, ...clone(this.player.loot.monsterMeat)];
    this.save.successfulExtractions = (this.save.successfulExtractions || 0) + 1;
    this.save.totalMonsterMeatReturned = (this.save.totalMonsterMeatReturned || 0) + returnedMeat;
    this.save.madness = this.player.madness;
    this.save.madnessResistance = this.player.madnessResistance;
    this.save.health = Math.round(this.player.health);
    this.advanceFarm(); this.save.expeditions += 1;
    this.save.lastResult = { success: true, meat: returnedMeat, summary, viewed: false };
    this.save.activeExpedition = null;
    this.callbacks.onAudioEvent?.('extract_success');
    this.stop(); this.callbacks.onComplete?.(this.save, true);
  }

  failExpedition(reason = this.player.hunger <= 0 ? 'starvation' : 'other') {
    if (!this.running) return;
    if (reason !== 'combat') this.callbacks.onAudioEvent?.('failure');
    if (this.config.global.keepMadnessOnDeath) this.save.madness = this.player.madness;
    this.save.madnessResistance = this.player.madnessResistance;
    this.save.health = this.config.player.health;
    this.advanceFarm(); this.save.expeditions += 1;
    this.save.expeditionFailures = (this.save.expeditionFailures || 0) + 1;
    const carriedMeat = this.player.loot.monsterMeat.length;
    const lostMeat = this.config.global.loseLootOnDeath ? carriedMeat : 0;
    this.save.lastResult = { success: false, meat: this.config.global.loseLootOnDeath ? 0 : carriedMeat, lostMeat, reason, summary: this.getExpeditionSummary(), viewed: false };
    this.save.activeExpedition = null;
    if (!this.config.global.loseLootOnDeath) this.save.monsterMeat = [...this.save.monsterMeat, ...clone(this.player.loot.monsterMeat)];
    this.stop(); this.callbacks.onComplete?.(this.save, false);
  }

  getExpeditionSummary() {
    const start = this.expeditionStart || {};
    return {
      turns: this.turn,
      exploredTiles: this.visitedTiles?.size || 0,
      kills: Math.max(0, (this.save.enemiesKilled || 0) - (start.enemiesKilled || 0)),
      nestsDestroyed: Math.max(0, (this.save.nestsDestroyed || 0) - (start.nestsDestroyed || 0)),
      meatCollected: this.player.loot.monsterMeat.length + Math.max(0, (this.save.totalMonsterMeatConsumed || 0) - (start.monsterMeatConsumed || 0)),
      meatConsumed: Math.max(0, (this.save.totalMonsterMeatConsumed || 0) - (start.monsterMeatConsumed || 0)),
      madnessDelta: Math.round((this.player.madness - (start.madness || 0)) * 100) / 100,
      resistanceRemaining: Math.round(this.player.madnessResistance * 100) / 100,
      sceneMadness: this.sceneMadness
    };
  }

  advanceFarm() {
    if (this.save.farm.planted) this.save.farm.cyclesLeft = Math.max(0, this.save.farm.cyclesLeft - 1);
  }

  render() {
    if (!this.running || this.mode !== 'OUTDOOR_EXPLORATION') return;
    const ctx = this.ctx, size = this.tileSize, fog = this.mapConfig.fogOfWar;
    ctx.fillStyle = '#080d0c'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const camera = this.getCamera();
    const viewportTiles = this.tiles.filter((tile) => tile.x >= camera.x && tile.y >= camera.y && tile.x < camera.x + this.viewWidth && tile.y < camera.y + this.viewHeight);
    viewportTiles.forEach((tile) => {
      const px = (tile.x - camera.x) * size, py = (tile.y - camera.y) * size;
      this.drawTerrainArt(px, py, size, tile);
    });
    this.drawSubtleGrid(camera, viewportTiles);
    this.drawEnemyVisionCones(camera);
    viewportTiles.forEach((tile) => {
      const px = (tile.x - camera.x) * size, py = (tile.y - camera.y) * size;
      const content = tile.visibility === 'visible' ? this.contentAt(tile.x, tile.y) : tile.rememberedContent;
      const memory = tile.visibility === 'explored';
      if (content?.extract) this.drawExtract(px, py, size, memory);
      if (content?.corpse && (tile.visibility === 'visible' || fog.showCorpseMemory)) this.drawCorpse(px, py, size, memory);
      if (content?.enemy && (tile.visibility === 'visible' || fog.showEnemyMemory)) this.drawEnemy(px, py, size, content.enemy, memory);
      if (memory) {
        ctx.fillStyle = `rgba(2,6,5,${1 - fog.exploredBrightness})`;
        ctx.fillRect(px, py, size, size);
      }
    });
    this.drawFog(camera, viewportTiles);
    this.drawPlayer(camera);
    this.callbacks.onHud?.(this.getHud());
  }

  drawTerrainArt(px, py, size, tile) {
  const image = tile.walkable ? this.art.ground : this.art.obstacle;
  if (!drawImageCover(this.ctx, image, px, py, size, size, tile.walkable ? 1 : .96)) {
    this.ctx.fillStyle = tile.walkable ? '#30382f' : '#1b211d'; this.ctx.fillRect(px, py, size, size);
  }
  if (tile.walkable) {
    const variation = (seededFogJitter(tile.x, tile.y) + 1) * .5;
    this.ctx.fillStyle = `rgba(11,15,12,${.08 + variation * .09})`; this.ctx.fillRect(px, py, size, size);
  }
}

  drawGroundTexture(px, py, size, tile) {
    if (!tile.walkable) return;
    const ctx = this.ctx;
    const noise = seededFogJitter(tile.x, tile.y);
    ctx.fillStyle = noise > .25 ? 'rgba(122,143,112,.035)' : 'rgba(12,22,18,.035)';
    ctx.beginPath();
    ctx.ellipse(px + size * (.34 + noise * .08), py + size * .58, size * .34, size * .12, noise * .8, 0, Math.PI * 2);
    ctx.fill();
  }

  drawSubtleGrid(camera, tiles) {
    const ctx = this.ctx, size = this.tileSize;
    ctx.save();
    ctx.strokeStyle = 'rgba(157,177,166,.12)';
    ctx.lineWidth = Math.max(.55, size / 42);
    ctx.setLineDash([Math.max(1.5, size * .08), Math.max(3, size * .15)]);
    ctx.beginPath();
    for (const tile of tiles) {
      const px = (tile.x - camera.x) * size, py = (tile.y - camera.y) * size;
      const east = this.tileAt(tile.x + 1, tile.y);
      const south = this.tileAt(tile.x, tile.y + 1);
      if (tile.x < camera.x + this.viewWidth - 1 && shouldDrawGridEdge(tile, east)) {
        ctx.moveTo(px + size, py + 2); ctx.lineTo(px + size, py + size - 2);
      }
      if (tile.y < camera.y + this.viewHeight - 1 && shouldDrawGridEdge(tile, south)) {
        ctx.moveTo(px + 2, py + size); ctx.lineTo(px + size - 2, py + size);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  drawEnemyVisionCones(camera) {
    if (this.config.ui.showEnemyVision === false) return;
    const ctx = this.ctx, size = this.tileSize;
    const map = { width: this.mapConfig.width, height: this.mapConfig.height, tileAt: (x, y) => this.tileAt(x, y) };
    for (const enemy of this.monsters) {
      if (enemy.health <= 0 || enemy.config.spawnConfig?.enabled || !enemy.config.vision?.enabled) continue;
      if (this.tileAt(enemy.x, enemy.y)?.visibility !== 'visible') continue;
      const cells = getVisionCells(enemy, enemy.facing, enemy.config.vision, map)
        .filter((cell) => this.tileAt(cell.x, cell.y)?.visibility !== 'unexplored');
      if (!cells.length) continue;
      const centerX = (enemy.x - camera.x + .5) * size;
      const centerY = (enemy.y - camera.y + .5) * size;
      const radius = (enemy.config.vision.range + .48) * size;
      const angle = directionAngle(enemy.facing);
      const half = Math.min(359.8, Math.max(1, enemy.config.vision.angle)) * Math.PI / 360;
      const palette = visionPalette(visionTone(enemy.state));
      ctx.save();
      ctx.beginPath();
      for (const cell of cells) {
        const px = (cell.x - camera.x) * size, py = (cell.y - camera.y) * size;
        ctx.rect(px - 1, py - 1, size + 2, size + 2);
      }
      ctx.clip();
      const gradient = ctx.createRadialGradient(centerX, centerY, size * .18, centerX, centerY, radius);
      gradient.addColorStop(0, palette.core); gradient.addColorStop(.72, palette.core); gradient.addColorStop(1, palette.edge);
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, angle - half, angle + half);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = palette.line; ctx.lineWidth = Math.max(1, size * .035); ctx.setLineDash([size * .18, size * .12]);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawFog(camera, tiles) {
  const ctx = this.ctx, size = this.tileSize;
  for (const tile of tiles) {
    if (tile.visibility !== 'unexplored') continue;
    const px = (tile.x - camera.x) * size, py = (tile.y - camera.y) * size;
    if (!drawImageCover(ctx, this.art.fog, px - 2, py - 2, size + 4, size + 4, .97)) {
      ctx.fillStyle = '#050807'; ctx.fillRect(px, py, size, size);
    }
  }
}

drawEnemy(px, py, size, enemy, memory) {
    const ctx = this.ctx; ctx.save(); ctx.globalAlpha = memory ? .42 : 1;
    ctx.fillStyle = enemy.color; ctx.beginPath();
    if (enemy.isSpawner) {
      ctx.moveTo(px + size * .5, py + size * .15);
      for (let index = 1; index < 10; index += 1) {
        const angle = -Math.PI / 2 + index * Math.PI * 2 / 10;
        const radius = index % 2 ? size * .2 : size * .34;
        ctx.lineTo(px + size * .5 + Math.cos(angle) * radius, py + size * .5 + Math.sin(angle) * radius);
      }
      ctx.closePath(); ctx.fill();
    } else { ctx.arc(px + size / 2, py + size / 2, size * .25, 0, Math.PI * 2); ctx.fill(); }
    if (!memory && enemy.visionEnabled && !enemy.isSpawner) {
      const angle = directionAngle(enemy.facing);
      const centerX = px + size / 2, centerY = py + size / 2;
      ctx.translate(centerX, centerY); ctx.rotate(angle);
      ctx.fillStyle = '#f4ecd4'; ctx.beginPath();
      ctx.moveTo(size * .39, 0); ctx.lineTo(size * .17, -size * .09); ctx.lineTo(size * .17, size * .09);
      ctx.closePath(); ctx.fill();
      ctx.rotate(-angle); ctx.translate(-centerX, -centerY);
    }
    if (!memory && ['Alert', 'Chase', 'AttackIntent'].includes(enemy.state)) {
      ctx.fillStyle = enemy.state === 'AttackIntent' ? '#ff5f5f' : '#f5d078';
      ctx.font = `700 ${size * .42}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(enemy.state === 'Alert' ? '!' : enemy.state === 'AttackIntent' ? '⚠' : '↓', px + size / 2, py + size * .24);
    }
    if (memory) { ctx.fillStyle = '#e5d5a1'; ctx.font = `${size * .35}px serif`; ctx.textAlign = 'center'; ctx.fillText('?', px + size * .75, py + size * .35); }
    ctx.restore();
  }

  getVisibleEnemyVision() {
    const result = new Map();
    if (this.config.ui.showEnemyVision === false) return result;
    const map = {
      width: this.mapConfig.width,
      height: this.mapConfig.height,
      tileAt: (x, y) => this.tileAt(x, y)
    };
    for (const monster of this.monsters) {
      if (monster.health <= 0 || monster.config.spawnConfig?.enabled || !monster.config.vision?.enabled) continue;
      if (this.tileAt(monster.x, monster.y)?.visibility !== 'visible') continue;
      const tone = ['Chase', 'AttackIntent'].includes(monster.state) ? 'danger'
        : monster.state === 'Alert' ? 'alert'
          : monster.state === 'Cooldown' ? 'cooldown'
            : 'normal';
      for (const cell of getVisionCells(monster, monster.facing, monster.config.vision, map)) {
        if (this.tileAt(cell.x, cell.y)?.visibility === 'unexplored') continue;
        const key = keyOf(cell.x, cell.y);
        if (!result.has(key) || tone === 'danger') result.set(key, tone);
      }
    }
    return result;
  }

  drawCorpse(px, py, size, memory) {
  const alpha = memory ? .36 : .92;
  if (!drawImageCover(this.ctx, this.art.corpse, px + size * .02, py + size * .18, size * .96, size * .72, alpha)) {
    this.ctx.fillStyle = '#55473b'; this.ctx.fillRect(px + size * .2, py + size * .42, size * .6, size * .18);
  }
}

drawExtract(px, py, size, memory) {
    const ctx = this.ctx; ctx.save(); ctx.globalAlpha = memory ? .55 : 1; ctx.strokeStyle = '#b7f4d3'; ctx.lineWidth = 2;
    ctx.strokeRect(px + 5, py + 5, size - 10, size - 10); ctx.restore();
  }

  getCamera() {
    return {
      x: clamp(this.player.x - Math.floor(this.viewWidth / 2), 0, Math.max(0, this.mapConfig.width - this.viewWidth)),
      y: clamp(this.player.y - Math.floor(this.viewHeight / 2), 0, Math.max(0, this.mapConfig.height - this.viewHeight))
    };
  }

  drawPlayer(camera) {
  const ctx = this.ctx, size = this.tileSize, px = (this.player.x - camera.x) * size, py = (this.player.y - camera.y) * size;
  ctx.save();
  ctx.shadowColor = 'rgba(218,205,157,.35)'; ctx.shadowBlur = Math.max(4, size * .22);
  if (!drawImageCover(ctx, this.art.player, px - size * .05, py - size * .16, size * 1.1, size * 1.18, 1)) {
    ctx.fillStyle = '#d9d0ae'; ctx.fillRect(px + size * .3, py + size * .18, size * .4, size * .64);
  }
  ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(214,194,132,.65)'; ctx.lineWidth = Math.max(1, size * .035); ctx.strokeRect(px + 2, py + 2, size - 4, size - 4); ctx.restore();
}
}
