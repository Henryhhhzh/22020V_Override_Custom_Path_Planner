import { boundHeading } from "./Calculation";
import { EndControl, Path } from "./Path";

interface RamseteBackwardsPathConfig {
  ramseteBackwards?: boolean;
}

export function isRamsetePathBackwards(path: Path | undefined): boolean {
  return path !== undefined && (path.pc as RamseteBackwardsPathConfig).ramseteBackwards === true;
}

export function getRamsetePreviewHeading(path: Path | undefined, heading: number): number {
  return isRamsetePathBackwards(path) ? boundHeading(heading + 180) : boundHeading(heading);
}

export function getRamsetePreviewRobotPosition(path: Path | undefined, position: EndControl): EndControl {
  const heading = getRamsetePreviewHeading(path, position.heading);
  if (heading === position.heading) return position;

  const previewPosition = position.clone();
  previewPosition.heading = heading;
  previewPosition.visible = position.visible;
  previewPosition.lock = position.lock;

  return previewPosition;
}
