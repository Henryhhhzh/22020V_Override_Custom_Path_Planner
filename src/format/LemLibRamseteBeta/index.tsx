import { makeAutoObservable } from "mobx";
import { MainApp, getAppStores } from "@core/MainApp";
import { clamp, makeId } from "@core/Util";
import { Path, Point, Segment, SpeedKeyframe } from "@core/Path";
import { UnitOfLength, UnitConverter, Quantity } from "@core/Unit";
import { GeneralConfig, convertFormat } from "../Config";
import { Format, importPDJDataFromTextFile } from "../Format";
import { AddKeyframe } from "@core/Command";
import { PointCalculationResult, getPathPoints } from "@core/Calculation";
import { GeneralConfigImpl } from "./GeneralConfig";
import { PathConfigImpl, PathConfigPanel } from "../LemLibFormatV0_4/PathConfig";
import { UserInterface } from "@core/Layout";
import { LemLibTarballFormatV0_5 } from "../LemLibTarballFormatV0_5";
import { PathConfigImpl as LemLibTarballFormatV0_5PathConfigImpl } from "../LemLibTarballFormatV0_5/PathConfig";

const EPSILON = 1e-9;
const LEMLIB_MAX_SPEED = 127;

export interface RamseteInputPoint {
  xIn: number;
  yIn: number;
  speed: number;
}

export interface RamseteTrajectoryOptions {
  dt: number;
  maxVelocity: number;
  maxAcceleration: number;
}

export interface RamseteTrajectoryRow {
  time_s: number;
  x_in: number;
  y_in: number;
  theta_rad: number;
  v_ips: number;
  omega_radps: number;
}

interface RamseteProfilePoint extends RamseteInputPoint {
  distance: number;
  velocity: number;
  time: number;
}

function distance(a: { xIn: number; yIn: number }, b: { xIn: number; yIn: number }) {
  return Math.hypot(a.xIn - b.xIn, a.yIn - b.yIn);
}

function normalizeAngle(angle: number) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle <= -Math.PI) angle += Math.PI * 2;
  return angle;
}

function unwrapAngle(previous: number, current: number) {
  return previous + normalizeAngle(current - previous);
}

function cleanNumber(value: number) {
  return Math.abs(value) < 0.0005 ? 0 : value;
}

function formatNumber(value: number) {
  return cleanNumber(value).toFixed(3);
}

function getSuggestedRamseteFileName(name: string) {
  const extension = name.toLowerCase().endsWith(".txt") ? ".txt" : "";
  const base = extension === "" ? name : name.slice(0, -extension.length);
  return `${base.endsWith("_ramsete") ? base : `${base}_ramsete`}.txt`;
}

function createProfile(points: RamseteInputPoint[], options: RamseteTrajectoryOptions): RamseteProfilePoint[] {
  const profile: RamseteProfilePoint[] = [];

  points.forEach(point => {
    const velocity = (clamp(point.speed, 0, LEMLIB_MAX_SPEED) / LEMLIB_MAX_SPEED) * options.maxVelocity;
    const last = profile[profile.length - 1];

    if (last !== undefined && distance(last, point) <= EPSILON) return;

    profile.push({
      ...point,
      distance: 0,
      velocity,
      time: 0
    });
  });

  if (profile.length < 2) throw new Error("The path is too short to export");

  for (let i = 1; i < profile.length; i++) {
    profile[i].distance = profile[i - 1].distance + distance(profile[i - 1], profile[i]);
  }

  profile[0].velocity = 0;
  profile[profile.length - 1].velocity = 0;

  for (let i = 1; i < profile.length; i++) {
    const ds = profile[i].distance - profile[i - 1].distance;
    const accelerationLimitedVelocity = Math.sqrt(profile[i - 1].velocity ** 2 + 2 * options.maxAcceleration * ds);
    profile[i].velocity = Math.min(profile[i].velocity, accelerationLimitedVelocity);
  }

  for (let i = profile.length - 2; i >= 0; i--) {
    const ds = profile[i + 1].distance - profile[i].distance;
    const decelerationLimitedVelocity = Math.sqrt(profile[i + 1].velocity ** 2 + 2 * options.maxAcceleration * ds);
    profile[i].velocity = Math.min(profile[i].velocity, decelerationLimitedVelocity);
  }

  for (let i = 1; i < profile.length; i++) {
    const ds = profile[i].distance - profile[i - 1].distance;
    const averageVelocity = (profile[i - 1].velocity + profile[i].velocity) / 2;
    const segmentTime = averageVelocity > EPSILON ? ds / averageVelocity : 2 * Math.sqrt(ds / options.maxAcceleration);
    profile[i].time = profile[i - 1].time + segmentTime;
  }

  return profile;
}

function getSegmentHeading(profile: RamseteProfilePoint[], segmentIndex: number) {
  for (let i = segmentIndex; i < profile.length - 1; i++) {
    const dx = profile[i + 1].xIn - profile[i].xIn;
    const dy = profile[i + 1].yIn - profile[i].yIn;
    if (Math.hypot(dx, dy) > EPSILON) return Math.atan2(dy, dx);
  }

  for (let i = segmentIndex; i > 0; i--) {
    const dx = profile[i].xIn - profile[i - 1].xIn;
    const dy = profile[i].yIn - profile[i - 1].yIn;
    if (Math.hypot(dx, dy) > EPSILON) return Math.atan2(dy, dx);
  }

  return 0;
}

function sampleProfile(profile: RamseteProfilePoint[], time: number) {
  if (time <= 0) {
    return { xIn: profile[0].xIn, yIn: profile[0].yIn, segmentIndex: 0 };
  }

  for (let i = 1; i < profile.length; i++) {
    if (time <= profile[i].time + EPSILON) {
      const previous = profile[i - 1];
      const current = profile[i];
      const segmentTime = current.time - previous.time;
      const ratio = segmentTime <= EPSILON ? 1 : clamp((time - previous.time) / segmentTime, 0, 1);

      return {
        xIn: previous.xIn + (current.xIn - previous.xIn) * ratio,
        yIn: previous.yIn + (current.yIn - previous.yIn) * ratio,
        segmentIndex: i - 1
      };
    }
  }

  const last = profile[profile.length - 1];
  return { xIn: last.xIn, yIn: last.yIn, segmentIndex: profile.length - 2 };
}

export function generateRamseteTrajectory(
  points: RamseteInputPoint[],
  options: RamseteTrajectoryOptions
): RamseteTrajectoryRow[] {
  if (options.dt <= 0) throw new Error("Ramsete dt must be greater than 0");
  if (options.maxVelocity <= 0) throw new Error("Ramsete max velocity must be greater than 0");
  if (options.maxAcceleration <= 0) throw new Error("Ramsete max acceleration must be greater than 0");

  const profile = createProfile(points, options);
  const duration = profile[profile.length - 1].time;
  const stepCount = Math.max(1, Math.ceil(duration / options.dt));
  const rows: RamseteTrajectoryRow[] = [];

  for (let i = 0; i <= stepCount + 1; i++) {
    const time = i * options.dt;
    const pose = sampleProfile(profile, Math.min(time, duration));
    const rawTheta =
      i === stepCount + 1 ? rows[rows.length - 1].theta_rad : getSegmentHeading(profile, pose.segmentIndex);
    const theta = rows.length === 0 ? rawTheta : unwrapAngle(rows[rows.length - 1].theta_rad, rawTheta);

    rows.push({
      time_s: time,
      x_in: pose.xIn,
      y_in: pose.yIn,
      theta_rad: theta,
      v_ips: 0,
      omega_radps: 0
    });
  }

  for (let i = 1; i < rows.length; i++) {
    const previous = rows[i - 1];
    const current = rows[i];

    current.v_ips = Math.hypot(current.x_in - previous.x_in, current.y_in - previous.y_in) / options.dt;
    current.omega_radps = (current.theta_rad - previous.theta_rad) / options.dt;
  }

  const last = rows[rows.length - 1];
  last.v_ips = 0;
  last.omega_radps = 0;

  return rows;
}

// observable class
export class LemLibRamseteBeta implements Format {
  isInit: boolean = false;
  uid: string;

  private gc = new GeneralConfigImpl(this);

  private readonly disposers: (() => void)[] = [];

  constructor() {
    this.uid = makeId(10);
    makeAutoObservable(this);
  }

  createNewInstance(): Format {
    return new LemLibRamseteBeta();
  }

  getName(): string {
    return "LemLib Ramsete Beta";
  }

  getDescription(): string {
    return "Exports a time-based Ramsete trajectory for PROS/LemLib projects.";
  }

  getSuggestedFileName(currentName: string): string {
    return getSuggestedRamseteFileName(currentName);
  }

  register(app: MainApp, ui: UserInterface): void {
    if (this.isInit) return;
    this.isInit = true;

    this.disposers.push(
      app.history.addEventListener("beforeExecution", event => {
        if (event.isCommandInstanceOf(AddKeyframe)) {
          const keyframe = event.command.keyframe;
          if (keyframe instanceof SpeedKeyframe) {
            keyframe.followBentRate = true;
          }
        }
      }),
      ui.registerPanel(PathConfigPanel).disposer
    );
  }

  unregister(): void {
    this.disposers.forEach(disposer => disposer());
  }

  getGeneralConfig(): GeneralConfig {
    return this.gc;
  }

  createPath(...segments: Segment[]): Path {
    return new Path(new PathConfigImpl(this), ...segments);
  }

  getPathPoints(path: Path): PointCalculationResult {
    const uc = new UnitConverter(this.gc.uol, UnitOfLength.Inch);

    const result = getPathPoints(path, new Quantity(this.gc.pointDensity, this.gc.uol), {
      defaultFollowBentRate: true
    });

    const pc = path.pc as PathConfigImpl;
    const rate = pc.maxDecelerationRate;
    const minSpeed = pc.speedLimit.from;

    if (result.points.length > 1) {
      result.points[result.points.length - 2].speed = 0;
    }

    for (let i = result.points.length - 3; i >= 0; i--) {
      const last = result.points[i + 1];
      const current = result.points[i];

      const newSpeed = Math.sqrt(Math.pow(last.speed, 2) + 2 * rate * uc.fromAtoB(last.distance(current)));
      current.speed = Math.max(Math.min(current.speed, newSpeed), minSpeed);
    }
    return result;
  }

  convertFromFormat(oldFormat: Format, oldPaths: Path[]): Path[] {
    const newPaths = convertFormat(this, oldFormat, oldPaths);

    if (oldFormat instanceof LemLibTarballFormatV0_5) {
      for (let i = 0; i < newPaths.length; i++) {
        const oldPathConfig = oldPaths[i].pc as LemLibTarballFormatV0_5PathConfigImpl;
        const newPathConfig = newPaths[i].pc as PathConfigImpl;
        newPathConfig.speedLimit = oldPathConfig.speedLimit;
        newPathConfig.bentRateApplicableRange = oldPathConfig.bentRateApplicableRange;
        newPathConfig.maxDecelerationRate = oldPathConfig.maxDecelerationRate;
      }
    }

    return newPaths;
  }

  importPathsFromFile(buffer: ArrayBuffer): Path[] {
    throw new Error("Raw Ramsete files cannot be imported without PATH.JERRYIO-DATA.");
  }

  importPDJDataFromFile(buffer: ArrayBuffer): Record<string, any> | undefined {
    return importPDJDataFromTextFile(buffer);
  }

  exportFile(): ArrayBufferView<ArrayBufferLike> {
    const { app } = getAppStores();

    const path = app.interestedPath();
    if (path === undefined) throw new Error("No path to export");
    if (path.segments.length === 0) throw new Error("No segment to export");

    const uc = new UnitConverter(this.gc.uol, UnitOfLength.Inch);
    const points = this.getPathPoints(path).points.map((point: Point) => ({
      xIn: uc.fromAtoB(point.x),
      yIn: uc.fromAtoB(point.y),
      speed: point.speed
    }));
    const rows = generateRamseteTrajectory(points, {
      dt: this.gc.ramseteDt,
      maxVelocity: this.gc.ramseteMaxVelocity,
      maxAcceleration: this.gc.ramseteMaxAcceleration
    });

    let fileContent = "# RAMSETE v1\n";
    fileContent += "# time_s, x_in, y_in, theta_rad, v_ips, omega_radps\n";

    rows.forEach(row => {
      fileContent += `${formatNumber(row.time_s)}, ${formatNumber(row.x_in)}, ${formatNumber(row.y_in)}, ${formatNumber(
        row.theta_rad
      )}, ${formatNumber(row.v_ips)}, ${formatNumber(row.omega_radps)}\n`;
    });

    fileContent += "endData\n";
    fileContent += "#PATH.JERRYIO-DATA " + JSON.stringify(app.exportPDJData());

    return new TextEncoder().encode(fileContent);
  }
}
