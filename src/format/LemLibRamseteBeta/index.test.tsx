import { getAppStores } from "@core/MainApp";
import { Control, EndControl, Segment } from "@core/Path";
import { LemLibFormatV0_4 } from "../LemLibFormatV0_4";
import { getAllCustomFormats } from "../Format";
import { LemLibRamseteBeta } from ".";
import { PathConfigImpl } from "../LemLibFormatV0_4/PathConfig";
import { action } from "mobx";
import { TextEncoder as NodeTextEncoder } from "util";

beforeAll(() => {
  (globalThis as any).TextEncoder = NodeTextEncoder;
});

const setAppPath = action((format: LemLibRamseteBeta | LemLibFormatV0_4, segment: Segment) => {
  const { app } = getAppStores();
  const path = format.createPath(segment);
  const pc = path.pc as PathConfigImpl;
  pc.speedLimit.from = 0;
  pc.speedLimit.to = 127;
  pc.maxDecelerationRate = 127;

  app.format = format;
  app.paths = [path];

  return path;
});

function decodeExport(format: LemLibRamseteBeta | LemLibFormatV0_4) {
  const output = format.exportFile();
  return Buffer.from(output.buffer, output.byteOffset, output.byteLength).toString("utf8");
}

function parseRamseteRows(fileContent: string) {
  return fileContent
    .split("\n")
    .filter(line => line !== "" && !line.startsWith("#") && line !== "endData")
    .map(line => {
      const [time_s, x_in, y_in, theta_rad, v_ips, omega_radps] = line.split(",").map(token => Number(token.trim()));
      return { time_s, x_in, y_in, theta_rad, v_ips, omega_radps };
    });
}

test("custom format registry includes LemLib Ramsete Beta", () => {
  expect(getAllCustomFormats().map(format => format.getName())).toContain("LemLib Ramsete Beta");
});

test("straight Ramsete export uses fixed time steps and stops", () => {
  const format = new LemLibRamseteBeta();
  const gc = format.getGeneralConfig() as any;
  gc.pointDensity = 1;
  gc.ramseteDt = 0.02;
  gc.ramseteMaxVelocity = 60;
  gc.ramseteMaxAcceleration = 120;
  setAppPath(format, new Segment(new EndControl(0, 0, 0), new EndControl(24, 0, 0)));

  const fileContent = decodeExport(format);
  const rows = parseRamseteRows(fileContent);

  expect(fileContent).toContain("# RAMSETE v1\n");
  expect(fileContent).toContain("# time_s, x_in, y_in, theta_rad, v_ips, omega_radps\n");
  expect(fileContent).toContain("endData\n#PATH.JERRYIO-DATA ");
  expect(rows[0].time_s).toBeCloseTo(0);
  expect(rows[1].time_s - rows[0].time_s).toBeCloseTo(0.02);
  expect(rows[0].v_ips).toBeCloseTo(0);
  expect(rows[rows.length - 1].v_ips).toBeCloseTo(0);
  expect(Math.max(...rows.map(row => row.v_ips))).toBeGreaterThan(0);
  rows.forEach(row => {
    expect(row.theta_rad).toBeCloseTo(0);
    expect(row.omega_radps).toBeCloseTo(0);
  });
});

test("curved Ramsete export has finite changing heading and omega", () => {
  const format = new LemLibRamseteBeta();
  const gc = format.getGeneralConfig() as any;
  gc.pointDensity = 1;
  gc.ramseteDt = 0.02;
  gc.ramseteMaxVelocity = 60;
  gc.ramseteMaxAcceleration = 120;
  setAppPath(
    format,
    new Segment(new EndControl(0, 0, 0), new Control(12, 0), new Control(24, 12), new EndControl(24, 24, 0))
  );

  const rows = parseRamseteRows(decodeExport(format));
  const thetaRange = Math.max(...rows.map(row => row.theta_rad)) - Math.min(...rows.map(row => row.theta_rad));

  expect(thetaRange).toBeGreaterThan(0.1);
  expect(rows.some(row => Math.abs(row.omega_radps) > 0.01)).toBe(true);
  rows.forEach(row => {
    expect(Number.isFinite(row.theta_rad)).toBe(true);
    expect(Number.isFinite(row.omega_radps)).toBe(true);
  });
});

test("LemLib v0.5 Pure Pursuit export remains a three-column path file", () => {
  const format = new LemLibFormatV0_4();
  setAppPath(format, new Segment(new EndControl(0, 0, 0), new EndControl(4, 0, 0)));

  const fileContent = decodeExport(format);
  const firstPathPoint = fileContent
    .split("\n")
    .find(line => line !== "" && !line.startsWith("#") && line !== "endData")!;

  expect(fileContent).not.toContain("# RAMSETE v1");
  expect(firstPathPoint.split(",").length).toBe(3);
  expect(fileContent).toContain("endData\n");
});
