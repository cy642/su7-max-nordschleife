import * as T from 'three';

// Lens centres in the local coordinates of the five player models.
const lenses = {
  su7:[.76,.630,2.203,.76], max:[.76,.630,2.203,.76], ultra:[.76,.630,2.203,.76],
  yu7gt:[.776,.681,2.211,.76], visiongt:[.874,.541,2.355,.40]
};

export function createTestDriveControls(carRoot) {
  const lights = new T.Group();
  lights.name = 'Test drive low beams';
  carRoot.add(lights);
  // A single shadow-free light covers the overlapping road footprints of the two lenses.
  const beam = new T.SpotLight(0xf1f6ff, 1950, 43, .47, .70, 2);
  const aim = new T.Object3D();
  aim.position.set(0, .055, 17);
  beam.target = aim;
  lights.add(beam, aim);
  const bulb = new T.SphereGeometry(1, 12, 8);
  const litGlass = new T.MeshBasicMaterial({color:0xf2fbff, toneMapped:false});
  const emitters = [-1,1].map(() => {
    const mesh = new T.Mesh(bulb,litGlass);
    lights.add(mesh);
    return mesh;
  });
  function setVehicle(id) {
    const [x,y,z,angle] = lenses[id] || lenses.max;
    emitters.forEach((mesh,i) => {
      const side = i ? 1 : -1;
      mesh.position.set(x*side,y,z);
      mesh.rotation.set(0,angle*side,id==='visiongt'?.24*side:0,'YXZ');
      mesh.scale.set(id==='visiongt'?.026:.047,id==='visiongt'?.008:.018,.014);
    });
    beam.position.set(0,y,z+.19);
  }

  let hiddenHost;
  const panel = document.createElement('span');
  panel.style.gap = '5px';
  function button(label) {
    const b = document.createElement('button');
    b.type = 'button';b.className = 'small';b.textContent = label;
    panel.append(b);return b;
  }
  const lampButton = button('近光灯'), hornButton = button('鸣笛');
  let active = false, enabled = false, raceBeam = false, audible = false, unavailable = false;
  let soundEnabled = () => false;
  let audio, hornGain, revision = 0, pending = false;

  function sync() {
    if (hiddenHost) hiddenHost.hidden=!active;
    panel.style.display = active?'inline-flex':'none';
    lights.visible = (active && enabled) || raceBeam;
    lampButton.textContent = '近光 · '+(lights.visible?'开':'关');
    lampButton.setAttribute('aria-pressed',String(lights.visible));
    lampButton.title = '切换近光灯（L）';
    hornButton.disabled = !audible || unavailable;
    hornButton.textContent = !audible?'鸣笛 · 静音':unavailable?'鸣笛不可用':hornGain?'鸣笛中':'鸣笛';
    hornButton.title = audible?'短鸣一声（H）':'请先打开游戏声音';
  }
  function setRaceBeam(on) {
    raceBeam = Boolean(on);
    enabled = raceBeam;
    sync();
  }
  function getBeam() { return lights.visible; }
  function quiet() {
    revision++;
    pending = false;
    if (hornGain) {hornGain.disconnect();hornGain=null;}
  }
  function toggle() {
    if (!active) return;
    enabled=!enabled;sync();
  }
  async function honk() {
    if (!active || !soundEnabled() || pending || hornGain || unavailable) return;
    const request = ++revision;
    pending = true;
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state!=='running') await audio.resume();
      if (revision!==request || !active || !soundEnabled()) return;
      const t=audio.currentTime, gain=audio.createGain();
      hornGain=gain;
      gain.gain.setValueAtTime(.001,t);
      gain.gain.exponentialRampToValueAtTime(.057,t+.018);
      gain.gain.setValueAtTime(.057,t+.19);
      gain.gain.exponentialRampToValueAtTime(.001,t+.27);
      gain.connect(audio.destination);
      const filter=audio.createBiquadFilter();
      filter.type='lowpass';filter.frequency.value=1550;filter.Q.value=.6;filter.connect(gain);
      let voices=2;
      for (const pitch of [405,505]) {
        const osc=audio.createOscillator();
        osc.frequency.value=pitch;osc.type='sawtooth';osc.connect(filter);
        osc.onended=()=>{
          osc.disconnect();
          if (--voices===0) {
            filter.disconnect();gain.disconnect();
            if(hornGain===gain){hornGain=null;sync();}
          }
        };
        osc.start(t);osc.stop(t+.28);
      }
    } catch {
      unavailable=true;quiet();
    } finally {
      if(revision===request) pending=false;
      sync();
    }
  }
  lampButton.onclick=toggle;hornButton.onclick=honk;
  window.addEventListener('keydown',e=>{
    if (!active || e.repeat || e.altKey || e.ctrlKey || e.metaKey ||
        e.target?.closest?.('input,select,textarea,[contenteditable=true]')) return;
    if(e.code==='KeyL'){e.preventDefault();toggle();}
    if(e.code==='KeyH'){e.preventDefault();honk();}
  });
  function update(nextActive) {
    const nextAudible=Boolean(soundEnabled());
    if (active===nextActive && audible===nextAudible) return;
    active=nextActive;audible=nextAudible;
    if(!active || !audible) quiet();
    sync();
  }
  function reset() {
    active=false;enabled=false;raceBeam=false;quiet();sync();
  }
  function bindPanel(container,readSound) {
    hiddenHost=container.hidden?container:null;
    container.append(panel);
    soundEnabled=readSound;audible=Boolean(readSound());sync();
  }
  setVehicle('max');sync();
  return {setVehicle, bindPanel, update, reset, setRaceBeam, getBeam};
}
