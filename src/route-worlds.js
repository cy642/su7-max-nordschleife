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
  let venue='nord', scene=stage.world, tunnels=null, lights=[], ambient=1;
  return {
    actors,
    select(route){
      if(venue===route.id)return scene;
      const previous=scene;
      scene=route.id==='nord'?stage.world:new T.Scene();
      venue=route.id;tunnels=null;lights=[];
      if(scene!==stage.world){
        scene.environment=stage.world.environment;
        buildRouteLandscape(scene,route,sample);
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
