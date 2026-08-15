from pathlib import Path

css_path = Path('formal-art.css')
css = css_path.read_text(encoding='utf-8')
marker = '/* === V3.1 FORMAL ART PASS 2 === */'
if marker not in css:
    css += r'''

/* === V3.1 FORMAL ART PASS 2 === */
:root{
  --frame:#4b4030;--frame-hi:#8c7553;--panel-deep:rgba(8,11,10,.92);
  --danger:#9b3d2f;--warning:#ad7b3f;--safe:#6f8258;--cold:#6d8390;
}
.menu-screen,.shelter-screen,.game-screen,.battle-screen{isolation:isolate}
.menu-screen:before,.shelter-screen:before,.game-screen:before,.battle-screen:before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;background:radial-gradient(circle at 50% 45%,transparent 0 38%,rgba(0,0,0,.46) 78%,rgba(0,0,0,.78) 100%),linear-gradient(180deg,rgba(255,230,170,.025),transparent 25%,rgba(0,0,0,.28))}
.menu-screen>* ,.shelter-screen>* ,.game-screen>* ,.battle-screen>*{position:relative;z-index:1}
.panel,.exploration-side,.hud,.modal-card,.battle-screen,.config-card{border:1px solid var(--frame-hi)!important;outline:5px solid rgba(18,17,14,.94)!important;box-shadow:inset 0 0 0 1px #251f18,inset 0 0 35px #0008,0 16px 45px #000b!important}
.panel:before,.exploration-side:before,.hud:before,.modal-card:before{content:"";position:absolute;inset:5px;pointer-events:none;border:1px solid rgba(142,116,77,.18)}
.panel,.exploration-side,.hud,.modal-card{position:relative;overflow:hidden}
.panel-kicker,.eyebrow{color:#9d8a69!important;letter-spacing:.16em!important;text-shadow:0 1px #000}
.menu-copy{padding:clamp(30px,7vh,78px) clamp(28px,6vw,96px)!important;max-width:760px}
.menu-copy:before{content:"POLLUTED FRONTIER";display:block;color:#7d6a4f;font-size:.78rem;letter-spacing:.42em;margin-bottom:8px}
.menu-copy h1{line-height:.92!important;margin:.08em 0 .22em!important}
.menu-actions{display:grid!important;gap:8px!important}
.menu-actions button{font-size:1rem!important;border-left:3px solid #8b714f!important;background-color:rgba(21,21,17,.9)!important}
.menu-actions button.primary{border-left-color:#b55c40!important}
.menu-note{max-width:360px;background:rgba(8,10,9,.78)!important;border:1px solid #5d503b!important;outline:4px solid #0c0e0c;padding:18px 22px!important}
.shelter-screen{background-position:center 15%!important}
.topbar{border-bottom:1px solid #5c4e39;padding-bottom:14px!important;margin-bottom:18px!important}
.shelter-grid{max-width:1540px;margin:0 auto;align-items:stretch!important}
.shelter-grid .panel{min-height:210px!important;background-color:rgba(10,13,11,.86)!important}
.status-panel{grid-column:span 3!important;padding-left:118px!important}
.status-panel:after{content:"";position:absolute;left:16px;top:56px;width:86px;height:128px;background:url('./assets/art/player.svg') center/contain no-repeat;filter:sepia(.1) saturate(.75) brightness(.86);opacity:.92}
.pantry-panel{grid-column:span 3!important}
.relic-panel{grid-column:span 6!important;min-height:340px!important;text-align:center;background:linear-gradient(90deg,rgba(8,11,9,.94),rgba(11,15,12,.62),rgba(8,11,9,.94)),url('./assets/art/shelter-bg.svg') center 36%/cover!important}
.relic-panel .relic-visual{min-height:190px!important;filter:drop-shadow(0 0 18px rgba(213,215,163,.24))}
.relic-panel .stat-row,.relic-panel p,.relic-panel .relic-actions{max-width:620px;margin-left:auto;margin-right:auto}
.farm-panel{grid-column:span 4!important}
.expedition-panel{grid-column:span 5!important;background:linear-gradient(90deg,rgba(8,11,9,.9),rgba(8,11,9,.65)),url('./assets/art/menu-bg.svg') center 58%/cover!important}
.goal-panel{grid-column:span 3!important}
.resource{border-top:1px solid rgba(121,103,75,.22);padding:12px 0!important}.resource:first-of-type{border-top:0}
.shelter-footer{text-align:center;color:#797766!important;border-top:1px solid #393329;margin-top:16px;padding-top:12px}
.game-screen{display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:center!important;overflow:hidden!important;background:linear-gradient(#080b0bcf,#080b0bf2),url('./assets/art/menu-bg.svg') center/cover fixed no-repeat!important}
.exploration-layout{position:relative!important;display:block!important;width:min(96vw,1050px)!important;margin:0 auto!important}
.exploration-layout canvas{display:block!important;width:min(82vh,82vw,820px)!important;height:auto!important;margin:0 auto!important;border-width:8px!important;outline:1px solid #8e7652!important;background:#0a0e0b!important;filter:saturate(.82) contrast(1.06)}
.exploration-side{position:absolute!important;right:-4px!important;top:14px!important;width:min(300px,31vw)!important;min-width:230px;padding:15px 16px!important;background:rgba(7,10,9,.9)!important;backdrop-filter:blur(5px);z-index:5}
.exploration-side h3{margin:.2rem 0 .5rem!important;font-size:1.3rem!important}.exploration-side>p{font-size:.78rem!important;color:#999482!important;margin:.35rem 0 .8rem!important}
.legend{display:grid!important;grid-template-columns:1fr 1fr!important;gap:5px!important;font-size:.75rem!important}
.turn-message{font-size:.8rem!important;min-height:48px!important;margin:.7rem 0!important;padding:8px 10px!important}
.explore-actions{display:grid!important;grid-template-columns:1fr 1fr!important;gap:6px!important}.explore-actions button{min-height:38px!important;font-size:.78rem!important;padding:.4rem .55rem!important}
#interact-button{grid-column:1/-1!important;border-color:#a48655!important;animation:interactionPulse 1.35s ease-in-out infinite}
@keyframes interactionPulse{50%{box-shadow:0 0 18px rgba(193,154,83,.28),inset 0 0 0 1px #3b3022}}
.hud{width:min(96vw,1050px)!important;margin:12px auto 0!important;padding:10px 14px!important;display:grid!important;grid-template-columns:minmax(0,1.4fr) minmax(300px,.9fr)!important;gap:16px!important;background:rgba(7,10,9,.93)!important}
.hud-bars{display:grid!important;grid-template-columns:1fr 1fr!important;gap:7px 12px!important}.hud-bars label{display:grid!important;grid-template-columns:72px 1fr 42px!important;align-items:center!important;gap:7px!important;font-size:.75rem!important}.hud-bars label>span{grid-column:3;text-align:right}.hud-bars label>i{grid-column:2;grid-row:1;margin:0!important}
.hud-info{display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:4px 10px!important;align-content:center!important;font-size:.74rem!important}.hud-info span{border-bottom:1px solid rgba(113,94,66,.18);padding:3px 0}.hud-goal{grid-column:1/-1;color:#b99b69!important}
.game-screen .madness-overlay{z-index:3!important;pointer-events:none}.madness-medium .madness-overlay{opacity:.08!important}.madness-high .madness-overlay{opacity:.15!important}.madness-severe .madness-overlay{opacity:.22!important}
.danger-notice{right:clamp(14px,4vw,58px)!important;top:clamp(14px,4vh,48px)!important;min-width:280px!important;border-left:4px solid var(--warning)!important;background:rgba(17,12,9,.94)!important}.danger-notice.attack-intent,.danger-notice.chase{border-left-color:var(--danger)!important}
.battle-layer{backdrop-filter:blur(5px)}
.battle-screen{width:min(1180px,96vw)!important;min-height:min(760px,92vh)!important;margin:auto!important;padding:24px 28px!important;background:linear-gradient(180deg,rgba(7,9,8,.28),rgba(7,9,8,.82)),url('./assets/art/menu-bg.svg') center/cover!important}
.battle-screen header{border-bottom:1px solid #65543d!important;padding-bottom:14px!important}
.combatants{min-height:390px!important;display:grid!important;grid-template-columns:1fr 110px 1fr!important;align-items:end!important;gap:10px!important}
.combatant{background:linear-gradient(180deg,transparent 0 42%,rgba(7,9,8,.78) 72%)!important;border:0!important;box-shadow:none!important;padding:10px 18px 18px!important}
.combatant-art{height:310px!important;filter:drop-shadow(0 18px 18px #000)!important}.player-combatant .combatant-art{transform:scaleX(-1)}
.versus{font-size:1.1rem!important;letter-spacing:.18em;color:#826c4e!important;align-self:center!important}
.battle-bottom{display:grid!important;grid-template-columns:1fr 1.2fr!important;gap:14px!important;border-top:1px solid #584a37!important;padding-top:14px!important}.battle-log{max-height:150px!important;overflow:auto!important;background:#080b09b8!important;border:1px solid #382f24!important;padding:10px 12px!important}.battle-actions{display:grid!important;grid-template-columns:repeat(2,1fr)!important;gap:8px!important}.battle-actions button{min-height:52px!important}.battle-actions .recommended-action{border-color:#9c7747!important;box-shadow:0 0 14px rgba(176,128,67,.16)!important}
.modal-card{max-width:610px!important;background-color:rgba(10,12,10,.97)!important}.modal-actions{border-top:1px solid #3c3327;padding-top:12px!important}
.config-screen{min-height:100vh!important}.config-header{border-bottom:1px solid #4b4030!important}.config-nav{background:#080b09d9!important;border-right:1px solid #4b4030!important}.config-editor{background:#0a0d0bcc!important}
@media(max-width:980px){.status-panel,.pantry-panel,.relic-panel,.farm-panel,.expedition-panel,.goal-panel{grid-column:auto!important}.status-panel{padding-left:104px!important}.exploration-layout{width:100%!important}.exploration-layout canvas{width:min(96vw,760px)!important}.exploration-side{position:relative!important;right:auto!important;top:auto!important;width:auto!important;min-width:0!important;margin-top:8px!important}.hud{width:100%!important;grid-template-columns:1fr!important}.hud-bars{grid-template-columns:1fr!important}.hud-info{grid-template-columns:repeat(2,1fr)!important}.mobile-pad{z-index:8!important;bottom:18px!important}.combatants{grid-template-columns:1fr 54px 1fr!important;min-height:300px!important}.combatant-art{height:180px!important}.battle-bottom{grid-template-columns:1fr!important}}
@media(max-width:620px){.menu-copy{padding:28px 18px!important}.menu-copy h1{font-size:3.4rem!important}.menu-note{display:none!important}.hud-info{grid-template-columns:1fr 1fr!important}.battle-screen{padding:14px!important}.combatants{grid-template-columns:1fr!important}.versus{display:none!important}.combatant-art{height:145px!important}.enemy-combatant .combatant-art{height:165px!important}}
'''
    css_path.write_text(css, encoding='utf-8')

game_path = Path('game.js')
game = game_path.read_text(encoding='utf-8')
game = game.replace('亮色是当前视野，暗色是最后记忆，黑色区域尚未探索。', '雾会吞掉未探索区域；已探索区域只保留最后一次观察到的信息。')
game = game.replace('WASD / 方向键移动，也可以点击相邻格', 'WASD / 方向键 / 点击相邻格 · E 交互 · 空格战斗快捷操作')
game = game.replace('<span class="eyebrow">OUTDOOR_EXPLORATION</span><h3>${config.maps[0].name}</h3>', '<span class="eyebrow">污染区远征</span><h3>${config.maps[0].name}</h3>')
game = game.replace('<span class="eyebrow">BATTLE · ROUND ${view.round}</span>', '<span class="eyebrow">接敌 · ROUND ${view.round}</span>')
game = game.replace('<span>速度决定先后手</span>', '<span>观察敌人状态，决定进攻、防御或脱离</span>')
game_path.write_text(game, encoding='utf-8')

doc = Path('docs/design/v3.1-formal-art-pass.md')
text = doc.read_text(encoding='utf-8')
if '## 第二轮：正式界面化' not in text:
    text += '''
## 第二轮：正式界面化

- 户外探索从网页双栏布局收拢为地图主画面 + 战术覆盖层，HUD 下沉为指挥条。
- 庇护所重新编排为基地控制台：圣遗物成为视觉中心，幸存者状态、仓储、种植、外出与目标围绕核心组织。
- 战斗界面升级为全屏对峙构图，角色美术占主视觉，日志与操作位于下方。
- 格子、敌人视野、迷雾判定继续保持精确，不牺牲可读性换氛围。
- UI 统一使用磨损边框、暗色材料、少量警戒色，不再使用明显 Web Card 语言。
'''
    doc.write_text(text, encoding='utf-8')
