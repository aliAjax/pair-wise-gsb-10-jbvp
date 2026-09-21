import React from 'react';
import { STATUS, STATUS_LABEL } from '../rules/constraints.js';

// 状态切换器 + 隔离/恢复原因登记表单
export default function StatusControl({ current, pending, reason, onRequest, onReasonChange, onConfirm, onCancel }) {
  return (
    <div className="status-control">
      <div className="status-buttons">
        {Object.values(STATUS).map(s => (
          <button
            key={s}
            className={`st-btn st-${s}${current === s ? ' on' : ''}`}
            onClick={() => onRequest(s)}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {pending && (
        <div className="reason-form">
          <label>
            {pending === STATUS.RUNNING ? '恢复原因（将登记）' : `隔离为「${STATUS_LABEL[pending]}」的原因（将登记）`}
            <input
              value={reason}
              placeholder="例如：固件升级 / 端口故障 / 例行巡检"
              onChange={e => onReasonChange(e.target.value)}
              autoFocus
            />
          </label>
          <div className="reason-actions">
            <button className="confirm" onClick={onConfirm}>
              {pending === STATUS.RUNNING ? '确认恢复' : '确认隔离'}
            </button>
            <button onClick={onCancel}>取消</button>
          </div>
          <small>提交前将按规则复核；时间自动登记为当前时间</small>
        </div>
      )}
    </div>
  );
}
