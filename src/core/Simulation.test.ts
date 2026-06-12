import { action } from "mobx";
import { getAppStores } from "./MainApp";
import { Control, EndControl, Segment } from "./Path";
import {
  createEntireSimulationRoute,
  createSelectedSimulationRoute,
  createSimulationRoute,
  sampleSimulationRoute
} from "./Simulation";
import { LemLibFormatV0_4 } from "@format/LemLibFormatV0_4";
import { PathConfigImpl } from "@format/LemLibFormatV0_4/PathConfig";
import { LemLibRamseteBeta } from "@format/LemLibRamseteBeta";

beforeEach(
  action(() => {
    const { app } = getAppStores();
    app.resetUserControl();
    app.paths = [];
  })
);

function addPath(format: LemLibFormatV0_4 | LemLibRamseteBeta, name: string, segment: Segment) {
  return action(() => {
    const { app } = getAppStores();
    const path = format.createPath(segment);
    const pc = path.pc as PathConfigImpl;
    pc.speedLimit.from = 0;
    pc.speedLimit.to = 127;
    pc.maxDecelerationRate = 127;
    path.name = name;
    app.paths.push(path);

    return path;
  })();
}

function setFormat(format: LemLibFormatV0_4 | LemLibRamseteBeta) {
  action(() => {
    const { app } = getAppStores();
    app.format = format;
  })();
}

test("selected simulation route uses the existing interested path", () => {
  const { app } = getAppStores();
  const format = new LemLibFormatV0_4();
  setFormat(format);
  const first = addPath(format, "First", new Segment(new EndControl(0, 0, 0), new EndControl(24, 0, 0)));
  const second = addPath(format, "Second", new Segment(new EndControl(0, 10, 0), new EndControl(24, 10, 0)));

  app.setSelected([second]);

  const route = createSelectedSimulationRoute(app, "visual")!;

  expect(route.runs).toHaveLength(1);
  expect(route.runs[0].path).toBe(second);
  expect(route.runs[0].path).not.toBe(first);
});

test("entire simulation route skips hidden and locked paths in tree order", () => {
  const { app } = getAppStores();
  const format = new LemLibFormatV0_4();
  setFormat(format);
  const first = addPath(format, "First", new Segment(new EndControl(0, 0, 0), new EndControl(24, 0, 0)));
  const hidden = addPath(format, "Hidden", new Segment(new EndControl(0, 8, 0), new EndControl(24, 8, 0)));
  const locked = addPath(format, "Locked", new Segment(new EndControl(0, 16, 0), new EndControl(24, 16, 0)));
  const last = addPath(format, "Last", new Segment(new EndControl(0, 24, 0), new EndControl(24, 24, 0)));

  action(() => {
    hidden.visible = false;
    locked.lock = true;
  })();

  const route = createEntireSimulationRoute(app, "visual")!;

  expect(route.runs.map(run => run.path)).toEqual([first, last]);
});

test("Ramsete simulation route produces finite pose and metrics", () => {
  const { app } = getAppStores();
  const format = new LemLibRamseteBeta();
  const gc = format.getGeneralConfig() as any;
  gc.pointDensity = 1;
  gc.ramseteDt = 0.02;
  gc.ramseteWheelRpm = 360;
  gc.ramseteWheelDiameterIn = 3.25;
  gc.ramseteMaxAcceleration = 120;
  setFormat(format);
  const path = addPath(
    format,
    "Curve",
    new Segment(new EndControl(0, 0, 0), new Control(12, 0), new Control(24, 12), new EndControl(24, 24, 0))
  );

  const route = createSimulationRoute(app, [path], "ramsete")!;
  const sample = sampleSimulationRoute(route, route.totalTime / 2);

  expect(route.mode).toBe("ramsete");
  expect(route.totalTime).toBeGreaterThan(0);
  expect(Number.isFinite(sample.x)).toBe(true);
  expect(Number.isFinite(sample.y)).toBe(true);
  expect(Number.isFinite(sample.thetaRad)).toBe(true);
  expect(Number.isFinite(sample.vIps)).toBe(true);
  expect(Number.isFinite(sample.omegaRadps)).toBe(true);
  expect(route.samples.some(row => row.radiusIn !== undefined && Number.isFinite(row.radiusIn))).toBe(true);
});

test("Ramsete simulation follows reversed path heading and velocity", () => {
  const { app } = getAppStores();
  const format = new LemLibRamseteBeta();
  const gc = format.getGeneralConfig() as any;
  gc.pointDensity = 1;
  gc.ramseteDt = 0.02;
  gc.ramseteWheelRpm = 360;
  gc.ramseteWheelDiameterIn = 3.25;
  gc.ramseteMaxAcceleration = 120;
  setFormat(format);
  const path = addPath(format, "Reverse", new Segment(new EndControl(0, 0, 0), new EndControl(24, 0, 0)));
  (path.pc as any).ramseteBackwards = true;

  const route = createSimulationRoute(app, [path], "ramsete")!;
  const movingSample = route.samples.find(sample => sample.vIps < 0)!;

  expect(route.mode).toBe("ramsete");
  expect(movingSample.vIps).toBeLessThan(0);
  expect(movingSample.thetaRad).toBeCloseTo(Math.PI);
});

test("visual simulation route produces straight and curved metrics", () => {
  const { app } = getAppStores();
  const format = new LemLibFormatV0_4();
  setFormat(format);
  const straight = addPath(format, "Straight", new Segment(new EndControl(0, 0, 0), new EndControl(24, 0, 0)));
  const curve = addPath(
    format,
    "Curve",
    new Segment(new EndControl(0, 0, 0), new Control(12, 0), new Control(24, 12), new EndControl(24, 24, 0))
  );

  const straightRoute = createSimulationRoute(app, [straight], "visual")!;
  const curveRoute = createSimulationRoute(app, [curve], "visual")!;

  expect(straightRoute.totalTime).toBeCloseTo(4);
  expect(straightRoute.samples.every(sample => Math.abs(sample.omegaRadps) < 1e-6)).toBe(true);
  expect(curveRoute.samples.some(sample => sample.radiusIn !== undefined && Number.isFinite(sample.radiusIn))).toBe(
    true
  );
});

test("simulation controller runs and finishes selected path playback", () => {
  const { app } = getAppStores();
  const format = new LemLibFormatV0_4();
  setFormat(format);
  const path = addPath(format, "Selected", new Segment(new EndControl(0, 0, 0), new EndControl(24, 0, 0)));

  action(() => {
    app.setSelected([path]);
    app.simulation.mode = "visual";
  })();
  app.simulation.runSelectedPath();

  expect(app.simulation.status).toBe("running");
  expect(app.simulation.currentPath).toBe(path);

  app.simulation.tick(performance.now() + app.simulation.route!.totalTime * 1000 + 100);

  expect(app.simulation.status).toBe("finished");
  expect(app.simulation.currentPath).toBe(path);

  app.simulation.stop();
});
