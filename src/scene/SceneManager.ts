import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { COLORS, TABLE_HALF } from '../config'
import { createTable } from './Grid'

/** Maior passo de tempo aceito num frame — evita salto ao voltar de outra aba. */
const MAX_DELTA = 1 / 20

export class SceneManager {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  readonly controls: OrbitControls
  readonly table: THREE.Group

  private frame = 0
  private lastTime = 0
  private readonly onFrame: Array<(dt: number) => void> = []
  private readonly resizeObserver: ResizeObserver

  constructor(private readonly container: HTMLElement) {
    this.scene.background = new THREE.Color(COLORS.background)
    // A névoa só amacia o fundo distante: a mesa inteira precisa ficar nítida.
    this.scene.fog = new THREE.Fog(COLORS.background, TABLE_HALF * 3.5, TABLE_HALF * 7)

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)
    this.camera.position.set(0, 15, 15)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.style.touchAction = 'none'
    this.renderer.domElement.style.display = 'block'
    container.appendChild(this.renderer.domElement)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.controls.minDistance = 6
    this.controls.maxDistance = 60
    // Não deixa a câmera passar por baixo da mesa: some com as peças e confunde.
    this.controls.maxPolarAngle = Math.PI * 0.48
    this.controls.minPolarAngle = 0.1
    this.controls.target.set(0, 0, 0)
    // Um dedo orbita, dois dedos dão zoom e pan — como pede a especificação.
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }

    this.setupLights()
    this.table = createTable()
    this.scene.add(this.table)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
  }

  private setupLights(): void {
    // Iluminação de brinquedo: céu claro por cima, luz quente principal, e uma
    // luz de preenchimento fraca para as sombras não ficarem duras demais.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xcbd9e6, 1.15))

    const key = new THREE.DirectionalLight(0xfff4e0, 1.5)
    key.position.set(8, 16, 10)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.radius = 3
    key.shadow.bias = -0.0006
    const size = TABLE_HALF * 1.4
    key.shadow.camera.left = -size
    key.shadow.camera.right = size
    key.shadow.camera.top = size
    key.shadow.camera.bottom = -size
    key.shadow.camera.near = 1
    key.shadow.camera.far = 60
    this.scene.add(key)

    const fill = new THREE.DirectionalLight(0xdfeaff, 0.45)
    fill.position.set(-10, 8, -8)
    this.scene.add(fill)
  }

  addFrameListener(listener: (dt: number) => void): void {
    this.onFrame.push(listener)
  }

  start(): void {
    this.lastTime = performance.now()
    const tick = (now: number) => {
      this.frame = requestAnimationFrame(tick)
      const dt = Math.min((now - this.lastTime) / 1000, MAX_DELTA)
      this.lastTime = now
      for (const listener of this.onFrame) listener(dt)
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    }
    this.frame = requestAnimationFrame(tick)
  }

  resize(): void {
    const width = this.container.clientWidth || window.innerWidth
    const height = this.container.clientHeight || window.innerHeight
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  /**
   * Enquadra a mesa inteira, seja qual for o formato da tela.
   *
   * Em vez de deduzir a distância por fórmula — a perspectiva faz a borda
   * PRÓXIMA da mesa crescer muito mais do que a fórmula simples prevê —,
   * afasta a câmera aos poucos e projeta os cantos até todos caberem. É barato
   * (roda só ao abrir e no botão de centralizar) e não tem como errar.
   */
  frameTable(): void {
    const elevation = THREE.MathUtils.degToRad(46)
    const edge = TABLE_HALF * 1.06
    // Cantos da mesa, mais um nível acima para as peças altas não encostarem
    // no topo da tela.
    const corners: THREE.Vector3[] = []
    for (const y of [0, 2.5]) {
      for (const x of [-edge, edge]) {
        for (const z of [-edge, edge]) corners.push(new THREE.Vector3(x, y, z))
      }
    }

    let distance = this.controls.minDistance
    while (distance < this.controls.maxDistance) {
      if (this.cornersFit(corners, distance, elevation)) break
      distance *= 1.05
    }
    distance = Math.min(distance, this.controls.maxDistance)

    this.camera.position.set(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance)
    this.camera.lookAt(0, 0, 0)
    this.controls.target.set(0, 0, 0)

    // Mata a inércia pendente antes de fixar o enquadramento: sem isso, um
    // giro recém-solto continua amortecendo e leva a câmera embora logo depois
    // de centralizar. Um update sem damping zera o resíduo.
    this.controls.enableDamping = false
    this.controls.update()
    this.controls.enableDamping = true
    this.controls.update()
  }

  private cornersFit(corners: THREE.Vector3[], distance: number, elevation: number): boolean {
    this.camera.position.set(0, Math.sin(elevation) * distance, Math.cos(elevation) * distance)
    this.camera.lookAt(0, 0, 0)
    this.camera.updateMatrixWorld(true)
    this.camera.updateProjectionMatrix()

    const probe = new THREE.Vector3()
    return corners.every((corner) => {
      probe.copy(corner).project(this.camera)
      return Math.abs(probe.x) <= 1 && Math.abs(probe.y) <= 1
    })
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
