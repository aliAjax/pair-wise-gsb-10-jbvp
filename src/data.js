// 数据层：种子数据、规范化与持久化（不含任何规则判断）
export const seed={
  nodes:[
    {id:'gw',name:'核心路由器',type:'router',x:470,y:220,ip:'10.0.0.1',status:'running'},
    {id:'sw1',name:'交换机 A',type:'switch',x:250,y:370,ip:'10.0.1.1',status:'running'},
    {id:'sw2',name:'交换机 B',type:'switch',x:690,y:370,ip:'10.0.2.1',status:'running'},
    {id:'web',name:'Web Server',type:'server',x:100,y:520,ip:'10.0.1.10',status:'running'},
    {id:'db',name:'Database',type:'server',x:400,y:550,ip:'10.0.1.20',status:'running'},
    {id:'user',name:'办公终端',type:'device',x:820,y:530,ip:'10.0.2.22',status:'running'},
  ],
  edges:[['gw','sw1'],['gw','sw2'],['sw1','web'],['sw1','db'],['sw2','user']],
  logs:[],
};

const KEY='topology';

// 兼容旧存档：补齐 status 与 logs，保证刷新后状态、链路、记录一致
export function normalize(raw){
  const base=raw&&Array.isArray(raw.nodes)&&Array.isArray(raw.edges)?raw:seed;
  return{
    nodes:base.nodes.map(n=>({status:'running',...n})),
    edges:base.edges.map(e=>[...e]),
    logs:Array.isArray(base.logs)?base.logs:[],
  };
}

export function load(){
  try{return normalize(JSON.parse(localStorage.getItem(KEY)))}catch{return normalize(seed)}
}

export function save(data){
  try{localStorage.setItem(KEY,JSON.stringify(data))}catch{/* 存储不可用时静默 */}
}
