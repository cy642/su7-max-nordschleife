// Centralized visual, lighting, road, and biome definitions for all 9 circuits.
export const ROUTE_THEMES = {
  nord: {
    biome:'forest', worldType:'custom', night:false,
    region:'德国 · 莱茵兰', tag:'经典森林', stars:5, accent:'#6be8e7',
    signBg:'#1c3e44', signSub:'T13 起终点'
  },
  duku: {
    biome:'alpine', worldType:'landform', night:false,
    region:'中国 · 新疆天山', tag:'雪山垭口', stars:4, accent:'#8be0ff',
    signBg:'#2b545a', signSub:'天山垭口',
    sky:{zenith:[38,101,164], horizon:[204,224,234], mist:0xc4d8e1, fog:.00052, hemiSky:0xe4f3ff, hemiGround:0xb7b8b0, sun:0xfff1d6, sunPower:1.72, ambient:1.16, env:.84, cloud:.70, stars:false},
    road:{asphaltBase:78, shoulder:0xa5a8a4, side:0xbcc4ca, lines:0xf0eedd, center:0xf2c567, rail:0x9ba5a7, reflector:0xd64a32, kerbA:0xd84638, kerbB:0xf2f0e6, snowBank:true, snowPoles:true},
    land:{pad:990, mode:'alpine', rockA:0x5b6470, rockB:0x949ba4, cap:0xf3f7f8, boulderA:0xb1b5b4, boulderB:0x757d85, snowCap:true, trees:null}
  },
  subsea: {
    biome:'subsea', worldType:'waterfront', night:false,
    region:'东海 · 沉管工程', tag:'海底奇观', stars:3, accent:'#4ef2da',
    signBg:'#155568', signSub:'海岸入口',
    sky:{zenith:[39,115,166], horizon:[185,224,228], mist:0xb0d0d4, fog:.00086, hemiSky:0xe4f8ff, hemiGround:0x729ea9, sun:0xffedcc, sunPower:1.68, ambient:1.22, env:.85, cloud:.68, stars:false},
    road:{asphaltBase:78, shoulder:0x82979d, side:0x7e9591, lines:0xf5f2d9, center:0xe3e9e5, rail:0x98aaae, reflector:0x7be8df, kerbA:0x2ea6a8, kerbB:0xf0f4ee, marine:true},
    water:{mode:'subsea', base:'#4f989e', tint:0xe5f0ef, waveA:'rgba(223,241,221,.18)', waveB:'rgba(9,52,70,.19)'}
  },
  canyon: {
    biome:'canyon', worldType:'landform', night:false,
    region:'中国 · 丹霞地貌', tag:'红岩峡谷', stars:4, accent:'#ff9f62',
    signBg:'#824833', signSub:'红砂台地',
    sky:{zenith:[76,126,170], horizon:[244,194,152], mist:0xe8bc9a, fog:.00070, hemiSky:0xffe4c2, hemiGround:0x9c6852, sun:0xffdfa6, sunPower:1.74, ambient:1.12, env:.82, cloud:.64, stars:false},
    road:{asphaltBase:80, shoulder:0xb58e6c, side:0xcb946f, lines:0xf2e1b6, center:0xffbc67, rail:0x977a61, reflector:0xf4a34f, kerbA:0xd96136, kerbB:0xf6e6c2},
    land:{pad:700, mode:'canyon', rockA:0x9a513b, rockB:0xd48153, cap:0xe6ae83, boulderA:0xb75d40, boulderB:0xd5905e, mesas:true, trees:null}
  },
  harbor: {
    biome:'harbor', worldType:'waterfront', night:true,
    region:'深水港 · 跨海桥', tag:'夜港高架', stars:3, accent:'#ffbe68',
    signBg:'#233b59', signSub:'东码头',
    sky:{zenith:[9,20,46], horizon:[74,83,118], mist:0x545f7a, fog:.00072, hemiSky:0xabc9f2, hemiGround:0x677889, sun:0xb2d2ff, sunPower:.82, ambient:1.06, env:.44, cloud:.18, stars:true},
    road:{asphaltBase:82, shoulder:0x636973, side:0x868486, lines:0xf0eadb, center:0xfcb55e, rail:0x9da7b3, reflector:0xffbe6d, kerbA:0xe88e3c, kerbB:0xeae7dc, viaduct:true, bridgeTowers:[2100,2320], lampColor:0xffdea2},
    water:{mode:'harbor', base:'#304d61', tint:0x75889e, waveA:'rgba(166,206,212,.18)', waveB:'rgba(9,52,70,.19)'}
  },
  fuji: {
    biome:'autumn', worldType:'landform', night:false,
    region:'东方山道 · 红枫岭', tag:'秋名云海', stars:5, accent:'#ff6e54',
    signBg:'#6e2d28', signSub:'红枫驿站',
    sky:{zenith:[42,58,108], horizon:[245,162,118], mist:0xdfa185, fog:.00066, hemiSky:0xffd3ad, hemiGround:0x7c4e3d, sun:0xffbd7a, sunPower:1.78, ambient:1.08, env:.78, cloud:.62, stars:false},
    road:{asphaltBase:72, shoulder:0x7e6d61, side:0x8a5b46, lines:0xf5ebcf, center:0xf5b947, rail:0x9ea3a6, reflector:0xff7b42, kerbA:0xd93f32, kerbB:0xf7eed7, chevrons:true},
    land:{pad:860, mode:'autumn', rockA:0x574842, rockB:0xa65031, cap:0xdf823c, boulderA:0x6d615b, boulderB:0x8e7969, trees:{count:260, palette:[0xc93b2b,0xe26a2c,0xeb9d35,0x3c6143,0x9e2d26], canopy:'maple'}}
  },
  sakura: {
    biome:'coast', worldType:'coast', night:false,
    region:'太平洋 · 樱花岬', tag:'碧海樱花', stars:3, accent:'#ff9ec7',
    signBg:'#225d72', signSub:'樱岬海湾',
    sky:{zenith:[34,118,194], horizon:[194,234,246], mist:0xbbe2eb, fog:.00055, hemiSky:0xeaf9ff, hemiGround:0x7ba89e, sun:0xfff4d4, sunPower:1.76, ambient:1.24, env:.88, cloud:.58, stars:false},
    road:{asphaltBase:79, shoulder:0x98a4a6, side:0x8fb08d, lines:0xf8f6eb, center:0xf8d468, rail:0xd5dce0, reflector:0xff8bb8, kerbA:0xe86c9a, kerbB:0xf8f4f0},
    land:{pad:760, mode:'coast', rockA:0x6b7c74, rockB:0x669468, cap:0x89b372, boulderA:0x8c928d, boulderB:0x6c7572, trees:{count:240, palette:[0xf7adc9,0xf493b8,0xfbd0e0,0x528d60,0x6ca372], canopy:'sakura'}},
    water:{mode:'coast', base:'#2d9db5', tint:0xd9f4f6, waveA:'rgba(240,252,255,.24)', waveB:'rgba(14,76,104,.22)'}
  },
  cyber: {
    biome:'cyber', worldType:'waterfront', night:true,
    region:'未来都市 · 湾岸环线', tag:'霓虹都会', stars:4, accent:'#d86bff',
    signBg:'#291746', signSub:'中央光轨',
    sky:{zenith:[10,8,34], horizon:[66,34,98], mist:0x322250, fog:.00078, hemiSky:0xa992ff, hemiGround:0x3f2d5e, sun:0x9ad8ff, sunPower:.78, ambient:1.08, env:.48, cloud:.24, stars:true},
    road:{asphaltBase:66, shoulder:0x3a374c, side:0x4b4266, lines:0x68f7ff, center:0xff5ed8, rail:0x757b98, reflector:0x5ef8ff, kerbA:0xd946ef, kerbB:0x4ef2ff, viaduct:true, bridgeTowers:[2550,2790], lampColor:0x84f7ff, neonDeck:true},
    water:{mode:'cyber', base:'#1d2444', tint:0x576192, waveA:'rgba(124,235,255,.22)', waveB:'rgba(190,74,232,.22)'}
  },
  volcano: {
    biome:'volcano', worldType:'landform', night:true,
    region:'黑曜群岛 · 火山口', tag:'熔岩秘境', stars:5, accent:'#ff6a2b',
    signBg:'#572216', signSub:'黑曜隘口',
    sky:{zenith:[26,16,30], horizon:[148,58,36], mist:0x5e2e24, fog:.00076, hemiSky:0xffa06b, hemiGround:0x522519, sun:0xff7b3d, sunPower:1.35, ambient:1.05, env:.52, cloud:.48, stars:true},
    road:{asphaltBase:56, shoulder:0x484245, side:0x573b33, lines:0xffd088, center:0xff6c2e, rail:0x6f6869, reflector:0xff5b24, kerbA:0xff551f, kerbB:0x2b2528, lavaGlow:true},
    land:{pad:820, mode:'volcano', rockA:0x2c282b, rockB:0x4b3835, cap:0xff5a1f, boulderA:0x383236, boulderB:0x59362d, lavaPools:true, trees:null}
  }
};

export function getRouteTheme(id) {
  return Object.hasOwn(ROUTE_THEMES, id) ? ROUTE_THEMES[id] : ROUTE_THEMES.nord;
}
