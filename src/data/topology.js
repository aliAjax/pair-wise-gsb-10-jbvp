// —— 数据层：拓扑种子数据、localStorage 持久化、登记记录 ——
// 该层只关心“数据长什么样、存在哪里”，不包含任何业务规则。

export const STORAGE_KEY = 'topology';
export const RECORDS_KEY = 'topology-records';

export const seed = {
  coreId: 'gw',
  nodes: [
    { id: 'gw', name: '核心路由器', type: 'router', x: 470, y: 220, ip: '10.0.0.1', status: 'running' },
    { id: 'sw1', name: '交换机 A', type: 'switch', x: 250, y: 370, ip: '10.0.1.1', status: 'running' },
    { id: 'sw2', name: '交换机 B', type: 'switch', x: 690, y: 370, ip: '10.0.2.1', status: 'running' },
    { id: 'web', name: 'Web Server', type: 'server', x: 100, y: 520, ip: '10.0.1.10', status: 'running' },
    { id: 'db', name: 'Database', type: 'server', x: 400, y: 550, ip: '10.0.1.20', status: 'running' },
    { id: 'user', name: '办公终端', type: 'device', x: 820, y: 530, ip: '10.0.2.22', status: 'running' },
  ],
  edges: [['gw', 'sw1'], ['gw', 'sw2'], ['sw1', 'web'], ['sw1', 'db'], ['sw2', 'user']],
};

// 兼容旧版本存档：补齐 status / coreId 字段，保证刷新后状态、链路一致
export function normalizeTopology(raw) {
  if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) {
    return JSON.parse(JSON.stringify(seed));
  }
  const nodes = raw.nodes.map(n => ({ status: 'running', ...n }));
  const coreId = raw.coreId && nodes.some(n => n.id === raw.coreId)
    ? raw.coreId
    : (nodes.find(n => n.type === 'router')?.id ?? nodes[0]?.id ?? null);
  return { coreId, nodes, edges: raw.edges.map(e => [...e]) };
}

export function loadTopology() {
  try {
    return normalizeTopology(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return normalizeTopology(null);
  }
}

export function saveTopology(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveRecords(records) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

// 生成一条隔离 / 恢复登记记录（原因 + 时间）
export function buildRecord(device, from, to, reason, now = new Date()) {
  return {
    id: `rec-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    deviceId: device.id,
    deviceName: device.name,
    action: to === 'running' ? 'recover' : to === 'maintenance' ? 'maintenance' : 'disable',
    from,
    to,
    reason: reason.trim(),
    time: now.toISOString(),
  };
}
