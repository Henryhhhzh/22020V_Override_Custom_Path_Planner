import { Box, Button, MenuItem, Select, SelectChangeEvent, Typography } from "@mui/material";
import TimelineIcon from "@mui/icons-material/Timeline";
import { action } from "mobx";
import { observer } from "mobx-react-lite";
import { PanelBox } from "@src/app/component.blocks/PanelBox";
import { PanelBuilderProps, PanelInstanceProps } from "@core/Layout";
import { getAppStores } from "@core/MainApp";
import { SimulationMode, canUseRamseteSimulation, getEntireRouteSimulationPaths } from "@core/Simulation";

import "./SimulationPanel.scss";

function formatNumber(value: number | undefined, digits: number = 2) {
  return value === undefined || Number.isFinite(value) === false ? "-" : value.toFixed(digits);
}

function formatRadius(value: number | undefined) {
  return value === undefined ? "Straight" : `${formatNumber(value)} in`;
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const SimulationPanelBody = observer(() => {
  const { app } = getAppStores();
  const simulation = app.simulation;
  const selectedPath = simulation.selectedPath;
  const current = simulation.current;
  const route = simulation.route;
  const canUseRamsete = canUseRamseteSimulation(app);
  const entireRoutePathCount = getEntireRouteSimulationPaths(app).length;
  const isSelectedRun = simulation.isRunning && simulation.activeScope === "selected";
  const isEntireRun = simulation.isRunning && simulation.activeScope === "entire";

  const onModeChange = action((event: SelectChangeEvent<SimulationMode>) => {
    simulation.mode = event.target.value as SimulationMode;
  });

  return (
    <Box id="SimulationPanel">
      <Typography gutterBottom>Mode</Typography>
      <PanelBox>
        <Select
          size="small"
          sx={{ minWidth: "8rem" }}
          value={simulation.mode}
          renderValue={value => (value === "ramsete" ? "Ramsete" : "Visual")}
          onChange={onModeChange}>
          <MenuItem value="ramsete">Ramsete</MenuItem>
          <MenuItem value="visual">Visual</MenuItem>
        </Select>
        <Typography variant="body2" className="SimulationPanel-Status">
          {simulation.mode === "ramsete" && !canUseRamsete
            ? "Visual fallback"
            : formatStatus(route?.mode ?? simulation.mode)}
        </Typography>
      </PanelBox>

      <PanelBox flexWrap="wrap">
        <Button
          className="SimulationPanel-Button"
          variant={isSelectedRun ? "contained" : "outlined"}
          color={isSelectedRun ? "error" : "primary"}
          disabled={(simulation.isRunning && !isSelectedRun) || selectedPath === undefined}
          onClick={isSelectedRun ? simulation.stop : simulation.runSelectedPath}>
          {isSelectedRun ? "Stop" : "Run Selected Path"}
        </Button>
        <Button
          className="SimulationPanel-Button"
          variant={isEntireRun ? "contained" : "outlined"}
          color={isEntireRun ? "error" : "primary"}
          disabled={(simulation.isRunning && !isEntireRun) || entireRoutePathCount === 0}
          onClick={isEntireRun ? simulation.stop : simulation.runEntireRoute}>
          {isEntireRun ? "Stop" : "Run Entire Route"}
        </Button>
      </PanelBox>

      <PanelBox flexWrap="wrap">
        <Typography variant="body2" sx={{ minWidth: "11rem" }}>
          Selected: {selectedPath?.name ?? "-"}
        </Typography>
        <Typography variant="body2" sx={{ minWidth: "11rem" }}>
          Current: {current?.path.name ?? "-"}
        </Typography>
      </PanelBox>
      <PanelBox flexWrap="wrap">
        <Typography variant="body2" sx={{ minWidth: "8rem" }}>
          Status: {formatStatus(simulation.status)}
        </Typography>
        <Typography variant="body2" sx={{ minWidth: "9rem" }}>
          Time: {formatNumber(current?.time)} / {formatNumber(route?.totalTime)} s
        </Typography>
      </PanelBox>
      <PanelBox flexWrap="wrap">
        <Typography variant="body2" sx={{ minWidth: "6.4rem" }}>
          X: {formatNumber(current?.xIn)} in
        </Typography>
        <Typography variant="body2" sx={{ minWidth: "6.4rem" }}>
          Y: {formatNumber(current?.yIn)} in
        </Typography>
        <Typography variant="body2" sx={{ minWidth: "8rem" }}>
          Heading: {formatNumber(current === undefined ? undefined : (current.thetaRad * 180) / Math.PI)}°
        </Typography>
      </PanelBox>
      <PanelBox flexWrap="wrap">
        <Typography variant="body2" sx={{ minWidth: "7.4rem" }}>
          V: {formatNumber(current?.vIps)} in/s
        </Typography>
        <Typography variant="body2" sx={{ minWidth: "8.2rem" }}>
          Omega: {formatNumber(current?.omegaRadps)} rad/s
        </Typography>
        <Typography variant="body2" sx={{ minWidth: "8.6rem" }}>
          Radius: {formatRadius(current?.radiusIn)}
        </Typography>
      </PanelBox>
    </Box>
  );
});

export const SimulationPanel = (props: PanelBuilderProps): PanelInstanceProps => {
  return {
    id: "SimulationPanel",
    header: "Simulate",
    children: <SimulationPanelBody />,
    icon: <TimelineIcon fontSize="large" />
  };
};
