export const WEATHERS = {
  clear:  {id:'clear',  label:'晴朗', icon:'☀', grip:1,    brake:1,    drag:1,    rain:false, fog:false},
  sunset: {id:'sunset', label:'黄昏', icon:'🌇', grip:.99,  brake:.99,  drag:1,    rain:false, fog:false},
  rain:   {id:'rain',   label:'暴雨', icon:'🌧', grip:.84,  brake:.88,  drag:1.03, rain:true,  fog:false},
  fog:    {id:'fog',    label:'浓雾', icon:'🌫', grip:.95,  brake:.96,  drag:1.01, rain:false, fog:true}
};

export const WEATHER_LIST = Object.keys(WEATHERS);

export function getWeather(id) {
  return Object.hasOwn(WEATHERS, id) ? WEATHERS[id] : WEATHERS.clear;
}
