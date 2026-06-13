import { Box, Card, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { Modal } from "./Modal";
import { APP_VERSION } from "@core/MainApp";
import { APP_BRAND_NAME, APP_SOURCE_URL } from "@core/AppIdentity";

import "./AboutModal.scss";

export const AboutModalSymbol = Symbol("AboutModal");

export const AboutModal = observer(() => {
  const InlineLink = (props: { href: string; children: React.ReactNode }) => (
    <Typography
      component="a"
      display="inline-block"
      margin="0 8px"
      target="_blank"
      rel="noreferrer"
      href={props.href}
      children={props.children}
    />
  );

  return (
    <Modal symbol={AboutModalSymbol}>
      <Card id="AboutModal" className="Modal-Container">
        <Box
          component="img"
          margin="auto"
          width="128px"
          display="block"
          src="static/logo512.png"
          alt={`${APP_BRAND_NAME} logo`}
        />
        <Typography variant="h3" gutterBottom align="center">
          {APP_BRAND_NAME} Version {APP_VERSION.version}
        </Typography>
        <Typography variant="body1" align="center" marginBottom="2rem">
          Modified GPL-3.0 fork of PATH.JERRYIO by Jerry Lum.
        </Typography>
        <Typography variant="body1" align="center">
          This is a free software licensed under GPL-3.0
        </Typography>
        <Typography variant="body1" align="center">
          <InlineLink href={APP_SOURCE_URL}>Source Code</InlineLink>
          <InlineLink href="https://www.tldrlegal.com/license/gnu-general-public-license-v3-gpl-3">License</InlineLink>
          <InlineLink href={`${APP_SOURCE_URL}/blob/main/PRIVACY.md`}>Privacy Terms</InlineLink>
          <InlineLink href="https://www.gnu.org/philosophy/free-sw.html">About Free Software</InlineLink>
          <InlineLink href="https://discord.gg/4uVSVXXBBa">Join Our Discord Server</InlineLink>
        </Typography>
      </Card>
    </Modal>
  );
});
