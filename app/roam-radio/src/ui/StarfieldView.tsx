// 星图/地球 3D 视图：单站全量点云 + 准星注视拾取 + 拖拽惯性 + 捏合缩放。
// three.js 走 expo-gl 上下文（新版 GLView 由 CADisplayLink 自动呈现，JS 只管 rAF 绘制）。
import { GLView } from 'expo-gl';
import * as React from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import * as THREE from 'three';

export interface CloudData {
  /** 单位球面坐标 xyz（连续存储） */
  dirs: Float32Array;
  /** 每点像素大小 */
  sizes: Float32Array;
  /** 每点 rgb */
  colors: Float32Array;
}

export interface StarfieldProps {
  cloud: CloudData;
  mode: 'sky' | 'globe';
  /** 准星指向的台站索引（变化时才回调；null = 无目标） */
  onLookAt: (index: number | null) => void;
  /** 点击星点（短按且未拖拽） */
  onTapPoint: (index: number) => void;
}

function latLngToDir(iLat: number, iLng: number, out: number[]) {
  const lat = (iLat / 100) * (Math.PI / 180);
  const lng = (iLng / 100) * (Math.PI / 180);
  const cl = Math.cos(lat);
  out[0] = cl * Math.sin(lng);
  out[1] = Math.sin(lat);
  out[2] = cl * Math.cos(lng);
}

export function buildCloud(
  lat: number[],
  lng: number[],
  pop: number[],
  indices: number[],
): CloudData {
  const n = indices.length;
  const dirs = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  const colors = new Float32Array(n * 3);
  const v: number[] = [0, 0, 0];
  for (let k = 0; k < n; k++) {
    const i = indices[k];
    latLngToDir(lat[i], lng[i], v);
    dirs[k * 3] = v[0];
    dirs[k * 3 + 1] = v[1];
    dirs[k * 3 + 2] = v[2];
    const p = pop[i] ?? 0;
    sizes[k] = 2 + p * 1.1;
    const t = Math.min(1, p / 10);
    // 冷白 → 暖金：热门台更亮
    colors[k * 3] = 0.72 + 0.28 * t;
    colors[k * 3 + 1] = 0.8 - 0.18 * t;
    colors[k * 3 + 2] = 1 - 0.55 * t;
  }
  return { dirs, sizes, colors };
}

const VERT = `
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
uniform float uScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.35, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  float glow = smoothstep(0.5, 0.0, d);
  float core = smoothstep(0.18, 0.0, d);
  float alpha = glow * 0.35 + core * 0.75;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(vColor * (0.75 + core * 0.9), alpha);
}`;

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  globeMesh?: THREE.Mesh;
}

export function StarfieldView({ cloud, mode, onLookAt, onTapPoint }: StarfieldProps) {
  const glRef = React.useRef<any>(null);
  const sceneRef = React.useRef<SceneRefs | null>(null);
  const cloudRef = React.useRef(cloud);
  const modeRef = React.useRef(mode);
  const lookCb = React.useRef(onLookAt);
  const tapCb = React.useRef(onTapPoint);
  lookCb.current = onLookAt;
  tapCb.current = onTapPoint;
  modeRef.current = mode;

  // 视角状态（yaw/pitch + 惯性 + fov）
  const view = React.useRef({
    yaw: 0,
    pitch: 0.15,
    vy: 0.0016, // 缓慢自转
    vx: 0,
    fov: 68,
    dist: 2.7, // globe 模式相机距离
    lastLook: -2, // -2 未初始化，-1 无目标
    pickAt: 0,
  });

  const drag = React.useRef({ active: false, lastX: 0, lastY: 0, moved: 0, downAt: 0, pinchDist: 0 });

  const responder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
        onPanResponderGrant: (evt) => {
          const t = evt.nativeEvent;
          drag.current = { active: true, lastX: t.locationX, lastY: t.locationY, moved: 0, downAt: Date.now(), pinchDist: 0 };
          view.current.vy = 0;
          view.current.vx = 0;
        },
        onPanResponderMove: (evt, g) => {
          const v = view.current;
          const d = drag.current;
          if (g.numberActiveTouches === 2) {
            const ts = evt.nativeEvent.touches;
            const pd = ts.length >= 2 ? Math.hypot(ts[0].locationX - ts[1].locationX, ts[0].locationY - ts[1].locationY) : 0;
            if (d.pinchDist > 20) {
              const ratio = d.pinchDist / pd;
              v.fov = Math.max(18, Math.min(85, v.fov * ratio));
              v.dist = Math.max(1.55, Math.min(5, v.dist / ratio ** 0.35));
            }
            d.pinchDist = pd;
            return;
          }
          const mx = g.x0 + g.dx;
          const my = g.y0 + g.dy;
          const dx = mx - d.lastX;
          const dy = my - d.lastY;
          d.moved += Math.abs(dx) + Math.abs(dy);
          d.lastX = mx;
          d.lastY = my;
          v.yaw += dx * 0.0042;
          v.pitch = Math.max(-1.45, Math.min(1.45, v.pitch + dy * 0.0042));
          v.vx = dx * 0.00042;
          v.vy = dy * 0.00042;
        },
        onPanResponderRelease: (_, g) => {
          const d = drag.current;
          d.active = false;
          d.pinchDist = 0;
          const v = view.current;
          if (d.moved < 12 && Date.now() - d.downAt < 320) {
            // 短按 = 点选准星目标
            if (v.lastLook >= 0) tapCb.current(v.lastLook);
          } else {
            v.vy = Math.max(-0.02, Math.min(0.02, g.vy * 0.0006));
            v.vx = Math.max(-0.06, Math.min(0.06, g.vx * -0.0012));
          }
        },
        onPanResponderTerminate: () => {
          drag.current.active = false;
        },
      }),
    [],
  );

  const makeScene = React.useCallback((gl: any): SceneRefs => {
    const canvas = {
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      style: gl.style,
      addEventListener() {},
      removeEventListener() {},
      constructor: gl.constructor,
    };
    const renderer = new THREE.WebGLRenderer({ canvas: canvas as any, context: gl, alpha: true });
    renderer.autoClear = true;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(68, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.02, 10);
    const group = new THREE.Group();
    scene.add(group);

    const geometry = new THREE.BufferGeometry();
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: Math.max(1, gl.drawingBufferWidth / 390) } },
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    group.add(points);

    return { renderer, scene, camera, group, points, material };
  }, []);

  const rebuildGeometry = React.useCallback(() => {
    const s = sceneRef.current;
    if (!s) return;
    const { dirs, sizes, colors } = cloudRef.current;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(dirs, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    s.points.geometry.dispose();
    s.points.geometry = geo;
  }, []);

  React.useEffect(() => {
    cloudRef.current = cloud;
    rebuildGeometry();
  }, [cloud, rebuildGeometry]);

  React.useEffect(() => {
    // 模式切换：加/去地球球体，重设相机
    const s = sceneRef.current;
    if (!s) return;
    if (s.globeMesh) {
      s.scene.remove(s.globeMesh);
      s.globeMesh = undefined;
    }
    if (mode === 'globe') {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.985, 36, 24),
        new THREE.MeshBasicMaterial({ color: 0x0d1b33, transparent: true, opacity: 0.96 }),
      );
      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.SphereGeometry(0.988, 12, 8)),
        new THREE.LineBasicMaterial({ color: 0x1f3556, transparent: true, opacity: 0.5 }),
      );
      const grp = new THREE.Group();
      grp.add(sphere);
      grp.add(wire);
      s.globeMesh = grp as unknown as THREE.Mesh;
      s.scene.add(s.globeMesh);
    }
    s.group.rotation.set(0, 0, 0);
  }, [mode]);

  const rafRef = React.useRef(0);

  const onContextCreate = React.useCallback((gl: any) => {
    glRef.current = gl;
    const s = makeScene(gl);
    sceneRef.current = s;
    rebuildGeometry();
    let prev = Date.now();
    const forward = new THREE.Vector3();
    const inv = new THREE.Quaternion();
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const loop = () => {
      const now = Date.now();
      const dt = Math.min(50, now - prev);
      prev = now;
      const v = view.current;
      if (!drag.current.active) {
        v.yaw += v.vx * dt;
        v.pitch = Math.max(-1.45, Math.min(1.45, v.pitch + v.vy * dt));
        v.vx *= 0.96;
        v.vy = v.vy * 0.985 + 0.000004 * dt; // 缓慢自转回弹
        if (Math.abs(v.vx) < 0.000005) v.vx = 0;
      }
      const g2 = sceneRef.current;
      if (!g2) return;
      euler.set(v.pitch, v.yaw, 0);
      g2.group.quaternion.setFromEuler(euler);
      if (modeRef.current === 'globe') {
        g2.camera.position.set(0, 0, v.dist);
        g2.camera.fov = 50;
      } else {
        g2.camera.position.set(0, 0, 0.01);
        g2.camera.fov = v.fov;
      }
      g2.camera.updateProjectionMatrix();
      g2.renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      g2.renderer.render(g2.scene, g2.camera);

      // 拾取：准星 = 相机 forward；找角度最小的点
      if (now - v.pickAt > 120) {
        v.pickAt = now;
        g2.camera.getWorldDirection(forward); // -Z 方向
        inv.copy(g2.group.quaternion).invert();
        forward.applyQuaternion(inv); // 转到点云局部空间
        const dirs = cloudRef.current.dirs;
        const n = dirs.length / 3;
        const cosThresh = Math.cos((Math.PI / 180) * Math.max(2.2, v.fov / 14));
        let best = -1;
        let bestDot = cosThresh;
        for (let k = 0; k < n; k++) {
          const dk = dirs[k * 3] * forward.x + dirs[k * 3 + 1] * forward.y + dirs[k * 3 + 2] * forward.z;
          if (dk > bestDot) {
            bestDot = dk;
            best = k;
          }
        }
        if (best !== v.lastLook) {
          v.lastLook = best;
          lookCb.current(best < 0 ? null : best);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [makeScene, rebuildGeometry]);

  React.useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      const s = sceneRef.current;
      sceneRef.current = null;
      try {
        s?.renderer.dispose();
      } catch {
        /* noop */
      }
    },
    [],
  );

  return (
    <View style={StyleSheet.absoluteFill} {...responder.panHandlers}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
    </View>
  );
}
