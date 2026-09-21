import React from 'react';

const ACTION_LABEL = {
  recover: '恢复运行',
  maintenance: '隔离 · 维护',
  disable: '隔离 · 停用',
};

// 隔离 / 恢复登记记录（原因 + 时间），刷新后从 localStorage 恢复
export default function RecordsLog({ records }) {
  return (
    <div className="records">
      <div className="section-title"><span>隔离 / 恢复记录</span><small>{records.length} 条</small></div>
      <div className="record-list">
        {records.length === 0 && <p className="empty">暂无登记记录</p>}
        {[...records].reverse().map(r => (
          <div className="record" key={r.id}>
            <div className="record-top">
              <strong>{r.deviceName}</strong>
              <span className={`act ${r.action}`}>{ACTION_LABEL[r.action] ?? r.action}</span>
            </div>
            <p>{r.reason}</p>
            <small>{new Date(r.time).toLocaleString('zh-CN', { hour12: false })}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
