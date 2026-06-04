import { Expose, Type } from "class-transformer";
import { IsNumber, IsObject, ValidateNested } from "class-validator";
import { makeAutoObservable } from "mobx";
import { fromHeadingInDegreeToAngleInRadian } from "./Calculation";
import { EndControl, Vector } from "./Path";
import { UnitConverter, UnitOfLength } from "./Unit";
import type { MainApp } from "./MainApp";

export const ROBOT_SENSOR_SIDES = ["front", "right", "back", "left"] as const;

export type RobotSensorSide = (typeof ROBOT_SENSOR_SIDES)[number];

export const ROBOT_SENSOR_LABELS: Record<RobotSensorSide, string> = {
  front: "Front",
  right: "Right",
  back: "Back",
  left: "Left"
};

export class RobotSensorOffset {
  @IsNumber()
  @Expose()
  x: number;

  @IsNumber()
  @Expose()
  y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    makeAutoObservable(this);
  }
}

export class RobotSensorOffsets {
  @Type(() => RobotSensorOffset)
  @ValidateNested()
  @IsObject()
  @Expose()
  front: RobotSensorOffset = new RobotSensorOffset();

  @Type(() => RobotSensorOffset)
  @ValidateNested()
  @IsObject()
  @Expose()
  right: RobotSensorOffset = new RobotSensorOffset();

  @Type(() => RobotSensorOffset)
  @ValidateNested()
  @IsObject()
  @Expose()
  back: RobotSensorOffset = new RobotSensorOffset();

  @Type(() => RobotSensorOffset)
  @ValidateNested()
  @IsObject()
  @Expose()
  left: RobotSensorOffset = new RobotSensorOffset();

  constructor() {
    makeAutoObservable(this);
  }
}

export interface RobotSensorReading {
  side: RobotSensorSide;
  start: Vector;
  end: Vector;
  length: number;
}

export type RobotSensorReadings = Record<RobotSensorSide, RobotSensorReading>;

interface FieldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function createDefaultRobotSensorOffsets() {
  return new RobotSensorOffsets();
}

export function cloneRobotSensorOffsets(offsets: RobotSensorOffsets) {
  const clone = new RobotSensorOffsets();
  ROBOT_SENSOR_SIDES.forEach(side => {
    clone[side].x = offsets[side].x;
    clone[side].y = offsets[side].y;
  });
  return clone;
}

function vectorFromHeading(heading: number) {
  const theta = fromHeadingInDegreeToAngleInRadian(heading);
  return new Vector(Math.cos(theta), Math.sin(theta));
}

function rotateClockwise(vector: Vector) {
  return new Vector(vector.y, -vector.x);
}

function getBoundsFromHalfSizeInInches(app: MainApp, halfWidth: number, halfHeight: number): FieldBounds {
  const uc = new UnitConverter(UnitOfLength.Inch, app.gc.uol);
  const halfWidthInUOL = uc.fromAtoB(halfWidth);
  const halfHeightInUOL = uc.fromAtoB(halfHeight);

  return {
    minX: -halfWidthInUOL,
    maxX: halfWidthInUOL,
    minY: -halfHeightInUOL,
    maxY: halfHeightInUOL
  };
}

function getKnownFieldBounds(app: MainApp) {
  const displayName = app.fieldImageAsset.displayName;

  if (/^V5RC|^VRC|^VURC/.test(displayName)) {
    return getBoundsFromHalfSizeInInches(app, 72, 72);
  }

  if (/^VIQRC|^VIQC/.test(displayName)) {
    return getBoundsFromHalfSizeInInches(app, 48, 36);
  }

  return undefined;
}

function getFieldBounds(app: MainApp): FieldBounds {
  const knownBounds = getKnownFieldBounds(app);
  if (knownBounds !== undefined) return knownBounds;

  const uc = new UnitConverter(UnitOfLength.Millimeter, app.gc.uol);
  const height = uc.fromAtoB(app.fieldImageAsset.heightInMM);
  const imageRatio =
    app.fieldDimension.width > 0 && app.fieldDimension.height > 0
      ? app.fieldDimension.width / app.fieldDimension.height
      : 1;
  const width = height * imageRatio;

  return {
    minX: -width / 2,
    maxX: width / 2,
    minY: -height / 2,
    maxY: height / 2
  };
}

function getRayBoundIntersection(origin: Vector, direction: Vector, bounds: FieldBounds) {
  const epsilon = 1e-9;
  const candidates: number[] = [];

  if (Math.abs(direction.x) > epsilon) {
    candidates.push((bounds.minX - origin.x) / direction.x);
    candidates.push((bounds.maxX - origin.x) / direction.x);
  }

  if (Math.abs(direction.y) > epsilon) {
    candidates.push((bounds.minY - origin.y) / direction.y);
    candidates.push((bounds.maxY - origin.y) / direction.y);
  }

  let closestDistance = Infinity;

  candidates.forEach(distance => {
    if (distance < 0) return;

    const point = origin.add(direction.multiply(distance));
    const inBounds =
      point.x >= bounds.minX - epsilon &&
      point.x <= bounds.maxX + epsilon &&
      point.y >= bounds.minY - epsilon &&
      point.y <= bounds.maxY + epsilon;

    if (inBounds && distance < closestDistance) {
      closestDistance = distance;
    }
  });

  return Number.isFinite(closestDistance) ? origin.add(direction.multiply(closestDistance)) : undefined;
}

function getFallbackLaserEnd(origin: Vector, direction: Vector, bounds: FieldBounds) {
  const distance = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 2;
  return origin.add(direction.multiply(distance));
}

export function getRobotSensorReadings(app: MainApp, position: EndControl): RobotSensorReadings {
  const offsets = app.gc.sensorOffsets;
  const inchToUOL = new UnitConverter(UnitOfLength.Inch, app.gc.uol);
  const bounds = getFieldBounds(app);
  const front = vectorFromHeading(position.heading);

  const directions: Record<RobotSensorSide, Vector> = {
    front,
    right: rotateClockwise(front),
    back: front.multiply(-1),
    left: rotateClockwise(front).multiply(-1)
  };

  const center = position.toVector();

  return ROBOT_SENSOR_SIDES.reduce((readings, side) => {
    const outward = directions[side];
    const localRight = rotateClockwise(outward);
    const offset = offsets[side];
    const start = center
      .add(localRight.multiply(inchToUOL.fromAtoB(offset.x)))
      .add(outward.multiply(inchToUOL.fromAtoB(offset.y)));
    const end = getRayBoundIntersection(start, outward, bounds) ?? getFallbackLaserEnd(start, outward, bounds);

    readings[side] = {
      side,
      start,
      end,
      length: start.distance(end)
    };

    return readings;
  }, {} as RobotSensorReadings);
}
