// 规则层：状态机、连通性复核与冲突扫描（不依赖界面与存储）
export const STATUS={RUNNING:'running',MAINTENANCE:'maintenance',DISABLED:'disabled'};
export const STATUS_LABEL={running:'运行',maintenance:'维护',disabled:'停用'};
export const ACTION_LABEL={running:'恢复',maintenance:'维护',disabled:'隔离'};

export const RULES={
  CORE_LOCKED:{id:'R1',text:'核心路由器不得停用'},
  LINK_MAINTENANCE:{id:'R2',text:'同一条链路两端不能同时维护'},
  CORE_REACHABLE:{id:'R3',text:'停用前须确认其余运行设备仍能到达核心路由器'},
};

export const coreOf=nodes=>nodes.find(n=>n.type==='router')||null;
export const nodeById=(data,id)=>data.nodes.find(n=>n.id===id);

// 运行中的设备里，从核心路由器出发不可达的设备（维护/停用设备视为暂时离线，不参与判定）
export function unreachableRunning(nodes,edges){
  const core=coreOf(nodes);
  if(!core||core.status!==STATUS.RUNNING)return[];
  const live=new Set(nodes.filter(n=>n.status===STATUS.RUNNING).map(n=>n.id));
  const seen=new Set([core.id]);
  const queue=[core.id];
  while(queue.length){
    const cur=queue.shift();
    for(const[a,b]of edges){
      const next=a===cur?b:b===cur?a:null;
      if(next&&live.has(next)&&!seen.has(next)){seen.add(next);queue.push(next)}
    }
  }
  return nodes.filter(n=>live.has(n.id)&&!seen.has(n.id));
}

// 复核一次状态迁移：通过返回 {ok:true}，拒绝返回规则、受影响设备与链路
export function evaluateTransition(data,id,target){
  const node=nodeById(data,id);
  if(!node)return{ok:false,rule:null,devices:[],links:[],message:'设备不存在'};
  if(node.status===target)return{ok:false,rule:null,devices:[],links:[],message:`设备已处于「${STATUS_LABEL[target]}」状态`};

  if(target===STATUS.DISABLED){
    const core=coreOf(data.nodes);
    if(core&&core.id===id)
      return{ok:false,rule:RULES.CORE_LOCKED,devices:[id],links:[],message:'核心路由器不得停用'};
    const simulated=data.nodes.map(n=>n.id===id?{...n,status:STATUS.DISABLED}:n);
    const cut=unreachableRunning(simulated,data.edges);
    if(cut.length)
      return{ok:false,rule:RULES.CORE_REACHABLE,devices:cut.map(n=>n.id),links:[],
        message:`停用后仍有 ${cut.length} 台运行设备无法到达核心路由器，整次操作已拒绝`};
  }

  if(target===STATUS.MAINTENANCE){
    const links=data.edges.filter(([a,b])=>{
      const other=a===id?b:b===id?a:null;
      const o=other&&nodeById(data,other);
      return o&&o.status===STATUS.MAINTENANCE;
    });
    if(links.length)
      return{ok:false,rule:RULES.LINK_MAINTENANCE,
        devices:[id,...new Set(links.flat().filter(x=>x!==id))],links,
        message:'链路对端正在维护，同一条链路两端不能同时维护'};
  }

  return{ok:true};
}

// 执行迁移：先复核，通过后更新状态并登记原因与时间
export function applyTransition(data,id,target,reason){
  const verdict=evaluateTransition(data,id,target);
  if(!verdict.ok)return{...verdict,data};
  const node=nodeById(data,id);
  const log={
    id:'log'+Date.now(),
    device:id,
    deviceName:node.name,
    from:node.status,
    to:target,
    action:ACTION_LABEL[target],
    reason:reason||'（未填写）',
    time:new Date().toISOString(),
  };
  return{ok:true,log,data:{
    ...data,
    nodes:data.nodes.map(n=>n.id===id?{...n,status:target}:n),
    logs:[log,...data.logs],
  }};
}

// 全量冲突扫描（用于刷新后复核与「检查」按钮）
export function findConflicts(data){
  const out=[];
  const core=coreOf(data.nodes);
  if(core&&core.status===STATUS.DISABLED)
    out.push({rule:RULES.CORE_LOCKED,devices:[core.id],links:[],detail:'核心路由器处于停用状态'});
  for(const[a,b]of data.edges){
    const na=nodeById(data,a),nb=nodeById(data,b);
    if(na&&nb&&na.status===STATUS.MAINTENANCE&&nb.status===STATUS.MAINTENANCE)
      out.push({rule:RULES.LINK_MAINTENANCE,devices:[a,b],links:[[a,b]],detail:'链路两端同时处于维护状态'});
  }
  const cut=unreachableRunning(data.nodes,data.edges);
  if(cut.length)
    out.push({rule:RULES.CORE_REACHABLE,devices:cut.map(n=>n.id),links:[],detail:'运行中的设备无法到达核心路由器'});
  return out;
}
