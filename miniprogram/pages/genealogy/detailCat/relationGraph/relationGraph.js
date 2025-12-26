import { getCatItem, getCatItemMulti, getAvatar } from "../../../../utils/cat";

const CONFIG = {
  // 展示与尺寸
  MAX_SUB: 6,                 // 二级最多显示5个
  BASE_SIZE: 80,              // rpx, 基础大小
  SIZE_STEP: 8,               // rpx, 每个子节点增加的大小
  MAX_SIZE: 140,              // rpx, 最大大小
  CENTER_SIZE_RPX: 220,       // rpx, 中心节点大小上限
  SUB_NODE_SIZE_RPX: 72,      // rpx, 二级节点大小
  NAME_GAP: 0,                // rpx, 名字与头像底部的间距（零点定位法通过CSS变量传入）

  // 布局半径（rpx）
  SUB_RADIUS: 250,            // rpx, 二级展开半径
  SINGLE_RING_BASE: 260,      // rpx, 少节点布局基半径
  SINGLE_RING_JITTER: 30,     // rpx, 少节点半径抖动（±值）
  INNER_RING_BASE: 260,       // rpx, 多节点内环基半径
  INNER_RING_JITTER: 20,      // rpx, 多节点内环半径抖动（±值）
  OUTER_RING_BASE: 430,       // rpx, 多节点外环基半径
  OUTER_RING_JITTER: 30,      // rpx, 多节点外环半径抖动（±值）
  POP_OUT_RADIUS_RPX: 440,    // rpx, 呼吸弹射的安全展开半径（必须大于最外圈）
  GRAVITY_INNER_RPX: 260,     // rpx, 引力布局内圈基半径
  GRAVITY_MID_RPX: 360,       // rpx, 引力布局中圈基半径
  GRAVITY_OUTER_RPX: 430,     // rpx, 引力布局外圈基半径
  GRAVITY_BREATH_JITTER: 30,  // rpx, 引力布局呼吸抖动（±值）
  GRAVITY_SIZE_STEP: 10,      // rpx, 引力布局下大小步进
  GRAVITY_SIZE_CAP: 120,      // rpx, 引力布局下大小上限

  // 角度与扇形
  FAN_SPREAD_MIN: 60,         // 度, 二级展开的最小扇形
  FAN_SPREAD_MAX: 210,        // 度, 二级展开的最大扇形
  FAN_PER_CHILD: 30,          // 度, 每增加一个子节点的扇形增量（用于自适应展开）
  SAFE_MARGIN_SMALL: 20,      // 度, 少节点安全边距（抖动留白）
  SAFE_MARGIN_LARGE: 10,      // 度, 多节点安全边距
  MIN_JITTER: 5,              // 度, 抖动下限
  ANGLE_MIN_SPAN: 12,         // 度, 每个一级节点的最小角跨度，保障不重叠
  ANGLE_JITTER_RATIO: 0.25    // 比例, 每个角段的抖动比例（越大越随机）
};

Page({
  data: {
    nodes: [],
    lines: [],
    boardX: 0,
    boardY: 0,
    isDragging: false,
    showMoreRelation: false,
    currentOverflowList: [],
    hasExpanded: false,
    expandedId: null,
    hasFocusedChild: false,
    isLonely: false
  },

  jsData: {
    cat_id: "",
    centerCat: null,
    firstLevelCats: [],
    firstLevelRelationsRaw: [],
    childrenRelMap: {},     // { parentId: [relations] }
    childrenCache: {},      // { parentId: [{id,name,avatar,relation}] }
    dragStart: { x: 0, y: 0 },
    dragBoardStart: { x: 0, y: 0 }
  },

  async onLoad(options) {
    this.jsData.cat_id = options?.cat_id || "";
    await new Promise((resolve) => {
      wx.getSystemInfo({
        success: (res) => {
          this.jsData.rpx2px = res.windowWidth / 750;
          resolve();
        },
        fail: () => resolve()
      });
    });
    // 将配置中的名字间距传入视图，作为CSS变量 --gap 的值
    this.setData({ gapRpx: CONFIG.NAME_GAP });
    await this.initGraph();
  },

  // 初始化算法
  async initGraph() {
    try {
      // 1) 加载中心猫
      const center = await getCatItem(this.jsData.cat_id);
      const centerAvatar = await getAvatar(this.jsData.cat_id);
      this.jsData.centerCat = center;

      const nodes = [];
      const lines = [];

      // 中心节点 (0,0)
      nodes.push({
        id: center?._id || "center",
        name: center?.name || "中心猫",
        avatar: (centerAvatar?.photo_compressed || centerAvatar?.photo_id) || "/pages/public/images/info/default_avatar.png",
        x: 0, y: 0,
        sizePx: Math.min(CONFIG.MAX_SIZE, CONFIG.CENTER_SIZE_RPX) * (this.jsData.rpx2px || 1),
        classes: "level-0",
        subCount: 0,
        isCenter: true,
        key: "center"
      });
      const centerSizePx = nodes[0].sizePx;

      // 2) 加载一级关系及对应猫信息与头像
      const relations = Array.isArray(center?.relations) ? center.relations : [];
      this.jsData.firstLevelRelationsRaw = relations;
      const count = relations.length;

      if (count === 0) {
        this.setData({ nodes, lines, isLonely: true });
        return;
      }

      const ids = relations.map(r => r.cat_id);
      const [firstCats, firstAvatars] = await Promise.all([
        getCatItemMulti(ids),
        getAvatar(ids)
      ]);

      // 为权重计算准备二级关系列表（仅统计数量，详情在展开时懒加载）
      const firstLevelIdsSet = new Set(ids.concat(center?._id ? [center._id] : []));
      firstCats.forEach(cat => {
        if (!cat) return;
        const raw = Array.isArray(cat.relations) ? cat.relations : [];
        // 过滤：去掉与中心和所有一级关系重复的项；并做同一 cat_id 去重
        const seen = new Set();
        const filtered = [];
        for (const r of raw) {
          const cid = r && r.cat_id;
          if (!cid) continue;
          // 仅对次级列表内部做 cat_id 去重
          if (center && cid === center._id) continue;
          if (cid === cat._id) continue;
          if (seen.has(cid)) continue;
          seen.add(cid);
          filtered.push(r);
        }
        this.jsData.childrenRelMap[cat._id] = filtered;
      });

      // 1) 先准备每个一级节点的大小和半径（不计算角度），用于权重分配角段
      const prepared = [];
      relations.forEach((rel, index) => {
        const cat = firstCats[index];
        const avatarObj = firstAvatars[index];
        if (!cat) return;
        const subCount = (this.jsData.childrenRelMap[cat._id] || []).length;

        let distRpx;
        let sizeRpx;
        if (count <= 10) {
          // 引力布局：大小与轨道按权重分层
          sizeRpx = CONFIG.BASE_SIZE + (subCount * CONFIG.GRAVITY_SIZE_STEP);
          if (sizeRpx > CONFIG.GRAVITY_SIZE_CAP) sizeRpx = CONFIG.GRAVITY_SIZE_CAP;

          if (subCount >= 6) {
            // [核心圈] 大家长：紧贴中心
            distRpx = CONFIG.GRAVITY_INNER_RPX;   
          } else if (subCount >= 3) {
            // [中继圈] 有分支的普通关系
            distRpx = CONFIG.GRAVITY_MID_RPX;
          } else {
            // [边缘圈] 边缘关系
            distRpx = CONFIG.GRAVITY_OUTER_RPX;
          }
          distRpx = distRpx + (Math.random() * (CONFIG.GRAVITY_BREATH_JITTER * 2) - CONFIG.GRAVITY_BREATH_JITTER);
        } else {
          sizeRpx = CONFIG.BASE_SIZE + (subCount * CONFIG.SIZE_STEP);
          if (sizeRpx > CONFIG.MAX_SIZE) sizeRpx = CONFIG.MAX_SIZE;
          if (count <= 10) {
            distRpx = CONFIG.SINGLE_RING_BASE + (Math.random() * (CONFIG.SINGLE_RING_JITTER * 2) - CONFIG.SINGLE_RING_JITTER);
          } else {
            const isInner = index % 2 === 0;
            const base = isInner ? CONFIG.INNER_RING_BASE : CONFIG.OUTER_RING_BASE;
            const jitter = isInner ? CONFIG.INNER_RING_JITTER : CONFIG.OUTER_RING_JITTER;
            distRpx = base + (Math.random() * (jitter * 2) - jitter);
          }
        }
        const sizePx = sizeRpx * (this.jsData.rpx2px || 1);
        const distPx = distRpx * (this.jsData.rpx2px || 1);
        prepared.push({ rel, cat, avatarObj, subCount, sizeRpx, sizePx, distRpx, distPx });
      });

      // 2) 根据节点大小分配角段：大体积分配更大的角跨度，减少重叠
      let safeMargin = count <= 10 ? CONFIG.SAFE_MARGIN_SMALL : CONFIG.SAFE_MARGIN_LARGE;
      const rad2deg = 180 / Math.PI;
      const marginPx = CONFIG.COLLISION_MARGIN_PX || 6;
      // 每个节点的最小角跨度，依据自身尺寸和轨道半径换算为角度；确保至少 ANGLE_MIN_SPAN
      const minSpans = prepared.map(p => {
        const base = ((p.sizePx + marginPx) / Math.max(p.distPx, 1)) * rad2deg;
        return Math.max(CONFIG.ANGLE_MIN_SPAN, base);
      });
      const sumMin = minSpans.reduce((a, b) => a + b, 0);
      let segments = [];
      if (sumMin < 360) {
        const availableAngle = 360 - sumMin;
        const weightSum = prepared.reduce((sum, p) => sum + (p.sizePx || 1), 0) || 1;
        segments = prepared.map((p, idx) => minSpans[idx] + availableAngle * ((p.sizePx || 1) / weightSum));
      } else {
        // 角度不够，等比压缩各自最小角段以适配 360°
        const scale = 360 / sumMin;
        segments = minSpans.map(ms => ms * scale);
      }

      // 3) 预计算中心角与抖动，计算全局旋转，使最远节点趋向垂直方向
      const normalize = (a) => ((a % 360) + 360) % 360;
      let acc = 0;
      const centerAngles = [];
      const jitterOffsets = [];
      segments.forEach((segment, idx) => {
        const centerAngle = acc + segment / 2;
        let maxJitter = (segment / 2) - safeMargin;
        if (maxJitter < CONFIG.MIN_JITTER) maxJitter = CONFIG.MIN_JITTER;
        const jitterLimit = segment * (CONFIG.ANGLE_JITTER_RATIO || 0.25);
        if (maxJitter > jitterLimit) maxJitter = jitterLimit;
        const randomOffset = (Math.random() * maxJitter * 2) - maxJitter;
        centerAngles[idx] = centerAngle;
        jitterOffsets[idx] = randomOffset;
        acc += segment;
      });

      let rotateDeg = 0;
      if (count <= 10 && prepared.length > 0) {
        let farIdx = 0;
        for (let i = 1; i < prepared.length; i++) {
          if (prepared[i].distPx > prepared[farIdx].distPx) farIdx = i;
        }
        const farAngle = normalize(centerAngles[farIdx] + jitterOffsets[farIdx]);
        const deltaTo90 = ((90 - farAngle + 540) % 360) - 180;   // [-180, 180]
        const deltaTo270 = ((270 - farAngle + 540) % 360) - 180; // [-180, 180]
        const candidate = Math.abs(deltaTo90) <= Math.abs(deltaTo270) ? deltaTo90 : deltaTo270;
        if (Math.abs(candidate) > 1) rotateDeg = candidate; // 小旋转忽略，避免抖动
      }

      // 4) 生成节点与连线（已应用全局旋转），保存 _origin 备份
      prepared.forEach((p, idx) => {
        const angleDeg = normalize(centerAngles[idx] + jitterOffsets[idx] + rotateDeg);
        const angleRad = angleDeg * (Math.PI / 180);

        const x = Math.cos(angleRad) * p.distPx;
        const y = Math.sin(angleRad) * p.distPx;

        nodes.push({
          id: p.cat._id,
          name: p.cat.name || "?",
          avatar: (p.avatarObj?.photo_compressed || p.avatarObj?.photo_id) || "/pages/public/images/info/default_avatar.png",
          relation: p.rel.alias || p.rel.type || "",
          x, y,
          sizePx: p.sizePx,
          subCount: p.subCount,
          _angle: angleDeg,
          _originX: x,
          _originY: y,
          _originDist: p.distPx,
          classes: "level-1",
          gender: (p.cat.gender === '公') ? 'male' : (p.cat.gender === '母' ? 'female' : '')
          ,key: `n-${p.cat._id}`
        });

        // 一级连线：起点偏移到中心头像外缘，终点到一级头像外缘
        const originLen = Math.max(0, p.distPx - (centerSizePx / 2) - (p.sizePx / 2));
        lines.push({
          id: `l-${p.cat._id}`,
          x: Math.cos(angleRad) * (centerSizePx / 2),
          y: Math.sin(angleRad) * (centerSizePx / 2),
          len: originLen,
          _originLen: originLen,
          angle: angleDeg,
          text: p.rel.alias || p.rel.type || "",
          level: 1
        });
      });

      this.setData({ nodes, lines, isLonely: false });
    } catch (err) {
      console.error("[initGraph] - error", err);
      wx.showToast({ title: '加载图谱失败', icon: 'none' });
    }
  },

  // 交互逻辑
  async onNodeTap(e) {
    const item = e.currentTarget.dataset.item;

    // A. 点击更多 -> 弹窗
    if (item.isMore) {
      this.setData({
        showMoreRelation: true,
        currentOverflowList: item.overflowData || []
      });
      return;
    }

    // 点击二级节点：
    // 若该子节点在一级中也存在（与中心直连），则跳转聚焦到对应的一级节点；否则聚焦子节点自身
    if (item.isChild && !item.isMore) {
      const primary = this.data.nodes.find(n => n.id === item.id && !n.isChild);
      // 若存在与中心直连的一级对应节点，则同时保持该一级与当前点击的二级高亮
      if (primary) {
        this.focusNode(primary, item);
      } else {
        this.focusNode(item);
      }
      return;
    }

    // 点击中心或已展开 -> 重置
    if (item.isCenter || this.data.expandedId === item.id) {
      this.resetView();
      return;
    }

    // 点击普通节点 -> 展开
    await this.expandNode(item);
  },

  // 长按节点跳转到猫猫详情页
  onNodeLongPress(e) {
    const cat = e.currentTarget.dataset.item;
    // 点击"更多"不跳转
    if (cat.isMore) {
      return;
    }
    // 跳转到猫猫详情页
    wx.navigateTo({
      url: `/pages/genealogy/detailCat/detailCat?cat_id=${cat.id}`,
    });
  },

  // 点击弹窗更多关系若该子节点已是主节点的一级直连，则聚焦并高亮；否则不处理
  onOverflowCardTap(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const primary = (this.data.nodes || []).find(n => !n.isChild && n.id === id);
    if (primary) {
      this.focusNode(primary);
    }
    this.setData({ showMoreRelation: false });
  },

  async expandNode(parentNode) {
    // 1) 提取一级节点与连线
    let cleanNodes = this.data.nodes.filter(n => !n.isChild);
    let cleanLines = this.data.lines.filter(l => l.level !== 2);

    // 2) 在弹出新的一级节点前，先将其他已弹出的一级节点收回到原始位置；并恢复连线长度
    cleanNodes = cleanNodes.map(n => {
      const baseCls = (n.classes || '').replace('active', '').trim();
      if (n.id !== parentNode.id && typeof n._originX === 'number') {
        return { ...n, x: n._originX, y: n._originY, classes: baseCls };
      }
      return { ...n, classes: baseCls };
    });
    cleanLines = cleanLines.map(l => {
      const cls = (l.classes || '').replace('active-line', '').trim();
      if (l.id !== `l-${parentNode.id}`) {
        return { ...l, len: (typeof l._originLen === 'number') ? l._originLen : l.len, classes: cls };
      }
      return { ...l, classes: `${cls} active-line` };
    });

    // 呼吸弹射，沿原角度将节点推到外圈安全半径
    const popOutPx = CONFIG.POP_OUT_RADIUS_RPX * (this.jsData.rpx2px || 1);
    const rad = parentNode._angle * (Math.PI / 180);
    const newX = Math.cos(rad) * popOutPx;
    const newY = Math.sin(rad) * popOutPx;

    // 运镜：反向移动画布，将弹射后节点移到屏幕正中央
    const targetX = -newX;
    const targetY = -newY;

    // 计算二级节点 (扇形 + 截断)
    let childrenList = await this.ensureChildren(parentNode.id);
    if (!childrenList || childrenList.length === 0) {
      // 更新被点击的一级节点位置为弹射后坐标，其他取消高亮
      const updatedNodes = cleanNodes.map(n => {
        const baseCls = (n.classes || '').replace('active', '').trim();
        if (n.id === parentNode.id) {
          return { ...n, x: newX, y: newY, classes: `${baseCls} active` };
        }
        return { ...n, classes: baseCls };
      });
      // 更新一级连线长度为弹射后长度
    const updatedLines = cleanLines.map(l => {
      if (l.id === `l-${parentNode.id}`) {
          const parentSizeHalf = (parentNode.sizePx || CONFIG.BASE_SIZE * (this.jsData.rpx2px || 1)) / 2;
          const centerNode = cleanNodes.find(n => n.isCenter) || cleanNodes.find(n => (n.classes || '').includes('level-0'));
          const centerHalf = (centerNode?.sizePx || (CONFIG.CENTER_SIZE_RPX * (this.jsData.rpx2px || 1))) / 2;
          const newLen = Math.max(0, popOutPx - centerHalf - parentSizeHalf);
          return { ...l, len: newLen, classes: (l.classes || '').includes('active-line') ? l.classes : `${l.classes || ''} active-line` };
      }
      return l;
    });
      this.setData({ 
        nodes: updatedNodes, 
        lines: updatedLines,
        boardX: targetX, boardY: targetY,
        expandedId: parentNode.id,
        hasExpanded: true,
        hasFocusedChild: false
      });
      return;
    }

    let displayList = childrenList;
    let hasMore = false;
    if (childrenList.length > CONFIG.MAX_SUB) {
      displayList = childrenList.slice(0, CONFIG.MAX_SUB);
      hasMore = true;
    }

    const renderCount = displayList.length + (hasMore ? 1 : 0);
    // 自适应扇形角度，根据渲染数量动态放宽，避免少量节点占用过大角度
    let fanSpread = 0;
    if (renderCount > 1) {
      const ideal = CONFIG.FAN_PER_CHILD * (renderCount - 1);
      fanSpread = Math.max(CONFIG.FAN_SPREAD_MIN, Math.min(CONFIG.FAN_SPREAD_MAX, ideal));
    }
    const startAngle = parentNode._angle - (fanSpread / 2);
    const step = renderCount > 1 ? fanSpread / (renderCount - 1) : 0;

    const newNodes = [];
    const newLines = [];

    const tempParent = { ...parentNode, x: newX, y: newY };
    displayList.forEach((child, i) => {
      this.createSubNode(child, i, renderCount, tempParent, startAngle, step, newNodes, newLines);
    });

    if (hasMore) {
      const moreData = { 
        id: `more-${parentNode.id}`, 
        name: `还有${childrenList.length - CONFIG.MAX_SUB}个`, 
        isMore: true, 
        overflowData: childrenList.slice(CONFIG.MAX_SUB) 
      };
      this.createSubNode(moreData, renderCount - 1, renderCount, tempParent, startAngle, step, newNodes, newLines, true);
    }

    // 更新被点击的一级节点位置为弹射后坐标，其他取消高亮
    const updatedNodes = cleanNodes.map(n => {
      const baseCls = (n.classes || '').replace('active', '').trim();
      if (n.id === parentNode.id) {
        return { ...n, x: newX, y: newY, classes: `${baseCls} active` };
      }
      return { ...n, classes: baseCls };
    });
    const newNodesEnter = newNodes.map(n => ({ ...n, classes: `${n.classes} enter` }));
    const newLinesEnter = newLines.map(l => ({ ...l, len: 0, classes: `${(l.classes || '')} enter` }));
    const finalNodes = updatedNodes.concat(newNodesEnter);

    this.setData({
      nodes: finalNodes,
      lines: cleanLines.map(l => {
        if (l.id === `l-${parentNode.id}`) {
          const parentSizeHalf = (parentNode.sizePx || CONFIG.BASE_SIZE * (this.jsData.rpx2px || 1)) / 2;
          const centerNode = cleanNodes.find(n => n.isCenter) || cleanNodes.find(n => (n.classes || '').includes('level-0'));
          const centerHalf = (centerNode?.sizePx || (CONFIG.CENTER_SIZE_RPX * (this.jsData.rpx2px || 1))) / 2;
          const newLen = Math.max(0, popOutPx - centerHalf - parentSizeHalf);
          return { ...l, len: newLen, classes: (l.classes || '').includes('active-line') ? l.classes : `${l.classes || ''} active-line` };
        }
        return l;
      }).concat(newLinesEnter),
      boardX: targetX,
      boardY: targetY,
      expandedId: parentNode.id,
      hasExpanded: true,
      hasFocusedChild: false
    });

    // 入场，二阶段将 enter 去除，并将连线宽度从 0 动画到目标长度
    setTimeout(() => {
      const currentLines = this.data.lines.map(l => {
        const target = newLines.find(nl => nl.id === l.id);
        if (target) {
          const cls = (l.classes || '').replace('enter', '').trim();
          return { ...l, len: target.len, classes: cls };
        }
        return l;
      });
      const currentNodes = this.data.nodes.map(n => {
        if (newNodesEnter.some(nn => nn.key === n.key)) {
          const cls = (n.classes || '').replace('enter', '').trim();
          return { ...n, classes: cls };
        }
        return n;
      });
      this.setData({ lines: currentLines, nodes: currentNodes });
    }, 50);
  },

  createSubNode(data, i, total, parent, startAngle, step, nodesArr, linesArr, isDashed = false) {
    const angleDeg = total === 1 ? parent._angle : startAngle + (step * i);
    const angleRad = angleDeg * (Math.PI / 180);
    const distPx = (CONFIG.SUB_RADIUS * (this.jsData.rpx2px || 1));

    const x = parent.x + Math.cos(angleRad) * distPx;
    const y = parent.y + Math.sin(angleRad) * distPx;

    const lineId = `l2-${parent.id}-${i}`;

    nodesArr.push({
      ...data,
      x, y,
      sizePx: CONFIG.SUB_NODE_SIZE_RPX * (this.jsData.rpx2px || 1),
      classes: data.isMore ? 'level-2 more-node' : 'level-2 child-node',
      isChild: true,
      parentId: parent.id,
      lineId,
      key: data.isMore ? `m-${parent.id}` : `c-${parent.id}-${data.id}`
    });

    // 二级连线，起点偏移到父头像外缘，终点到子节点头像外缘
    linesArr.push({
      id: lineId,
      x: parent.x + Math.cos(angleRad) * (parent.sizePx / 2),
      y: parent.y + Math.sin(angleRad) * (parent.sizePx / 2),
      len: Math.max(0, distPx - (parent.sizePx / 2) - ((data.sizePx || (CONFIG.SUB_NODE_SIZE_RPX * (this.jsData.rpx2px || 1))) / 2)),
      angle: angleDeg,
      text: isDashed ? '' : (data.relation || ''),
      level: 2,
      isDashed
    });
  },

  focusNode(node, childCtx) {
    if (!node) return;
    const targetX = -node.x;
    const targetY = -node.y;
    const updatedNodes = this.data.nodes.map(n => {
      const cls = (n.classes || '').replace('active', '').trim();
      let isActive = false;
      if (node.isChild) {
        // 子节点自身保持高亮，同时其对应的次级（一级）父节点保持高亮不淡化
        isActive = (n.isChild && (n.key === node.key)) || (!n.isChild && (n.id === node.parentId));
      } else {
        // 一级节点聚焦；若同时传入 childCtx，则该二级也保持高亮，且其父次级（一级）节点保持高亮
        const keepExpandedParent = !!this.data.expandedId && (n.id === this.data.expandedId) && !n.isChild;
        isActive = (!n.isChild && (n.id === node.id))
          || (!!childCtx && n.isChild && (n.key === childCtx.key))
          || (!!childCtx && !n.isChild && (n.id === childCtx.parentId))
          || keepExpandedParent;
      }
      return { ...n, classes: isActive ? `${cls} active` : cls };
    });
    const updatedLines = this.data.lines.map(l => {
      const cls = (l.classes || '').replace('active-line', '').trim();
      let isActive = false;
      if (node.isChild) {
        // 子节点自身连线高亮，父级一级连线也保持高亮
        isActive = (!!node.lineId && (l.id === node.lineId)) || (l.id === `l-${node.parentId}`);
      } else {
        // 一级节点聚焦；若同时传入 childCtx，则其二级连线也保持高亮，并保留 childCtx 的父一级连线
        const keepExpandedParentLine = !!this.data.expandedId && (l.id === `l-${this.data.expandedId}`);
        isActive = (l.id === `l-${node.id}`)
          || (!!childCtx && !!childCtx.lineId && (l.id === childCtx.lineId))
          || (!!childCtx && (l.id === `l-${childCtx.parentId}`))
          || keepExpandedParentLine;
      }
      return { ...l, classes: isActive ? `${cls} active-line` : cls };
    });
    this.setData({ boardX: targetX, boardY: targetY, nodes: updatedNodes, lines: updatedLines, hasFocusedChild: !!(node.isChild || childCtx) });
  },

  resetView() {
    // 1) 还原节点位置到 _originX/_originY
    const cleanNodes = this.data.nodes
      .filter(n => !n.isChild)
      .map(n => ({
        ...n,
        x: (typeof n._originX === 'number') ? n._originX : n.x,
        y: (typeof n._originY === 'number') ? n._originY : n.y,
        classes: (n.classes || '').replace('active', '').trim()
      }));
    // 2) 还原一级连线长度到 _originLen
    const cleanLines = this.data.lines
      .filter(l => l.level !== 2)
      .map(l => ({
        ...l,
        len: (typeof l._originLen === 'number') ? l._originLen : l.len,
        classes: (l.classes || '').replace('active-line', '').trim()
      }));
    this.setData({
      nodes: cleanNodes,
      lines: cleanLines,
      boardX: 0, boardY: 0,
      expandedId: null,
      hasExpanded: false,
      hasFocusedChild: false,
      showMoreRelation: false,
      currentOverflowList: []
    });
  },

  async ensureChildren(parentId) {
    // 如果已缓存，直接返回
    if (this.jsData.childrenCache[parentId]) {
      return this.jsData.childrenCache[parentId];
    }

    // 原始关系（仅包含 cat_id、alias/type）
    const raw = this.jsData.childrenRelMap[parentId] || [];
    if (!raw.length) {
      this.jsData.childrenCache[parentId] = [];
      return [];
    }

    const childIds = raw.map(r => r.cat_id);
    const [childCats, childAvatars] = await Promise.all([
      getCatItemMulti(childIds),
      getAvatar(childIds)
    ]);

    const children = raw.map((r, i) => {
      const c = childCats[i];
      const av = childAvatars[i];
      return {
        id: c?._id || r.cat_id,
        name: c?.name || '?',
        avatar: (av?.photo_compressed || av?.photo_id) || '/pages/public/images/info/default_avatar.png',
        relation: r.alias || r.type || '',
        gender: (c?.gender === '公') ? 'male' : (c?.gender === '母' ? 'female' : ''),
        key: `c-${parentId}-${c?._id || r.cat_id}`
      };
    });

    this.jsData.childrenCache[parentId] = children;
    return children;
  },

  // 拖拽逻辑
  onDragStart(e) {
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    this.jsData.dragStart = { x: touch.clientX, y: touch.clientY };
    this.jsData.dragBoardStart = { x: this.data.boardX, y: this.data.boardY };
    this.setData({ isDragging: true });
  },

  onDragMove(e) {
    const touch = e.touches && e.touches[0];
    if (!touch || !this.data.isDragging) return;
    const dx = touch.clientX - this.jsData.dragStart.x;
    const dy = touch.clientY - this.jsData.dragStart.y;
    this.setData({ boardX: this.jsData.dragBoardStart.x + dx, boardY: this.jsData.dragBoardStart.y + dy });
  },

  onDragEnd() {
    this.setData({ isDragging: false });
  },

  // 弹窗控制
  closeMoreRelation() {
    this.setData({ showMoreRelation: false });
  },
  noop() {},

  // 悬浮“重置”按钮点击
  onResetTap() {
    this.resetView();
  }
});
