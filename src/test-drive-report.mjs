import {VEHICLES} from './vehicles.mjs';
const value = (n, precision, unit='') => Number.isFinite(n) ? n.toFixed(precision)+unit : '—';
const key = (venue,id) => 'nordrun.trials.v1.'+venue+'.'+id;
function previous(venue,id){
  try{return JSON.parse(localStorage.getItem(key(venue,id)))||{};}catch{return {};}
}
export function testReport(venue,id,stats){
  const old=previous(venue,id),record={};
  for(const k of ['bestZeroTo100S','best100ToZeroM','topSpeedKph']){
    const candidates=[old[k],stats[k]].filter(n=>Number.isFinite(n)&&n>0);
    record[k]=candidates.length?(k==='topSpeedKph'?Math.max(...candidates):Math.min(...candidates)):null;
  }
  if(stats.distanceM>=1){try{localStorage.setItem(key(venue,id),JSON.stringify(record));}catch{}}
  const rows=[
    ['本次实跑',(stats.distanceM/1000).toFixed(2)+' km'],
    ['本次最高车速',value(stats.topSpeedKph,1,' km/h')],
    ['最佳 0–100 km/h',value(stats.bestZeroTo100S,2,' s')],
    ['最佳 100–0 km/h',value(stats.best100ToZeroM,1,' m')]
  ];
  const board=Object.values(VEHICLES).flatMap(car=>{
    const score=car.id===id?record:previous(venue,car.id);
    if(!Number.isFinite(score.topSpeedKph)||score.topSpeedKph<=0)return [];
    const name=car.id==='visiongt'?'Vision GT':car.name;
    return ['<tr><th>'+name+'</th><td>'+value(score.bestZeroTo100S,2)+'</td><td>'+value(score.best100ToZeroM,1)+'</td><td>'+value(score.topSpeedKph,1)+'</td></tr>'];
  });
  const comparison=board.length?'<details class="drive-compare"><summary>同场地车型对比</summary><table><thead><tr><th>车型</th><th>零百 / s</th><th>刹停 / m</th><th>极速 / km/h</th></tr></thead><tbody>'+board.join('')+'</tbody></table></details>':'';
  return {rows,comparison};
}
