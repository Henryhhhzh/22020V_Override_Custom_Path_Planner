import { Box, Typography } from "@mui/material";
import { BrandMark } from "../BrandMark";

export const WelcomeHero = () => (
  <Box className="WelcomeModal-Hero">
    <Box className="WelcomeModal-HeroCopy">
      <BrandMark variant="dropdown" />
      <Typography component="h1" className="WelcomeModal-HeroTitle">
        Welcome to 22020V Path Planner
      </Typography>
      <Typography className="WelcomeModal-HeroSubtitle">
        Design VEX paths, visualize robot sensors, and export LemLib-compatible paths including Ramsete trajectories.
      </Typography>
      <Box className="WelcomeModal-HeroPills" aria-hidden="true">
        <span>Sensor rays</span>
        <span>Ramsete export</span>
        <span>Offline PWA</span>
      </Box>
    </Box>
    <Box className="WelcomeModal-HeroPreview" aria-hidden="true">
      <span className="WelcomeModal-PreviewField" />
      <span className="WelcomeModal-PreviewPath WelcomeModal-PreviewPath_a" />
      <span className="WelcomeModal-PreviewPath WelcomeModal-PreviewPath_b" />
      <span className="WelcomeModal-PreviewRay WelcomeModal-PreviewRay_front" />
      <span className="WelcomeModal-PreviewRay WelcomeModal-PreviewRay_side" />
      <span className="WelcomeModal-PreviewBot" />
      <span className="WelcomeModal-PreviewPoint WelcomeModal-PreviewPoint_1" />
      <span className="WelcomeModal-PreviewPoint WelcomeModal-PreviewPoint_2" />
      <span className="WelcomeModal-PreviewPoint WelcomeModal-PreviewPoint_3" />
    </Box>
  </Box>
);
