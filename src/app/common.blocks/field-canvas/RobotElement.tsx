import { observer } from "mobx-react-lite";
import { EndControl, Vector } from "@core/Path";
import { FieldCanvasConverter } from "@core/Canvas";
import { Group, Line, Rect } from "react-konva";
import { getAppStores } from "@core/MainApp";
import { ROBOT_SENSOR_SIDES, getRobotSensorReadings } from "@core/RobotSensors";

const RobotElement = observer(
  (props: {
    fcc: FieldCanvasConverter;
    pos: EndControl;
    width: number;
    height: number;
    showSensors?: boolean;
    fill?: string;
    stroke?: string;
    frontStroke?: string;
    opacity?: number;
  }) => {
    const { app } = getAppStores();
    const widthInPx = props.width * props.fcc.uol2pixel;
    const heightInPx = props.height * props.fcc.uol2pixel;
    const startInUOL = props.pos.toVector();
    const startInPx = props.fcc.toPx(startInUOL);
    const centerInPx = new Vector(widthInPx / 2, heightInPx / 2);
    const frontInPx = centerInPx.add(new Vector(0, -heightInPx / 2));
    const sensorReadings = getRobotSensorReadings(app, props.pos);

    const lineWidth = props.fcc.heightInPx / 600;

    return (
      <>
        {(props.showSensors ?? true) &&
          ROBOT_SENSOR_SIDES.map(side => {
            const reading = sensorReadings[side];
            const start = props.fcc.toPx(reading.start);
            const end = props.fcc.toPx(reading.end);

            return (
              <Line
                key={side}
                points={[start.x, start.y, end.x, end.y]}
                stroke="#ff2222"
                strokeWidth={Math.max(lineWidth, 1)}
                opacity={0.9}
                listening={false}
              />
            );
          })}
        <Group
          rotation={props.pos.heading}
          x={startInPx.x}
          y={startInPx.y}
          offsetX={widthInPx / 2}
          offsetY={heightInPx / 2}
          opacity={props.opacity ?? 1}
          listening={false}>
          <Rect
            x={0}
            y={0}
            width={widthInPx}
            height={heightInPx}
            stroke={props.stroke ?? "#000"}
            strokeWidth={lineWidth}
            fill={props.fill ?? "#ffffff3f"}
          />
          <Line
            points={[centerInPx.x, centerInPx.y, frontInPx.x, frontInPx.y]}
            stroke={props.frontStroke ?? "#ffffff"}
            strokeWidth={lineWidth}
          />
        </Group>
      </>
    );
  }
);

export { RobotElement };
