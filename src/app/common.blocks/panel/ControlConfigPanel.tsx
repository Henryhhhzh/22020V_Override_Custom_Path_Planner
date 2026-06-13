import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { action } from "mobx";
import { observer } from "mobx-react-lite";
import { AnyControl, Control, EndControl, Path } from "@core/Path";
import { FormInputField, clampQuantity } from "@app/component.blocks/FormInputField";
import { Quantity, UnitConverter, UnitOfAngle, UnitOfLength } from "@core/Unit";
import { boundHeading, findCentralPoint } from "@core/Calculation";
import { Coordinate, CoordinateWithHeading, EuclideanTransformation, isCoordinateWithHeading } from "@core/Coordinate";
import { PanelBuilderProps, PanelInstanceProps } from "@core/Layout";
import { UpdatePathTreeItems } from "@core/Command";
import { getAppStores } from "@core/MainApp";
import { NumberUOA, NumberUOL } from "@token/Tokens";
import { parseFormula } from "@core/Util";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import FlipIcon from "@mui/icons-material/Flip";
import RotateLeftIcon from "@mui/icons-material/RotateLeft";
import RotateRightIcon from "@mui/icons-material/RotateRight";

import "./ControlConfigPanel.scss";
import { FormCheckbox } from "@app/component.blocks/FormCheckbox";
import { PanelBox } from "@src/app/component.blocks/PanelBox";
import { CoordinateSystemTransformation } from "@src/core/CoordinateSystem";
import { ROBOT_SENSOR_LABELS, ROBOT_SENSOR_SIDES, RobotSensorSide, getRobotSensorReadings } from "@core/RobotSensors";
import {
  getMotionChainConnectionKey,
  getMotionChainDsrPreviewHeading,
  getMotionChainDsrPreviewPosition,
  getMotionChainStartHeading,
  getSelectedMotionChainConnection,
  isMotionChainDsrPreviewEnabled,
  isMotionChainDsrUsingPathHeading,
  isMotionChainUsingPathStartHeading
} from "@core/MotionChain";

const LEMLIB_RAMSETE_BETA_FORMAT_NAME = "LemLib Ramsete Beta";

const ControlConfigPanelBody = observer((props: {}) => {
  const { app } = getAppStores();

  const isDisabled = app.selectedControl === undefined;
  const isRamseteBetaFormat = app.format.getName() === LEMLIB_RAMSETE_BETA_FORMAT_NAME;

  const flipByAxisX = function () {
    const selectedControls = app.selectedEntities.filter(
      entity => entity instanceof EndControl || entity instanceof Control
    ) as AnyControl[];

    if (selectedControls.length === 0) return;

    const updates = selectedControls.map(control => {
      if (control instanceof EndControl) {
        return { y: control.y * -1, heading: boundHeading(90 + (90 - control.heading)) };
      } else {
        return { y: control.y * -1 };
      }
    }) as Partial<AnyControl>[];

    app.history.execute("Flip by Axis X", new UpdatePathTreeItems(selectedControls, updates), 0);
  };

  const flipByAxisY = function () {
    const selectedControls = app.selectedEntities.filter(
      entity => entity instanceof EndControl || entity instanceof Control
    ) as AnyControl[];

    if (selectedControls.length === 0) return;

    const updates = selectedControls.map(control => {
      if (control instanceof EndControl) {
        return { x: control.x * -1, heading: boundHeading(180 + (180 - control.heading)) };
      } else {
        return { x: control.x * -1 };
      }
    }) as Partial<AnyControl>[];

    app.history.execute("Flip by Axis Y", new UpdatePathTreeItems(selectedControls, updates), 0);
  };

  const rotate = function (angle: number) {
    const selectedControls = app.selectedEntities.filter(
      entity => entity instanceof EndControl || entity instanceof Control
    ) as AnyControl[];

    if (selectedControls.length === 0) return;

    const central = findCentralPoint(selectedControls)!;
    const t = new EuclideanTransformation({ ...central, heading: angle });

    const updates = selectedControls.map(control => {
      if (control instanceof EndControl) {
        const { x, y, heading } = t.transform(control) as CoordinateWithHeading;
        return { x: central.x + x, y: central.y + y, heading: heading };
      } else {
        const { x, y } = t.transform(control) as Coordinate;
        return { x: central.x + x, y: central.y + y };
      }
    });

    app.history.execute("Rotate controls right", new UpdatePathTreeItems(selectedControls, updates), 0);
  };

  const clampQuantityValue = function (value: number) {
    return clampQuantity(
      value,
      app.gc.uol,
      new Quantity(-1000, UnitOfLength.Centimeter),
      new Quantity(1000, UnitOfLength.Centimeter)
    );
  };

  const cst: CoordinateSystemTransformation | undefined = (() => {
    if (app.selectedEntityCount !== 1) return undefined;
    const control = app.selectedControl;
    if (control === undefined) return undefined;

    const referencedPath = app.interestedPath();
    if (referencedPath === undefined) return undefined;

    const cs = app.coordinateSystem;
    if (cs === undefined) return undefined;

    const fieldDimension = app.fieldDimension;

    const firstControl = referencedPath.segments[0].controls[0];

    return new CoordinateSystemTransformation(cs, fieldDimension, firstControl);
  })();

  const getCoordinateSystemTransformation = (path: Path | undefined): CoordinateSystemTransformation | undefined => {
    if (path === undefined) return undefined;

    const cs = app.coordinateSystem;
    if (cs === undefined) return undefined;

    const firstControl = path.segments[0]?.controls[0];
    if (firstControl === undefined) return undefined;

    return new CoordinateSystemTransformation(cs, app.fieldDimension, firstControl);
  };

  const selectedMotionChainConnection = getSelectedMotionChainConnection(app);

  const getHeadingDisplayValue = (path: Path, control: EndControl) => {
    const pathCst = getCoordinateSystemTransformation(path);
    if (pathCst === undefined) return "";

    const coordInFCS = pathCst.transform(control);
    return isCoordinateWithHeading(coordInFCS) ? coordInFCS.heading.toUser().toString() : "";
  };

  const getRawHeadingDisplayValue = (path: Path, control: EndControl, heading: number | undefined) => {
    if (heading === undefined) return "";

    const pathCst = getCoordinateSystemTransformation(path);
    if (pathCst === undefined) return "";

    const coordInFCS = pathCst.transform({ x: control.x, y: control.y, heading });
    return isCoordinateWithHeading(coordInFCS) ? coordInFCS.heading.toUser().toString() : "";
  };

  const setHeadingValue = (path: Path, control: EndControl, value: string, title: string) => {
    const pathCst = getCoordinateSystemTransformation(path);
    if (pathCst === undefined) return;

    const coordInFCS = pathCst.transform(control);
    const headingValueInFCS = parseFormula(value, NumberUOA.parse)!.compute(UnitOfAngle.Degree);
    const newCoord = pathCst.inverseTransform({ ...coordInFCS, heading: headingValueInFCS });

    app.history.execute(title, new UpdatePathTreeItems([control], { heading: newCoord.heading }));
  };

  const setDsrHeadingValue = (path: Path, control: EndControl, value: string) => {
    if (selectedMotionChainConnection === undefined) return;

    const pathCst = getCoordinateSystemTransformation(path);
    if (pathCst === undefined) return;

    const coordInFCS = pathCst.transform(control);
    const headingValueInFCS = parseFormula(value, NumberUOA.parse)!.compute(UnitOfAngle.Degree);
    const newCoord = pathCst.inverseTransform({ ...coordInFCS, heading: headingValueInFCS });
    const connectionKey = getMotionChainConnectionKey(selectedMotionChainConnection);

    app.motionChainDsrUsePathHeading.set(connectionKey, false);
    app.motionChainDsrPreviewHeadings.set(connectionKey, newCoord.heading);
  };

  const setStartHeadingValue = (path: Path, control: EndControl, value: string) => {
    if (selectedMotionChainConnection === undefined) return;

    const pathCst = getCoordinateSystemTransformation(path);
    if (pathCst === undefined) return;

    const coordInFCS = pathCst.transform(control);
    const headingValueInFCS = parseFormula(value, NumberUOA.parse)!.compute(UnitOfAngle.Degree);
    const newCoord = pathCst.inverseTransform({ ...coordInFCS, heading: headingValueInFCS });
    const connectionKey = getMotionChainConnectionKey(selectedMotionChainConnection);

    app.motionChainUsePathStartHeading.set(connectionKey, false);
    app.motionChainStartHeadings.set(connectionKey, newCoord.heading);
  };

  const setUsePathStartHeadingValue = (value: boolean) => {
    if (selectedMotionChainConnection === undefined) return;

    const connectionKey = getMotionChainConnectionKey(selectedMotionChainConnection);
    if (value) {
      app.motionChainUsePathStartHeading.delete(connectionKey);
      app.motionChainStartHeadings.delete(connectionKey);
    } else {
      const currentHeading = getMotionChainStartHeading(app);
      app.motionChainUsePathStartHeading.set(connectionKey, false);
      if (currentHeading !== undefined) app.motionChainStartHeadings.set(connectionKey, currentHeading);
    }
  };

  const setUsePathHeadingValue = (value: boolean) => {
    if (selectedMotionChainConnection === undefined) return;

    const connectionKey = getMotionChainConnectionKey(selectedMotionChainConnection);
    if (value) {
      app.motionChainDsrUsePathHeading.delete(connectionKey);
      app.motionChainDsrPreviewHeadings.delete(connectionKey);
    } else {
      const currentHeading = getMotionChainDsrPreviewHeading(app);
      app.motionChainDsrUsePathHeading.set(connectionKey, false);
      if (currentHeading !== undefined) app.motionChainDsrPreviewHeadings.set(connectionKey, currentHeading);
    }
  };

  const setDsrPreviewEnabled = (value: boolean) => {
    if (selectedMotionChainConnection === undefined) return;

    const connectionKey = getMotionChainConnectionKey(selectedMotionChainConnection);
    if (value) app.motionChainDsrPreviewConnectionKeys.add(connectionKey);
    else app.motionChainDsrPreviewConnectionKeys.delete(connectionKey);
  };

  let xDisplayValue: string;
  let yDisplayValue: string;
  let headingDisplayValue: string;

  if (app.selectedEntityCount > 1) {
    xDisplayValue = "(mixed)";
    yDisplayValue = "(mixed)";
    headingDisplayValue = "(mixed)";
  } else if (cst === undefined) {
    xDisplayValue = "";
    yDisplayValue = "";
    headingDisplayValue = "";
  } else {
    const control = app.selectedControl!;
    const coordInFCS = cst.transform(control);
    xDisplayValue = coordInFCS.x.toUser().toString();
    yDisplayValue = coordInFCS.y.toUser().toString();
    if (isCoordinateWithHeading(coordInFCS)) {
      headingDisplayValue = coordInFCS.heading.toUser().toString();
    } else {
      headingDisplayValue = "";
    }
  }

  const showMotionChainHeadings = selectedMotionChainConnection !== undefined && !isRamseteBetaFormat;
  const motionChainEndHeadingDisplay =
    selectedMotionChainConnection === undefined
      ? ""
      : getHeadingDisplayValue(selectedMotionChainConnection.fromPath, selectedMotionChainConnection.fromEnd);
  const motionChainStartHeadingDisplay =
    selectedMotionChainConnection === undefined
      ? ""
      : getHeadingDisplayValue(selectedMotionChainConnection.toPath, selectedMotionChainConnection.toStart);
  const motionChainRamseteStartHeadingDisplay =
    selectedMotionChainConnection === undefined
      ? ""
      : getRawHeadingDisplayValue(
          selectedMotionChainConnection.toPath,
          selectedMotionChainConnection.toStart,
          getMotionChainStartHeading(app)
        );
  const motionChainDsrHeadingDisplay =
    selectedMotionChainConnection === undefined
      ? ""
      : getRawHeadingDisplayValue(
          selectedMotionChainConnection.toPath,
          selectedMotionChainConnection.toStart,
          getMotionChainDsrPreviewHeading(app)
        );
  const isUsingPathStartHeading = isMotionChainUsingPathStartHeading(app);
  const isDsrUsingPathHeading = isMotionChainDsrUsingPathHeading(app);
  const isDsrPreviewEnabled = isMotionChainDsrPreviewEnabled(app);
  const motionChainDsrPreviewPosition = getMotionChainDsrPreviewPosition(app);
  const robotReadoutPosition =
    motionChainDsrPreviewPosition ?? (app.gc.showRobot && app.robot.position.visible ? app.robot.position : undefined);
  const robotSensorReadings =
    robotReadoutPosition === undefined ? undefined : getRobotSensorReadings(app, robotReadoutPosition);
  const uolToInch = new UnitConverter(app.gc.uol, UnitOfLength.Inch);
  const getSensorLengthDisplay = (side: RobotSensorSide) =>
    robotSensorReadings === undefined ? "-" : `${uolToInch.fromAtoB(robotSensorReadings[side].length).toFixed(2)} in`;
  const robotCst: CoordinateSystemTransformation | undefined = (() => {
    const referencedPath = app.interestedPath();
    if (referencedPath === undefined) return undefined;

    const cs = app.coordinateSystem;
    if (cs === undefined) return undefined;

    const firstControl = referencedPath.segments[0]?.controls[0];
    if (firstControl === undefined) return undefined;

    return new CoordinateSystemTransformation(cs, app.fieldDimension, firstControl);
  })();
  const robotOdom =
    robotReadoutPosition !== undefined && robotCst !== undefined ? robotCst.transform(robotReadoutPosition) : undefined;
  const getRobotOdomDisplay = (value: number | undefined) => (value === undefined ? "-" : value.toUser().toString());
  const robotOdomHeadingDisplay =
    robotOdom === undefined || !isCoordinateWithHeading(robotOdom) ? "-" : `${robotOdom.heading.toUser()}°`;

  return (
    <Box id="ControlConfigPanel">
      <PanelBox marginTop="0">
        <FormInputField
          label="X"
          getValue={() => xDisplayValue}
          setValue={(value: string) => {
            if (cst === undefined) return;
            const control = app.selectedControl;
            if (control === undefined) return;

            const coordInFCS = cst.transform(control);
            const xValueInFCS = parseFormula(value, NumberUOL.parse)!.compute(app.gc.uol);
            const newCoord = cst.inverseTransform({ ...coordInFCS, x: xValueInFCS });

            newCoord.x = clampQuantityValue(newCoord.x);
            newCoord.y = clampQuantityValue(newCoord.y);

            app.history.execute(
              `Update control ${control.uid} coordinate`,
              new UpdatePathTreeItems([control], newCoord)
            );
          }}
          isValidIntermediate={() => true}
          isValidValue={(candidate: string) => parseFormula(candidate, NumberUOL.parse) !== null}
          disabled={app.selectedEntityCount !== 1 || app.selectedControl === undefined}
          numeric
        />
        <FormInputField
          label="Y"
          getValue={() => yDisplayValue}
          setValue={(value: string) => {
            if (cst === undefined) return;
            const control = app.selectedControl;
            if (control === undefined) return;

            const coordInFCS = cst.transform(control);
            const yValueInFCS = parseFormula(value, NumberUOL.parse)!.compute(app.gc.uol);
            const newCoord = cst.inverseTransform({ ...coordInFCS, y: yValueInFCS });

            newCoord.x = clampQuantityValue(newCoord.x);
            newCoord.y = clampQuantityValue(newCoord.y);

            app.history.execute(
              `Update control ${control.uid} coordinate`,
              new UpdatePathTreeItems([control], newCoord)
            );
          }}
          isValidIntermediate={() => true}
          isValidValue={(candidate: string) => parseFormula(candidate, NumberUOL.parse) !== null}
          disabled={app.selectedEntityCount !== 1 || app.selectedControl === undefined}
          numeric
        />
        {!isRamseteBetaFormat && !showMotionChainHeadings && (
          <FormInputField
            label="Heading"
            getValue={() => headingDisplayValue}
            setValue={(value: string) => {
              if (cst === undefined) return;
              const control = app.selectedControl;
              if (!(control instanceof EndControl)) return;

              const coordInFCS = cst.transform(control);
              const headingValueInFCS = parseFormula(value, NumberUOA.parse)!.compute(UnitOfAngle.Degree);
              const newCoord = cst.inverseTransform({ ...coordInFCS, heading: headingValueInFCS });

              const controlUid = control.uid;
              const finalVal = newCoord.heading;

              app.history.execute(
                `Update control ${controlUid} heading value`,
                new UpdatePathTreeItems([control], { heading: finalVal })
              );
            }}
            isValidIntermediate={() => true}
            isValidValue={(candidate: string) => parseFormula(candidate, NumberUOA.parse) !== null}
            disabled={app.selectedEntityCount !== 1 || app.selectedControl === undefined}
            sx={{
              visibility: app.selectedEntityCount === 1 && !(app.selectedControl instanceof EndControl) ? "hidden" : ""
            }}
            numeric
          />
        )}
      </PanelBox>
      {selectedMotionChainConnection !== undefined && (
        <PanelBox>
          {!isRamseteBetaFormat && (
            <>
              <FormInputField
                label="End Heading"
                getValue={() => motionChainEndHeadingDisplay}
                setValue={(value: string) =>
                  setHeadingValue(
                    selectedMotionChainConnection.fromPath,
                    selectedMotionChainConnection.fromEnd,
                    value,
                    `Update chained end heading ${selectedMotionChainConnection.fromEnd.uid}`
                  )
                }
                isValidIntermediate={() => true}
                isValidValue={(candidate: string) => parseFormula(candidate, NumberUOA.parse) !== null}
                disabled={app.selectedEntityCount !== 1}
                numeric
              />
              <FormInputField
                label="Start Heading"
                getValue={() => motionChainStartHeadingDisplay}
                setValue={(value: string) =>
                  setHeadingValue(
                    selectedMotionChainConnection.toPath,
                    selectedMotionChainConnection.toStart,
                    value,
                    `Update chained start heading ${selectedMotionChainConnection.toStart.uid}`
                  )
                }
                isValidIntermediate={() => true}
                isValidValue={(candidate: string) => parseFormula(candidate, NumberUOA.parse) !== null}
                disabled={app.selectedEntityCount !== 1}
                numeric
              />
            </>
          )}
          {isRamseteBetaFormat && (
            <>
              <Typography variant="body2">Movement Start</Typography>
              <FormCheckbox
                label="Use Path Heading"
                title="Use the next path's starting Ramsete heading for the gold-point start heading"
                checked={isUsingPathStartHeading}
                onCheckedChange={setUsePathStartHeadingValue}
              />
              <FormInputField
                label="Start Heading"
                getValue={() => motionChainRamseteStartHeadingDisplay}
                setValue={(value: string) =>
                  setStartHeadingValue(
                    selectedMotionChainConnection.toPath,
                    selectedMotionChainConnection.toStart,
                    value
                  )
                }
                isValidIntermediate={() => true}
                isValidValue={(candidate: string) => parseFormula(candidate, NumberUOA.parse) !== null}
                disabled={app.selectedEntityCount !== 1}
                sx={{
                  "& .MuiInputBase-root": {
                    backgroundColor: isUsingPathStartHeading ? "rgba(255, 255, 255, 0.08)" : undefined
                  }
                }}
                numeric
              />
            </>
          )}
          {isRamseteBetaFormat && <Typography variant="body2">DSR Preview</Typography>}
          <FormCheckbox
            label="DSR"
            title="Show robot outline and DSR sensor rays at this chained endpoint"
            checked={isDsrPreviewEnabled}
            onCheckedChange={setDsrPreviewEnabled}
          />
          <FormCheckbox
            label="Use Path Heading"
            title="Use the next path's starting Ramsete heading for DSR preview"
            checked={isDsrUsingPathHeading}
            onCheckedChange={setUsePathHeadingValue}
          />
          <FormInputField
            label="DSR Heading"
            getValue={() => motionChainDsrHeadingDisplay}
            setValue={(value: string) =>
              setDsrHeadingValue(selectedMotionChainConnection.toPath, selectedMotionChainConnection.toStart, value)
            }
            isValidIntermediate={() => true}
            isValidValue={(candidate: string) => parseFormula(candidate, NumberUOA.parse) !== null}
            disabled={app.selectedEntityCount !== 1}
            sx={{
              "& .MuiInputBase-root": {
                backgroundColor: isDsrUsingPathHeading ? "rgba(255, 255, 255, 0.08)" : undefined
              }
            }}
            numeric
          />
        </PanelBox>
      )}
      <PanelBox flexWrap="wrap">
        <Typography variant="body2" sx={{ minWidth: "6.9rem" }}>
          Odom X: {getRobotOdomDisplay(robotOdom?.x)}
        </Typography>
        <Typography variant="body2" sx={{ minWidth: "6.9rem" }}>
          Odom Y: {getRobotOdomDisplay(robotOdom?.y)}
        </Typography>
        <Typography variant="body2" sx={{ minWidth: "8.4rem" }}>
          Odom Heading: {robotOdomHeadingDisplay}
        </Typography>
      </PanelBox>
      <PanelBox flexWrap="wrap">
        {ROBOT_SENSOR_SIDES.map(side => (
          <Typography key={side} variant="body2" sx={{ minWidth: "5.8rem" }}>
            {ROBOT_SENSOR_LABELS[side]}: {getSensorLengthDisplay(side)}
          </Typography>
        ))}
      </PanelBox>
      <PanelBox>
        <Tooltip title="Rotate Right 90°">
          <IconButton
            edge="end"
            size="small"
            className="ControlConfigPanel-ActionButton"
            disabled={isDisabled}
            onClick={action(rotate.bind(undefined, -90))}>
            <RotateRightIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Rotate Left 90°">
          <IconButton
            edge="end"
            size="small"
            className="ControlConfigPanel-ActionButton"
            disabled={isDisabled}
            onClick={action(rotate.bind(undefined, 90))}>
            <RotateLeftIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Flip Horizontal">
          <IconButton
            edge="end"
            size="small"
            className="ControlConfigPanel-ActionButton"
            disabled={isDisabled}
            onClick={action(flipByAxisY)}>
            <FlipIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Flip Vertical">
          <IconButton
            edge="end"
            size="small"
            className="ControlConfigPanel-ActionButton"
            disabled={isDisabled}
            onClick={action(flipByAxisX)}>
            <FlipIcon sx={{ transform: "rotate(90deg)" }} />
          </IconButton>
        </Tooltip>
      </PanelBox>
    </Box>
  );
});

export const ControlConfigPanel = (props: PanelBuilderProps): PanelInstanceProps => {
  return {
    id: "ControlConfigPanel",
    header: "Control",
    children: <ControlConfigPanelBody />,
    icon: <FiberManualRecordIcon fontSize="large" />
  };
};
