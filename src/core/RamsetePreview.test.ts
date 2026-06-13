import { EndControl, Path } from "./Path";
import { getRamsetePreviewHeading, getRamsetePreviewRobotPosition, isRamsetePathBackwards } from "./RamsetePreview";

function createPath(ramseteBackwards = false): Path {
  return { pc: { ramseteBackwards } } as unknown as Path;
}

test("Ramsete preview heading stays unchanged for forward paths", () => {
  const path = createPath();
  const position = new EndControl(3, 4, 37);

  expect(isRamsetePathBackwards(path)).toBe(false);
  expect(getRamsetePreviewHeading(path, position.heading)).toBe(37);
  expect(getRamsetePreviewRobotPosition(path, position)).toBe(position);
});

test("Ramsete preview heading flips for reversed paths without mutating the source position", () => {
  const path = createPath(true);
  const position = new EndControl(3, 4, 37);
  position.visible = false;
  position.lock = true;

  const previewPosition = getRamsetePreviewRobotPosition(path, position);

  expect(isRamsetePathBackwards(path)).toBe(true);
  expect(getRamsetePreviewHeading(path, position.heading)).toBe(217);
  expect(previewPosition).not.toBe(position);
  expect(previewPosition).toMatchObject({ x: 3, y: 4, heading: 217, visible: false, lock: true });
  expect(position.heading).toBe(37);
});
