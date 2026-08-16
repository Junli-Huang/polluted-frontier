from pathlib import Path
import re

runtime_path = Path('src/game-runtime.js')
runtime = runtime_path.read_text(encoding='utf-8')

old_files = """const FORMAL_ART_FILES = {\n  ground: './assets/art/terrain-ground.svg', obstacle: './assets/art/terrain-obstacle.svg',\n  player: './assets/art/player.svg', enemy: './assets/art/enemy.svg', nest: './assets/art/nest.svg',\n  corpse: './assets/art/corpse.svg', extract: './assets/art/extract.svg', fog: './assets/art/fog.svg',\n  facing: './assets/art/facing-arrow.svg', alert: './assets/art/alert.svg'\n};"""
new_files = """const FORMAL_ART_FILES = {\n  actors: './assets/art/formal-actors.webp',\n  props: './assets/art/formal-props.webp',\n  tiles: './assets/art/formal-tiles.webp',\n  fog: './assets/art/fog.svg',\n  facing: './assets/art/facing-arrow.svg',\n  alert: './assets/art/alert.svg'\n};\n\nconst FORMAL_ART_FRAMES = {\n  player: { atlas: 'actors', x: 0, y: 0, w: 220, h: 300 },\n  stalker: { atlas: 'actors', x: 220, y: 0, w: 220, h: 300 },\n  brute: { atlas: 'actors', x: 440, y: 0, w: 220, h: 300 },\n  hound: { atlas: 'actors', x: 660, y: 0, w: 220, h: 300 },\n  nest: { atlas: 'actors', x: 880, y: 0, w: 220, h: 300 },\n  corpse: { atlas: 'props', x: 0, y: 0, w: 220, h: 220 },\n  extract: { atlas: 'props', x: 220, y: 0, w: 220, h: 220 }\n};\n\nconst MONSTER_ART = {\n  passive: 'brute',\n  wanderer: 'stalker',\n  tracker: 'hound',\n  basic_nest: 'nest'\n};"""
if old_files not in runtime:
    raise SystemExit('FORMAL_ART_FILES block not found')
runtime = runtime.replace(old_files, new_files, 1)

anchor = """function drawImageCover(ctx, image, x, y, width, height, alpha = 1) {\n  if (!image?.complete || !image.naturalWidth) return false;\n  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);\n  const sw = width / scale, sh = height / scale;\n  const sx = (image.naturalWidth - sw) / 2, sy = (image.naturalHeight - sh) / 2;\n  ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height); ctx.restore();\n  return true;\n}\n"""
helper = anchor + """\nfunction drawAtlasFrame(ctx, assets, frameKey, x, y, width, height, alpha = 1, fit = 'contain') {\n  const frame = FORMAL_ART_FRAMES[frameKey];\n  const image = frame ? assets[frame.atlas] : null;\n  if (!frame || !image?.complete || !image.naturalWidth) return false;\n  const scale = fit === 'cover'\n    ? Math.max(width / frame.w, height / frame.h)\n    : Math.min(width / frame.w, height / frame.h);\n  const dw = frame.w * scale, dh = frame.h * scale;\n  const dx = x + (width - dw) / 2, dy = y + (height - dh) / 2;\n  ctx.save();\n  ctx.globalAlpha = alpha;\n  ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, dx, dy, dw, dh);\n  ctx.restore();\n  return true;\n}\n\nfunction tileAtlasFrame(tile, variant) {\n  return { x: (variant % 4) * 128, y: tile.walkable ? 0 : 128, w: 128, h: 128 };\n}\n\nfunction drawTileAtlas(ctx, image, frame, x, y, size, alpha = 1) {\n  if (!image?.complete || !image.naturalWidth) return false;\n  ctx.save(); ctx.globalAlpha = alpha;\n  ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, x, y, size, size);\n  ctx.restore();\n  return true;\n}\n"""
if anchor not in runtime:
    raise SystemExit('drawImageCover anchor not found')
runtime = runtime.replace(anchor, helper, 1)

runtime = runtime.replace(
    "id: monster.id, name: monster.config.name, color: monster.config.color, state: monster.state,",
    "id: monster.id, typeId: monster.config.id, name: monster.config.name, color: monster.config.color, state: monster.state,",
    1
)

terrain_pattern = re.compile(r"  drawTerrainArt\(px, py, size, tile\) \{.*?\n  \}\n\n  drawGroundTexture", re.S)
terrain_replacement = """  drawTerrainArt(px, py, size, tile) {\n    const variation = Math.floor(((seededFogJitter(tile.x, tile.y) + 1) * .5) * 4) % 4;\n    const frame = tileAtlasFrame(tile, variation);\n    if (!drawTileAtlas(this.ctx, this.art.tiles, frame, px, py, size, tile.walkable ? 1 : .98)) {\n      this.ctx.fillStyle = tile.walkable ? '#30382f' : '#1b211d';\n      this.ctx.fillRect(px, py, size, size);\n    }\n    if (tile.walkable) {\n      const shade = (seededFogJitter(tile.x + 31, tile.y + 17) + 1) * .5;\n      this.ctx.fillStyle = `rgba(8,12,10,${.035 + shade * .075})`;\n      this.ctx.fillRect(px, py, size, size);\n    }\n  }\n\n  drawGroundTexture"""
runtime, count = terrain_pattern.subn(terrain_replacement, runtime, count=1)
if count != 1:
    raise SystemExit('drawTerrainArt patch failed')

enemy_pattern = re.compile(r"drawEnemy\(px, py, size, enemy, memory\) \{.*?\n  \}\n\n  getVisibleEnemyVision", re.S)
enemy_replacement = """drawEnemy(px, py, size, enemy, memory) {\n    const ctx = this.ctx;\n    const artKey = enemy.isSpawner ? 'nest' : (MONSTER_ART[enemy.typeId] || 'stalker');\n    const alpha = memory ? .42 : 1;\n    ctx.save();\n    ctx.shadowColor = memory ? 'transparent' : 'rgba(0,0,0,.7)';\n    ctx.shadowBlur = memory ? 0 : Math.max(3, size * .16);\n    const drawn = drawAtlasFrame(\n      ctx, this.art, artKey,\n      px - size * (enemy.isSpawner ? .22 : .18),\n      py - size * (enemy.isSpawner ? .18 : .32),\n      size * (enemy.isSpawner ? 1.44 : 1.36),\n      size * (enemy.isSpawner ? 1.36 : 1.55),\n      alpha\n    );\n    ctx.shadowBlur = 0;\n    if (!drawn) {\n      ctx.globalAlpha = alpha;\n      ctx.fillStyle = enemy.color;\n      ctx.beginPath(); ctx.arc(px + size / 2, py + size / 2, size * .25, 0, Math.PI * 2); ctx.fill();\n    }\n    if (!memory && enemy.visionEnabled && !enemy.isSpawner) {\n      const angle = directionAngle(enemy.facing);\n      const centerX = px + size / 2, centerY = py + size / 2;\n      ctx.translate(centerX, centerY); ctx.rotate(angle);\n      if (!drawImageCover(ctx, this.art.facing, size * .15, -size * .1, size * .28, size * .2, .88)) {\n        ctx.fillStyle = '#efe4c7'; ctx.beginPath();\n        ctx.moveTo(size * .39, 0); ctx.lineTo(size * .17, -size * .09); ctx.lineTo(size * .17, size * .09);\n        ctx.closePath(); ctx.fill();\n      }\n      ctx.rotate(-angle); ctx.translate(-centerX, -centerY);\n    }\n    if (!memory && ['Alert', 'Chase', 'AttackIntent'].includes(enemy.state)) {\n      const noticeAlpha = enemy.state === 'AttackIntent' ? 1 : .9;\n      if (!drawImageCover(ctx, this.art.alert, px + size * .31, py - size * .16, size * .38, size * .38, noticeAlpha)) {\n        ctx.fillStyle = enemy.state === 'AttackIntent' ? '#ff705d' : '#e4c06b';\n        ctx.font = `700 ${size * .42}px sans-serif`; ctx.textAlign = 'center';\n        ctx.fillText('!', px + size / 2, py + size * .22);\n      }\n    }\n    if (memory) {\n      ctx.fillStyle = '#d7c89e'; ctx.font = `${size * .28}px serif`; ctx.textAlign = 'center';\n      ctx.fillText('?', px + size * .78, py + size * .3);\n    }\n    ctx.restore();\n  }\n\n  getVisibleEnemyVision"""
runtime, count = enemy_pattern.subn(enemy_replacement, runtime, count=1)
if count != 1:
    raise SystemExit('drawEnemy patch failed')

corpse_pattern = re.compile(r"  drawCorpse\(px, py, size, memory\) \{.*?\n\}\n\ndrawExtract\(px, py, size, memory\) \{.*?\n  \}\n", re.S)
corpse_replacement = """  drawCorpse(px, py, size, memory) {\n    const alpha = memory ? .34 : .96;\n    if (!drawAtlasFrame(this.ctx, this.art, 'corpse', px - size * .12, py + size * .08, size * 1.24, size * .96, alpha)) {\n      this.ctx.fillStyle = '#55473b'; this.ctx.fillRect(px + size * .2, py + size * .42, size * .6, size * .18);\n    }\n  }\n\n  drawExtract(px, py, size, memory) {\n    const alpha = memory ? .48 : 1;\n    if (!drawAtlasFrame(this.ctx, this.art, 'extract', px - size * .12, py - size * .2, size * 1.24, size * 1.42, alpha)) {\n      const ctx = this.ctx; ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = '#b7f4d3'; ctx.lineWidth = 2;\n      ctx.strokeRect(px + 5, py + 5, size - 10, size - 10); ctx.restore();\n    }\n  }\n"""
runtime, count = corpse_pattern.subn(corpse_replacement, runtime, count=1)
if count != 1:
    raise SystemExit('corpse/extract patch failed')

player_pattern = re.compile(r"  drawPlayer\(camera\) \{.*?\n\}\n\}", re.S)
player_replacement = """  drawPlayer(camera) {\n    const ctx = this.ctx, size = this.tileSize, px = (this.player.x - camera.x) * size, py = (this.player.y - camera.y) * size;\n    ctx.save();\n    ctx.shadowColor = 'rgba(221,201,142,.38)'; ctx.shadowBlur = Math.max(4, size * .2);\n    if (!drawAtlasFrame(ctx, this.art, 'player', px - size * .14, py - size * .38, size * 1.28, size * 1.7, 1)) {\n      ctx.fillStyle = '#d9d0ae'; ctx.fillRect(px + size * .3, py + size * .18, size * .4, size * .64);\n    }\n    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(214,194,132,.58)'; ctx.lineWidth = Math.max(1, size * .03);\n    ctx.strokeRect(px + 2, py + 2, size - 4, size - 4); ctx.restore();\n  }\n}"""
runtime, count = player_pattern.subn(player_replacement, runtime, count=1)
if count != 1:
    raise SystemExit('drawPlayer patch failed')

runtime = runtime.replace(
    "enemy: { name: this.battle.monster.config.name, health: this.battle.monster.health, maxHealth: this.battle.monster.config.health, attack: this.battle.monster.config.attack, speed: this.battle.monster.config.speed, color: this.battle.monster.config.color },",
    "enemy: { id: this.battle.monster.config.id, name: this.battle.monster.config.name, health: this.battle.monster.health, maxHealth: this.battle.monster.config.health, attack: this.battle.monster.config.attack, speed: this.battle.monster.config.speed, color: this.battle.monster.config.color },",
    1
)

runtime_path.write_text(runtime, encoding='utf-8')

# Battle DOM gets an enemy type class so the atlas can show the right creature.
game_path = Path('game.js')
game = game_path.read_text(encoding='utf-8')
game = game.replace(
    '<article class="combatant enemy-combatant"><div class="combatant-art" style="--enemy:${view.enemy.color}" aria-label="敌人"></div>',
    '<article class="combatant enemy-combatant enemy-${view.enemy.id}"><div class="combatant-art" style="--enemy:${view.enemy.color}" aria-label="${view.enemy.name}"></div>',
    1
)
game_path.write_text(game, encoding='utf-8')

css_path = Path('formal-art.css')
css = css_path.read_text(encoding='utf-8')
css = css.replace(
    "background:url('./assets/art/player.svg') center/contain no-repeat;filter:sepia(.1) saturate(.75) brightness(.86);opacity:.92",
    "background-image:url('./assets/art/formal-actors.webp');background-size:500% 100%;background-position:0 0;background-repeat:no-repeat;filter:sepia(.1) saturate(.75) brightness(.86);opacity:.92",
    1
)
css = re.sub(
    r"\.player-combatant \.combatant-art\{background-image:url\('\./assets/art/player\.svg'\)!important\}\.enemy-combatant \.combatant-art\{background-image:url\('\./assets/art/enemy\.svg'\)!important\}",
    ".player-combatant .combatant-art,.enemy-combatant .combatant-art{background-image:url('./assets/art/formal-actors.webp')!important;background-size:500% 100%!important;background-repeat:no-repeat!important}.player-combatant .combatant-art{background-position:0 0!important}.enemy-combatant .combatant-art{background-position:25% 0!important}.enemy-combatant.enemy-passive .combatant-art{background-position:50% 0!important}.enemy-combatant.enemy-wanderer .combatant-art{background-position:25% 0!important}.enemy-combatant.enemy-tracker .combatant-art{background-position:75% 0!important}.enemy-combatant.enemy-basic_nest .combatant-art{background-position:100% 0!important}",
    css,
    count=1
)
if 'formal-actors.webp' not in css:
    raise SystemExit('formal atlas CSS patch failed')
css_path.write_text(css, encoding='utf-8')

doc_path = Path('docs/design/v3.1-formal-art-pass.md')
doc = doc_path.read_text(encoding='utf-8')
marker = '## 第三轮：正式 WebP 资产落地'
if marker not in doc:
    doc += '''\n\n## 第三轮：正式 WebP 资产落地\n\n- 将已确认风格的生成美术拆成运行时 WebP 图集，而不是继续依赖程序占位或单色 SVG。\n- `formal-actors.webp`：幸存者、潜行者、腐化巨兽、腐化猎犬、腐化巢穴。\n- `formal-props.webp`：尸体残骸、撤离信标。\n- `formal-tiles.webp`：4 组地表与 4 组障碍纹理。\n- 怪物按配置 ID 映射不同视觉形象，战斗和探索使用同一套角色图集。\n- 格子、视野锥、警戒提示仍是精确玩法信息层，不烘焙进背景图。\n'''
doc_path.write_text(doc, encoding='utf-8')
