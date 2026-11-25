export const RUNWAY = Object.freeze({split:400, target:600, tolerance:10, laneLimit:6, boxHalfWidth:4});
export function runwaySample(s) {
  return {x:0,y:0,z:s,tx:0,tz:1,grade:0};
}
export function newRunwayTrial() {
  return {launchTime:null, hundred:null, quarter:null, stopped:0, error:null};
}
export function stepRunwayTrial(trial,car,elapsed,dt) {
  const previous=car.previous;
  if (Math.abs(car.lane)>RUNWAY.laneLimit) return '驶出测试走廊';
  if (car.v<-.05) return '倒车中止测试';
  if (trial.launchTime===null && car.v>0) trial.launchTime=elapsed-dt;
  const runSeconds=trial.launchTime===null?0:elapsed-trial.launchTime;
  const threshold=100/3.6;
  if (trial.hundred===null && previous.v<threshold && car.v>=threshold) {
    trial.hundred=runSeconds-dt*(car.v-threshold)/(car.v-previous.v);
  }
  if (trial.quarter===null && previous.s<RUNWAY.split && car.s>=RUNWAY.split) {
    trial.quarter=runSeconds-dt*(car.s-RUNWAY.split)/(car.s-previous.s);
  }
  if (car.s>RUNWAY.target+RUNWAY.tolerance) return '驶过停车区';
  const inside=Math.abs(car.s-RUNWAY.target)<=RUNWAY.tolerance && Math.abs(car.lane)<=RUNWAY.boxHalfWidth;
  trial.stopped=inside && Math.abs(car.v)<.10 ? trial.stopped+dt : 0;
  if (trial.stopped<.15) return '';
  if (trial.hundred===null || trial.quarter===null) return '未完成加速项目';
  trial.error=Math.abs(car.s-RUNWAY.target);
  return '试车完成';
}
