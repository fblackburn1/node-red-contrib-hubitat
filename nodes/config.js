/* eslint-disable no-console */
/* eslint-disable global-require */
module.exports = function HubitatConfigModule(RED) {
  const fetch = require('node-fetch');
  const bodyParser = require('body-parser');
  const cookieParser = require('cookie-parser');
  const events = require('events');

  const MAXLISTERNERS = 500;
  const MAXSIMULTANEOUSREQUESTS = 4; // 4 simultaneous requests seem to never cause issue

  let requestPool = MAXSIMULTANEOUSREQUESTS;
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
    this.token = this.credentials.token;
    this.appId = this.credentials.appId;
    this.nodeRedServer = config.nodeRedServer;
    this.webhookPath = config.webhookPath;
    this.hubitatEvent = new events.EventEmitter();
    this.hubitatEvent.setMaxListeners(MAXLISTERNERS);

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

        const { content } = req.body;
        node.hubitatEvent.emit('event', content);
        if (content.deviceId != null) {
          node.hubitatEvent.emit(`device.${content.deviceId}`, content);
        } else if (content.name === 'mode') {
          node.hubitatEvent.emit('mode', content);
        } else if (content.name.startsWith('hsm')) {
          // pass
        } else if (content.deviceId === null) {
          // There are no specific condition to know if it's a location event
          // One of property seems to have a deviceId === null
          node.hubitatEvent.emit('location', content);
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

  RED.nodes.registerType('hubitat config', HubitatConfigNode, {
    credentials: {
      appId: { type: 'text' },
      token: { type: 'text' },
    },
  });

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
      if (!response.ok) { throw response; }
      res.json(await response.json());
    } catch (err) {
      let message = err;
      if (err.text) {
        message = await err.text();
        res.sendStatus(err.status);
      } else {
        res.sendStatus(500);
      }
      console.log(`ERROR ${req.path}: ${message}`);
    }
  });

  RED.httpAdmin.get('/hubitat/modes', RED.auth.needsPermission('hubitat.read'), async (req, res) => {
    if ((!req.query.host) || (!req.query.port) || (!req.query.appId) || (!req.query.token)) {
      console.log(`ERROR: ${req.originalUrl} missing parameters (required: host, port, appId, token)`);
      res.sendStatus(404);
      return;
    }
    const scheme = ((req.query.usetls === 'true') ? 'https' : 'http');
    const baseUrl = `${scheme}://${req.query.host}:${req.query.port}/apps/api/${req.query.appId}`;
    const options = { method: 'GET' };
    let url = `${baseUrl}/modes`;
    console.log(`GET ${url}`);
    url = `${url}?access_token=${req.query.token}`;

    let modes;
    try {
      const response = await fetch(url, options);
      if (response.status >= 400) {
        throw new Error(await response.text());
      }
      modes = await response.json();
    } catch (err) {
      console.log(`ERROR ${req.path}: ${err}`);
      res.sendStatus(400);
      return;
    }

    modes.sort((first, second) => first.name.localeCompare(second.name));
    res.json(modes);
  });
};
