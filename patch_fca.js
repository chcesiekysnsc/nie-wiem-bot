const fs = require('fs');
const path = require('path');

// 1. Patch axios-cookiejar-support
const cookiejarPath = path.join(__dirname, 'node_modules/axios-cookiejar-support/dist/index.js');
if (fs.existsSync(cookiejarPath)) {
  let content = fs.readFileSync(cookiejarPath, 'utf8');
  
  // Replace Symbol with String
  content = content.replace(
    "const AGENT_CREATED_BY_AXIOS_COOKIEJAR_SUPPORT = Symbol('AGENT_CREATED_BY_AXIOS_COOKIEJAR_SUPPORT');",
    "const AGENT_CREATED_BY_AXIOS_COOKIEJAR_SUPPORT = 'AGENT_CREATED_BY_AXIOS_COOKIEJAR_SUPPORT';"
  );
  
  // Add early return check for already-wrapped agents
  const targetStr = `function requestInterceptor(config) {
    if (!config.jar) {
        return config;
    }`;
  
  const replacementStr = `function requestInterceptor(config) {
    if (!config.jar) {
        return config;
    }
    if ((config.httpAgent != null && config.httpAgent[AGENT_CREATED_BY_AXIOS_COOKIEJAR_SUPPORT] === true) ||
        (config.httpsAgent != null && config.httpsAgent[AGENT_CREATED_BY_AXIOS_COOKIEJAR_SUPPORT] === true)) {
        return config;
    }`;

  if (content.includes(targetStr) && !content.includes('AGENT_CREATED_BY_AXIOS_COOKIEJAR_SUPPORT] === true')) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync(cookiejarPath, content, 'utf8');
    console.log('[PATCH] Successfully patched axios-cookiejar-support');
  } else {
    console.log('[PATCH] axios-cookiejar-support already patched or target string not found');
  }
} else {
  console.log('[PATCH] axios-cookiejar-support not found');
}

// 2. Patch @dongdev/fca-unofficial
const fcaPath = path.join(__dirname, 'node_modules/@dongdev/fca-unofficial/dist/index.js');
if (fs.existsSync(fcaPath)) {
  let content = fs.readFileSync(fcaPath, 'utf8');
  
  const targetFcaStr = `function setProxy(proxyUrl) {
  if (!proxyUrl) {
    client.defaults.httpAgent = void 0;
    client.defaults.httpsAgent = void 0;
    client.defaults.proxy = false;
    return;
  }
  const agent = new import_https_proxy_agent.default(proxyUrl);
  client.defaults.httpAgent = agent;
  client.defaults.httpsAgent = agent;
  client.defaults.proxy = false;
}`;

  const replacementFcaStr = `function setProxy(proxyUrl) {
  if (!proxyUrl) {
    client.defaults.httpAgent = void 0;
    client.defaults.httpsAgent = void 0;
    client.defaults.proxy = false;
    return;
  }
  const { createCookieAgent } = require("http-cookie-agent/http");
  const HttpsProxyCookieAgent = createCookieAgent(import_https_proxy_agent.default);
  const agent = new HttpsProxyCookieAgent(proxyUrl, {
    cookies: { jar }
  });
  agent['AGENT_CREATED_BY_AXIOS_COOKIEJAR_SUPPORT'] = true;
  client.defaults.httpAgent = void 0;
  client.defaults.httpsAgent = agent;
  client.defaults.proxy = false;
}`;

  if (content.includes(targetFcaStr)) {
    content = content.replace(targetFcaStr, replacementFcaStr);
    fs.writeFileSync(fcaPath, content, 'utf8');
    console.log('[PATCH] Successfully patched @dongdev/fca-unofficial');
  } else {
    console.log('[PATCH] @dongdev/fca-unofficial already patched or target string not found');
  }
} else {
  console.log('[PATCH] @dongdev/fca-unofficial not found');
}
