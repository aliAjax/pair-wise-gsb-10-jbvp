// —— 规则层：设备状态机约束与核心连通性复核 ——
// 纯函数实现，不依赖 React / DOM / localStorage，可独立测试。

export const STATUS = {
  RUNNING: 'running',
  MAINTENANCE: 'maintenance',
  DISABLED: 'disabled',
};

export const STATUS_LABEL = {
  running: '运行',
  maintenance: '维护',
  disabled: '停用',
};

export const RULES = {
  CORE_PROTECT: { id: 'R1', name: '核心保护', text: '核心路由器不得停用' },
  CORE_REACHABILITY: { id: 'R2', name: '核心连通性', text: '停用前须确认其余运行设备仍能到达核心路由器' },
  MAINTENANCE_MUTEX: { id: 'R3', name: '维护互斥', text: '同一条链路两端不能同时维护' },
  REASON_REQUIRED: { id: 'R4', name: '登记要求', text: '隔离与恢复必须登记原因与时间' },
};

const statusOf = n => n?.status ?? STATUS.RUNNING;

export function findCore(data) {
  return data.nodes.find(n => n.id === data.coreId)
    ?? data.nodes.find(n => n.type === 'router')
    ?? null;
}

// 参与转发的设备：仅“运行”状态；维护视为暂时断开，停用视为离线
function runningIds(data, extraExcluded = null) {
  return new Set(
    data.nodes
      .filter(n => n.id !== extraExcluded && statusOf(n) === STATUS.RUNNING)
      .map(n => n.id),
  );
}

// 从核心路由器出发，沿“两端均运行”的链路做 BFS，返回可达设备 id 集合
export function reachableFromCore(data, extraExcluded = null) {
  const core = findCore(data);
  const seen = new Set();
  if (!core) return seen;
  const active = runningIds(data, extraExcluded);
  if (!active.has(core.id)) return seen;
  const queue = [core.id];
  seen.add(core.id);
  while (queue.length) {
    const cur = queue.shift();
    for (const [a, b] of data.edges) {
      const next = a === cur ? b : b === cur ? a : null;
      if (next && active.has(next) && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

// 复核一次状态切换：返回 { ok, conflicts:[{ rule, message, devices, links }] }
// 调用方只有在 ok 时才允许落库，否则整次拒绝。
export function evaluateTransition(data, deviceId, target, reason) {
  const device = data.nodes.find(n => n.id === deviceId);
  if (!device) return { ok: false, conflicts: [] };
  const from = statusOf(device);
  if (from === target) return { ok: true, conflicts: [], noop: true };

  const conflicts = [];
  const core = findCore(data);

  // R4 登记要求：隔离（→维护/停用）与恢复（→运行）都必须填写原因
  if (!reason?.trim()) {
    conflicts.push({
      rule: RULES.REASON_REQUIRED,
      message: `将「${device.name}」${target === STATUS.RUNNING ? '恢复' : '隔离'}前必须登记原因，时间将自动记录`,
      devices: [device],
      links: [],
    });
  }

  if (target === STATUS.DISABLED) {
    // R1 核心保护
    if (core && device.id === core.id) {
      conflicts.push({
        rule: RULES.CORE_PROTECT,
        message: '核心路由器不得停用',
        devices: [device],
        links: [],
      });
    } else {
      // R2 核心连通性：模拟停用后，其余运行设备必须仍能到达核心路由器
      const before = reachableFromCore(data);
      const after = reachableFromCore(data, deviceId);
      const affected = data.nodes.filter(n =>
        n.id !== deviceId
        && statusOf(n) === STATUS.RUNNING
        && before.has(n.id)
        && !after.has(n.id));
      if (affected.length) {
        const affectedIds = new Set(affected.map(n => n.id));
        const cutLinks = data.edges.filter(([a, b]) =>
          (a === deviceId && affectedIds.has(b)) || (b === deviceId && affectedIds.has(a)));
        conflicts.push({
          rule: RULES.CORE_REACHABILITY,
          message: `停用「${device.name}」后，${affected.length} 台运行设备将失去核心连通性，整次操作已拒绝`,
          devices: affected,
          links: cutLinks,
        });
      }
    }
  }

  if (target === STATUS.MAINTENANCE) {
    // R3 维护互斥：同一条链路两端不能同时维护
    const mutexLinks = data.edges.filter(([a, b]) => {
      if (a !== deviceId && b !== deviceId) return false;
      const other = data.nodes.find(n => n.id === (a === deviceId ? b : a));
      return other && statusOf(other) === STATUS.MAINTENANCE;
    });
    if (mutexLinks.length) {
      const peerIds = new Set(mutexLinks.map(([a, b]) => (a === deviceId ? b : a)));
      conflicts.push({
        rule: RULES.MAINTENANCE_MUTEX,
        message: '对端设备已在维护中，同一条链路两端不能同时维护',
        devices: [device, ...data.nodes.filter(n => peerIds.has(n.id))],
        links: mutexLinks,
      });
    }
  }

  return { ok: conflicts.length === 0, conflicts };
}

// 全量复核当前拓扑：供“复核”按钮使用，返回冲突列表（可能为空）
export function reviewTopology(data) {
  const conflicts = [];
  const core = findCore(data);

  // 当前是否存在无法到达核心的运行设备
  const reachable = reachableFromCore(data);
  const unreachable = data.nodes.filter(n =>
    statusOf(n) === STATUS.RUNNING && core && n.id !== core.id && !reachable.has(n.id));
  if (unreachable.length) {
    const ids = new Set(unreachable.map(n => n.id));
    conflicts.push({
      rule: RULES.CORE_REACHABILITY,
      message: `${unreachable.length} 台运行设备当前无法到达核心路由器`,
      devices: unreachable,
      links: data.edges.filter(([a, b]) => ids.has(a) || ids.has(b)),
    });
  }

  // 当前是否存在两端同时维护的链路
  const mutexLinks = data.edges.filter(([a, b]) => {
    const na = data.nodes.find(n => n.id === a);
    const nb = data.nodes.find(n => n.id === b);
    return statusOf(na) === STATUS.MAINTENANCE && statusOf(nb) === STATUS.MAINTENANCE;
  });
  if (mutexLinks.length) {
    const ids = new Set(mutexLinks.flat());
    conflicts.push({
      rule: RULES.MAINTENANCE_MUTEX,
      message: `${mutexLinks.length} 条链路两端同时处于维护状态`,
      devices: data.nodes.filter(n => ids.has(n.id)),
      links: mutexLinks,
    });
  }

  return conflicts;
}
