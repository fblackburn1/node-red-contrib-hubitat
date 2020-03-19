/* eslint-disable no-console */
/* eslint-disable global-require */
module.exports = function HubitatConfigModule(RED) {
  const fetch = require('node-fetch');
  const bodyParser = require('body-parser');
  const cookieParser = require('cookie-parser');

  const nodes = {};
  let requestPool = 4; // 4 simultaneous requests seem to never cause issue

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async function acquireLock() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (requestPool) {
        requestPool -= 1;
        return;
      }
      // eslint-disable-next-line no-await-in-loop
      await sleep(40);
    }
  }

  function releaseLock() {
    requestPool += 1;
  }

  function HubitatConfigNode(config) {
    RED.nodes.createNode(this, config);
    this.name = config.name;
    this.usetls = config.usetls;
    this.host = config.host;
    this.port = config.port;
    this.token = config.token;
    this.appId = config.appId;
    this.nodeRedServer = config.nodeRedServer;
    this.webhookPath = config.webhookPath;
    this.callbacks = [];

    const scheme = ((this.usetls) ? 'https' : 'http');
    this.baseUrl = `${scheme}://${this.host}:${this.port}/apps/api/${this.appId}`;

    const node = this;

    if ((!node.host) || (!node.port) || (!node.token) || (!node.appId)) {
      return;
    }
    
    node.getMode = async () => {
      const url = `${node.baseUrl}/modes?access_token=${node.token}`;
      const options = { method: 'GET' };
      let mode;
      try {
        await acquireLock();
        const response = await fetch(url, options);
        if (response.status >= 400) {
          throw new Error(await response.text());
        }
        mode = await response.json();
      } catch (err) {
        node.warn(`Unable to fetch modes: ${err}`);
        throw err;
      } finally {
        releaseLock();
      }

      node.debug(`mode: ${JSON.stringify(mode)}`);
      return mode;
    };

    node.getHsm = async () => {
      const url = `${node.baseUrl}/hsm?access_token=${node.token}`;
      const options = { method: 'GET' };
      let hsm;
      try {
        await acquireLock();
        const response = await fetch(url, options);
        if (response.status >= 400) {
          throw new Error(await response.text());
        }
        hsm = await response.json();
      } catch (err) {
        node.warn(`Unable to fetch hsm: ${err}`);
        throw err;
      } finally {
        releaseLock();
      }

      node.debug(`hsm: ${JSON.stringify(hsm)}`);
      return hsm;
    };

    node.getDevice = async (deviceId) => {
      const url = `${node.baseUrl}/devices/${deviceId}?access_token=${node.token}`;
      const options = { method: 'GET' };
      let device;

      try {
        await acquireLock();
        const response = await fetch(url, options);
        if (response.status >= 400) {
          throw new Error(await response.text());
        }
        device = await response.json();
      } catch (err) {
        node.warn(`Unable to fetch device(${deviceId}): ${err}`);
        throw err;
      } finally {
        releaseLock();
      }
      device.attributes = device.attributes.filter(
        (attribute, index, self) => index === self.findIndex((t) => (t.name === attribute.name)),
      );

      node.debug(`device: ${JSON.stringify(device)}`);
      return device;
    };

    node.unregisterCallback = (parent, deviceId, callback) => {
      if (node.callbacks[deviceId]) {
        node.callbacks[deviceId] = node.callbacks[deviceId].filter((c) => c.callback !== callback);
        if (node.callbacks[deviceId].length === 0) {
          delete node.callbacks[deviceId];
        }
      }
    };

    node.registerCallback = (parent, deviceId, callback) => {
      if (!(deviceId in node.callbacks)) {
        node.callbacks[deviceId] = [];
      }

      node.callbacks[deviceId].push({ parent, callback });
    };

    nodes[node.baseUrl] = node;

    if (RED.settings.httpNodeRoot !== false) {
      if (!this.webhookPath) {
        this.webhookPath = '/hubitat/webhook';
        this.warn(`webhook url not set, set default to ${this.webhookPath}`);
      }
      if (!this.webhookPath.startsWith('/')) {
        this.webhookPath = `/${this.webhookPath}`;
      }
      node.log(`Starting endpoint for ${this.webhookPath}`);

      this.postCallback = (req, res) => {
        node.debug(`receive event on ${node.webhookPath}: ${JSON.stringify(req.body)}`);
        if (!req.body.content) {
          node.warn('No content in body');
          res.sendStatus(400);
          return;
        }

        let callback;
        if (req.body.content.deviceId != null) {
          callback = node.callbacks[req.body.content.deviceId];
        } else if (req.body.content.name === 'mode') {
          [callback] = node.callbacks;
        } else if (req.body.content.name.startsWith('hsm')) {
          if ((req.body.content.name === 'hsmStatus') || (req.body.content.name === 'hsmAlert') || (req.body.content.name === 'hsmRules'))
            callback = node.callbacks[-1];
        } else if (req.body.content.deviceId === null) {
          callback = node.callbacks[-2];
        }

        if (callback) {
          callback.forEach((c) => {
            c.callback.call(c.parent, req.body.content);
          });
        }
        res.sendStatus(204);
      };

      this.webErrorHandler = (err, req, res, next) => {
        node.warn(err);
        res.sendStatus(500);
      };

      const maxApiRequestSize = RED.settings.apiMaxLength || '5mb';
      const jsonParser = bodyParser.json({ limit: maxApiRequestSize });
      const urlencParser = bodyParser.urlencoded({ limit: maxApiRequestSize, extended: true });
      RED.httpNode.post(
        this.webhookPath,
        cookieParser(),
        jsonParser,
        urlencParser,
        this.postCallback,
        this.webErrorHandler,
      );

      this.on('close', () => {
        // eslint-disable-next-line no-underscore-dangle
        RED.httpNode._router.stack.forEach((route, i, routes) => {
          if (route.route && route.route.path === node.webhookPath && route.route.methods.post) {
            routes.splice(i, 1);
          }
        });
      });
    }
  }

  RED.nodes.registerType('hubitat config', HubitatConfigNode);

  RED.httpAdmin.get('/hubitat/devices', RED.auth.needsPermission('hubitat.read'), async (req, res) => {
    if ((!req.query.host) || (!req.query.port) || (!req.query.appId) || (!req.query.token)) {
      console.log(`ERROR: ${req.originalUrl} missing parameters (required: host, port, appId, token)`);
      res.sendStatus(404);
      return;
    }
    const scheme = ((req.query.usetls === 'true') ? 'https' : 'http');
    const baseUrl = `${scheme}://${req.query.host}:${req.query.port}/apps/api/${req.query.appId}`;
    const options = { method: 'GET' };
    let url = `${baseUrl}/devices`;
    console.log(`GET ${url}`);
    url = `${url}?access_token=${req.query.token}`;

    let devices;
    try {
      const response = await fetch(url, options);
      if (response.status >= 400) {
        throw new Error(await response.text());
      }
      devices = await response.json();
    } catch (err) {
      console.log(`ERROR ${req.path}: ${err}`);
      res.sendStatus(400);
      return;
    }

    devices.sort((first, second) => first.label.localeCompare(second.label));
    res.json(devices);
    // Check if the result should not be [{deviceId: 1, label: light}, ...]
  });

  RED.httpAdmin.get('/hubitat/devices/:deviceId/commands', RED.auth.needsPermission('hubitat.read'), async (req, res) => {
    if ((!req.query.host) || (!req.query.port) || (!req.query.appId) || (!req.query.token)) {
      console.log(`ERROR: ${req.originalUrl} missing parameters (required: host, port, appId, token)`);
      res.sendStatus(404);
      return;
    }
    const scheme = ((req.query.usetls === 'true') ? 'https' : 'http');
    const baseUrl = `${scheme}://${req.query.host}:${req.query.port}/apps/api/${req.query.appId}`;
    const options = { method: 'GET' };
    let url = `${baseUrl}/devices/${req.params.deviceId}/commands`;
    console.log(`GET ${url}`);
    url = `${url}?access_token=${req.query.token}`;

    try {
      const response = await fetch(url, options);
      if (response.status >= 400) {
        throw new Error(await response.text());
      }
      res.json(await response.json());
    } catch (err) {
      console.log(`ERROR ${req.path}: ${err}`);
      res.sendStatus(400);
    }
  });

  RED.httpAdmin.get('/hubitat/devices/:deviceId', RED.auth.needsPermission('hubitat.read'), async (req, res) => {
    if ((!req.query.host) || (!req.query.port) || (!req.query.appId) || (!req.query.token)) {
      console.log(`ERROR: ${req.originalUrl} missing parameters (required: host, port, appId, token)`);
      res.sendStatus(404);
      return;
    }
    const scheme = ((req.query.usetls === 'true') ? 'https' : 'http');
    const baseUrl = `${scheme}://${req.query.host}:${req.query.port}/apps/api/${req.query.appId}`;
    const options = { method: 'GET' };
    let url = `${baseUrl}/devices/${req.params.deviceId}`;
    console.log(`GET ${url}`);
    url = `${url}?access_token=${req.query.token}`;

    try {
      const response = await fetch(url, options);
      if (response.status >= 400) {
        throw new Error(await response.text());
      }
      res.json(await response.json());
    } catch (err) {
      console.log(`ERROR ${req.path}: ${err}`);
      res.sendStatus(400);
    }
  });

  RED.httpAdmin.post('/hubitat/configure', RED.auth.needsPermission('hubitat.write'), async (req, res) => {
    // eslint-disable-next-line max-len
    if ((!req.body.host) || (!req.body.port) || (!req.body.appId) || (!req.body.token) || (!req.body.nodeRedServer)) {
      console.log(`ERROR: ${req.originalUrl} missing parameters (required: host, port, appId, token, nodeRedServer)`);
      res.sendStatus(404);
      return;
    }
    const scheme = ((req.body.usetls === 'true') ? 'https' : 'http');
    const baseUrl = `${scheme}://${req.body.host}:${req.body.port}/apps/api/${req.body.appId}`;
    const options = { method: 'GET' };
    const nodeRedURL = encodeURIComponent(`${req.body.nodeRedServer}${req.body.webhookPath}`);
    let url = `${baseUrl}/postURL/${nodeRedURL}`;
    console.log(`GET ${url}`);
    url = `${url}?access_token=${req.body.token}`;

    try {
      const response = await fetch(url, options);
      if (response.status >= 400) {
        throw new Error(await response.text());
      }
      res.json(await response.json());
    } catch (err) {
      console.log(`ERROR ${req.path}: ${err}`);
      res.sendStatus(400);
    }
  });
};
