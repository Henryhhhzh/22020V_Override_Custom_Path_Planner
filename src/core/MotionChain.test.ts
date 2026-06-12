import { action } from "mobx";
import { getAppStores } from "./MainApp";
import { SnapMotionChainEndpoint } from "./Command";
import { EndControl, Segment } from "./Path";
import {
  buildMotionChainOrder,
  findMotionChainConnections,
  findSnapCandidateForEndpoint,
  getMotionChainConnectionKey,
  getMotionChainRouteStatus,
  getMotionChainDsrPreviewHeading,
  getMotionChainDsrPreviewPosition,
  getSelectedMotionChainConnection,
  getPathStartEndControls
} from "./MotionChain";
import { LemLibFormatV0_4 } from "@format/LemLibFormatV0_4";

beforeEach(
  action(() => {
    const { app } = getAppStores();
    const format = new LemLibFormatV0_4();

    app.resetUserControl();
    app.format = format;
    app.paths = [];
  })
);

function addPath(name: string, start: EndControl, end: EndControl) {
  const { app } = getAppStores();
  const path = app.format.createPath(new Segment(start, end));
  path.name = name;
  app.paths.push(path);

  return path;
}

test("detects end-to-start pairs within two inches", () => {
  const { app } = getAppStores();
  const first = addPath("First", new EndControl(0, 0, 0), new EndControl(24, 0, 90));
  const second = addPath("Second", new EndControl(25, 0, 180), new EndControl(48, 0, 180));

  const connections = findMotionChainConnections(app, 2);

  expect(connections).toHaveLength(1);
  expect(connections[0].fromPath).toBe(first);
  expect(connections[0].toPath).toBe(second);
  expect(connections[0].isOrdered).toBe(true);
  expect(connections[0].isAmbiguous).toBe(false);
});

test("does not connect same path, locked paths, hidden paths, or locked endpoints", () => {
  const { app } = getAppStores();
  const first = addPath("First", new EndControl(0, 0, 0), new EndControl(24, 0, 0));
  const lockedPath = addPath("Locked", new EndControl(24, 0, 0), new EndControl(48, 0, 0));
  const hiddenPath = addPath("Hidden", new EndControl(24, 0, 0), new EndControl(48, 0, 0));
  const lockedEndpoint = addPath("Locked endpoint", new EndControl(24, 0, 0), new EndControl(48, 0, 0));

  action(() => {
    lockedPath.lock = true;
    hiddenPath.visible = false;
    getPathStartEndControls(lockedEndpoint)!.start.lock = true;
  })();

  const connections = findMotionChainConnections(app, 2);

  expect(connections.some(connection => connection.fromPath === first && connection.toPath === first)).toBe(false);
  expect(connections).toHaveLength(0);
});

test("marks ambiguous endpoint matches", () => {
  const { app } = getAppStores();
  addPath("First", new EndControl(0, 0, 0), new EndControl(24, 0, 0));
  const second = addPath("Second", new EndControl(24.5, 0, 0), new EndControl(48, 0, 0));
  const third = addPath("Third", new EndControl(25, 0, 0), new EndControl(48, 10, 0));

  const connections = findMotionChainConnections(app, 2);
  const candidate = findSnapCandidateForEndpoint(app, getPathStartEndControls(second)!.start, 2)!;

  expect(connections).toHaveLength(2);
  expect(connections.every(connection => connection.isAmbiguous)).toBe(true);
  expect(candidate.isAmbiguous).toBe(true);
  expect(candidate.toPath).toBe(second);
  expect(connections.some(connection => connection.toPath === third)).toBe(true);
});

test("builds clear chain order without changing unrelated ordering more than needed", () => {
  const { app } = getAppStores();
  const first = addPath("First", new EndControl(0, 0, 0), new EndControl(24, 0, 0));
  const unrelated = addPath("Unrelated", new EndControl(0, 20, 0), new EndControl(10, 20, 0));
  const second = addPath("Second", new EndControl(24, 0, 0), new EndControl(48, 0, 0));
  const [connection] = findMotionChainConnections(app, 2);

  expect(buildMotionChainOrder([first, unrelated, second], [connection])).toEqual([first, second, unrelated]);
});

test("route status reports connected, unordered, ambiguous, and disconnected state", () => {
  const { app } = getAppStores();
  const first = addPath("First", new EndControl(0, 0, 0), new EndControl(24, 0, 0));
  const disconnected = addPath("Disconnected", new EndControl(0, 20, 0), new EndControl(10, 20, 0));
  const second = addPath("Second", new EndControl(24, 0, 0), new EndControl(48, 0, 0));

  const status = getMotionChainRouteStatus(app, 2);

  expect(status.connectedPairCount).toBe(1);
  expect(status.unorderedConnectionCount).toBe(1);
  expect(status.disconnectedRouteBreakCount).toBe(2);
  expect(status.ambiguousConnectionCount).toBe(0);
  expect(app.paths).toEqual([first, disconnected, second]);
});

test("snap command preserves separate headings and reorders a clear chain", () => {
  const { app } = getAppStores();
  const secondStart = new EndControl(25, 0, 180);
  const second = addPath("Second", secondStart, new EndControl(48, 0, 180));
  const firstEnd = new EndControl(24, 0, 90);
  const first = addPath("First", new EndControl(0, 0, 0), firstEnd);
  const command = new SnapMotionChainEndpoint(app.paths, secondStart, firstEnd, first, second);

  expect(command.execute()).toBe(true);

  expect(secondStart).not.toBe(firstEnd);
  expect(secondStart.x).toBe(firstEnd.x);
  expect(secondStart.y).toBe(firstEnd.y);
  expect(firstEnd.heading).toBe(90);
  expect(secondStart.heading).toBe(180);
  expect(app.paths).toEqual([first, second]);

  command.undo();

  expect(secondStart.x).toBe(25);
  expect(secondStart.y).toBe(0);
  expect(app.paths).toEqual([second, first]);

  command.redo();

  expect(secondStart.x).toBe(firstEnd.x);
  expect(app.paths).toEqual([first, second]);
});

test("selected chained endpoint can drive DSR preview position", () => {
  const { app } = getAppStores();
  const firstEnd = new EndControl(24, 0, 90);
  const secondStart = new EndControl(24, 0, 180);
  addPath("First", new EndControl(0, 0, 0), firstEnd);
  addPath("Second", secondStart, new EndControl(48, 0, 180));

  action(() => {
    app.setSelected([secondStart]);
  })();

  expect(getMotionChainDsrPreviewPosition(app)).toBeUndefined();

  action(() => {
    app.motionChainDsrPreviewEnabled = true;
  })();

  expect(getMotionChainDsrPreviewPosition(app)).toMatchObject({ x: secondStart.x, y: secondStart.y, heading: 90 });

  action(() => {
    app.setSelected([firstEnd]);
  })();

  expect(getMotionChainDsrPreviewPosition(app)).toMatchObject({ x: firstEnd.x, y: firstEnd.y, heading: 90 });
});

test("DSR preview heading defaults to next path travel heading until overridden", () => {
  const { app } = getAppStores();
  const firstEnd = new EndControl(24, 0, 90);
  const secondStart = new EndControl(24, 0, 180);
  addPath("First", new EndControl(0, 0, 0), firstEnd);
  addPath("Second", secondStart, new EndControl(48, 0, 180));

  action(() => {
    app.setSelected([firstEnd]);
    app.motionChainDsrPreviewEnabled = true;
  })();

  const connection = getSelectedMotionChainConnection(app)!;
  expect(getMotionChainDsrPreviewHeading(app)).toBe(90);

  action(() => {
    app.motionChainDsrPreviewHeadings.set(getMotionChainConnectionKey(connection), 45);
  })();

  expect(getMotionChainDsrPreviewHeading(app)).toBe(45);
  expect(getMotionChainDsrPreviewPosition(app)).toMatchObject({ heading: 45 });
});
