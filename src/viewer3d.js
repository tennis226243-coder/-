// three.js による 3D ビュー（間取りデータ → 3D モデル生成・表示・書き出し）
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { wallSegments, bounds } from './model.js';

const EYE_HEIGHT = 1.6;

export class Viewer3D {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeef1f5);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
    this.camera.position.set(8, 10, 12);

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.maxPolarAngle = Math.PI * 0.495;

    this.walk = new PointerLockControls(this.camera, this.renderer.domElement);
    this.walk.addEventListener('unlock', () => this.setWalkMode(false));
    this.keys = new Set();
    this.walkMode = false;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb0a890, 1.6);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 1 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.01;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.model = new THREE.Group();
    this.model.name = 'Floorplan';
    this.scene.add(this.model);

    this.textureCache = new Map();
    this.options = { showPlanImage: true, wallColor: '#f4f1ea', wallOpacity: 1, showRooms: true };
    this.hasFitted = false;

    this.clock = new THREE.Clock();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    window.addEventListener('keydown', (e) => this.walkMode && this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.walkMode && this.walk.isLocked) {
      const speed = (this.keys.has('ShiftLeft') ? 3 : 1.4) * dt;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) this.walk.moveForward(speed);
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) this.walk.moveForward(-speed);
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.walk.moveRight(-speed);
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.walk.moveRight(speed);
      this.camera.position.y = EYE_HEIGHT;
    } else {
      this.orbit.update();
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** 間取りデータから 3D モデルを再構築する */
  update(project, options = {}) {
    Object.assign(this.options, options);
    disposeTree(this.model);
    this.model.clear();

    const s = project.scale;
    const b = bounds(project);
    // モデルの中心を原点に
    this.offset = { x: ((b.minX + b.maxX) / 2) * s, z: ((b.minY + b.maxY) / 2) * s };
    const P = (p) => new THREE.Vector3(p.x * s - this.offset.x, 0, p.y * s - this.offset.z);

    const opts = this.options;
    const wallMat = new THREE.MeshStandardMaterial({
      color: opts.wallColor,
      roughness: 0.85,
      transparent: opts.wallOpacity < 1,
      opacity: opts.wallOpacity,
    });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xa8784f, roughness: 0.6 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x5c6670, roughness: 0.5, metalness: 0.3 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xbfdcf0, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false,
    });

    // 案の比較用：変更のあった壁を色分けし、撤去した壁を半透明で表示する
    const highlightMats = new Map();
    const highlightMat = (color) => {
      if (!highlightMats.has(color)) {
        highlightMats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.7, emissive: color, emissiveIntensity: 0.25 }));
      }
      return highlightMats.get(color);
    };
    const highlight = opts.highlightWalls ?? new Map();

    const walls = new THREE.Group();
    walls.name = 'Walls';
    const fixtures = new THREE.Group();
    fixtures.name = 'Openings';

    for (const wall of project.walls) {
      const { length: L, segments, openings } = wallSegments(wall, project.openings, s, project.wallHeight);
      if (L < 1e-6) continue;
      const a = P(wall.a);
      const dir = P(wall.b).sub(a).normalize();
      const angle = -Math.atan2(dir.z, dir.x);
      const t = wall.thickness;
      const at = (dist, y) => a.clone().addScaledVector(dir, dist).setY(y);

      for (const seg of segments) {
        // 壁端の区間は厚み/2 延長して隣の壁との角を埋める
        const s0 = seg.s0 === 0 ? -t / 2 : seg.s0;
        const s1 = seg.s1 >= L - 1e-9 ? L + t / 2 : seg.s1;
        const h = seg.top - seg.bottom;
        if (h <= 1e-6 || s1 - s0 <= 1e-6) continue;
        const mat = highlight.has(wall.id) ? highlightMat(highlight.get(wall.id)) : wallMat;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(s1 - s0, h, t), [
          mat, mat, capMat, mat, mat, mat,
        ]);
        mesh.position.copy(at((s0 + s1) / 2, (seg.top + seg.bottom) / 2));
        mesh.rotation.y = angle;
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.name = `Wall_${wall.id}`;
        walls.add(mesh);
      }

      for (const o of openings) {
        const w = o.s1 - o.s0;
        const h = o.top - o.bottom;
        if (w <= 0 || h <= 0) continue;
        const g = new THREE.Group();
        g.name = `${o.type === 'door' ? 'Door' : 'Window'}_${o.id}`;
        g.position.copy(at(o.s0, o.bottom));
        g.rotation.y = angle;
        if (o.type === 'door') {
          // 吊元を軸に 60° 開いたドア
          const leafT = 0.04;
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.01, leafT), doorMat);
          leaf.position.set(w / 2, (h - 0.01) / 2, 0);
          const hinge = new THREE.Group();
          hinge.position.set(0, 0, t / 2 - leafT / 2);
          hinge.rotation.y = -Math.PI / 3;
          hinge.add(leaf);
          leaf.castShadow = true;
          const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), frameMat);
          knob.position.set(w / 2 - 0.08, 1.0 - (h - 0.01) / 2, leafT / 2 + 0.02);
          leaf.add(knob);
          g.add(hinge);
        } else {
          const f = 0.04;
          const frame = (fw, fh, x, y) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, t * 0.6), frameMat);
            m.position.set(x, y, 0);
            g.add(m);
          };
          frame(w, f, w / 2, f / 2);
          frame(w, f, w / 2, h - f / 2);
          frame(f, h, f / 2, h / 2);
          frame(f, h, w - f / 2, h / 2);
          frame(f, h, w / 2, h / 2);
          const glass = new THREE.Mesh(new THREE.BoxGeometry(w - 2 * f, h - 2 * f, 0.01), glassMat);
          glass.position.set(w / 2, h / 2, 0);
          g.add(glass);
        }
        fixtures.add(g);
      }
    }

    if (opts.ghostWalls?.length) {
      const ghostMat = new THREE.MeshStandardMaterial({
        color: opts.ghostColor ?? 0xe11d48, transparent: true, opacity: 0.28, depthWrite: false,
      });
      for (const wall of opts.ghostWalls) {
        const a = P(wall.a);
        const v = P(wall.b).sub(a);
        const L = v.length();
        if (L < 1e-6) continue;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(L + wall.thickness, project.wallHeight, wall.thickness), ghostMat);
        mesh.position.copy(a.addScaledVector(v, 0.5).setY(project.wallHeight / 2));
        mesh.rotation.y = -Math.atan2(v.z, v.x);
        mesh.name = `Removed_${wall.id}`;
        fixtures.add(mesh);
      }
    }

    // 床：間取り画像を貼った板 / 部屋ごとの床
    const floors = new THREE.Group();
    floors.name = 'Floors';
    if (project.image && opts.showPlanImage) {
      const tex = this.planTexture(project.image.dataUrl);
      const w = project.image.width * s;
      const d = project.image.height * s;
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(w / 2 - this.offset.x, 0, d / 2 - this.offset.z);
      plane.receiveShadow = true;
      plane.name = 'PlanImage';
      floors.add(plane);
    }
    if (opts.showRooms) {
      for (const room of project.rooms) {
        // Shape は XY 平面。x→X, y→-Z として作り、X 軸回りに -90° 回転で XZ 平面へ
        const shape = new THREE.Shape(room.points.map((p) => {
          const v = P(p);
          return new THREE.Vector2(v.x, -v.z);
        }));
        const mesh = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshStandardMaterial({
            color: room.color, roughness: 0.8, side: THREE.DoubleSide,
            transparent: !!(project.image && opts.showPlanImage), opacity: project.image && opts.showPlanImage ? 0.75 : 1,
          }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.005;
        mesh.receiveShadow = true;
        mesh.name = `Room_${room.name || room.id}`;
        floors.add(mesh);
      }
    }

    this.model.add(floors, walls, fixtures);

    // 影の範囲をモデルに合わせる
    const size = Math.max((b.maxX - b.minX) * s, (b.maxY - b.minY) * s, 4);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -size;
    cam.right = cam.top = size;
    cam.far = size * 6;
    cam.updateProjectionMatrix();
    this.sun.position.set(size * 0.6, size * 1.5, size * 0.9);
    this.modelSize = size;

    if (!this.hasFitted && (project.walls.length || project.image)) {
      this.fitView();
      this.hasFitted = true;
    }
  }

  planTexture(dataUrl) {
    let tex = this.textureCache.get(dataUrl);
    if (!tex) {
      for (const t of this.textureCache.values()) t.dispose();
      this.textureCache.clear();
      tex = new THREE.TextureLoader().load(dataUrl);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.textureCache.set(dataUrl, tex);
    }
    return tex;
  }

  fitView() {
    if (this.walkMode) this.setWalkMode(false);
    const size = this.modelSize || 10;
    this.orbit.target.set(0, 0, 0);
    this.camera.position.set(size * 0.45, size * 0.95, size * 0.85);
    this.orbit.update();
  }

  setWalkMode(on) {
    if (on === this.walkMode) return;
    this.walkMode = on;
    this.keys.clear();
    if (on) {
      this.camera.position.set(this.orbit.target.x, EYE_HEIGHT, this.orbit.target.z);
      this.camera.rotation.set(0, 0, 0);
      this.orbit.enabled = false;
      try {
        this.walk.lock();
      } catch {
        // ポインタロック非対応環境でもカメラ位置は歩行視点にする
      }
    } else {
      if (this.walk.isLocked) this.walk.unlock();
      this.orbit.enabled = true;
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      this.orbit.target.copy(this.camera.position).addScaledVector(dir, 2).setY(0);
      this.camera.position.y = Math.max(this.camera.position.y, 3);
    }
    this.onWalkModeChange?.(on);
  }

  screenshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  exportGLB() {
    return new Promise((resolve, reject) => {
      new GLTFExporter().parse(this.model, resolve, reject, { binary: true });
    });
  }
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      // テクスチャはキャッシュで管理するのでマテリアルのみ破棄
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    }
  });
}
