import type { MainApp } from "./MainApp";
import { makeAutoObservable, observable } from "mobx";
import { Path, Point } from "./Path";
import { generateRamseteTrajectory, unwrapAngle } from "./RamseteTrajectory";
import { UnitConverter, UnitOfLength } from "./Unit";

export type SimulationMode = "ramsete" | "visual";
export type SimulationStatus = "idle" | "running" | "finished";
export type SimulationScope = "selected" | "entire";

export interface SimulationSample {
  time: number;
  path: Path;
  x: number;
  y: number;
  headingDeg: number;
  xIn: number;
  yIn: number;
  thetaRad: number;
  vIps: number;
  omegaRadps: number;
  radiusIn: number | undefined;
}

export interface SimulationPathRun {
  path: Path;
  startTime: number;
  duration: number;
  samples: SimulationSample[];
}

export interface SimulationRoute {
  requestedMode: SimulationMode;
  mode: SimulationMode;
  runs: SimulationPathRun[];
  totalTime: number;
  samples: SimulationSample[];
}

interface RamseteCapableConfig {
  ramseteDt: number;
  ramseteMaxVelocity: number;
  ramseteMaxAcceleration: number;
}

const VISUAL_PATH_DURATION_SECONDS = 4;
const STRAIGHT_OMEGA_EPSILON = 1e-6;

export class SimulationController {
  mode: SimulationMode = "ramsete";
  status: SimulationStatus = "idle";
  activeScope: SimulationScope | undefined = undefined;
  route: SimulationRoute | undefined = undefined;
  current: SimulationSample | undefined = undefined;

  private startTimeMs: number = 0;
  private animationFrameId: number | undefined = undefined;

  constructor(private readonly app: MainApp) {
    makeAutoObservable(
      this,
      {
        app: false,
        route: observable.ref,
        current: observable.ref,
        animationFrameId: false
      },
      { autoBind: true }
    );
  }

  get isRunning() {
    return this.status === "running";
  }

  get selectedPath() {
    return this.app.interestedPath();
  }

  get currentPath() {
    return this.current?.path;
  }

  runSelectedPath() {
    const route = createSelectedSimulationRoute(this.app, this.mode);
    this.start(route, "selected");
  }

  runEntireRoute() {
    const route = createEntireSimulationRoute(this.app, this.mode);
    this.start(route, "entire");
  }

  stop() {
    this.cancelAnimationFrame();
    this.status = "idle";
    this.activeScope = undefined;
    this.route = undefined;
    this.current = undefined;
    this.startTimeMs = 0;
  }

  tick(nowMs: number = getNowMs()) {
    if (this.route === undefined || this.status !== "running") return;

    const elapsed = (nowMs - this.startTimeMs) / 1000;

    if (elapsed >= this.route.totalTime) {
      this.current = sampleSimulationRoute(this.route, this.route.totalTime);
      this.status = "finished";
      this.cancelAnimationFrame();
      return;
    }

    this.current = sampleSimulationRoute(this.route, elapsed);
    this.requestAnimationFrame();
  }

  private start(route: SimulationRoute | undefined, scope: SimulationScope) {
    if (route === undefined) return;

    this.cancelAnimationFrame();
    this.route = route;
    this.activeScope = scope;
    this.status = "running";
    this.current = route.samples[0];
    this.startTimeMs = getNowMs();
    this.requestAnimationFrame();
  }

  private requestAnimationFrame() {
    if (typeof window === "undefined") return;

    this.cancelAnimationFrame();
    this.animationFrameId = window.requestAnimationFrame(this.tick);
  }

  private cancelAnimationFrame() {
    if (this.animationFrameId === undefined || typeof window === "undefined") return;

    window.cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = undefined;
  }
}

function getNowMs() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function isRamseteCapableConfig(config: unknown): config is RamseteCapableConfig {
  const candidate = config as Partial<RamseteCapableConfig>;

  return (
    typeof candidate.ramseteDt === "number" &&
    typeof candidate.ramseteMaxVelocity === "number" &&
    typeof candidate.ramseteMaxAcceleration === "number"
  );
}

export function canUseRamseteSimulation(app: MainApp) {
  return isRamseteCapableConfig(app.gc);
}

export function getEffectiveSimulationMode(app: MainApp, requestedMode: SimulationMode): SimulationMode {
  return requestedMode === "ramsete" && canUseRamseteSimulation(app) ? "ramsete" : "visual";
}

export function calculateSimulationRadius(vIps: number, omegaRadps: number): number | undefined {
  return Math.abs(omegaRadps) <= STRAIGHT_OMEGA_EPSILON ? undefined : Math.abs(vIps / omegaRadps);
}

export function getEntireRouteSimulationPaths(app: MainApp) {
  return app.paths.filter(path => path.visible && !path.lock && path.segments.length > 0);
}

export function createSelectedSimulationRoute(
  app: MainApp,
  requestedMode: SimulationMode
): SimulationRoute | undefined {
  const path = app.interestedPath();
  if (path === undefined || path.segments.length === 0) return undefined;

  return createSimulationRoute(app, [path], requestedMode);
}

export function createEntireSimulationRoute(app: MainApp, requestedMode: SimulationMode): SimulationRoute | undefined {
  return createSimulationRoute(app, getEntireRouteSimulationPaths(app), requestedMode);
}

export function createSimulationRoute(
  app: MainApp,
  paths: Path[],
  requestedMode: SimulationMode
): SimulationRoute | undefined {
  const mode = getEffectiveSimulationMode(app, requestedMode);
  const runs: SimulationPathRun[] = [];
  let startTime = 0;

  for (const path of paths.filter(path => path.segments.length > 0)) {
    const localSamples = mode === "ramsete" ? createRamseteSamples(app, path) : createVisualSamples(app, path);
    if (localSamples.length === 0) continue;

    const samples = localSamples.map(sample => ({ ...sample, time: sample.time + startTime }));
    const duration = samples[samples.length - 1].time - startTime;

    runs.push({ path, startTime, duration, samples });
    startTime += duration;
  }

  const samples = runs.flatMap(run => run.samples);
  if (samples.length === 0) return undefined;

  return {
    requestedMode,
    mode,
    runs,
    totalTime: samples[samples.length - 1].time,
    samples
  };
}

export function sampleSimulationRoute(route: SimulationRoute, time: number): SimulationSample {
  const clampedTime = Math.max(0, Math.min(time, route.totalTime));
  const samples = route.samples;

  if (clampedTime <= samples[0].time) return samples[0];
  if (clampedTime >= samples[samples.length - 1].time) return samples[samples.length - 1];

  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1];
    const current = samples[i];

    if (clampedTime <= current.time) {
      const dt = current.time - previous.time;
      const ratio = dt <= 0 ? 1 : (clampedTime - previous.time) / dt;
      const thetaRad =
        previous.thetaRad + (unwrapAngle(previous.thetaRad, current.thetaRad) - previous.thetaRad) * ratio;
      const vIps = previous.vIps + (current.vIps - previous.vIps) * ratio;
      const omegaRadps = previous.omegaRadps + (current.omegaRadps - previous.omegaRadps) * ratio;

      return {
        time: clampedTime,
        path: current.path,
        x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio,
        headingDeg: (thetaRad * 180) / Math.PI,
        xIn: previous.xIn + (current.xIn - previous.xIn) * ratio,
        yIn: previous.yIn + (current.yIn - previous.yIn) * ratio,
        thetaRad,
        vIps,
        omegaRadps,
        radiusIn: calculateSimulationRadius(vIps, omegaRadps)
      };
    }
  }

  return samples[samples.length - 1];
}

function createRamseteSamples(app: MainApp, path: Path): SimulationSample[] {
  const gc = app.gc;
  if (!isRamseteCapableConfig(gc)) return [];

  const uolToIn = new UnitConverter(gc.uol, UnitOfLength.Inch);
  const inToUol = new UnitConverter(UnitOfLength.Inch, gc.uol);
  const points = app.format.getPathPoints(path).points.map((point: Point) => ({
    xIn: uolToIn.fromAtoB(point.x),
    yIn: uolToIn.fromAtoB(point.y),
    speed: point.speed
  }));
  const rows = generateRamseteTrajectory(points, {
    dt: gc.ramseteDt,
    maxVelocity: gc.ramseteMaxVelocity,
    maxAcceleration: gc.ramseteMaxAcceleration
  });

  return rows.map(row => ({
    time: row.time_s,
    path,
    x: inToUol.fromAtoB(row.x_in),
    y: inToUol.fromAtoB(row.y_in),
    headingDeg: (row.theta_rad * 180) / Math.PI,
    xIn: row.x_in,
    yIn: row.y_in,
    thetaRad: row.theta_rad,
    vIps: row.v_ips,
    omegaRadps: row.omega_radps,
    radiusIn: calculateSimulationRadius(row.v_ips, row.omega_radps)
  }));
}

function createVisualSamples(app: MainApp, path: Path): SimulationSample[] {
  const uolToIn = new UnitConverter(app.gc.uol, UnitOfLength.Inch);
  const points = path.cachedResult.points;
  if (points.length < 2) return [];

  const distances: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    distances.push(distances[i - 1] + points[i].distance(points[i - 1]));
  }

  const totalDistance = distances[distances.length - 1];
  if (totalDistance <= 0) return [];

  const samples = points.map((point, index) => {
    const thetaRad = getPointHeading(points, index);
    const time = (distances[index] / totalDistance) * VISUAL_PATH_DURATION_SECONDS;

    return {
      time,
      path,
      x: point.x,
      y: point.y,
      headingDeg: (thetaRad * 180) / Math.PI,
      xIn: uolToIn.fromAtoB(point.x),
      yIn: uolToIn.fromAtoB(point.y),
      thetaRad,
      vIps: 0,
      omegaRadps: 0,
      radiusIn: undefined
    };
  });

  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1];
    const current = samples[i];
    const dt = current.time - previous.time;

    if (dt <= 0) continue;

    current.vIps = Math.hypot(current.xIn - previous.xIn, current.yIn - previous.yIn) / dt;
    current.omegaRadps = (unwrapAngle(previous.thetaRad, current.thetaRad) - previous.thetaRad) / dt;
    current.radiusIn = calculateSimulationRadius(current.vIps, current.omegaRadps);
  }

  const last = samples[samples.length - 1];
  last.vIps = 0;
  last.omegaRadps = 0;
  last.radiusIn = undefined;

  return samples;
}

function getPointHeading(points: Point[], index: number) {
  const point = points[index];
  const next = points[index + 1];
  const previous = points[index - 1];

  if (next !== undefined && point.distance(next) > 0) return Math.atan2(next.y - point.y, next.x - point.x);
  if (previous !== undefined && previous.distance(point) > 0)
    return Math.atan2(point.y - previous.y, point.x - previous.x);

  return 0;
}
