import * as T from 'three';
import {buildRouteLandscape} from './route-landscapes.js';
import {buildRouteTunnels} from './route-tunnels.js';
import {sample} from './track.mjs';

function disposeScenery(scene){
  const geometries=new Set(), materials=new Set(), textures=new Set();
  scene.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    if(object.material){
      for(const material of [].concat(object.material))materials.add(material);
    }
    if(object.isInstancedMesh)object.dispose();
  });
  if(scene.background?.isTexture)textures.add(scene.background);
  for(const material of materials){
    for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    material.dispose();
  }
  for(const geometry of geometries)geometry.dispose();
  for(const texture of textures)if(texture!==scene.environment)texture.dispose();
  scene.clear();
}

export function createRouteWorlds(stage){
  const actors=new T.Group();
  actors.add(stage.sprintFinish,stage.challengeMarker,...stage.lineMarkers);
  stage.world.add(actors);
  const nordBase={
    fogColor:stage.world.fog.color.getHex(),
    fogDensity:stage.world.fog.density,
    bgIntensity:stage.world.backgroundIntensity,
    envIntensity:stage.world.environmentIntensity,
    lights:[]
  };
  stage.world.traverse(light=>{
    if(light.isHemisphereLight||light.isDirectionalLight){
      nordBase.lights.push({light,color:light.color.getHex(),intensity:light.intensity});
    }
  });
  function applyNordWeather(weather){
    const w=stage.world;
    if(weather==='sunset'){
      w.fog.color.setHex(0xd69f84);w.fog.density=.0019;w.backgroundIntensity=.74;w.environmentIntensity=.78;
      nordBase.lights.forEach(item=>{
        item.light.color.setHex(item.light.isDirectionalLight?0xffae66:0xffd3ad);
        item.light.intensity=item.intensity*(item.light.isDirectionalLight?1.08:.88);
      });
    }else if(weather==='rain'){
      w.fog.color.setHex(0x6e7e88);w.fog.density=.0034;w.backgroundIntensity=.45;w.environmentIntensity=.55;
      nordBase.lights.forEach(item=>{
        item.light.color.setHex(0xb4c7d4);
        item.light.intensity=item.intensity*(item.light.isDirectionalLight?.46:.78);
      });
    }else if(weather==='fog'){
      w.fog.color.setHex(0xc2cdd1);w.fog.density=.0048;w.backgroundIntensity=.62;w.environmentIntensity=.68;
      nordBase.lights.forEach(item=>{
        item.light.color.setHex(0xdde6ea);
        item.light.intensity=item.intensity*(item.light.isDirectionalLight?.62:.92);
      });
    }else{
      w.fog.color.setHex(nordBase.fogColor);w.fog.density=nordBase.fogDensity;
      w.backgroundIntensity=nordBase.bgIntensity;w.environmentIntensity=nordBase.envIntensity;
      nordBase.lights.forEach(item=>{item.light.color.setHex(item.color);item.light.intensity=item.intensity;});
    }
  }
  let venue='nord', weatherKey='clear', scene=stage.world, tunnels=null, lights=[], ambient=1;
  return {
    actors,
    select(route,weather='clear'){
      if(route.id==='nord'){
        applyNordWeather(weather);
        if(venue==='nord'){weatherKey=weather;return scene;}
      }else if(venue===route.id&&weatherKey===weather){
        return scene;
      }
      const previous=scene;
      scene=route.id==='nord'?stage.world:new T.Scene();
      venue=route.id;weatherKey=weather;tunnels=null;lights=[];
      if(scene!==stage.world){
        scene.environment=stage.world.environment;
        buildRouteLandscape(scene,route,sample,weather);
        tunnels=buildRouteTunnels(scene,route,sample);
        scene.traverse(light=>{
          if(light.isHemisphereLight||light.isDirectionalLight)lights.push([light,light.intensity]);
        });
        ambient=scene.environmentIntensity;
      }
      scene.add(actors);
      if(previous!==stage.world)disposeScenery(previous);
      return scene;
    },
    update(distance,elapsed){
      if(!tunnels)return 0;
      const cover=tunnels.update(distance,elapsed);
      scene.environmentIntensity=ambient*(1-.57*cover);
      for(const [light,intensity] of lights){
        const dimming=light.isDirectionalLight ? .70 : .32;
        light.intensity=intensity*(1-dimming*cover);
      }
      return cover;
    }
  };
}
