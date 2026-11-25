// Advertised production specifications are separate from the arcade handling coefficients.
// Dimensions are in metres. The Vision GT dimensions and performance are game settings.
export const VEHICLES = {
  su7: {
    id:'su7', name:'SU7 标准版', year:2024, drive:'单电机后驱', aero:'原厂车尾',
    powerKw:220, zeroTo100:5.28, topSpeed:210, color:'#9b9fa2', colorName:'雅灰', wing:'none',
    length:4.997, width:1.963, height:1.455,
    physics:{launch:5.94, specificPower:111, brakes:12.1, grip:11.8, aeroGrip:0, drag:.00030, rollScale:1.05}
  },
  max: {
    id:'max', name:'SU7 Max', year:2024, drive:'双电机四驱', aero:'电动尾翼',
    powerKw:495, zeroTo100:2.78, topSpeed:265, color:'#17adce', colorName:'海湾蓝', wing:'active',
    length:4.997, width:1.963, height:1.440,
    physics:{launch:10.55, specificPower:226, brakes:13.9, grip:12.8, aeroGrip:0, drag:.00030, rollScale:1}
  },
  ultra: {
    id:'ultra', name:'SU7 Ultra', year:2025, drive:'三电机四驱', aero:'选装碳纤维固定尾翼',
    powerKw:1138, zeroTo100:1.98, topSpeed:350, color:'#f6cd23', colorName:'闪电黄', wing:'fixed',
    length:5.115, width:1.970, height:1.465,
    physics:{launch:14.58, specificPower:330, brakes:15.1, grip:14.5, aeroGrip:2.7, drag:.00029, rollScale:.86}
  },
  yu7gt: {
    id:'yu7gt', name:'YU7 GT', year:2026, drive:'双电机四驱', aero:'车顶扰流板',
    powerKw:738, zeroTo100:2.92, topSpeed:300, color:'#861e36', colorName:'车厘子红', wing:'fixed',
    length:5.015, width:2.007, height:1.597,
    physics:{launch:9.77, specificPower:298, brakes:13.4, grip:12.5, aeroGrip:.8, drag:.00038, rollScale:1.24}
  },
  visiongt: {
    id:'visiongt', name:'Xiaomi Vision Gran Turismo', year:2026, drive:'纯电概念车', aero:'主动尾流控制',
    concept:true, powerKw:null, zeroTo100:2.15, topSpeed:360, color:'#acb8be', colorName:'银灰', wing:'none',
    length:5.24, width:2.17, height:1.30,
    physics:{launch:13.17, specificPower:450, brakes:15.6, grip:14.2, aeroGrip:4.7, drag:.00033, rollScale:.66}
  }
};

export function getVehicle(id) {
  return Object.hasOwn(VEHICLES, id) ? VEHICLES[id] : VEHICLES.max;
}
