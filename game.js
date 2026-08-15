import { ConfigService, SAVE_STORAGE_KEY, createInitialSave, loadSave, persistSave } from './src/config/config-service.js';
import { GridExplorationRuntime } from './src/game-runtime.js';
import { GoalService } from './src/systems/goal-service.js';
import { MadnessPresentationService } from './src/systems/madness-presentation.js';
import { AudioService } from './src/systems/audio-service.js';
import { trimMapToBounds } from './src/systems/map-generation.js';
import { TutorialService } from './src/systems/tutorial-service.js';
import {
  consumeLeastCorruptedMeat,
  formatResource,
  getMeatPurificationPreview,
  getResistanceRestorePreview,
  purifyMonsterMeat,
  restoreResistance
} from './src/systems/madness-resources.js';

const app = document.querySelector('#app');
const fileInput = document.querySelector('#config-file');
const configService = new ConfigService();
let config = configService.loadActiveConfig();
let save = loadSave(config);
let runtime = null;
let configDraft = structuredClone(config);
let activeCategory = 'global';
let goalService = new GoalService(config);
let madnessPresentation = new MadnessPresentationService(config);
let audioService = new AudioService(config);
let tutorialService = new TutorialService(save, persistSave);
let tutorialQueue = [];
let playtestState = null;
let importTarget = 'config';
let mapEditorTool = 'select';
let mapEditorSelection = null;
let mapAreaAnchor = null;
const mapEditorHistory = { undo: [], redo: [] };
addEventListener('pointerdown', () => audioService.unlock(), { once: true });
addEventListener('keydown', () => audioService.unlock(), { once: true });
document.addEventListener('visibilitychange', () => runtime?.setPageHidden(document.hidden));

const labels = {
  global: '全局规则', player: '玩家', monsters: '怪物', foods: '食物', monsterMeat: '怪物肉', relic: '圣遗物', madnessStages: '疯狂阶段',
  equipment: '装备', maps: '地图数据', mapEditor: '地图编辑', farming: '种植', shelter: '庇护所', ui: '界面反馈', speed: '速度',
  maxHealth: '最大生命', maxHunger: '最大饥饿', maxMadness: '最大疯狂', hungerDrainPerSecond: '每秒饥饿消耗',
  starvationDamagePerSecond: '饥饿伤害/秒', extractDuration: '撤离读条（秒）', loseLootOnDeath: '死亡丢失本局资源',
  keepEquipmentOnDeath: '死亡保留装备', keepMadnessOnDeath: '死亡保留疯狂', enableShelterFarming: '启用庇护所种植',
  enableOutdoorFarming: '启用户外种植', health: '生命', hunger: '饥饿', madness: '疯狂', radius: '碰撞半径',
  moveSpeed: '移动速度', baseAttack: '基础攻击', attackRange: '攻击距离', attackCooldown: '攻击间隔',
  invulnerableDuration: '受击无敌时间', inventoryCapacity: '背包容量', harvestSpeedMultiplier: '切割速度倍率',
  harvestYieldMultiplier: '切割产量倍率', id: '配置 ID', name: '显示名称', color: '颜色', attack: '攻击力',
  defense: '防御力', canMove: '允许移动', canWander: '允许游荡', wanderRadius: '游荡半径', wanderInterval: '游荡间隔',
  wanderSpeedMultiplier: '游荡速度倍率', hostile: '主动敌对', detectRadius: '感知距离', loseTargetRadius: '丢失目标距离',
  loseTargetDelay: '丢失等待时间', canChase: '允许追踪', maxChaseDistance: '最大追踪距离',
  maxHomeDistance: '最大离家距离', chaseSpeedMultiplier: '追踪速度倍率', returnHome: '返回出生点',
  returnSpeedMultiplier: '返回速度倍率', canHarvest: '可切割', harvestDuration: '切割时间', meatYield: '基础肉量',
  carriedLoot: '携带物掉落表', type: '类型', healthRestore: '恢复生命', hungerRestore: '恢复饥饿', madnessGain: '增加疯狂',
  allowOutdoor: '户外可食用', allowShelter: '庇护所可食用', maxStack: '最大堆叠', min: '最小值', max: '最大值',
  attackMultiplier: '攻击倍率', state: '状态名', effectIntensity: '视觉强度', slot: '装备槽', attackSpeedMultiplier: '攻速倍率',
  attackRangeBonus: '攻击距离加成', defaultEquipped: '默认装备', width: '宽度', height: '高度', playerSpawn: '玩家出生点',
  extractPoint: '撤离点', monsterSpawns: '怪物出生点', monsterId: '怪物 ID', count: '数量', spread: '散布范围',
  obstacles: '障碍物', x: 'X', y: 'Y', growthCycles: '生长周期（外出次数）', seedCost: '播种消耗',
  yieldItem: '产出物 ID', yieldCount: '产出数量', allowShelter: '允许庇护所种植', initialSafeFood: '初始安全食物',
  initialMonsterMeat: '初始怪物肉', battle: '回合制战斗', fogOfWar: '战争迷雾', visionRadius: '视野半径', shape: '视野形状',
  terrainBlocksVision: '地形遮挡视野', exploredBrightness: '已探索亮度', showEnemyMemory: '显示敌人记忆', showCorpseMemory: '显示尸体记忆',
  allowDiagonalMove: '允许斜向移动', requiredTurns: '所需行动回合', actionChance: '每回合行动概率', maxMovesPerTurn: '每回合最大移动格',
  detectRange: '旧版感知距离', vision: '方向视野', range: '视野距离', angle: '视野夹角',
  rotateWhenIdle: '静止时转向', canRotateBeforeMove: '移动前观察', canDetectAfterMove: '移动后观察',
  disengageCooldownTurns: '脱战冷却回合', harvestTurns: '切割回合', playerActions: '玩家行动',
  initiatorActsFirst: '主动接敌方先手', baseEscapeChance: '基础逃跑概率', failedEscapeEnemyAttack: '逃跑失败立即受击',
  defenseDamageReduction: '防御减伤比例', allowFoodInBattle: '战斗中允许食物', victoryPlayerMovesIntoEnemyTile: '胜利后进入敌人格',
  hungerCostPerMove: '移动饥饿消耗', starvationDamagePerAction: '饥饿伤害/移动', alertDuration: '警觉持续回合',
  attackIntentRange: '攻击意图距离', useSpeedOrder: '按速度决定先手', battleTransition: '启用战斗转场', battleResultDelay: '结果展示秒数',
  showEnemyAlert: '显示敌人发现提示', showAttackIntent: '显示攻击意图', showEnemyVision: '显示敌人视野',
  highlightInteract: '高亮可交互操作',
  demoGoal: 'Demo 目标', requiredExtractions: '目标撤离次数', requiredMonsterMeat: '目标带回肉量', maxExpeditionFailures: '最大失败次数',
  madnessPresentation: '疯狂表现', showStageMessages: '阶段变化提示', showWhispers: '显示低语', enableEdgeVignette: '边缘暗影', enableUiPulse: 'UI 脉动', enableUiJitter: 'UI 轻微偏移', reducedMotion: '减少动态效果',
  mapEvents: '地图事件规则', events: '地图事件内容', triggerChancePerNewTile: '新格触发概率', maxEventsPerExpedition: '单次事件上限', minStepsBetweenEvents: '事件最小间隔',
  audio: '音频', masterVolume: '主音量', bgmVolume: 'BGM 音量', sfxVolume: '音效音量', muted: '静音', enabled: '启用',
  extractionPoints: '撤离点列表', randomSpawnRules: '随机布点规则', random: '随机种子', useFixedSeed: '使用固定 Seed', seed: 'Seed',
  enabled: '启用', minCount: '最少数量', maxCount: '最多数量', allowedArea: '允许区域', minDistanceFromPlayerSpawn: '距玩家最小距离',
  minDistanceFromExtraction: '距撤离点最小距离', minDistanceBetweenSameType: '同类最小距离', minDistanceBetweenAnyMonster: '怪物最小距离', placementAttempts: '尝试次数',
  spawnConfig: '产出设置', monsterConfigId: '怪物配置 ID', intervalTurns: '产出间隔回合', initialDelayTurns: '首次产出延迟',
  maxAliveChildren: '存活子怪上限', maxTotalChildren: '总产出上限', spawnRadiusMin: '最小产出半径', spawnRadiusMax: '最大产出半径',
  spawnOnVisibleTile: '允许在视野内产出', requireWalkableTile: '要求可通行格', childHomeLinkedToSpawner: '子怪以巢穴为 Home',
  maxMadnessResistance: '最大疯狂抗性', initialMadnessResistance: '初始疯狂抗性', environmentMadness: '环境污染',
  amount: '每次污染值', intervalSeconds: '污染间隔（秒）', maxMadness: '最大疯狂值', maxPurification: '最大净化值', initialPurification: '初始净化值',
  resistanceRestoreCostMultiplier: '抗性恢复消耗倍率', meatPurificationCostMultiplier: '肉净化消耗倍率', protectsShelter: '维持庇护屏障'
};

function button(label, action, className = '', disabled = false) {
  return `<button class="${className}" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
}

function bindActions(root, actions) {
  root.querySelectorAll('[data-action]').forEach((element) => {
    element.addEventListener('click', () => actions[element.dataset.action]?.(element));
  });
}

function renderMain() {
  runtime?.stop(); runtime = null;
  app.innerHTML = `
    <section class="menu-screen">
      <div class="menu-fog"></div>
      <div class="menu-copy">
        <p class="eyebrow">A LIGHT EXTRACTION SURVIVAL</p>
        <h1>污染边境</h1>
        <p class="tagline">活下去，需要吃掉一些不该入口的东西。</p>
        <div class="menu-actions">
          ${button('开始游戏', 'start', 'primary')}
          ${save.expeditions || save.introSeen ? button('继续游戏', 'continue') : ''}
          ${button('配置', 'config')}
          ${button('关于', 'about', 'ghost')}
          ${save.expeditions || save.introSeen ? button('重置存档', 'reset-save', 'ghost danger') : ''}
        </div>
        <p class="version">V3.0.0-dev · Expedition Rebuild</p>
      </div>
      <aside class="menu-note">
        <span>生存守则 01</span>
        <strong>安全食物让你保持清醒。</strong>
        <strong>怪物肉让你变得更强。</strong>
      </aside>
    </section>`;
  bindActions(app, { start: renderShelter, continue: renderShelter, config: renderConfig, about: renderAbout,
    'reset-save': () => { if (confirm('确定清空当前存档并重新开始？')) { localStorage.removeItem(SAVE_STORAGE_KEY); save = createInitialSave(config); renderMain(); } }
  });
}

function renderAbout() {
  showModal('关于《污染边境》', '一个关于生存、饥饿与污染的轻量搜打撤原型。\n\n安全食物让你保持清醒；怪物肉让你活下去，也让你变得更强。', [{ label: '返回', action: closeModal }]);
}

function madnessStage(value) {
  return config.madnessStages.find((stage) => value >= stage.min && value <= stage.max) || config.madnessStages.at(-1);
}

function renderShelter() {
  audioService.dispose();
  config = configService.loadActiveConfig();
  goalService = new GoalService(config); madnessPresentation = new MadnessPresentationService(config); audioService = new AudioService(config);
  tutorialService = new TutorialService(save, persistSave);
  const crop = config.farming[0];
  const stage = madnessStage(save.madness);
  const meatCount = save.monsterMeat.length;
  const purifiedMeat = save.monsterMeat.filter((meat) => meat.currentMadness <= 0).length;
  const meatPollution = save.monsterMeat.reduce((sum, meat) => sum + meat.currentMadness, 0);
  const lowestMeatMadness = meatCount ? Math.min(...save.monsterMeat.map((meat) => meat.currentMadness)) : 0;
  const relicEnabled = config.relic.enabled !== false;
  const restorePreview = getResistanceRestorePreview(save, config.relic.resistanceRestoreCostMultiplier);
  const contaminatedMeat = save.monsterMeat.filter((meat) => meat.currentMadness > 0);
  const farmText = !save.farm.planted ? '空置' : save.farm.cyclesLeft > 0 ? `生长中 · 还需 ${save.farm.cyclesLeft} 次外出` : '可以收获';
  const result = save.lastResult ? `<div class="result ${save.lastResult.success ? 'success' : 'failure'}">${save.lastResult.success ? `上次成功撤离，带回 ${save.lastResult.meat} 份肉` : '上次外出失败，临时搜集物已丢失'}</div>` : '';
  const progress = goalService.progress(save), goal = config.demoGoal;
  app.innerHTML = `
    <section class="shelter-screen">
      <header class="topbar"><div><span class="eyebrow">SHELTER</span><h2>地下庇护所</h2></div>${button('返回主菜单', 'menu', 'ghost')}</header>
      ${result}
      <div class="shelter-grid">
        <article class="panel status-panel">
          <span class="panel-kicker">幸存者</span><h3>出发前状态</h3>
          <div class="stat-row"><span>生命</span><strong>${save.health} / ${config.global.maxHealth}</strong></div>
          <div class="stat-row"><span>疯狂抗性</span><strong>${formatResource(save.madnessResistance)} / ${formatResource(save.maxMadnessResistance)}</strong></div>
          <div class="stat-row"><span>疯狂</span><strong>${save.madness} / ${config.global.maxMadness}</strong></div>
          <div class="meter madness"><i style="width:${save.madness}%"></i></div>
          <p class="state-copy">${stage.state} · 攻击倍率 ×${stage.attackMultiplier}</p>
          <div class="equipment-list">${config.equipment.filter((item) => item.defaultEquipped).map((item) => `<div><span>${item.slot === 'weapon' ? '武器' : '防护'}</span><strong>${item.name}</strong></div>`).join('')}</div>
        </article>
        <article class="panel pantry-panel">
          <span class="panel-kicker">仓储</span><h3>食物库存</h3>
          <div class="resource"><span class="resource-icon safe"></span><div><strong>储备粮 × ${save.safeFood}</strong><small>安全，不增加疯狂</small></div>${button('食用', 'eat-safe', 'small')}</div>
          <div class="resource"><span class="resource-icon meat"></span><div><strong>异变肉块 × ${meatCount}</strong><small>已净化 ${purifiedMeat} · 剩余污染 ${formatResource(meatPollution)}</small></div>${button(`食用最低污染（疯狂 +${formatResource(lowestMeatMadness)}）`, 'eat-meat', 'small danger', meatCount <= 0)}</div>
        </article>
        <article class="panel relic-panel">
          <span class="panel-kicker">SANCTUARY RELIC</span><h3>${config.relic.name}</h3>
          <div class="relic-visual" aria-hidden="true"><i></i></div>
          <div class="stat-row"><span>净化值</span><strong>${formatResource(save.relic.currentPurification)} / ${formatResource(save.relic.maxPurification)}</strong></div>
          <div class="stat-row"><span>庇护屏障</span><strong>${relicEnabled && config.relic.protectsShelter ? '运行中' : '未启用'}</strong></div>
          <div class="stat-row"><span>玩家抗性</span><strong>${formatResource(save.madnessResistance)} / ${formatResource(save.maxMadnessResistance)}</strong></div>
          <p>${relicEnabled ? '有限净化值需要在恢复个人抗性与净化食物之间分配。庇护屏障不持续消耗净化值。' : '当前配置未启用圣遗物交互。'}</p>
          ${relicEnabled ? `<div class="relic-actions">${button(`恢复抗性（+${formatResource(restorePreview.restored)} / 消耗 ${formatResource(restorePreview.cost)}）`, 'restore-resistance', 'small primary', restorePreview.restored <= 0)}${button(`净化怪物肉（${contaminatedMeat.length}）`, 'purify-meat', 'small', contaminatedMeat.length <= 0 || (save.relic.currentPurification <= 0 && config.relic.meatPurificationCostMultiplier > 0))}</div>` : ''}
        </article>
        <article class="panel farm-panel">
          <span class="panel-kicker">种植格</span><h3>${crop.name}</h3>
          <div class="farm-visual ${save.farm.planted ? 'planted' : ''}"><i></i><i></i><i></i></div>
          <p>${farmText}</p>
          ${!save.farm.planted ? button(`播种（消耗 ${crop.seedCost} 份储备粮）`, 'plant', 'small') : save.farm.cyclesLeft <= 0 ? button(`收获 ${crop.yieldCount} 份储备粮`, 'harvest-crop', 'small primary') : ''}
        </article>
        <article class="panel expedition-panel">
          <span class="panel-kicker">外出区域 01</span><h3>${config.maps[0].name}</h3>
          <p>雾层下发现三种生命反应。固定撤离点仍然可用。</p>
          <ul><li>方向键 / WASD 移动</li><li>空格攻击</li><li>靠近尸体或撤离点长按 E</li></ul>
          ${button('进入户外', 'expedition', 'primary wide')}
        </article>
        ${goal.showGoalOnShelter ? `<article class="panel goal-panel">
          <span class="panel-kicker">DEMO GOAL</span><h3>生存目标</h3>
          <div class="goal-row"><span>成功撤离</span><strong>${progress.extractions} / ${goal.requiredExtractions}</strong></div>
          <div class="goal-row"><span>带回怪物肉</span><strong>${progress.meat} / ${goal.requiredMonsterMeat}</strong></div>
          <div class="goal-row"><span>外出失败</span><strong>${progress.failures} / ${goal.maxExpeditionFailures}</strong></div>
          <p>安全食物耗尽前，带回足够的肉。</p>
        </article>` : ''}
      </div>
      <footer class="shelter-footer">已完成外出 ${save.expeditions} 次 · 配置在下一次开始游戏时生效</footer>
    </section>`;
  bindActions(app, {
    menu: renderMain,
    expedition: startExpedition,
    'eat-safe': () => eatInShelter('safe_food'),
    'eat-meat': () => eatInShelter('monster_meat'),
    'restore-resistance': restoreMadnessResistance,
    'purify-meat': showMonsterMeatPurification,
    plant: () => {
      if (save.safeFood < crop.seedCost) return toast('储备粮不足，无法播种');
      save.safeFood -= crop.seedCost; save.farm = { planted: true, cyclesLeft: crop.growthCycles }; persistSave(save); renderShelter();
    },
    'harvest-crop': () => {
      save.safeFood += crop.yieldCount; save.farm = { planted: false, cyclesLeft: 0 }; persistSave(save); renderShelter();
    }
  });
  requestAnimationFrame(() => {
    if (tutorialService.shouldShow('demo_goal')) showTutorial('demo_goal');
    else if (save.lastResult && save.lastResult.viewed === false) showExpeditionSummary();
    else showGoalResultIfNeeded();
  });
}

function showExpeditionSummary() {
  const result = save.lastResult, summary = result.summary || {};
  result.viewed = true; persistSave(save);
  const signed = (value = 0) => `${value >= 0 ? '+' : ''}${value}`;
  const reasonNames = { combat: '战斗中生命归零', starvation: '饥饿伤害导致生命归零', other: '其他运行时原因' };
  const heading = result.success ? '本次探索结果' : '外出失败';
  const outcome = result.success
    ? `带回异变肉：${result.meat || 0}`
    : `失败原因：${reasonNames[result.reason] || reasonNames.other}\n丢失异变肉：${result.lostMeat || 0}\n失败次数：${save.expeditionFailures} / ${config.demoGoal.maxExpeditionFailures}`;
  showModal(heading, `${outcome}\n\n探索回合：${summary.turns || 0}\n探索格数：${summary.exploredTiles || 0}\n击杀敌人：${summary.kills || 0}\n破坏巢穴：${summary.nestsDestroyed || 0}\n获得异变肉：${summary.meatCollected || 0}\n本局食用异变肉：${summary.meatConsumed || 0}\n疯狂变化：${signed(summary.madnessDelta)}\n剩余疯狂抗性：${formatResource(summary.resistanceRemaining ?? save.madnessResistance)}\n场景吸收战斗伤害：${formatResource(summary.sceneMadness || 0)}\n\nDemo 目标\n撤离次数：${save.successfulExtractions} / ${config.demoGoal.requiredExtractions}\n累计带回异变肉：${save.totalMonsterMeatReturned} / ${config.demoGoal.requiredMonsterMeat}`, [
    { label: '返回庇护所', primary: true, action: () => { closeModal(); showGoalResultIfNeeded(); } }
  ]);
}

function eatInShelter(itemId) {
  const food = config.foods.find((item) => item.id === itemId);
  let madnessGain = food.madnessGain;
  if (itemId === 'monster_meat') {
    const consumed = consumeLeastCorruptedMeat(save.monsterMeat);
    if (!consumed.meat) return toast('库存不足');
    save.monsterMeat = consumed.remaining;
    madnessGain = consumed.meat.currentMadness;
  } else {
    if (save.safeFood <= 0) return toast('库存不足');
    save.safeFood -= 1;
  }
  const before = save.madness;
  save.health = Math.min(config.global.maxHealth, save.health + food.healthRestore);
  save.madness = Math.min(config.global.maxMadness, save.madness + madnessGain);
  save.highestMadness = Math.max(save.highestMadness || 0, save.madness);
  persistSave(save); renderShelter();
  audioService.playSfx(itemId === 'monster_meat' ? 'eat' : 'click');
  const stageChange = madnessPresentation.stageChange(before, save.madness);
  toast(itemId === 'monster_meat' ? madnessPresentation.eatMessage(save.madness) : `${food.name}已食用`);
  if (stageChange && config.madnessPresentation.showStageMessages) setTimeout(() => showStageMessage(stageChange), 350);
}

function restoreMadnessResistance() {
  if (config.relic.enabled === false) return toast('圣遗物未启用', true);
  const result = restoreResistance(save, config.relic.resistanceRestoreCostMultiplier);
  if (result.restored <= 0) return toast(save.madnessResistance >= save.maxMadnessResistance ? '疯狂抗性已经恢复至上限' : '圣遗物净化值不足', true);
  persistSave(save); renderShelter(); audioService.playSfx('resistance_restore'); toast(`消耗 ${formatResource(result.cost)} 点净化值，恢复 ${formatResource(result.restored)} 点疯狂抗性`);
}

function showMonsterMeatPurification() {
  if (config.relic.enabled === false) return toast('圣遗物未启用', true);
  const food = config.foods.find((item) => item.id === 'monster_meat');
  const candidates = save.monsterMeat.filter((meat) => meat.currentMadness > 0);
  if (!candidates.length) return toast('没有仍受污染的异变肉', true);
  const actions = candidates.map((meat, index) => {
    const preview = getMeatPurificationPreview(meat, save.relic.currentPurification, config.relic.meatPurificationCostMultiplier);
    const operation = preview.complete ? '完全净化' : '部分净化';
    return {
      label: `第 ${index + 1} 块 · 生命 +${food.healthRestore} / 饥饿 +${food.hungerRestore} / 疯狂 ${formatResource(meat.currentMadness)}→${formatResource(meat.currentMadness - preview.purified)} / ${formatResource(meat.maxMadness)} · ${operation}（消耗 ${formatResource(preview.cost)}）`,
      disabled: preview.purified <= 0,
      action: () => purifySelectedMonsterMeat(meat.id)
    };
  });
  actions.push({ label: '取消', action: closeModal });
  showModal('选择要净化的异变肉', `圣遗物净化值：${formatResource(save.relic.currentPurification)} / ${formatResource(save.relic.maxPurification)}\n选择一块肉确认净化；污染值和净化消耗按配置倍率结算。`, actions);
}

function purifySelectedMonsterMeat(meatId) {
  const result = purifyMonsterMeat(save, meatId, config.relic.meatPurificationCostMultiplier);
  if (result.purified <= 0) return toast('圣遗物净化值不足', true);
  closeModal(); persistSave(save); renderShelter(); audioService.playSfx('purify');
  toast(result.meat.currentMadness > 0
    ? `消耗 ${formatResource(result.cost)} 点净化值，这块肉仍有 ${formatResource(result.meat.currentMadness)} 点污染`
    : `消耗 ${formatResource(result.cost)} 点净化值，这块肉已完全净化`);
}

function showGoalIntro() {
  const goal = config.demoGoal;
  showModal('庇护所的安全食物已经所剩无几', `你必须进入雾区狩猎，将异变生物的肉带回来。\n\n完成 ${goal.requiredExtractions} 次撤离，并带回 ${goal.requiredMonsterMeat} 块怪物肉。\n\n它们可以让你活下去。\n\n代价是，你会逐渐变得不像自己。`, [{ label: '准备外出', primary: true, action: () => { save.introSeen = true; persistSave(save); closeModal(); } }]);
}

const tutorialContent = {
  demo_goal: ['生存目标', '完成 3 次撤离，并累计带回 12 块异变肉。\n\n外出失败达到上限，或庇护所食物耗尽，Demo 将会结束。异变肉能维持生存，但食用会提高疯狂。'],
  outdoor_movement: ['进入雾区', '使用 WASD、方向键、点击相邻格或屏幕方向键移动。\n\n每次实际移动会消耗饥饿，并推进地图回合。'],
  fog_of_war: ['战争迷雾', '明亮区域是当前视野，灰暗区域是探索过的记忆，黑色区域尚未探索。\n\n记忆中的敌人状态可能已经改变。'],
  enemy_alert: ['敌人发现了你', '敌人会经历警觉、追踪和准备接敌等状态。\n\n观察图标与文字，决定绕行、战斗或撤退。'],
  first_battle: ['回合制战斗', '速度决定战斗开始时的先后手。\n\n你可以攻击、防御、使用道具或尝试逃跑。'],
  first_harvest: ['切割尸体', '站在尸体所在格，点击高亮按钮或按 E 切割。\n\n切割会推进地图回合，附近敌人仍可能行动。'],
  monster_meat: ['异变肉', '异变肉可以恢复生命和饥饿，让你继续探索。每块肉都保留自己的当前/最大污染值。\n\n食肉污染不会被疯狂抗性抵消；回到庇护所后可以使用圣遗物净化。'],
  first_nest: ['腐化巢穴', '巢穴不会主动追击，但会定期产出怪物。\n\n尝试进入巢穴所在格，可以主动接敌并破坏它。'],
  first_extraction: ['撤离', '撤离需要等待多个地图回合，期间敌人仍会行动。\n\n成功撤离后，本次获得的异变肉才会带回庇护所。']
};

function showTutorial(step) {
  if (!tutorialService.shouldShow(step)) return;
  if (document.querySelector('#global-modal')) {
    if (!tutorialQueue.includes(step)) tutorialQueue.push(step);
    return;
  }
  if (runtime?.running) runtime.inputPaused = true;
  const [title, copy] = tutorialContent[step];
  showModal(title, copy, [
    { label: '知道了', primary: true, action: () => { tutorialService.complete(step); if (step === 'demo_goal') save.introSeen = true; closeModal(); resumeAfterTutorial(); showNextTutorial(); } },
    { label: '跳过全部引导', action: () => { tutorialService.skipAll(); tutorialQueue = []; closeModal(); resumeAfterTutorial(); } }
  ]);
}

function resumeAfterTutorial() {
  if (runtime?.running) runtime.inputPaused = false;
}

function showNextTutorial() {
  const next = tutorialQueue.shift();
  if (next) setTimeout(() => showTutorial(next), 0);
}

function showGoalResultIfNeeded() {
  const status = goalService.status(save);
  if (!['victory', 'failure'].includes(status.state) || save.goalResultSeen === `${status.state}:${status.reason}`) return;
  save.goalResultSeen = `${status.state}:${status.reason}`; persistSave(save);
  if (status.state === 'victory') {
    const stage = madnessPresentation.stage(save.madness);
    showModal('你带回了足够的食物', `雾仍在庇护所外翻涌。\n至少今天，你们不会挨饿。\n\n总外出 ${save.expeditions} 次 · 成功撤离 ${save.successfulExtractions} 次 · 失败 ${save.expeditionFailures} 次\n击杀 ${save.enemiesKilled} · 破坏巢穴 ${save.nestsDestroyed || 0}\n带回肉块 ${save.totalMonsterMeatReturned} · 最高疯狂 ${save.highestMadness}\n当前阶段：${stage.state || stage.name}`, [
      { label: '继续游戏', primary: true, action: closeModal }, { label: '重新开始', action: resetGame }, { label: '返回主菜单', action: () => { closeModal(); renderMain(); } }
    ]);
  } else {
    const copy = status.reason === 'food' ? '储藏室已经空了。\n\n你最后一次听见低语时，它们听起来像是在催促你进食。' : '你已经没有力气再次进入雾中了。\n\n门外仍有东西在移动，但庇护所里已经没有人回应。';
    showModal('庇护所沉默了', copy, [{ label: '重新开始', primary: true, action: resetGame }, { label: '返回主菜单', action: () => { closeModal(); renderMain(); } }]);
  }
}

function resetGame() { localStorage.removeItem(SAVE_STORAGE_KEY); save = createInitialSave(config); closeModal(); renderShelter(); }

function startExpedition() {
  const madnessView = madnessPresentation.stage(save.madness), progress = goalService.progress(save);
  app.innerHTML = `
    <section class="game-screen madness-${madnessView.id} ${config.madnessPresentation.reducedMotion ? 'reduced-motion' : ''}">
      <div class="madness-overlay" aria-hidden="true"></div>
      <div class="exploration-layout"><canvas id="game" width="760" height="760"></canvas><aside class="exploration-side">
        <span class="eyebrow">OUTDOOR_EXPLORATION</span><h3>${config.maps[0].name}</h3>
        <p>亮色是当前视野，暗色是最后记忆，黑色区域尚未探索。</p>
        <div class="legend"><span><i class="player-dot"></i>玩家</span><span><i class="enemy-dot"></i>敌人</span><span><i class="corpse-dot"></i>尸体</span><span><i class="extract-dot"></i>撤离</span></div>
        <div id="turn-message" class="turn-message"></div>
        <div class="explore-actions">${button('等待一回合', 'wait')}${button('使用补给', 'use-item', 'item-button')}<button id="interact-button" data-action="interact" hidden></button>${playtestState ? button('返回地图编辑', 'leave-playtest', 'ghost') : ''}</div>
        <small>WASD / 方向键移动，也可以点击相邻格</small>
      </aside></div>
      <div class="hud">
        <div class="hud-bars">
          <label>生命 <span id="health-label"></span><i><b id="health-bar"></b></i></label>
          <label>饥饿 <span id="hunger-label"></span><i><b id="hunger-bar"></b></i></label>
          <label>抗性 <span id="resistance-label"></span><i><b id="resistance-bar"></b></i></label>
          <label>疯狂 <span id="madness-label"></span><i><b id="madness-bar"></b></i></label>
        </div>
        <div class="hud-info"><span>回合 <b id="turn-label"></b></span><span>坐标 <b id="position-label"></b></span><span>攻击 <b id="attack-label"></b></span><span>本次肉 <b id="meat-label"></b> / ${config.player.inventoryCapacity}</span>${config.demoGoal.showGoalOnOutdoorHud ? `<span class="hud-goal">撤离 ${progress.extractions}/${config.demoGoal.requiredExtractions} · 肉 ${progress.meat}/${config.demoGoal.requiredMonsterMeat}</span>` : ''}</div>
      </div>
      <div id="battle-layer" class="battle-layer" hidden></div>
      <div id="danger-notice" class="danger-notice" hidden></div>
      <div class="mobile-pad"><button data-dir="0,-1">▲</button><button data-dir="-1,0">◀</button><button data-dir="1,0">▶</button><button data-dir="0,1">▼</button></div>
    </section>`;
  runtime = new GridExplorationRuntime(document.querySelector('#game'), config, save, {
    onHud: updateHud,
    onNotice: renderNotice,
    onBattleTransition: renderBattleTransition,
    onBattle: renderBattle,
    onBattleKey: handleBattleKey,
    onBattleResult: renderBattleResult,
    onMapEvent: renderMapEvent,
    onMapEventResult: renderMapEventResult,
    onMadnessChange: handleMadnessChange,
    onAudioEvent: (id) => audioService.playSfx(id),
    onMilestone: showTutorial,
    onSave: (nextSave) => { if (!playtestState) persistSave(nextSave); },
    onComplete: (nextSave, success) => {
      if (playtestState) return leaveMapPlaytest();
      save = nextSave; persistSave(save); renderShelter(); toast(success ? '撤离成功，搜集物已入库' : '外出失败，你失去了本次搜集物');
    }
  });
  bindActions(app, { wait: () => runtime.wait(), interact: () => runtime.interact(), 'use-item': showOutdoorItems, 'leave-playtest': leaveMapPlaytest });
  app.querySelectorAll('[data-dir]').forEach((element) => {
    const [dx, dy] = element.dataset.dir.split(',').map(Number);
    element.addEventListener('click', () => runtime.movePlayer(dx, dy));
  });
  runtime.start();
  showTutorial('outdoor_movement');
  audioService.playBgm('outdoor');
  if (config.madnessPresentation.showWhispers && save.madness >= 30) setTimeout(() => showWhisper(madnessPresentation.whisper()), 1200);
}

function showOutdoorItems() {
  const items = runtime.getOutdoorItems();
  const meat = items.find((item) => item.id === 'monster_meat');
  runtime.inputPaused = true;
  showModal('使用道具', '使用道具会消耗一个探索回合。系统会优先食用污染最低的异变肉；食肉污染不会被疯狂抗性抵消。', [
    {
      label: `${meat?.name || '异变肉块'} × ${meat?.count || 0} · 生命 +${meat?.healthRestore || 0} / 饥饿 +${meat?.hungerRestore || 0} / 本块疯狂 +${formatResource(meat?.currentMadness || 0)}`,
      primary: true,
      disabled: !meat?.count,
      action: () => {
        closeModal();
        runtime.inputPaused = false;
        const result = runtime.useOutdoorItem('monster_meat');
        if (!result.ok) return toast(result.message, true);
        audioService.playSfx('eat');
        toast(madnessPresentation.eatMessage(result.madness));
      }
    },
    { label: '取消', action: () => { closeModal(); runtime.inputPaused = false; } }
  ]);
}

function updateHud(hud) {
  const set = (id, value) => { const node = document.querySelector(id); if (node) node.textContent = value; };
  const width = (id, value, max) => { const node = document.querySelector(id); if (node) node.style.width = `${Math.max(0, value / max * 100)}%`; };
  set('#health-label', hud.health); set('#hunger-label', hud.hunger); set('#resistance-label', `${formatResource(hud.madnessResistance)} / ${formatResource(save.maxMadnessResistance)}`); set('#madness-label', `${formatResource(hud.madness)} · ${hud.madnessState}`);
  set('#attack-label', hud.attack); set('#meat-label', hud.meat); set('#turn-label', hud.turn); set('#position-label', hud.position);
  width('#health-bar', hud.health, config.global.maxHealth); width('#hunger-bar', hud.hunger, config.global.maxHunger); width('#resistance-bar', hud.madnessResistance, save.maxMadnessResistance || 1); width('#madness-bar', hud.madness, config.global.maxMadness);
  const message = document.querySelector('#turn-message'); if (message) message.textContent = hud.message;
  const interact = document.querySelector('#interact-button');
  if (interact) {
    interact.textContent = hud.interaction.label;
    interact.hidden = !hud.interaction.enabled;
    interact.disabled = !hud.interaction.enabled;
    interact.className = hud.interaction.enabled && config.ui.highlightInteract ? `interactive-ready ${hud.interaction.tone}` : '';
  }
}

function handleMadnessChange(before, after) {
  const change = madnessPresentation.stageChange(before, after);
  const root = document.querySelector('.game-screen');
  if (root) root.className = root.className.replace(/madness-\w+/g, '').trim() + ` madness-${madnessPresentation.stage(after).id}`;
  if (change && config.madnessPresentation.showStageMessages) showStageMessage(change);
  if (config.madnessPresentation.showWhispers) showWhisper(madnessPresentation.eatMessage(after));
  if (after > before) audioService.playSfx('madness');
}

function renderMapEvent(event, choose) {
  audioService.playSfx('alert');
  showModal(event.title, event.description, event.choices.map((choice, index) => ({ label: choice.label, primary: index === 0, action: () => { closeModal(); choose(choice); } })));
}

function renderMapEventResult(messages, finish) {
  showModal('事件结果', messages.join('\n') || '什么也没有发生。', [{ label: '继续探索', primary: true, action: () => { closeModal(); finish(); } }]);
}

function renderNotice(notice) {
  const node = document.querySelector('#danger-notice');
  if (!node) return;
  node.hidden = false; node.className = `danger-notice ${notice.type}`;
  node.innerHTML = `<strong>${notice.type === 'nest-sighted' ? '◈ 巢穴' : notice.type === 'spawn' ? '◉ 产出' : notice.type === 'attack-intent' ? '⚠ 攻击意图' : notice.type === 'chase' ? '↓ 追踪' : '！警觉'}</strong><span>${notice.message}</span>`;
  clearTimeout(renderNotice.timer);
  audioService.playSfx(notice.type === 'attack-intent' ? 'intent' : notice.type === 'chase' ? 'chase' : 'alert');
  renderNotice.timer = setTimeout(() => { node.hidden = true; }, 1800);
}

function renderBattleTransition(view, enter) {
  const layer = document.querySelector('#battle-layer');
  if (!layer) return enter();
  layer.hidden = false;
  layer.innerHTML = `<div class="encounter-transition" style="--enemy:${view.color}"><span>发现</span><strong>${view.enemy}</strong><i></i></div>`;
  audioService.playSfx('battle');
  requestAnimationFrame(() => layer.classList.add('transition-active'));
  setTimeout(() => { layer.classList.remove('transition-active'); enter(); }, 900);
}

function renderBattleResult(result, finish) {
  const layer = document.querySelector('#battle-layer');
  if (!layer) return finish();
  layer.hidden = false;
  layer.innerHTML = `<div class="battle-result ${result.type}"><span>${result.type === 'victory' ? 'BATTLE WON' : result.type === 'escaped' ? 'DISENGAGED' : 'EXPEDITION FAILED'}</span><h2>${result.title}</h2><p>${result.detail}</p></div>`;
  audioService.playSfx(result.type === 'victory' ? 'victory' : result.type === 'defeat' ? 'failure' : 'escape');
  const delay = Math.max(400, (config.battle.battleResultDelay || 0) * 1000);
  setTimeout(() => { layer.hidden = true; finish(); }, delay);
}

function renderBattle(view, act) {
  const layer = document.querySelector('#battle-layer');
  if (!layer) return;
  const names = { attack: '攻击', defend: '防御', item: '道具', escape: `逃跑（${Math.round(config.battle.baseEscapeChance * 100)}%）` };
  layer.hidden = false;
  layer.innerHTML = `<section class="battle-screen">
    <header><div><span class="eyebrow">BATTLE · ROUND ${view.round}</span><h2>${view.phase === 'player' ? '轮到你行动' : '敌人正在行动…'}</h2></div><span>速度决定先后手</span></header>
    <div class="combatants">
      <article class="combatant player-combatant"><div class="combatant-art" aria-label="幸存者"></div><h3>幸存者</h3><strong>${view.player.health} / ${view.player.maxHealth} HP</strong><i><b style="width:${view.player.health / view.player.maxHealth * 100}%"></b></i><small>攻击 ${view.player.attack} · 速度 ${view.player.speed} · 抗性 ${formatResource(view.player.madnessResistance)} · 疯狂 ${formatResource(view.player.madness)}</small></article>
      <div class="versus">VS</div>
      <article class="combatant enemy-combatant"><div class="combatant-art" style="--enemy:${view.enemy.color}" aria-label="敌人"></div><h3>${view.enemy.name}</h3><strong>${view.enemy.health} / ${view.enemy.maxHealth} HP</strong><i><b style="width:${view.enemy.health / view.enemy.maxHealth * 100}%"></b></i><small>攻击 ${view.enemy.attack} · 速度 ${view.enemy.speed}</small></article>
    </div>
    <div class="battle-bottom"><div class="battle-log">${view.log.map((line) => `<p>${line}</p>`).join('')}</div><div id="battle-action-menu" class="battle-actions player-turn"></div></div>
  </section>`;
  const menu = layer.querySelector('#battle-action-menu');
  const bindMenuKeyboard = () => {
    const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
    selectBattleButton(buttons, 0);
  };
  const renderActions = () => {
    menu.innerHTML = view.actions.map((action, index) => `<button data-battle-action="${action}" class="${index === 0 ? 'recommended-action' : ''}">${names[action]}</button>`).join('');
    menu.querySelectorAll('[data-battle-action]').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.battleAction;
      if (action === 'item') return renderItems();
      audioService.playSfx(action === 'attack' ? 'attack' : action);
      act(action);
    }));
    bindMenuKeyboard();
  };
  const renderItems = () => {
    const food = config.foods.find((item) => item.id === 'monster_meat');
    menu.innerHTML = `<button data-battle-item="monster_meat" ${view.player.meat <= 0 ? 'disabled' : ''}>异变肉 × ${view.player.meat} · 生命 +${food.healthRestore} / 饥饿 +${food.hungerRestore} / 疯狂 +${formatResource(view.player.meatMadness)}</button><button data-battle-back>返回</button>`;
    menu.querySelector('[data-battle-item]')?.addEventListener('click', () => { audioService.playSfx('eat'); act('eat'); });
    menu.querySelector('[data-battle-back]')?.addEventListener('click', renderActions);
    bindMenuKeyboard();
  };
  renderActions();
}

function selectBattleButton(buttons, index) {
  if (!buttons.length) return;
  const selectedIndex = (index + buttons.length) % buttons.length;
  buttons.forEach((button, cursor) => button.classList.toggle('keyboard-selected', cursor === selectedIndex));
  buttons[selectedIndex]?.focus({ preventScroll: true });
}

function handleBattleKey(key) {
  const menu = document.querySelector('#battle-action-menu');
  if (!menu) return false;
  const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
  if (!buttons.length) return false;
  const current = Math.max(0, buttons.findIndex((button) => button.classList.contains('keyboard-selected')));
  const offsets = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1, ArrowUp: -2, w: -2, W: -2, ArrowDown: 2, s: 2, S: 2 };
  if (key in offsets) {
    selectBattleButton(buttons, current + offsets[key]);
    return true;
  }
  if (key === 'Enter' || key === ' ') {
    buttons[current]?.click();
    return true;
  }
  return false;
}

const categoryDescriptions = {
  global: '控制整局规则、上限、消耗与失败结算。', player: '玩家初始能力，不修改正在进行中的角色。', monsters: '三种预设共用同一状态机，差异完全来自参数。',
  foods: '定义食物恢复效果；异变肉实际疯狂取所食肉块的当前污染值。', monsterMeat: '定义新生成异变肉的最大疯狂值。', relic: '定义庇护所圣遗物的名称、最大与初始净化值。', madnessStages: '定义疯狂阈值和攻击倍率。', equipment: '定义默认装备提供的能力。',
  maps: '定义 10×10 至 50×50 地图、迷雾、出生点、撤离点、固定与随机刷怪规则。', mapEditor: '可视化绘制障碍、出生点、撤离点与固定怪物；修改不会操作当前游戏实体。', battle: '定义独立回合制战斗、速度先手、转场与结果展示。', ui: '定义目标、快捷键、敌人图标和交互反馈。',
  demoGoal: '定义展示版的胜利目标与失败上限。', madnessPresentation: '定义低语、边缘效果和减少动态效果。', mapEvents: '定义随机事件的触发频率与上限。', events: '定义事件内容、权重、条件、选择与效果。', audio: '定义程序化 WAV 音效、合成回退、静音与音量。',
  farming: '定义作物周期与产出。', shelter: '定义新存档的初始库存。'
};

function renderConfig() {
  app.innerHTML = `
    <section class="config-screen">
      <header class="config-header"><div><span class="eyebrow">RULE CONFIGURATION</span><h2>游戏配置</h2><p>修改规则，而不是操纵某一局游戏。</p></div><div class="config-header-actions">${button('返回主菜单', 'menu', 'ghost')}${button('校验', 'validate')}${button('保存并应用', 'save', 'primary')}</div></header>
      <div class="config-layout">
        <nav class="config-nav">${Object.keys(categoryDescriptions).map((key) => `<button class="${key === activeCategory ? 'active' : ''}" data-category="${key}"><span>${labels[key]}</span><small>${Array.isArray(configDraft[key]) ? configDraft[key].length : ''}</small></button>`).join('')}</nav>
        <section class="config-editor"><div class="config-editor-head"><div><h3>${labels[activeCategory]}</h3><p>${categoryDescriptions[activeCategory]}</p></div><span>保存后，下次开始游戏生效</span></div><div id="config-fields"></div></section>
      </div>
      <footer class="config-footer"><div>${button('恢复默认', 'reset', 'danger ghost')}${button('重置游戏引导', 'reset-tutorial', 'ghost')}${button('导入 JSON', 'import')}${button('导出 JSON', 'export')}</div><span id="config-status">当前为${configService.loadSavedConfig() ? '已保存配置' : '默认配置'}</span></footer>
    </section>`;
  renderConfigFields();
  app.querySelectorAll('[data-category]').forEach((element) => element.addEventListener('click', () => { activeCategory = element.dataset.category; renderConfig(); }));
  bindActions(app, {
    menu: renderMain,
    validate: validateDraft,
    'reset-tutorial': () => { tutorialService.reset(); toast('游戏引导已重置'); },
    save: () => { if (validateDraft()) { configService.saveConfig(configDraft); config = configService.loadActiveConfig(); setConfigStatus('配置已保存，将在下次开始游戏时生效', true); } },
    reset: () => { if (confirm('恢复内置默认配置？当前未保存的修改会丢失。')) { configDraft = configService.resetConfig(); clearMapEditorHistory(); renderConfig(); toast('已恢复默认配置'); } },
    export: exportDraft,
    import: () => { importTarget = 'config'; fileInput.click(); }
  });
}

function renderConfigFields() {
  const root = document.querySelector('#config-fields');
  if (activeCategory === 'mapEditor') {
    root.innerHTML = renderMapEditor(configDraft.maps[0]);
    bindMapPreview();
    return;
  }
  const value = configDraft[activeCategory];
  root.innerHTML = Array.isArray(value)
    ? `<div class="array-editor">${value.map((item, index) => `<article class="config-card"><header><strong>${item.name || item.state || item.id || `项目 ${index + 1}`}</strong>${activeCategory === 'monsters' ? `<span class="monster-card-actions"><button data-monster-action="clone" data-monster-index="${index}">复制</button><button class="danger ghost" data-monster-action="delete" data-monster-index="${index}">删除</button></span>` : `<span>#${index + 1}</span>`}</header>${renderObjectFields(item, `${activeCategory}.${index}`)}</article>`).join('')}</div>`
    : `<article class="config-card single">${renderObjectFields(value, activeCategory)}</article>`;
  if (activeCategory === 'maps') root.insertAdjacentHTML('afterbegin', renderMapPreview(configDraft.maps[0]));
  if (activeCategory === 'monsters') root.insertAdjacentHTML('afterbegin', `<div class="editor-actions">${button('新增怪物', 'add-monster')}${button('恢复默认怪物配置', 'reset-monsters', 'danger ghost')}</div>`);
  bindConfigInputs(root);
  if (activeCategory === 'maps') bindMapPreview();
  if (activeCategory === 'monsters') {
    bindActions(root, {
      'add-monster': () => { const source = structuredClone(configDraft.monsters[0]); source.id = uniqueMonsterId('monster'); source.name = '新怪物'; delete source.spawnConfig; configDraft.monsters.push(source); renderConfigFields(); },
      'reset-monsters': resetDefaultMonsters
    });
    root.querySelectorAll('[data-monster-action]').forEach((element) => element.addEventListener('click', () => {
      const index = Number(element.dataset.monsterIndex);
      if (element.dataset.monsterAction === 'clone') cloneMonster(index);
      else deleteMonster(index);
    }));
  }
}

function uniqueMonsterId(base) {
  let id = `${base}_copy_${Date.now().toString(36).slice(-5)}`, suffix = 2;
  while (configDraft.monsters.some((monster) => monster.id === id)) id = `${base}_copy_${suffix++}`;
  return id;
}

function cloneMonster(index) {
  const source = configDraft.monsters[index];
  if (!source) return;
  const clone = structuredClone(source);
  clone.id = uniqueMonsterId(source.id);
  clone.name = `${source.name} 副本`;
  configDraft.monsters.splice(index + 1, 0, clone);
  renderConfigFields();
}

function monsterReferences(id, monsters = configDraft.monsters) {
  const references = [];
  configDraft.maps.forEach((map) => {
    if ((map.monsterSpawns || []).some((spawn) => spawn.monsterId === id)) references.push(`地图「${map.name}」的固定点`);
    if ((map.randomSpawnRules || []).some((rule) => rule.monsterConfigId === id)) references.push(`地图「${map.name}」的随机区域`);
  });
  monsters.forEach((monster) => { if (monster.id !== id && monster.spawnConfig?.monsterConfigId === id) references.push(`怪物「${monster.name}」的产出设置`); });
  return references;
}

function deleteMonster(index) {
  const monster = configDraft.monsters[index];
  if (!monster || ['passive', 'wanderer', 'tracker', 'basic_nest'].includes(monster.id)) return toast('内置怪物不能删除', true);
  const references = monsterReferences(monster.id);
  if (references.length) return toast(`无法删除：仍被${references.slice(0, 2).join('、')}引用`, true);
  configDraft.monsters.splice(index, 1); renderConfigFields();
}

function resetDefaultMonsters() {
  const defaults = configService.loadDefaultConfig().monsters;
  const defaultIds = new Set(defaults.map((monster) => monster.id));
  const blocking = configDraft.monsters
    .filter((monster) => !defaultIds.has(monster.id) && monsterReferences(monster.id, defaults).length)
    .map((monster) => monster.name);
  if (blocking.length) return toast(`请先移除对自定义怪物的引用：${blocking.slice(0, 3).join('、')}`, true);
  if (!confirm('仅恢复内置默认怪物配置？未被引用的自定义怪物会被移除。')) return;
  configDraft.monsters = structuredClone(defaults);
  renderConfigFields();
  toast('已恢复默认怪物配置');
}

function renderMapPreview(map) {
  const obstacleSet = new Set(map.obstacles.map((item) => `${item.x},${item.y}`));
  const spawnMap = new Map(map.monsterSpawns.map((item) => [`${item.x},${item.y}`, item.monsterId]));
  return `<article class="map-preview-card"><header><div><strong>${map.width}×${map.height} 配置预览</strong><small>这是关卡配置，不是运行时 GM 工具</small></div><select id="map-brush"><option value="obstacle">障碍</option><option value="spawn">玩家出生点</option><option value="extract">撤离点</option>${configDraft.monsters.map((item) => `<option value="monster:${item.id}">怪物：${item.name}</option>`).join('')}<option value="erase">删除</option></select></header><div class="map-preview-grid" style="grid-template-columns:repeat(${map.width},1fr)">${Array.from({ length: map.width * map.height }, (_, index) => { const x = index % map.width, y = Math.floor(index / map.width), key = `${x},${y}`; let type = obstacleSet.has(key) ? 'obstacle' : ''; if (map.playerSpawn.x === x && map.playerSpawn.y === y) type = 'spawn'; if (map.extractPoint.x === x && map.extractPoint.y === y) type = 'extract'; if (spawnMap.has(key)) type = `monster ${spawnMap.get(key)}`; return `<button class="${type}" data-map-x="${x}" data-map-y="${y}" title="(${x},${y})"></button>`; }).join('')}</div></article>`;
}

function renderMapEditor(map) {
  const obstacleMap = new Map((map.obstacles || []).map((item, index) => [`${item.x},${item.y}`, index]));
  const obstacleSet = new Set(obstacleMap.keys());
  const spawnMap = new Map((map.monsterSpawns || []).map((item, index) => [`${item.x},${item.y}`, { item, index }]));
  const extracts = new Map((map.extractionPoints || [map.extractPoint]).map((item, index) => [`${item.x},${item.y}`, index]));
  const toolOptions = [
    ['select', '选择工具'], ['ground', '地面'], ['obstacle', '障碍'], ['spawn', '玩家出生点'], ['extract', '撤离点'],
    ...configDraft.monsters.map((item) => [`monster:${item.id}`, `怪物：${item.name}`]), ['random-area', '矩形随机怪物区域'], ['erase', '删除']
  ];
  const areas = (map.randomSpawnRules || []).map((rule, index) => {
    const area = rule.allowedArea || { x: 0, y: 0, width: map.width, height: map.height };
    const selected = mapEditorSelection?.type === 'randomRule' && mapEditorSelection.index === index ? ' selected' : '';
    return `<div class="random-area-overlay${selected}" style="left:${area.x * 24}px;top:${area.y * 24}px;width:${area.width * 24}px;height:${area.height * 24}px" title="${escapeAttribute(rule.id)}"><span>${escapeAttribute(rule.id)}</span></div>`;
  }).join('');
  const draftArea = mapAreaAnchor ? `<div class="random-area-overlay draft" style="left:${mapAreaAnchor.x * 24}px;top:${mapAreaAnchor.y * 24}px;width:24px;height:24px"><span>再点另一角</span></div>` : '';
  return `<article class="map-editor-card">
    <header class="map-editor-toolbar">
      <label>宽 <input id="map-width" type="number" min="10" max="50" value="${map.width}"></label>
      <label>高 <input id="map-height" type="number" min="10" max="50" value="${map.height}"></label>
      <select id="map-brush" aria-label="地图工具">${toolOptions.map(([value, label]) => `<option value="${value}" ${mapEditorTool === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
      ${button('应用尺寸', 'resize-map')}<button data-action="undo-map" ${mapEditorHistory.undo.length ? '' : 'disabled'}>撤销</button><button data-action="redo-map" ${mapEditorHistory.redo.length ? '' : 'disabled'}>重做</button>${button('清空对象', 'clear-map', 'ghost')}${button('试玩当前地图', 'playtest-map', 'primary')}
    </header>
    <div class="seed-toolbar"><label><input id="fixed-seed" type="checkbox" ${map.random?.useFixedSeed ? 'checked' : ''}> 固定 Seed</label><input id="map-seed" value="${map.random?.seed || ''}">${button('生成 Seed', 'generate-seed')}${button('复制 Seed', 'copy-seed', 'ghost')}</div>
    <div class="map-file-toolbar">${button('导入单张地图 JSON', 'import-map')}${button('导出单张地图 JSON', 'export-map')}${button('仅恢复默认地图', 'reset-map', 'danger ghost')}</div>
    <p class="editor-help">选择工具用于点选对象并在右侧编辑属性；矩形随机区域依次点选两个角。地面、障碍和删除支持拖动绘制。</p>
    <div class="map-editor-workspace">
      <div class="map-editor-viewport"><div class="map-editor-canvas" style="width:${map.width * 24}px;height:${map.height * 24}px"><div class="map-preview-grid map-authoring-grid" style="--map-columns:${map.width}">${Array.from({ length: map.width * map.height }, (_, index) => { const x = index % map.width, y = Math.floor(index / map.width), key = `${x},${y}`; let type = obstacleSet.has(key) ? 'obstacle' : ''; let selectionType = obstacleSet.has(key) ? 'obstacle' : ''; let selectionIndex = obstacleMap.get(key); if (map.playerSpawn.x === x && map.playerSpawn.y === y) { type = 'spawn'; selectionType = 'player'; selectionIndex = 0; } if (extracts.has(key)) { type = 'extract'; selectionType = 'extract'; selectionIndex = extracts.get(key); } if (spawnMap.has(key)) { const spawn = spawnMap.get(key); type = `monster ${spawn.item.monsterId}`; selectionType = 'monster'; selectionIndex = spawn.index; } const selected = mapEditorSelection?.type === selectionType && mapEditorSelection.index === selectionIndex ? ' selected' : ''; return `<button class="${type}${selected}" data-map-x="${x}" data-map-y="${y}" title="(${x},${y})"></button>`; }).join('')}</div>${areas}${draftArea}</div></div>
      ${renderMapSelectionPanel(map)}
    </div>
  </article>`;
}

function renderMapSelectionPanel(map) {
  const selection = mapEditorSelection;
  if (!selection) return `<aside class="map-selection-panel"><h4>所选对象</h4><p>选择工具后点击地图对象或随机区域。</p></aside>`;
  let item, title, fields = '';
  if (selection.type === 'player') { item = map.playerSpawn; title = '玩家出生点'; fields = positionEditor(item); }
  else if (selection.type === 'extract') { item = (map.extractionPoints || [map.extractPoint])[selection.index]; title = '撤离点'; fields = `${positionEditor(item)}${numberEditor('requiredTurns', item?.requiredTurns, 1)}`; }
  else if (selection.type === 'monster') {
    item = map.monsterSpawns?.[selection.index]; title = '固定怪物';
    fields = `${positionEditor(item)}<label>怪物<select data-selected-path="monsterId">${configDraft.monsters.map((monster) => `<option value="${monster.id}" ${monster.id === item?.monsterId ? 'selected' : ''}>${monster.name}</option>`).join('')}</select></label>${numberEditor('count', item?.count, 1)}`;
  } else if (selection.type === 'obstacle') { item = map.obstacles?.[selection.index]; title = '障碍'; fields = positionEditor(item); }
  else if (selection.type === 'randomRule') {
    item = map.randomSpawnRules?.[selection.index]; title = '随机怪物区域';
    if (item) fields = `<label class="wide">ID<input data-selected-path="id" value="${escapeAttribute(item.id)}"></label><label class="toggle"><span>启用</span><input type="checkbox" data-selected-path="enabled" ${item.enabled ? 'checked' : ''}><i></i></label><label>怪物<select data-selected-path="monsterConfigId">${configDraft.monsters.map((monster) => `<option value="${monster.id}" ${monster.id === item.monsterConfigId ? 'selected' : ''}>${monster.name}</option>`).join('')}</select></label>${numberEditor('minCount', item.minCount, 0)}${numberEditor('maxCount', item.maxCount, 0)}${numberEditor('allowedArea.x', item.allowedArea?.x, 0)}${numberEditor('allowedArea.y', item.allowedArea?.y, 0)}${numberEditor('allowedArea.width', item.allowedArea?.width, 1)}${numberEditor('allowedArea.height', item.allowedArea?.height, 1)}${numberEditor('minDistanceFromPlayerSpawn', item.minDistanceFromPlayerSpawn, 0)}${numberEditor('minDistanceFromExtraction', item.minDistanceFromExtraction, 0)}${numberEditor('minDistanceBetweenSameType', item.minDistanceBetweenSameType, 0)}${numberEditor('minDistanceBetweenAnyMonster', item.minDistanceBetweenAnyMonster, 0)}${numberEditor('placementAttempts', item.placementAttempts, 1)}`;
  }
  if (!item) { mapEditorSelection = null; return renderMapSelectionPanel(map); }
  const canDelete = selection.type !== 'player' && !(selection.type === 'extract' && (map.extractionPoints || []).length <= 1);
  return `<aside class="map-selection-panel"><h4>${title}</h4><div class="selection-fields">${fields}</div>${canDelete ? button('删除所选对象', 'delete-selected', 'danger ghost') : `<small>${selection.type === 'player' ? '玩家出生点只能移动，不能删除。' : '地图至少需要一个撤离点。'}</small>`}</aside>`;
}

function escapeAttribute(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'); }
function positionEditor(item) { return `${numberEditor('x', item?.x, 0)}${numberEditor('y', item?.y, 0)}`; }
function numberEditor(path, value, min) { return `<label>${labels[path] || labels[path.split('.').at(-1)] || path}<input type="number" data-selected-path="${path}" value="${Number(value ?? 0)}" min="${min}"></label>`; }

function bindMapPreview() {
  const currentMap = configDraft.maps[0];
  const editor = document.querySelector('.map-editor-card');
  if (!editor) return;
  let painting = false;
  const paint = (cell) => {
    const map = configDraft.maps[0], x = Number(cell.dataset.mapX), y = Number(cell.dataset.mapY), brush = mapEditorTool;
    const onPlayerSpawn = map.playerSpawn.x === x && map.playerSpawn.y === y;
    const extracts = map.extractionPoints || [map.extractPoint];
    const onExtraction = extracts.some((item) => item.x === x && item.y === y);
    if (onPlayerSpawn && !['spawn', 'select'].includes(brush)) return toast('玩家出生点只能通过出生点工具移动', true);
    if (onExtraction && !['extract', 'select', 'ground', 'erase'].includes(brush)) return toast('撤离点不能与其他对象重叠', true);
    if (onExtraction && brush === 'extract') return;
    const clear = () => {
      map.obstacles = map.obstacles.filter((item) => item.x !== x || item.y !== y);
      map.monsterSpawns = map.monsterSpawns.filter((item) => item.x !== x || item.y !== y);
      if (!onExtraction || extracts.length > 1) map.extractionPoints = extracts.filter((item) => item.x !== x || item.y !== y);
      else if (['ground', 'erase'].includes(brush)) toast('地图至少需要一个撤离点', true);
    };
    clear();
    if (brush === 'obstacle') map.obstacles.push({ x, y });
    else if (brush === 'spawn') map.playerSpawn = { x, y };
    else if (brush === 'extract') map.extractionPoints.push({ x, y, requiredTurns: map.extractPoint?.requiredTurns || 3 });
    else if (brush.startsWith('monster:')) map.monsterSpawns.push({ monsterId: brush.split(':')[1], x, y, count: 1 });
    map.extractPoint = map.extractionPoints[0] || map.extractPoint;
    refreshMapCellClasses(map);
  };
  document.querySelectorAll('[data-map-x]').forEach((cell) => {
    cell.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const x = Number(cell.dataset.mapX), y = Number(cell.dataset.mapY);
      if (mapEditorTool === 'select') { selectMapObjectAt(x, y); renderConfigFields(); return; }
      if (mapEditorTool === 'random-area') { handleAreaCorner(x, y); return; }
      recordMapEditorChange();
      painting = true;
      paint(cell);
      addEventListener('pointerup', () => { painting = false; renderConfigFields(); }, { once: true });
    });
    cell.addEventListener('pointerenter', () => { if (painting && ['ground', 'obstacle', 'erase'].includes(mapEditorTool)) paint(cell); });
  });
  bindActions(editor, {
    'resize-map': () => { const map = configDraft.maps[0]; recordMapEditorChange(); map.width = Math.max(10, Math.min(50, Math.round(Number(document.querySelector('#map-width').value)))); map.height = Math.max(10, Math.min(50, Math.round(Number(document.querySelector('#map-height').value)))); trimMapToBounds(map); trimRandomAreas(map); mapEditorSelection = null; mapAreaAnchor = null; renderConfigFields(); },
    'undo-map': undoMapEditorChange,
    'redo-map': redoMapEditorChange,
    'clear-map': () => { const map = configDraft.maps[0]; recordMapEditorChange(); map.obstacles = []; map.monsterSpawns = []; map.randomSpawnRules = []; mapEditorSelection = null; mapAreaAnchor = null; renderConfigFields(); },
    'generate-seed': () => { recordMapEditorChange(); configDraft.maps[0].random.seed = globalThis.crypto?.randomUUID?.() || Date.now().toString(36); renderConfigFields(); },
    'copy-seed': async () => { await navigator.clipboard?.writeText(configDraft.maps[0].random.seed); toast('Seed 已复制'); },
    'playtest-map': startMapPlaytest,
    'import-map': () => { importTarget = 'map'; fileInput.click(); },
    'export-map': exportCurrentMap,
    'reset-map': resetDefaultMap,
    'delete-selected': deleteSelectedMapObject
  });
  document.querySelector('#map-brush')?.addEventListener('change', (event) => { mapEditorTool = event.target.value; mapAreaAnchor = null; if (mapEditorTool !== 'select') mapEditorSelection = null; renderConfigFields(); });
  document.querySelector('#fixed-seed')?.addEventListener('change', (event) => { recordMapEditorChange(); currentMap.random.useFixedSeed = event.target.checked; renderConfigFields(); });
  document.querySelector('#map-seed')?.addEventListener('change', (event) => { recordMapEditorChange(); currentMap.random.seed = event.target.value; renderConfigFields(); });
  editor.querySelectorAll('[data-selected-path]').forEach((input) => input.addEventListener('change', () => updateSelectedMapObject(input)));
}

function recordMapEditorChange() {
  mapEditorHistory.undo.push(structuredClone(configDraft.maps[0]));
  if (mapEditorHistory.undo.length > 50) mapEditorHistory.undo.shift();
  mapEditorHistory.redo = [];
}

function clearMapEditorHistory() {
  mapEditorHistory.undo = []; mapEditorHistory.redo = [];
  mapEditorSelection = null; mapAreaAnchor = null;
}

function undoMapEditorChange() {
  const previous = mapEditorHistory.undo.pop();
  if (!previous) return;
  mapEditorHistory.redo.push(structuredClone(configDraft.maps[0]));
  configDraft.maps[0] = previous;
  mapEditorSelection = null; mapAreaAnchor = null; renderConfigFields();
}

function redoMapEditorChange() {
  const next = mapEditorHistory.redo.pop();
  if (!next) return;
  mapEditorHistory.undo.push(structuredClone(configDraft.maps[0]));
  configDraft.maps[0] = next;
  mapEditorSelection = null; mapAreaAnchor = null; renderConfigFields();
}

function selectMapObjectAt(x, y) {
  const map = configDraft.maps[0];
  const monsterIndex = map.monsterSpawns.findIndex((item) => item.x === x && item.y === y);
  const extractIndex = (map.extractionPoints || [map.extractPoint]).findIndex((item) => item.x === x && item.y === y);
  const obstacleIndex = map.obstacles.findIndex((item) => item.x === x && item.y === y);
  let areaIndex = -1;
  for (let index = map.randomSpawnRules.length - 1; index >= 0; index -= 1) {
    const area = map.randomSpawnRules[index].allowedArea;
    if (area && x >= area.x && y >= area.y && x < area.x + area.width && y < area.y + area.height) { areaIndex = index; break; }
  }
  if (monsterIndex >= 0) mapEditorSelection = { type: 'monster', index: monsterIndex };
  else if (extractIndex >= 0) mapEditorSelection = { type: 'extract', index: extractIndex };
  else if (map.playerSpawn.x === x && map.playerSpawn.y === y) mapEditorSelection = { type: 'player', index: 0 };
  else if (obstacleIndex >= 0) mapEditorSelection = { type: 'obstacle', index: obstacleIndex };
  else if (areaIndex >= 0) mapEditorSelection = { type: 'randomRule', index: areaIndex };
  else mapEditorSelection = null;
}

function handleAreaCorner(x, y) {
  if (!mapAreaAnchor) { mapAreaAnchor = { x, y }; renderConfigFields(); return; }
  const x1 = Math.min(mapAreaAnchor.x, x), y1 = Math.min(mapAreaAnchor.y, y);
  const rule = {
    id: `random-area-${Date.now().toString(36).slice(-5)}`, enabled: true, monsterConfigId: configDraft.monsters[0].id,
    minCount: 1, maxCount: 1, allowedArea: { x: x1, y: y1, width: Math.abs(x - mapAreaAnchor.x) + 1, height: Math.abs(y - mapAreaAnchor.y) + 1 }, excludedAreas: [],
    minDistanceFromPlayerSpawn: 0, minDistanceFromExtraction: 0, minDistanceBetweenSameType: 1, minDistanceBetweenAnyMonster: 1, placementAttempts: 120
  };
  recordMapEditorChange();
  configDraft.maps[0].randomSpawnRules.push(rule);
  mapEditorSelection = { type: 'randomRule', index: configDraft.maps[0].randomSpawnRules.length - 1 };
  mapAreaAnchor = null; mapEditorTool = 'select'; renderConfigFields();
}

function selectedMapObject() {
  const map = configDraft.maps[0], selection = mapEditorSelection;
  if (!selection) return null;
  if (selection.type === 'player') return map.playerSpawn;
  if (selection.type === 'extract') return (map.extractionPoints || [map.extractPoint])[selection.index];
  if (selection.type === 'monster') return map.monsterSpawns[selection.index];
  if (selection.type === 'obstacle') return map.obstacles[selection.index];
  if (selection.type === 'randomRule') return map.randomSpawnRules[selection.index];
  return null;
}

function updateSelectedMapObject(input) {
  const target = selectedMapObject();
  if (!target) return;
  recordMapEditorChange();
  const parts = input.dataset.selectedPath.split('.');
  let owner = target;
  for (let index = 0; index < parts.length - 1; index += 1) owner = owner[parts[index]] ||= {};
  const key = parts.at(-1);
  owner[key] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
  const map = configDraft.maps[0];
  if ('x' in target && 'y' in target) { target.x = Math.max(0, Math.min(map.width - 1, Math.round(target.x))); target.y = Math.max(0, Math.min(map.height - 1, Math.round(target.y))); }
  if ('count' in target) target.count = Math.max(1, Math.round(target.count));
  if ('requiredTurns' in target) target.requiredTurns = Math.max(1, Math.round(target.requiredTurns));
  trimRandomAreas(map);
  map.extractPoint = (map.extractionPoints || [map.extractPoint])[0];
  renderConfigFields();
}

function trimRandomAreas(map) {
  (map.randomSpawnRules || []).forEach((rule) => {
    if (!rule.allowedArea) return;
    rule.allowedArea.x = Math.max(0, Math.min(map.width - 1, Math.round(rule.allowedArea.x)));
    rule.allowedArea.y = Math.max(0, Math.min(map.height - 1, Math.round(rule.allowedArea.y)));
    rule.allowedArea.width = Math.max(1, Math.min(map.width - rule.allowedArea.x, Math.round(rule.allowedArea.width)));
    rule.allowedArea.height = Math.max(1, Math.min(map.height - rule.allowedArea.y, Math.round(rule.allowedArea.height)));
  });
}

function deleteSelectedMapObject() {
  const map = configDraft.maps[0], selection = mapEditorSelection;
  if (!selection || selection.type === 'player') return;
  if (selection.type === 'extract' && (map.extractionPoints || []).length <= 1) return toast('地图至少需要一个撤离点', true);
  recordMapEditorChange();
  if (selection.type === 'extract') map.extractionPoints.splice(selection.index, 1);
  else if (selection.type === 'monster') map.monsterSpawns.splice(selection.index, 1);
  else if (selection.type === 'obstacle') map.obstacles.splice(selection.index, 1);
  else if (selection.type === 'randomRule') map.randomSpawnRules.splice(selection.index, 1);
  map.extractPoint = map.extractionPoints[0]; mapEditorSelection = null; renderConfigFields();
}

function exportCurrentMap() {
  const map = configDraft.maps[0];
  const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${map.id || 'map'}.json`; link.click(); URL.revokeObjectURL(link.href);
}

function resetDefaultMap() {
  if (!confirm('仅恢复第一张内置默认地图？其他配置不会改变。')) return;
  recordMapEditorChange();
  configDraft.maps[0] = structuredClone(configService.loadDefaultConfig().maps[0]);
  mapEditorSelection = null; mapAreaAnchor = null; renderConfigFields(); toast('已恢复默认地图');
}

function refreshMapCellClasses(map) {
  const obstacles = new Set(map.obstacles.map((item) => `${item.x},${item.y}`));
  const monsters = new Map(map.monsterSpawns.map((item) => [`${item.x},${item.y}`, item.monsterId]));
  const extracts = new Set((map.extractionPoints || [map.extractPoint]).map((item) => `${item.x},${item.y}`));
  document.querySelectorAll('[data-map-x]').forEach((cell) => {
    const key = `${cell.dataset.mapX},${cell.dataset.mapY}`;
    let type = obstacles.has(key) ? 'obstacle' : '';
    if (`${map.playerSpawn.x},${map.playerSpawn.y}` === key) type = 'spawn';
    if (extracts.has(key)) type = 'extract';
    if (monsters.has(key)) type = `monster ${monsters.get(key)}`;
    cell.className = type;
  });
}

function startMapPlaytest() {
  if (!validateDraft()) return;
  playtestState = { config, save, activeCategory };
  config = structuredClone(configDraft);
  save = createInitialSave(config);
  save.activeExpedition = null;
  startExpedition();
  toast(`试玩 Seed：${config.maps[0].random.seed}`);
}

function leaveMapPlaytest() {
  runtime?.stop();
  const previous = playtestState;
  if (!previous) return renderShelter();
  config = previous.config; save = previous.save; activeCategory = 'mapEditor'; playtestState = null; runtime = null;
  renderConfig();
}

function renderObjectFields(object, path) {
  return `<div class="field-grid">${Object.entries(object).map(([key, value]) => {
    const fieldPath = `${path}.${key}`;
    if (Array.isArray(value)) {
      if (value.length && typeof value[0] === 'object') return `<details class="nested-array"><summary>${labels[key] || key} <small>${value.length} 项</small></summary>${value.map((item, index) => `<div class="nested-item"><strong>${item.name || item.monsterId || item.id || `#${index + 1}`}</strong>${renderObjectFields(item, `${fieldPath}.${index}`)}</div>`).join('')}</details>`;
      return `<label class="field"><span>${labels[key] || key}</span><textarea data-path="${fieldPath}" data-kind="array">${JSON.stringify(value)}</textarea></label>`;
    }
    if (value && typeof value === 'object') return `<fieldset class="nested-object"><legend>${labels[key] || key}</legend>${renderObjectFields(value, fieldPath)}</fieldset>`;
    const type = typeof value === 'boolean' ? 'checkbox' : typeof value === 'number' ? 'number' : key === 'color' ? 'color' : 'text';
    if (type === 'checkbox') return `<label class="field toggle"><span>${labels[key] || key}</span><input type="checkbox" data-path="${fieldPath}" ${value ? 'checked' : ''}><i></i></label>`;
    return `<label class="field"><span>${labels[key] || key}</span><input type="${type}" data-path="${fieldPath}" value="${String(value).replaceAll('"', '&quot;')}" ${type === 'number' ? 'step="any"' : ''}></label>`;
  }).join('')}</div>`;
}

function bindConfigInputs(root) {
  root.querySelectorAll('[data-path]').forEach((input) => input.addEventListener('change', () => {
    const parts = input.dataset.path.split('.');
    let target = configDraft;
    for (let index = 0; index < parts.length - 1; index += 1) target = target[parts[index]];
    const key = parts.at(-1);
    if (input.dataset.kind === 'array') {
      try { target[key] = JSON.parse(input.value); input.classList.remove('invalid'); } catch { input.classList.add('invalid'); }
    } else if (input.type === 'checkbox') target[key] = input.checked;
    else if (input.type === 'number') target[key] = Number(input.value);
    else target[key] = input.value;
  }));
}

function validateDraft() {
  const result = configService.validateConfig(configDraft);
  if (result.valid) { setConfigStatus('校验通过：配置引用和数值范围有效', true); return true; }
  setConfigStatus(`发现 ${result.errors.length} 个问题：${result.errors.slice(0, 3).join('；')}`, false); return false;
}

function setConfigStatus(message, valid) {
  const node = document.querySelector('#config-status'); if (!node) return;
  node.textContent = message; node.className = valid ? 'valid' : 'invalid';
}

function exportDraft() {
  const blob = new Blob([configService.exportConfig(configDraft)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'tiny-signal-config.json'; link.click(); URL.revokeObjectURL(link.href);
}

fileInput.addEventListener('change', async () => {
  try {
    const json = await fileInput.files[0].text();
    if (importTarget === 'map') {
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('单张地图 JSON 必须是对象');
      const defaultMap = configService.loadDefaultConfig().maps[0];
      const importedMap = {
        ...structuredClone(defaultMap), ...parsed,
        fogOfWar: { ...defaultMap.fogOfWar, ...(parsed.fogOfWar || {}) },
        random: { ...defaultMap.random, ...(parsed.random || {}) },
        extractionPoints: parsed.extractionPoints || (parsed.extractPoint ? [parsed.extractPoint] : structuredClone(defaultMap.extractionPoints)),
        randomSpawnRules: parsed.randomSpawnRules || []
      };
      trimRandomAreas(importedMap);
      const candidate = structuredClone(configDraft); candidate.maps[0] = importedMap;
      const result = configService.validateConfig(candidate);
      if (!result.valid) throw new Error(result.errors.slice(0, 5).join('；'));
      recordMapEditorChange(); configDraft.maps[0] = importedMap; mapEditorSelection = null; mapAreaAnchor = null; renderConfigFields(); toast('单张地图已导入，请检查后保存');
    } else {
      configDraft = configService.importConfig(json); clearMapEditorHistory(); renderConfig(); toast('配置已导入，请检查后保存');
    }
  }
  catch (error) { toast(`导入失败：${error.message}`, true); }
  fileInput.value = ''; importTarget = 'config';
});

function toast(message, error = false) {
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div'); node.className = `toast ${error ? 'error' : ''}`; node.textContent = message; document.body.append(node);
  requestAnimationFrame(() => node.classList.add('show')); setTimeout(() => node.remove(), 2800);
}

function showModal(title, copy, actions = []) {
  closeModal();
  const layer = document.createElement('div'); layer.className = 'modal-layer'; layer.id = 'global-modal';
  layer.innerHTML = `<section class="story-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><span class="eyebrow">THE FOG REMEMBERS</span><h2 id="modal-title">${title}</h2><p>${String(copy).replaceAll('\n', '<br>')}</p><div class="modal-actions">${actions.map((item, index) => `<button data-modal-action="${index}" class="${item.primary ? 'primary' : ''}" ${item.disabled ? 'disabled' : ''}>${item.label}</button>`).join('')}</div></section>`;
  document.body.append(layer);
  actions.forEach((item, index) => layer.querySelector(`[data-modal-action="${index}"]`)?.addEventListener('click', () => { audioService.playSfx('click'); item.action?.(); }));
  layer.querySelector('button')?.focus();
}

function closeModal() { document.querySelector('#global-modal')?.remove(); }

function showWhisper(message) {
  if (!config.madnessPresentation.enabled || !config.madnessPresentation.showWhispers) return;
  document.querySelector('.whisper-toast')?.remove();
  const node = document.createElement('div'); node.className = 'whisper-toast'; node.textContent = message; document.body.append(node);
  setTimeout(() => node.remove(), 2600);
}

function showStageMessage(change) {
  showModal(change.stage.state || change.stage.name, change.message, [{ label: '继续', primary: true, action: closeModal }]);
}

window.addEventListener('beforeunload', () => runtime?.stop());
renderMain();
if (save.migrationNotice === 'v2-world-reset') {
  delete save.migrationNotice;
  persistSave(save);
  showModal(
    '存档已更新',
    '游戏主线已调整，旧 V2 连续世界存档无法用于当前版本，已创建新的远征存档。',
    [{ label: '知道了', primary: true, action: closeModal }]
  );
}
