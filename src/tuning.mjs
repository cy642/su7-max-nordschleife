export const PAINTS = [
  {id:'stock',    name:'原厂车漆', hex:null},
  {id:'aqua',     name:'海湾蓝',   hex:'#17adce'},
  {id:'purple',   name:'霞光紫',   hex:'#7e68b5'},
  {id:'lava',     name:'熔岩橙',   hex:'#e6592e'},
  {id:'yellow',   name:'闪电黄',   hex:'#f6cd23'},
  {id:'cherry',   name:'车厘子红', hex:'#8c1d37'},
  {id:'pearl',    name:'珍珠白',   hex:'#dfe6eb'},
  {id:'obsidian', name:'碳纤黑',   hex:'#272d34'}
];

export const TUNES = {
  balanced: {id:'balanced', label:'均衡', desc:'原厂平衡设定',          grip:1,    brake:1,    drag:1,    top:1,    drift:1},
  aero:     {id:'aero',     label:'弯道', desc:'过弯抓地 +8%，极速 -4%', grip:1.08, brake:1.06, drag:1.08, top:.96,  drift:.95},
  speed:    {id:'speed',    label:'极速', desc:'低阻极速 +4%，抓地 -5%', grip:.95,  brake:.97,  drag:.86,  top:1.04, drift:1.02},
  drift:    {id:'drift',    label:'漂移', desc:'更灵动车尾与手刹起漂',   grip:.93,  brake:.98,  drag:1.01, top:.99,  drift:1.28}
};

export function getTune(id) {
  return Object.hasOwn(TUNES, id) ? TUNES[id] : TUNES.balanced;
}

export function getPaint(id, vehicle) {
  const found = PAINTS.find(p => p.id === id);
  if (!found || !found.hex) return {id:'stock', name:vehicle.colorName, hex:vehicle.color};
  return found;
}
