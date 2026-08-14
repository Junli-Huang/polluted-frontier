# 污染边境（V3.0.0-dev · Expedition Rebuild）

一个轻量化的“保护区准备 → 单次户外远征 → 搜索、战斗、切割与撤离 → 返回结算”H5 生存探索 Demo。

当前主线以 V1.3.9 的最后稳定代码为玩法基线，恢复保护区 UI、单次户外地图与完整撤离循环。V2.1.2 连续世界版本已保存在 `archive/v2-world` 分支和 `v2.1.2` 标签；真实的 V2.1.1 保存在 `v2.1.1` 标签。

当前实现状态见 [`docs/design/current-game-status.md`](./docs/design/current-game-status.md)，主线调整说明见 [`docs/design/v3-expedition-rebuild.md`](./docs/design/v3-expedition-rebuild.md)。

## 当前核心循环

```text
主菜单
→ 保护区 UI
→ 开始单次户外远征
→ 探索战争迷雾、处理事件与观察敌人
→ 独立回合制战斗
→ 切割尸体获得异变肉
→ 撤离或失败结算
→ 返回保护区 UI
```

## 已实现

- 保护区库存、食用、固定装备、灰麦种植和可交互圣遗物
- 10×10～50×50 单次户外地图、战争迷雾与离散地图回合
- Idle / Wander / Alert / Chase / AttackIntent / Return / Cooldown / Dead 怪物状态机
- 四方向扇形视野、障碍遮挡、腐化巢穴与子怪产出
- 独立回合制战斗、尸体、切割、逐块异变肉污染
- 疯狂、疯狂抗性、环境污染和 8 个随机事件
- 撤离成功、死亡/失败结算、返回保护区和户外快照恢复
- 地图编辑、固定 Seed、程序化 WAV 音效与响应式布局

当前 Demo 目标仍沿用 V1 基线：完成 3 次成功撤离，并累计带回至少 12 块异变肉。

当前尚未重新加入树木/巨石障碍、木石采集、永久木石库存、新永久属性、新版持久污染、连续世界或地图圣遗物安全区。

## 存档说明

V2 连续世界存档不迁移到当前远征开发基线。检测到 V2 世界存档时，游戏会安全创建新的远征存档并显示一次提示；V2 存档仍可在归档分支对应版本中使用。

## 操作

- 移动：方向键或 WASD
- 接敌：尝试进入敌人所在格
- 战斗：方向键切换行动，回车确认
- 切割 / 撤离：站在目标格后按 E 或点击交互按钮
- 手机：使用屏幕方向键和操作按钮

## 本地开发

```bash
npm install
npm run generate:sfx
npm run dev
```

测试与构建：

```bash
npm test
npm run build
```

在线体验：[GitHub Pages](https://junli-huang.github.io/polluted-frontier/)
