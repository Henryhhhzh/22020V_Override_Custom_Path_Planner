import { makeAutoObservable } from "mobx";
import { Typography } from "@mui/material";
import { FieldImageSignatureAndOrigin, FieldImageOriginType, getDefaultBuiltInFieldImage } from "@core/Asset";
import { UnitOfLength } from "@core/Unit";
import { ValidateNumber, clamp } from "@core/Util";
import { Expose, Type, Exclude } from "class-transformer";
import { IsPositive, IsBoolean, ValidateNested, IsObject, IsIn } from "class-validator";
import { GeneralConfig, initGeneralConfig } from "../Config";
import { Format } from "../Format";
import { getNamedCoordinateSystems } from "@src/core/CoordinateSystem";
import { RobotSensorOffsets, createDefaultRobotSensorOffsets } from "@core/RobotSensors";
import { observer } from "mobx-react-lite";
import { getAppStores } from "@core/MainApp";
import { UpdateProperties } from "@core/Command";
import { FormInputField } from "@src/app/component.blocks/FormInputField";
import { PanelBox } from "@src/app/component.blocks/PanelBox";

function isPositiveNumber(candidate: string) {
  const value = Number(candidate);
  return Number.isFinite(value) && value > 0;
}

const RamseteConfigPanel = observer((props: { config: GeneralConfigImpl }) => {
  const { app } = getAppStores();
  const { config } = props;

  return (
    <>
      <Typography marginTop="16px" gutterBottom>
        Ramsete
      </Typography>
      <PanelBox flexWrap="wrap">
        <FormInputField
          sx={{ width: "7rem" }}
          label="dt (s)"
          getValue={() => config.ramseteDt.toString()}
          setValue={(value: string) =>
            app.history.execute(
              `Change Ramsete dt`,
              new UpdateProperties(config, { ramseteDt: clamp(Number(value), 0.001, 1).toUser() })
            )
          }
          isValidIntermediate={() => true}
          isValidValue={isPositiveNumber}
          numeric
        />
        <FormInputField
          sx={{ width: "8rem" }}
          label="Max V (in/s)"
          getValue={() => config.ramseteMaxVelocity.toString()}
          setValue={(value: string) =>
            app.history.execute(
              `Change Ramsete max velocity`,
              new UpdateProperties(config, { ramseteMaxVelocity: clamp(Number(value), 1, 1000).toUser() })
            )
          }
          isValidIntermediate={() => true}
          isValidValue={isPositiveNumber}
          numeric
        />
        <FormInputField
          sx={{ width: "8rem" }}
          label="Max A (in/s^2)"
          getValue={() => config.ramseteMaxAcceleration.toString()}
          setValue={(value: string) =>
            app.history.execute(
              `Change Ramsete max acceleration`,
              new UpdateProperties(config, { ramseteMaxAcceleration: clamp(Number(value), 1, 5000).toUser() })
            )
          }
          isValidIntermediate={() => true}
          isValidValue={isPositiveNumber}
          numeric
        />
      </PanelBox>
    </>
  );
});

// observable class
export class GeneralConfigImpl implements GeneralConfig {
  @IsPositive()
  @Expose()
  robotWidth: number = 12;
  @IsPositive()
  @Expose()
  robotHeight: number = 12;
  @IsBoolean()
  @Expose()
  robotIsHolonomic: boolean = false;
  @IsBoolean()
  @Expose()
  showRobot: boolean = false;
  @Type(() => RobotSensorOffsets)
  @ValidateNested()
  @IsObject()
  @Expose()
  sensorOffsets: RobotSensorOffsets = createDefaultRobotSensorOffsets();
  @ValidateNumber(num => num > 0 && num <= 1000) // Don't use IsEnum
  @Expose()
  uol: UnitOfLength = UnitOfLength.Inch;
  @IsPositive()
  @Expose()
  pointDensity: number = 2; // inches
  @IsPositive()
  @Expose()
  controlMagnetDistance: number = 5 / 2.54;
  @Type(() => FieldImageSignatureAndOrigin)
  @ValidateNested()
  @IsObject()
  @Expose()
  fieldImage: FieldImageSignatureAndOrigin<FieldImageOriginType> =
    getDefaultBuiltInFieldImage().getSignatureAndOrigin();
  @IsIn(getNamedCoordinateSystems().map(s => s.name))
  @Expose()
  coordinateSystem: string = "VEX Gaming Positioning System";
  @ValidateNumber(num => num > 0 && num <= 1)
  @Expose()
  ramseteDt: number = 0.02;
  @ValidateNumber(num => num > 0)
  @Expose()
  ramseteMaxVelocity: number = 60;
  @ValidateNumber(num => num > 0)
  @Expose()
  ramseteMaxAcceleration: number = 120;
  @Exclude()
  private format_: Format;

  constructor(format: Format) {
    this.format_ = format;
    makeAutoObservable(this);

    initGeneralConfig(this);
  }

  get format() {
    return this.format_;
  }

  getAdditionalConfigUI() {
    return <RamseteConfigPanel config={this} />;
  }
}
