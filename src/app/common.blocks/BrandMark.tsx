import { Box, Typography } from "@mui/material";
import { getAppStores } from "@core/MainApp";
import { AppThemeType } from "@app/Theme";
import { observer } from "mobx-react-lite";
import { APP_BRAND_NAME } from "@core/AppIdentity";

export const BrandMark = observer((props: { variant?: "menu" | "dropdown" | "mobile"; showText?: boolean }) => {
  const { appPreferences } = getAppStores();
  const showText = props.showText ?? true;
  const logoSrc =
    appPreferences.themeType === AppThemeType.Light ? "/static/22020v-logo-red.png" : "/static/22020v-logo-white.png";
  const className = ["AppBrand", props.variant ? `AppBrand_${props.variant}` : "", !showText ? "AppBrand_iconOnly" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <Box className={className}>
      <Box
        component="img"
        className="AppBrand-Logo"
        src={logoSrc}
        alt={showText ? "" : APP_BRAND_NAME}
        draggable={false}
      />
      {showText && (
        <Typography component="span" className="AppBrand-Text">
          {APP_BRAND_NAME}
        </Typography>
      )}
    </Box>
  );
});
