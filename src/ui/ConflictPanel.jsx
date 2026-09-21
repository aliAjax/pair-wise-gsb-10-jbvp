import React from 'react';

// 冲突清单：每条冲突列出触发规则、受影响设备与链路
export default function ConflictPanel({ view, data, onClose }) {
  if (!view?.items?.length) return null;
  const linkLabel = ([a, b]) => {
    const name = id => data.nodes.find(n => n.id === id)?.name ?? id;
    return `${name(a)} ↔ ${name(b)}`;
  };
  return (
    <div className="conflict-panel">
      <div className="conflict-head">
        <strong>{view.title}</strong>
        <button onClick={onClose}>✕</button>
      </div>
      {view.items.map((c, i) => (
        <div className="conflict" key={i}>
          <div className="conflict-rule">
            <span className="rule-badge">{c.rule.id}</span>
            <strong>{c.rule.name}</strong>
            <small>{c.rule.text}</small>
          </div>
          <p>{c.message}</p>
          {c.devices?.length > 0 && (
            <div className="conflict-row">
              <span>设备</span>
              <div>
                {c.devices.map(d => (
                  <em key={d.id} className={`chip st-${d.status ?? 'running'}`}>{d.name}</em>
                ))}
              </div>
            </div>
          )}
          {c.links?.length > 0 && (
            <div className="conflict-row">
              <span>链路</span>
              <div>
                {c.links.map((l, j) => <em key={j} className="chip link">{linkLabel(l)}</em>)}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
