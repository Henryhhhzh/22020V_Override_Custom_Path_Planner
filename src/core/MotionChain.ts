import type { MainApp } from "./MainApp";
import { EndControl, Path } from "./Path";
import { UnitConverter, UnitOfLength } from "./Unit";

export const MOTION_CHAIN_SNAP_TOLERANCE_INCHES = 2;

export type MotionChainEndpointRole = "fromEnd" | "toStart";

export interface MotionChainConnection {
  fromPath: Path;
  toPath: Path;
  fromEnd: EndControl;
  toStart: EndControl;
  distance: number;
  isOrdered: boolean;
  isAmbiguous: boolean;
}

export interface MotionChainSnapCandidate extends MotionChainConnection {
  draggedEndpoint: EndControl;
  targetEndpoint: EndControl;
  draggedRole: MotionChainEndpointRole;
}

export interface MotionChainRouteStatus {
  connectedPairCount: number;
  ambiguousConnectionCount: number;
  unorderedConnectionCount: number;
  disconnectedRouteBreakCount: number;
}

export function getPathStartEndControls(path: Path): { start: EndControl; end: EndControl } | undefined {
  if (path.segments.length === 0) return undefined;

  return {
    start: path.segments[0].first,
    end: path.segments[path.segments.length - 1].last
  };
}

function getToleranceInCurrentUnit(app: MainApp, toleranceInches: number) {
  return new UnitConverter(UnitOfLength.Inch, app.gc.uol).fromAtoB(toleranceInches);
}

function isEligiblePath(path: Path) {
  return path.visible && !path.lock && path.segments.length > 0;
}

function isEligibleEndpoint(endpoint: EndControl) {
  return endpoint.visible && !endpoint.lock;
}

function createConnection(app: MainApp, fromPath: Path, toPath: Path): MotionChainConnection | undefined {
  if (fromPath === toPath || !isEligiblePath(fromPath) || !isEligiblePath(toPath)) return undefined;

  const fromControls = getPathStartEndControls(fromPath);
  const toControls = getPathStartEndControls(toPath);
  if (fromControls === undefined || toControls === undefined) return undefined;
  if (!isEligibleEndpoint(fromControls.end) || !isEligibleEndpoint(toControls.start)) return undefined;

  return {
    fromPath,
    toPath,
    fromEnd: fromControls.end,
    toStart: toControls.start,
    distance: fromControls.end.distance(toControls.start),
    isOrdered: app.paths.indexOf(fromPath) + 1 === app.paths.indexOf(toPath),
    isAmbiguous: false
  };
}

function markAmbiguousConnections(connections: MotionChainConnection[]) {
  const fromCounts = new Map<Path, number>();
  const toCounts = new Map<Path, number>();

  connections.forEach(connection => {
    fromCounts.set(connection.fromPath, (fromCounts.get(connection.fromPath) ?? 0) + 1);
    toCounts.set(connection.toPath, (toCounts.get(connection.toPath) ?? 0) + 1);
  });

  connections.forEach(connection => {
    connection.isAmbiguous =
      (fromCounts.get(connection.fromPath) ?? 0) > 1 || (toCounts.get(connection.toPath) ?? 0) > 1;
  });
}

export function findMotionChainConnections(
  app: MainApp,
  toleranceInches: number = MOTION_CHAIN_SNAP_TOLERANCE_INCHES
): MotionChainConnection[] {
  const tolerance = getToleranceInCurrentUnit(app, toleranceInches);
  const connections: MotionChainConnection[] = [];

  app.paths.forEach(fromPath => {
    app.paths.forEach(toPath => {
      const connection = createConnection(app, fromPath, toPath);
      if (connection !== undefined && connection.distance <= tolerance) connections.push(connection);
    });
  });

  markAmbiguousConnections(connections);

  return connections.sort((a, b) => a.distance - b.distance);
}

export function findSnapCandidateForEndpoint(
  app: MainApp,
  draggedEndpoint: EndControl,
  toleranceInches: number = MOTION_CHAIN_SNAP_TOLERANCE_INCHES
): MotionChainSnapCandidate | undefined {
  const candidates = findMotionChainConnections(app, toleranceInches)
    .filter(connection => connection.fromEnd === draggedEndpoint || connection.toStart === draggedEndpoint)
    .map(connection => {
      const draggedRole: MotionChainEndpointRole = connection.fromEnd === draggedEndpoint ? "fromEnd" : "toStart";

      return {
        ...connection,
        draggedEndpoint,
        targetEndpoint: draggedRole === "fromEnd" ? connection.toStart : connection.fromEnd,
        draggedRole,
        isAmbiguous: connection.isAmbiguous
      };
    });

  if (candidates.length === 0) return undefined;

  const [candidate] = candidates;
  candidate.isAmbiguous = candidate.isAmbiguous || candidates.length > 1;

  return candidate;
}

export function buildMotionChainOrder(paths: Path[], connections: MotionChainConnection[]): Path[] {
  const ordered = paths.slice();
  const clearConnections = connections.filter(connection => !connection.isAmbiguous);

  clearConnections.forEach(connection => {
    const fromIdx = ordered.indexOf(connection.fromPath);
    const toIdx = ordered.indexOf(connection.toPath);
    if (fromIdx === -1 || toIdx === -1 || fromIdx + 1 === toIdx) return;

    if (fromIdx < toIdx) {
      const [toPath] = ordered.splice(toIdx, 1);
      ordered.splice(fromIdx + 1, 0, toPath);
    } else {
      const [fromPath] = ordered.splice(fromIdx, 1);
      const nextToIdx = ordered.indexOf(connection.toPath);
      ordered.splice(nextToIdx, 0, fromPath);
    }
  });

  return ordered;
}

export function getMotionChainEndpointRole(
  connections: MotionChainConnection[],
  path: Path,
  endpoint: EndControl
): MotionChainEndpointRole | undefined {
  if (connections.some(connection => connection.fromPath === path && connection.fromEnd === endpoint)) return "fromEnd";
  if (connections.some(connection => connection.toPath === path && connection.toStart === endpoint)) return "toStart";

  return undefined;
}

export function getMotionChainRouteStatus(
  app: MainApp,
  toleranceInches: number = MOTION_CHAIN_SNAP_TOLERANCE_INCHES
): MotionChainRouteStatus {
  const routePaths = app.paths.filter(path => path.visible && !path.lock && path.segments.length > 0);
  const connections = findMotionChainConnections(app, toleranceInches);
  const clearConnections = connections.filter(connection => !connection.isAmbiguous);
  let disconnectedRouteBreakCount = 0;

  for (let i = 1; i < routePaths.length; i++) {
    const previous = routePaths[i - 1];
    const current = routePaths[i];
    const hasConnection = clearConnections.some(
      connection => connection.fromPath === previous && connection.toPath === current
    );

    if (!hasConnection) disconnectedRouteBreakCount++;
  }

  return {
    connectedPairCount: clearConnections.length,
    ambiguousConnectionCount: connections.filter(connection => connection.isAmbiguous).length,
    unorderedConnectionCount: clearConnections.filter(connection => !connection.isOrdered).length,
    disconnectedRouteBreakCount
  };
}
