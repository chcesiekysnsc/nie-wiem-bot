const login = require('@dongdev/fca-unofficial');
const fs = require('fs');
const path = require('path');

const appStatePath = path.join(__dirname, '..', 'appstate.json');
const appState = JSON.parse(fs.readFileSync(appStatePath, 'utf8'));

login({ appState }, (err, api) => {
  if (err) {
    console.error('Login failed:', err);
    process.exit(1);
  }

  const targetId = '61560227271099';
  const scales = [1, 1.5, 2, 3, 4];

  async function queryScale(scale) {
    const form = {
      av: api.getCurrentUserID(),
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: 'CometHovercardQueryRendererQuery',
      server_timestamps: true,
      doc_id: '24418640587785718',
      variables: JSON.stringify({
        actionBarRenderLocation: "WWW_COMET_HOVERCARD",
        context: "DEFAULT",
        entityID: targetId,
        scale: scale,
        __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false
      })
    };

    return new Promise((resolve) => {
      api.httpPost('https://www.facebook.com/api/graphql/', form, (err, resText) => {
        if (err) {
          console.error(`Error for scale ${scale}:`, err);
          resolve(null);
          return;
        }

        try {
          const res = JSON.parse(resText.replace('for (;;);', ''));
          const user = res?.data?.node?.comet_hovercard_renderer?.user;
          const pic = user?.profile_picture;
          resolve(pic);
        } catch (e) {
          console.error(`Parse error for scale ${scale}:`, e.message);
          resolve(null);
        }
      });
    });
  }

  async function run() {
    for (const scale of scales) {
      const pic = await queryScale(scale);
      console.log(`Scale ${scale} profile_picture:`, JSON.stringify(pic, null, 2));
    }
    process.exit(0);
  }

  run();
});
