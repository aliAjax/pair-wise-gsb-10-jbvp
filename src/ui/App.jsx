import React, { useEffect, useRef, useState } from 'react';
import { loadTopology, saveTopology, loadRecords, saveRecords, buildRecord } from '../data/topology.js';
import { STATUS, STATUS_LABEL, RULES, evaluateTransition, reviewTopology, findCore } from '../rules/constraints.js';
import StatusControl from './StatusControl.jsx';
import ConflictPanel from './ConflictPanel.jsx';
import RecordsLog from './RecordsLog.jsx';

const TYPE_ICON = { router: '◉', switch: '▦', server: '▣', device: '▱' };
const statusOf = n => n?.status ?? STATUS.RUNNING;

export default function App() {
  const [data, setData] = useState(loadTopology);
  const [records, setRecords] = useState(loadRecords);
  const [selected, setSelected] = useState(data.coreId ?? data.nodes[0]?.id);
  const [tool, setTool] = useState('select');
  const [notice, setNotice] = useState('');
  const [drag, setDrag] = useState(null);
  const [pending, setPending] = useState(null);        // 待确认的目标状态
  const [reason, setReason] = useState('');            // 隔离 / 恢复原因
  const [conflictView, setConflictView] = useState(null); // { title, items }
  const board = useRef();

  useEffect(() => saveTopology(data), [data]);
  useEffect(() => saveRecords(records), [records]);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const node = data.nodes.find(n => n.id === selected) || data.nodes[0];
  const core = findCore(data);
  const count = s => data.nodes.filter(n => statusOf(n) === s).length;

  const updateNode = (k, v) => setData(d => ({ ...d, nodes: d.nodes.map(n => (n.id === selected ? { ...n, [k]: v } : n)) }));
  const selectNode = id => { setSelected(id); setPending(null); setReason(''); };

  // —— 隔离 / 恢复：先登记原因，再由规则引擎复核，通过才落库 ——
  const requestStatus = target => {
    if (!node || target === statusOf(node)) return;
    setConflictView(null);
    setReason('');
    setPending(target);
  };
  const cancelTransition = () => { setPending(null); setReason(''); };
  const confirmTransition = () => {
    const result = evaluateTransition(data, node.id, pending, reason);
    if (!result.ok) {
      setConflictView({ title: `「${node.name}」→ ${STATUS_LABEL[pending]}：整次操作已拒绝`, items: result.conflicts });
      setPending(null);
      setReason('');
      setNotice('存在冲突，操作未执行');
      return;
    }
    const from = statusOf(node);
    setData(d => ({ ...d, nodes: d.nodes.map(n => (n.id === node.id ? { ...n, status: pending } : n)) }));
    setRecords(rs => [...rs, buildRecord(node, from, pending, reason)]);
    setNotice(pending === STATUS.RUNNING
      ? `「${node.name}」已恢复运行，原因与时间已登记`
      : `「${node.name}」已隔离（${STATUS_LABEL[pending]}），原因与时间已登记`);
    setPending(null);
    setReason('');
  };

  // —— 复核：对当前拓扑做全量规则检查 ——
  const review = () => {
    const items = reviewTopology(data);
    if (items.length) {
      setConflictView({ title: `复核发现 ${items.length} 类冲突`, items });
      setNotice('复核未通过，详见冲突清单');
    } else {
      setConflictView(null);
      setNotice('复核通过：运行设备均可到达核心路由器，无维护互斥冲突');
    }
  };

  const addNode = (type = 'device', label = '新设备') => {
    const id = 'node' + Date.now();
    setData(d => ({ ...d, nodes: [...d.nodes, { id, name: label, type, x: 500, y: 300, ip: '192.168.0.10', status: STATUS.RUNNING }] }));
    setSelected(id);
    setTool('select');
    setNotice('已添加设备');
  };

  const connect = () => {
    if (!selected) return;
    const other = prompt('输入要连接的设备 ID（例如 sw1）');
    if (other && data.nodes.some(n => n.id === other) && other !== selected
      && !data.edges.some(e => (e[0] === selected && e[1] === other) || (e[1] === selected && e[0] === other))) {
      setData(d => ({ ...d, edges: [...d.edges, [selected, other]] }));
      setNotice('连接已创建');
    }
  };

  const remove = () => {
    if (node.id === core?.id) {
      setConflictView({ title: '删除被拒绝', items: [{ rule: RULES.CORE_PROTECT, message: '核心路由器不得删除或停用', devices: [node], links: [] }] });
      return;
    }
    setData(d => ({ ...d, nodes: d.nodes.filter(n => n.id !== selected), edges: d.edges.filter(e => !e.includes(selected)) }));
    setSelected(data.nodes.find(n => n.id !== selected)?.id);
    setNotice('设备已删除');
  };

  const save = () => { saveTopology(data); saveRecords(records); setNotice('拓扑状态与登记记录已保存'); };

  const exportJson = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...data, records }, null, 2)], { type: 'application/json' }));
    a.download = 'network-topology.json';
    a.click();
    setNotice('JSON 已导出（含设备状态与登记记录）');
  };

  const move = e => {
    if (!drag) return;
    const r = board.current.getBoundingClientRect();
    setData(d => ({ ...d, nodes: d.nodes.map(n => (n.id === drag ? { ...n, x: Math.max(35, e.clientX - r.left), y: Math.max(35, e.clientY - r.top) } : n)) }));
  };

  const edgeClass = ([a, b]) => {
    const sa = statusOf(data.nodes.find(n => n.id === a));
    const sb = statusOf(data.nodes.find(n => n.id === b));
    if (sa === STATUS.DISABLED || sb === STATUS.DISABLED) return 'edge down';
    if (sa === STATUS.MAINTENANCE || sb === STATUS.MAINTENANCE) return 'edge maint';
    return 'edge';
  };

  return (
    <div className="app">
      <header>
        <div className="brand"><span className="brand-mark">⌁</span><div><strong>NETSCAPE</strong><small>ISOLATION & CORE REACHABILITY REVIEW</small></div></div>
        <div className="file"><span className="dot"></span><div><strong>office-network.json</strong><small>最近保存：刚刚</small></div></div>
        <div className="top-actions">
          <button onClick={review}>✓ 复核</button>
          <button onClick={exportJson}>↓ 导出</button>
          <button className="save" onClick={save}>保存更改</button>
        </div>
      </header>
      <div className="toolbar">
        <div className="tool-group"><span>工具</span>
          <button className={tool === 'select' ? 'on' : ''} onClick={() => setTool('select')}>↖ 选择</button>
          <button className={tool === 'connect' ? 'on' : ''} onClick={() => { setTool('connect'); connect(); }}>⌁ 连接</button>
          <button onClick={() => addNode()}>＋ 设备</button>
        </div>
        <div className="tool-group zoom"><button>−</button><span>100%</span><button>＋</button><button onClick={() => setNotice('画布已居中')}>⌗</button></div>
      </div>
      <div className="workspace">
        <aside className="inventory">
          <div className="section-title"><span>设备库</span><small>{data.nodes.length} 个节点</small></div>
          <div className="device-types">
            {[['router', '◉', '路由器'], ['switch', '▦', '交换机'], ['server', '▣', '服务器'], ['device', '▱', '终端设备']].map(([t, i, l]) => (
              <button onClick={() => addNode(t, l)} key={t}><i className={t}>{i}</i>{l}<span>＋</span></button>
            ))}
          </div>
          <div className="section-title nodes-head"><span>图中节点</span><small>点击查看</small></div>
          <div className="node-list">
            {data.nodes.map(n => (
              <button className={selected === n.id ? 'sel' : ''} onClick={() => selectNode(n.id)} key={n.id}>
                <i className={n.type}>{TYPE_ICON[n.type]}</i>
                <span><strong>{n.name}</strong><small>{n.ip}</small></span>
                <em className={`st-tag st-${statusOf(n)}`}>{STATUS_LABEL[statusOf(n)]}</em>
                <b>›</b>
              </button>
            ))}
          </div>
        </aside>
        <section className="canvas-wrap">
          <div className="canvas" ref={board} onMouseMove={move} onMouseUp={() => setDrag(null)}>
            {data.edges.map((e, i) => {
              const n1 = data.nodes.find(n => n.id === e[0]);
              const n2 = data.nodes.find(n => n.id === e[1]);
              if (!n1 || !n2) return null;
              const dx = n2.x - n1.x, dy = n2.y - n1.y;
              const len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
              return <div className={edgeClass(e)} key={i} style={{ left: n1.x, top: n1.y, width: len, transform: `rotate(${ang}deg)` }}><span></span></div>;
            })}
            {data.nodes.map(n => (
              <button
                className={`node ${n.type} st-${statusOf(n)}${selected === n.id ? ' picked' : ''}`}
                style={{ left: n.x - 42, top: n.y - 31 }}
                onMouseDown={e => { e.stopPropagation(); selectNode(n.id); setDrag(n.id); }}
                onClick={() => selectNode(n.id)}
                key={n.id}
              >
                <b className={`st-dot st-${statusOf(n)}`}></b>
                {n.id === core?.id && <em className="core-tag">核心</em>}
                <i>{TYPE_ICON[n.type]}</i>
                <strong>{n.name}</strong>
                <small>{n.ip}</small>
              </button>
            ))}
            <div className="legend">
              <span><i className="router"></i>路由器</span>
              <span><i className="switch"></i>交换机</span>
              <span><i className="server"></i>服务器</span>
              <span><i className="lg-dot lg-running"></i>运行</span>
              <span><i className="lg-dot lg-maintenance"></i>维护</span>
              <span><i className="lg-dot lg-disabled"></i>停用</span>
            </div>
          </div>
          <div className="canvas-footer">
            <span>运行 {count(STATUS.RUNNING)} · 维护 {count(STATUS.MAINTENANCE)} · 停用 {count(STATUS.DISABLED)} · {data.edges.length} 条连接</span>
            <span>拖动节点调整位置 · 登记记录 {records.length} 条</span>
          </div>
        </section>
        <aside className="inspector">
          <div className="section-title"><span>属性</span><small>{node?.type}</small></div>
          {node ? (
            <>
              <label>设备名称<input value={node.name} onChange={e => updateNode('name', e.target.value)} /></label>
              <label>IP 地址<input value={node.ip} onChange={e => updateNode('ip', e.target.value)} /></label>
              <label>设备类型
                <select value={node.type} onChange={e => updateNode('type', e.target.value)}>
                  <option value="router">路由器</option>
                  <option value="switch">交换机</option>
                  <option value="server">服务器</option>
                  <option value="device">终端设备</option>
                </select>
              </label>
              <div className="section-title status-head">
                <span>运行状态</span>
                <small>{node.id === core?.id ? '核心路由器' : STATUS_LABEL[statusOf(node)]}</small>
              </div>
              <StatusControl
                current={statusOf(node)}
                pending={pending}
                reason={reason}
                onRequest={requestStatus}
                onReasonChange={setReason}
                onConfirm={confirmTransition}
                onCancel={cancelTransition}
              />
              <div className="inspector-actions">
                <button onClick={connect}>⌁ 添加连接</button>
                <button className="danger" onClick={remove}>删除设备</button>
              </div>
              <div className="connections">
                <div className="section-title"><span>连接</span><small>{data.edges.filter(e => e.includes(node.id)).length} 条</small></div>
                {data.edges.filter(e => e.includes(node.id)).map((e, i) => {
                  const other = data.nodes.find(n => n.id === (e[0] === node.id ? e[1] : e[0]));
                  return (
                    <div className="connection" key={i}>
                      <span className={`mini ${other?.type}`}></span>
                      <strong>{other?.name}</strong>
                      <small className={`st-${statusOf(other)}`}>{STATUS_LABEL[statusOf(other)]}</small>
                    </div>
                  );
                })}
              </div>
              <RecordsLog records={records} />
            </>
          ) : <p>选择一个设备</p>}
        </aside>
      </div>
      <ConflictPanel view={conflictView} data={data} onClose={() => setConflictView(null)} />
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}
