import React,{useEffect,useMemo,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import{load,save}from'./data';
import{STATUS,STATUS_LABEL,ACTION_LABEL,nodeById,applyTransition,findConflicts}from'./rules';
import'./styles.css';

const ICON={router:'◉',switch:'▦',server:'▣',device:'▱'};
const fmtTime=t=>{try{return new Date(t).toLocaleString('zh-CN',{hour12:false})}catch{return t}};

function App(){
  const[data,setData]=useState(load);
  const[selected,setSelected]=useState('gw');
  const[tool,setTool]=useState('select');
  const[notice,setNotice]=useState('');
  const[drag,setDrag]=useState(null);
  const[pending,setPending]=useState(null);// 待登记原因的迁移 {id,target}
  const[reason,setReason]=useState('');
  const[alert,setAlert]=useState(null);// 被拒绝的复核结果 {rule,message,devices,links}
  const board=useRef();

  useEffect(()=>save(data),[data]);

  const node=data.nodes.find(n=>n.id===selected)||data.nodes[0];
  const conflicts=useMemo(()=>findConflicts(data),[data]);
  const nameOf=id=>nodeById(data,id)?.name||id;
  const updateNode=(k,v)=>setData({...data,nodes:data.nodes.map(n=>n.id===selected?{...n,[k]:v}:n)});

  const addNode=(type='device',label='新设备')=>{
    const id='node'+Date.now();
    setData({...data,nodes:[...data.nodes,{id,name:label,type,x:500,y:300,ip:'192.168.0.10',status:STATUS.RUNNING}]});
    setSelected(id);setTool('select');setNotice('已添加设备');
  };
  const connect=()=>{
    if(!selected)return;
    const other=prompt('输入要连接的设备 ID（例如 sw1）');
    if(other&&data.nodes.some(n=>n.id===other)&&other!==selected&&!data.edges.some(e=>(e[0]===selected&&e[1]===other)||(e[1]===selected&&e[0]===other))){
      setData({...data,edges:[...data.edges,[selected,other]]});setNotice('连接已创建');
    }
  };
  const remove=()=>{
    setData({...data,nodes:data.nodes.filter(n=>n.id!==selected),edges:data.edges.filter(e=>!e.includes(selected))});
    setSelected(data.nodes.find(n=>n.id!==selected)?.id);setNotice('设备已删除');
  };
  const exportJson=()=>{
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    a.download='network-topology.json';a.click();setNotice('JSON 已导出');
  };

  // 状态迁移：打开原因登记 → 规则复核 → 通过则登记，拒绝则列出受影响对象
  const requestTransition=(id,target)=>{
    if(nodeById(data,id)?.status===target){setNotice(`设备已处于「${STATUS_LABEL[target]}」状态`);return}
    setPending({id,target});setReason('');
  };
  const confirmTransition=()=>{
    if(!reason.trim()){setNotice('请先登记原因');return}
    const r=applyTransition(data,pending.id,pending.target,reason.trim());
    setPending(null);setReason('');
    if(!r.ok){setAlert({rule:r.rule,message:r.message,devices:r.devices||[],links:r.links||[]});return}
    setData(r.data);setNotice(`已${r.log.action}「${r.log.deviceName}」并登记`);
  };

  const validate=()=>{
    const linked=new Set(data.edges.flat());
    const isolated=data.nodes.filter(n=>!linked.has(n.id));
    if(!isolated.length&&!conflicts.length){setNotice('复核通过：无孤立节点，无规则冲突');return}
    setAlert({
      rule:{id:'CHECK',text:'拓扑复核'},
      message:[isolated.length&&`发现 ${isolated.length} 个孤立节点`,conflicts.length&&`发现 ${conflicts.length} 项规则冲突`].filter(Boolean).join('；'),
      devices:isolated.map(n=>n.id),
      links:conflicts.flatMap(c=>c.links||[]),
    });
  };

  const move=e=>{
    if(!drag)return;
    const r=board.current.getBoundingClientRect();
    setData({...data,nodes:data.nodes.map(n=>n.id===drag?{...n,x:Math.max(35,e.clientX-r.left),y:Math.max(35,e.clientY-r.top)}:n)});
  };
  const edgeState=([a,b])=>{
    const na=nodeById(data,a),nb=nodeById(data,b);
    if(!na||!nb)return'down';
    if(na.status===STATUS.DISABLED||nb.status===STATUS.DISABLED)return'down';
    if(na.status===STATUS.MAINTENANCE||nb.status===STATUS.MAINTENANCE)return'maint';
    return'';
  };

  return <div className="app">
    <header>
      <div className="brand"><span className="brand-mark">⌁</span><div><strong>NETSCAPE</strong><small>隔离与连通性复核台</small></div></div>
      <div className="file"><span className="dot"></span><div><strong>office-network.json</strong><small>最近保存：刚刚</small></div></div>
      <div className="top-actions">
        <button onClick={validate}>✓ 复核</button>
        <button onClick={exportJson}>↓ 导出</button>
        <button className="save" onClick={()=>setNotice('拓扑图已保存')}>保存更改</button>
      </div>
    </header>

    <div className="toolbar">
      <div className="tool-group"><span>工具</span>
        <button className={tool==='select'?'on':''} onClick={()=>setTool('select')}>↖ 选择</button>
        <button className={tool==='connect'?'on':''} onClick={()=>{setTool('connect');connect()}}>⌁ 连接</button>
        <button onClick={()=>addNode()}>＋ 设备</button>
      </div>
      <div className="tool-group zoom"><button>−</button><span>100%</span><button>＋</button><button onClick={()=>setNotice('画布已居中')}>⌗</button></div>
    </div>

    <div className="workspace">
      <aside className="inventory">
        <div className="section-title"><span>设备库</span><small>{data.nodes.length} 个节点</small></div>
        <div className="device-types">{[['router','◉','路由器'],['switch','▦','交换机'],['server','▣','服务器'],['device','▱','终端设备']].map(([t,i,l])=>
          <button onClick={()=>addNode(t,l)} key={t}><i className={t}>{i}</i>{l}<span>＋</span></button>)}
        </div>

        <div className="section-title nodes-head"><span>图中节点</span><small>点击查看</small></div>
        <div className="node-list">{data.nodes.map(n=>
          <button className={selected===n.id?'sel':''} onClick={()=>setSelected(n.id)} key={n.id}>
            <i className={n.type}>{ICON[n.type]}</i>
            <span><strong>{n.name}</strong><small>{n.ip}</small></span>
            <em className={'st '+n.status} title={STATUS_LABEL[n.status]}></em>
          </button>)}
        </div>

        {conflicts.length>0&&<>
          <div className="section-title nodes-head"><span>冲突告警</span><small>{conflicts.length} 项</small></div>
          <div className="conflict-list">{conflicts.map((c,i)=>
            <div className="conflict" key={i}>
              <b>{c.rule.id} · {c.rule.text}</b>
              <span>{c.detail}</span>
              <small>设备：{c.devices.map(nameOf).join('、')||'—'}</small>
              {c.links.length>0&&<small>链路：{c.links.map(([a,b])=>nameOf(a)+' ↔ '+nameOf(b)).join('、')}</small>}
            </div>)}
          </div>
        </>}

        <div className="section-title nodes-head"><span>变更记录</span><small>{data.logs.length} 条</small></div>
        <div className="log-list">
          {data.logs.length===0&&<p className="empty">暂无隔离 / 恢复记录</p>}
          {data.logs.map(l=>
            <div className="log" key={l.id}>
              <strong>{l.deviceName}<em className={'tag '+l.to}>{l.action}</em></strong>
              <span>{l.reason}</span>
              <small>{fmtTime(l.time)}</small>
            </div>)}
        </div>
      </aside>

      <section className="canvas-wrap">
        <div className="canvas" ref={board} onMouseMove={move} onMouseUp={()=>setDrag(null)}>
          {data.edges.map((e,i)=>{
            const n1=nodeById(data,e[0]),n2=nodeById(data,e[1]);
            if(!n1||!n2)return null;
            const dx=n2.x-n1.x,dy=n2.y-n1.y,len=Math.hypot(dx,dy),ang=Math.atan2(dy,dx)*180/Math.PI;
            return <div className={'edge '+edgeState(e)} key={e.join('-')+i} style={{left:n1.x,top:n1.y,width:len,transform:`rotate(${ang}deg)`}}><span></span></div>;
          })}
          {data.nodes.map(n=>
            <button className={'node '+n.type+' '+n.status+(selected===n.id?' picked':'')} style={{left:n.x-42,top:n.y-31}}
              onMouseDown={e=>{e.stopPropagation();setSelected(n.id);setDrag(n.id)}} onClick={()=>setSelected(n.id)} key={n.id}>
              <em className={'st '+n.status} title={STATUS_LABEL[n.status]}></em>
              <i>{ICON[n.type]}</i><strong>{n.name}</strong><small>{n.ip}</small>
            </button>)}
          <div className="legend">
            <span><i className="router"></i>路由器</span>
            <span><i className="switch"></i>交换机</span>
            <span><i className="server"></i>服务器</span>
            <span><em className="dot running"></em>运行</span>
            <span><em className="dot maintenance"></em>维护</span>
            <span><em className="dot disabled"></em>停用</span>
          </div>
        </div>
        <div className="canvas-footer"><span>拖动节点调整位置 · {data.edges.length} 条连接</span><span>坐标系：画布局部</span></div>
      </section>

      <aside className="inspector">
        <div className="section-title"><span>属性</span><small>{node?.type}</small></div>
        {node?<>
          <label>设备名称<input value={node.name} onChange={e=>updateNode('name',e.target.value)}/></label>
          <label>IP 地址<input value={node.ip} onChange={e=>updateNode('ip',e.target.value)}/></label>
          <label>设备类型<select value={node.type} onChange={e=>updateNode('type',e.target.value)}>
            <option value="router">路由器</option><option value="switch">交换机</option>
            <option value="server">服务器</option><option value="device">终端设备</option>
          </select></label>

          <div className="status-group"><span>运行状态（切换需登记原因）</span>
            <div className="status-btns">{Object.values(STATUS).map(s=>
              <button key={s} className={node.status===s?'on '+s:s} onClick={()=>requestTransition(node.id,s)}>{STATUS_LABEL[s]}</button>)}
            </div>
          </div>

          <div className="inspector-actions">
            <button onClick={connect}>⌁ 添加连接</button>
            <button className="danger" onClick={remove}>删除设备</button>
          </div>
          <div className="connections">
            <div className="section-title"><span>连接</span><small>{data.edges.filter(e=>e.includes(node.id)).length} 条</small></div>
            {data.edges.filter(e=>e.includes(node.id)).map((e,i)=>{
              const other=nodeById(data,e[0]===node.id?e[1]:e[0]);
              return <div className="connection" key={i}>
                <span className={'mini '+other?.type}></span><strong>{other?.name}</strong>
                <small className={other?.status}>{STATUS_LABEL[other?.status]||'运行'}</small>
              </div>;
            })}
          </div>
        </>:<p>选择一个设备</p>}
      </aside>
    </div>

    {pending&&<div className="overlay"><div className="dialog">
      <h3>{ACTION_LABEL[pending.target]}设备</h3>
      <p>{nameOf(pending.id)} · {STATUS_LABEL[nodeById(data,pending.id)?.status]} → {STATUS_LABEL[pending.target]}，请登记原因与时间（时间自动记录）</p>
      <textarea autoFocus placeholder="登记原因（必填）" value={reason} onChange={e=>setReason(e.target.value)}/>
      <div className="row">
        <button onClick={()=>{setPending(null);setReason('')}}>取消</button>
        <button className="ok" onClick={confirmTransition}>确认并登记</button>
      </div>
    </div></div>}

    {alert&&<div className="overlay"><div className="dialog">
      <h3>操作被拒绝</h3>
      {alert.rule&&<p className="rule">{alert.rule.id} · {alert.rule.text}</p>}
      <p>{alert.message}</p>
      {alert.devices.length>0&&<div><strong className="list-head">受影响设备</strong>
        <ul>{alert.devices.map(id=><li key={id}>{nameOf(id)}（{id}）</li>)}</ul></div>}
      {alert.links.length>0&&<div><strong className="list-head">冲突链路</strong>
        <ul>{alert.links.map(([a,b])=><li key={a+b}>{nameOf(a)} ↔ {nameOf(b)}</li>)}</ul></div>}
      <div className="row"><button className="ok" onClick={()=>setAlert(null)}>知道了</button></div>
    </div></div>}

    {notice&&<div className="toast" onClick={()=>setNotice('')}>{notice}</div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
