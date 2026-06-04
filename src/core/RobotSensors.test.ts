import { EndControl } from "./Path";
import { UnitOfLength } from "./Unit";
import { MainApp } from "./MainApp";
import { createDefaultRobotSensorOffsets, getRobotSensorReadings } from "./RobotSensors";

function createTestApp() {
  return {
    fieldImageAsset: {
      displayName: "Custom Test Field",
      heightInMM: 2540
    },
    fieldDimension: {
      width: 1000,
      height: 1000
    },
    gc: {
      uol: UnitOfLength.Inch,
      sensorOffsets: createDefaultRobotSensorOffsets()
    }
  } as unknown as MainApp;
}

function createV5TestApp() {
  const app = createTestApp() as any;
  app.fieldImageAsset.displayName = "V5RC 2027 - Override";
  app.fieldImageAsset.heightInMM = 3690;
  app.fieldDimension = {
    width: 2000,
    height: 2000
  };
  return app;
}

test("robot sensors stop at the field bounds", () => {
  const app = createTestApp();
  const readings = getRobotSensorReadings(app, new EndControl(0, 0, 0));

  expect(readings.front.length).toBeCloseTo(50);
  expect(readings.front.end.y).toBeCloseTo(50);
  expect(readings.right.length).toBeCloseTo(50);
  expect(readings.right.end.x).toBeCloseTo(50);
  expect(readings.back.length).toBeCloseTo(50);
  expect(readings.back.end.y).toBeCloseTo(-50);
  expect(readings.left.length).toBeCloseTo(50);
  expect(readings.left.end.x).toBeCloseTo(-50);
});

test("robot sensor offsets are local to each sensor side", () => {
  const app = createTestApp();
  app.gc.sensorOffsets.front.y = 10;
  app.gc.sensorOffsets.left.y = 10;

  const readings = getRobotSensorReadings(app, new EndControl(0, 0, 0));

  expect(readings.front.start.y).toBeCloseTo(10);
  expect(readings.front.length).toBeCloseTo(40);
  expect(readings.left.start.x).toBeCloseTo(-10);
  expect(readings.left.length).toBeCloseTo(40);
});

test("vrc sensor bounds use the 144 inch play field", () => {
  const app = createV5TestApp();
  const readings = getRobotSensorReadings(app, new EndControl(0, 0, 0));

  expect(readings.front.length).toBeCloseTo(72);
  expect(readings.right.length).toBeCloseTo(72);
  expect(readings.back.length).toBeCloseTo(72);
  expect(readings.left.length).toBeCloseTo(72);
});
