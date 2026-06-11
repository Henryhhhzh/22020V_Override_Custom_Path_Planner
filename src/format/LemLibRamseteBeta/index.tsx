import { makeAutoObservable } from "mobx";
import { MainApp, getAppStores } from "@core/MainApp";
import { makeId } from "@core/Util";
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
import { generateRamseteTrajectory } from "@core/RamseteTrajectory";
export type { RamseteInputPoint, RamseteTrajectoryOptions, RamseteTrajectoryRow } from "@core/RamseteTrajectory";
export { generateRamseteTrajectory } from "@core/RamseteTrajectory";

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
