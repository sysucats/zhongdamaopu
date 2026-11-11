const { createScopedThreejs } = require('./vendor/threejs-miniprogram');

function smoothNormals(THREE, geometry) {
  const p = geometry.attributes.position, normals = new Float32Array(p.count * 3), shared = new Map(), faces = [];
  const key = i => `${Math.round(p.getX(i) * 1e6)},${Math.round(p.getY(i) * 1e6)},${Math.round(p.getZ(i) * 1e6)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const n = c.sub(b).cross(a.sub(b)).normalize(); faces.push(n.clone());
    for (let j = 0; j < 3; j++) { const k = key(i + j); if (!shared.has(k)) shared.set(k, []); shared.get(k).push(n.clone()); }
  }
  for (let i = 0; i < p.count; i++) {
    a.set(0, 0, 0); const face = faces[Math.floor(i / 3)];
    for (const n of shared.get(key(i))) if (face.dot(n) > .5) a.add(n);
    a.normalize(); normals.set([a.x, a.y, a.z], i * 3);
  }
  geometry.addAttribute('normal', new THREE.BufferAttribute(normals, 3));
}

// Owns the WebGL context, textures and animation. Idle badges do not redraw.
class BadgeRenderer {
  constructor(canvas, width, height, onFailure) {
    this.canvas = canvas; this.onFailure = onFailure; this.textures = [];
    const T = this.THREE = createScopedThreejs(canvas);
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(wx.getWindowInfo().pixelRatio);
    this.renderer.setSize(width, height, false); this.renderer.setClearColor(0xffffff, 0);
    this.renderer.gammaOutput = true; this.renderer.gammaFactor = 2.2;
    this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1;
    this.scene = new T.Scene();
    // Matches the 2D image's 1 / 1.08 scale, with room for the rounded metal edge.
    const frame = 1.08, aspect = width / height;
    this.camera = new T.OrthographicCamera(-frame * aspect, frame * aspect, frame, -frame, 1, 10);
    this.camera.position.z = 3.3;

    this.scene.add(new T.HemisphereLight(0xffffff, 0xe0d4b7, .9));
    const light = new T.DirectionalLight(0xfff7e8, 1.2); light.position.set(-3, 5, 5); this.scene.add(light);
    const rim = new T.DirectionalLight(0xcbdfff, .8); rim.position.set(3, 1, -4); this.scene.add(rim);
    this.group = new T.Group(); this.scene.add(this.group); this.rotation = this.target = 0; this.rotationMode = 'snap';
    this.contextLost = () => onFailure(new Error('WebGL context lost'));
    canvas.addEventListener('webglcontextlost', this.contextLost);
  }

  own(texture) {
    if (this.disposed) { texture.dispose(); throw new Error('Badge closed'); }
    this.textures.push(texture); return texture;
  }

  loadTexture(url) {
    return new Promise((resolve, reject) => new this.THREE.TextureLoader().load(url, texture => {
      try { resolve(this.own(texture)); } catch (error) { reject(error); }
    }, undefined, reject));
  }

  loadEnvironment(base) {
    return new Promise((resolve, reject) => new this.THREE.CubeTextureLoader().load(
      ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map(n => `${base}/env-${n}.png`), texture => {
        try { texture.encoding = this.THREE.sRGBEncoding; resolve(this.own(texture)); } catch (error) { reject(error); }
      }, undefined, reject
    ));
  }

  build(model, front, back, bump, roughness, environment, thicknessMm = .6) {
    const T = this.THREE, longest = Math.max(model.width, model.height), depth = .6 / 30;
    const points = contour => contour.map(([x, y]) => new T.Vector2((x - model.width / 2) / longest * 2, (model.height / 2 - y) / longest * 2));
    const shape = new T.Shape(points(model.contours[0]));
    model.contours.slice(1).forEach(contour => shape.holes.push(new T.Path(points(contour))));
    const bevel = Math.min(depth * .2, .006), coreDepth = depth - bevel * 2;
    const geometry = new T.ExtrudeBufferGeometry(shape, { depth: coreDepth, steps: 1, bevelEnabled: true, bevelSize: Math.min(.004, depth * .15), bevelThickness: bevel, bevelSegments: 4 });
    smoothNormals(T, geometry); geometry.translate(0, 0, -coreDepth / 2);
    const sides = geometry.groups.find(part => part.materialIndex === 1); geometry.setDrawRange(sides.start, sides.count);
    const color = model.edgeColor || [223, 189, 114];
    this.edge = new T.Mesh(geometry, new T.MeshStandardMaterial({ color: new T.Color(color[0] / 255, color[1] / 255, color[2] / 255), metalness: .85, roughness: .28, envMap: environment, envMapIntensity: 1.35 }));
    this.group.add(this.edge);
    this.faces = [];
    for (const isBack of [false, true]) {
      const face = new T.ShapeBufferGeometry(shape), p = face.attributes.position, uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { uv[i * 2] = .5 + (isBack ? -1 : 1) * p.getX(i) * longest / model.width / 2; uv[i * 2 + 1] = .5 + p.getY(i) * longest / model.height / 2; }
      face.addAttribute('uv', new T.BufferAttribute(uv, 2));
      const material = isBack ? new T.MeshStandardMaterial({ map: back, metalness: .65, roughness: .68, bumpMap: bump, bumpScale: .0015, roughnessMap: roughness, side: T.BackSide, envMap: environment, envMapIntensity: 1.35 }) : new T.ShaderMaterial({
        uniforms: { sourceMap: { value: front } },
        vertexShader: 'varying vec2 sourceUv; void main() { sourceUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D sourceMap; varying vec2 sourceUv; void main() { gl_FragColor = texture2D(sourceMap, sourceUv); }',
        transparent: true, toneMapped: false,
      });
      const mesh = new T.Mesh(face, material); this.faces.push(mesh); this.group.add(mesh);
    }
    this.setThickness(thicknessMm);
    if (this.renderer.getContext().getError()) throw new Error('Badge rendering failed');
    if (this.renderer.info.programs.some(program => program.diagnostics && !program.diagnostics.runnable)) throw new Error('Badge shader failed');
  }

  setThickness(thicknessMm = .6) {
    if (this.disposed || !this.edge) return;
    const depth = thicknessMm / 30;
    this.edge.visible = depth > 0;
    this.edge.scale.z = thicknessMm / .6;
    this.faces[0].position.z = depth / 2;
    this.faces[1].position.z = -depth / 2;
    this.renderer.render(this.scene, this.camera);
  }

  setRotationMode(mode) {
    const next = ['auto', 'snap', 'intro'].includes(mode) ? mode : 'snap';
    if (next === this.rotationMode) return;
    this.intro = null; this.introReturning = false; this.touch = null;
    this.rotationMode = next;
    this.target = next === 'snap' ? Math.round(this.rotation / Math.PI) * Math.PI : this.rotation;
    if (next === 'intro') this.intro = { from: this.rotation, elapsed: 0 };
    this.wake();
  }

  stopIntro() {
    if (!this.intro && !this.introReturning) return;
    this.intro = null; this.introReturning = false; this.rotationMode = 'snap';
    this.onIntroComplete?.();
  }

  dragStart(x, y) { this.stopIntro(); this.target = this.rotation; this.touch = { x, y, distance: 0 }; }
  dragMove(x, y) {
    if (!this.touch) return;
    const dx = x - this.touch.x, dy = y - this.touch.y;
    this.target += dx * .012; this.touch.distance += Math.hypot(dx, dy); this.touch.x = x; this.touch.y = y; this.wake();
  }
  dragEnd(cancelled = false) {
    if (!this.touch) return;
    if (!cancelled && this.touch.distance < 6) this.target += Math.PI;
    else {
      this.target = Math.round(this.target / Math.PI) * Math.PI;
    }
    this.touch = null; this.wake();
  }

  resetToFront() {
    if (this.resetAnimation) return this.resetAnimation.promise;
    this.stopIntro(); this.rotationMode = 'snap'; this.touch = null;
    this.target = Math.round(this.rotation / (2 * Math.PI)) * 2 * Math.PI;
    if (Math.abs(this.rotation - this.target) < .0001) return Promise.resolve();
    let complete;
    const promise = new Promise(resolve => { complete = resolve; });
    this.resetAnimation = { from: this.rotation, started: Date.now(), complete, promise };
    this.wake();
    return promise;
  }

  wake() {
    if (this.disposed || this.paused || this.frame !== undefined) return;
    let previous = Date.now();
    const draw = () => {
      this.frame = undefined;
      try {
        if (this.renderer.getContext().isContextLost()) throw new Error('WebGL context lost');
        const now = Date.now(), dt = Math.min((now - previous) / 1000, .1); previous = now;
        if (this.resetAnimation) {
          const progress = Math.min(1, (now - this.resetAnimation.started) / 180);
          this.rotation = this.resetAnimation.from + (this.target - this.resetAnimation.from) * (1 - (1 - progress) ** 3);
          if (progress === 1) { this.resetAnimation.complete(); this.resetAnimation = null; }
        } else if (this.intro) {
          this.intro.elapsed += dt;
          const progress = Math.min(1, this.intro.elapsed / 2.2);
          const eased = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
          this.rotation = this.target = this.intro.from + Math.PI * 2 * eased;
          if (progress === 1) {
            this.intro = null; this.introReturning = true; this.rotationMode = 'snap';
            this.target = Math.round(this.rotation / (Math.PI * 2)) * Math.PI * 2;
          }
        } else if (this.rotationMode === 'auto' && !this.touch && this.rotation === this.target) {
          this.rotation += dt * Math.PI / 3; this.target = this.rotation;
        } else this.rotation += (this.target - this.rotation) * (1 - Math.exp(-dt * 12));
        if (Math.abs(this.target - this.rotation) < .0001) this.rotation = this.target;
        this.group.rotation.set(0, this.rotation, 0); this.renderer.render(this.scene, this.camera);
        if (this.introReturning && this.rotation === this.target) {
          this.introReturning = false; this.onIntroComplete?.();
        }
        if (this.touch || this.rotation !== this.target || this.rotationMode === 'auto' || this.intro) this.frame = this.canvas.requestAnimationFrame(draw);
      } catch (error) { this.onFailure(error); }
    };
    this.frame = this.canvas.requestAnimationFrame(draw);
  }
  pause() { this.paused = true; if (this.frame !== undefined) this.canvas.cancelAnimationFrame(this.frame); this.frame = undefined; this.touch = null; }
  resume() { this.paused = false; this.wake(); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.pause();
    this.resetAnimation?.complete(); this.resetAnimation = null;
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.group.children.forEach(mesh => { mesh.geometry.dispose(); mesh.material.dispose(); });
    this.textures.forEach(texture => texture.dispose()); this.renderer.dispose();
  }
}

module.exports = BadgeRenderer;
