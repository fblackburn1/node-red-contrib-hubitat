/* eslint-disable no-console */
/* eslint-disable global-require */
module.exports = function HubitatConfigModule(RED) {
  const fetch = require('node-fetch');
  const bodyParser = require('body-parser');
  const cookieParser = require('cookie-parser');
  const events = require('events');
  const WebSocket = require('ws');

  const MAXLISTERNERS = 500;
  const MAXSIMULTANEOUSREQUESTS = 4; // 4 simultaneous requests seem to never cause issue

  function castHubitatValue(node, dataType, event) {
    const { value } = event;

    function defaultAction() {
      if (!node.devicesWarning[event.deviceId]) {
        node.warn(`\
The device (${event.deviceId}) sends an event (${event.name}) with non-official dataType (${dataType}). \
The default behaviour is to leave the attribute value (${value}) as string. \
It may result in a difference when getting attribute value with input vs event (e.g., json vs string). \
You should report back this issue to the device driver maintainer. \
Supported dataType: https://docs.hubitat.com/index.php?title=Attribute_Object \
        `);
        // eslint-disable-next-line no-param-reassign
        node.devicesWarning[event.deviceId] = true;
      }

      return value;
    }

    if (typeof value !== 'string') {
      return value;
    }
    switch (dataType) {
      case 'STRING':
      case 'ENUM':
      case 'DATE':
      case 'JSON_OBJECT': // Maker API always return it as String
        return value;
      case 'NUMBER':
        return parseFloat(value);
      case 'BOOL':
        return value === 'true';
      case 'VECTOR3': {
        if (value === 'null') {
          return null;
        }
        if (!value) {
          return value;
        }
        const threeAxesRegexp = new RegExp(/^\[([xyz]:.*),([xyz]:.*),([xyz]:.*)\]$/, 'i');
        const threeAxesMatch = value.match(threeAxesRegexp);
        if (threeAxesMatch) {
          const result = {};
          for (let i = 1; i < 4; i += 1) {
            const [axis, point] = threeAxesMatch[i].split(':', 2);
            result[axis] = parseFloat(point);
          }
          return result;
        }
        // Some devices use VECTOR3 for range (ex: Ecobee4 thermostat)
        const rangeRegexp = new RegExp(/^\[(.*),(.*)\]$/);
        const rangeMatch = value.match(rangeRegexp);
        if (rangeMatch) {
          const result = [];
          for (let i = 1; i < 3; i += 1) {
            result.push(parseFloat(rangeMatch[i]));
          }
          return result;
        }
        return defaultAction();
      }
      default:
        return defaultAction();
    }
  }

  function HubitatConfigNode(config) {
    RED.nodes.createNode(this, config);

    this.name = config.name;
    this.usetls = config.usetls;
    this.host = config.host;
    this.port = config.port;
    this.appId = config.appId;
    this.nodeRedServer = config.nodeRedServer;
    this.webhookPath = config.webhookPath;
    this.autoRefresh = config.autoRefresh;
    this.useWebsocket = config.useWebsocket;
    this.wsStatusOk = false;
    this.wsFirstInitPending = true;
    this.hubitatEvent = new events.EventEmitter();
    this.hubitatEvent.setMaxListeners(MAXLISTERNERS);
    this.devices = {};
    this.devicesWarning = {};
    this.expiredDevices = {};
    this.devicesInitialized = false;

    this.requestPool = MAXSIMULTANEOUSREQUESTS;

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    this.acquireLock = async () => {
      this.debug('Acquiring lock...');
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (this.requestPool) {
          this.requestPool -= 1;
          this.debug(`Lock acquired. Remaining: ${this.requestPool}/${MAXSIMULTANEOUSREQUESTS}`);
          return;
        }
        // eslint-disable-next-line no-await-in-loop
        await sleep(40);
      }
    };

    this.releaseLock = () => {
      this.requestPool += 1;
      this.debug(`Lock released. Remaining: ${this.requestPool}/${MAXSIMULTANEOUSREQUESTS}`);
    };

    const scheme = ((this.usetls) ? 'https' : 'http');
    this.baseUrl = `${scheme}://${this.host}:${this.port}/apps/api/${this.appId}`;

    const node = this;

    if (this.credentials) {
      this.token = this.credentials.token;
    }

    if ((!node.host) || (!node.port) || (!node.appId)) {
      return;
    }

    node.getMode = async () => {
      const url = `${node.baseUrl}/modes?access_token=${node.token}`;
      const options = { method: 'GET' };
      let mode;
      try {
        await node.acquireLock();
        const response = await fetch(url, options);
        if (response.status >= 400) {
          throw new Error(await response.text());
        }
        mode = await response.json();
      } catch (err) {
        node.warn(`Unable to fetch modes: ${err}`);
        throw err;
      } finally {
        node.releaseLock();
      }

      node.debug(`mode: ${JSON.stringify(mode)}`);
      return mode;
    };

    node.devicesFetcher = async () => {
      if (node.devicesInitialized === true) {
        return;
      }
      if (node.devicesInitialized === 'pending') {
        await sleep(40);
        await node.devicesFetcher();
        return;
      }
      node.devicesInitialized = 'pending';

      const url = `${node.baseUrl}/devices/*?access_token=${node.token}`;
      const options = { method: 'GET' };
      let devices;
      try {
        await node.acquireLock();
        const response = await fetch(url, options);
        if (response.status >= 400) {
          throw new Error(await response.text());
        }
        devices = await response.json();
      } catch (err) {
        node.warn(`Unable to fetch devices: ${err}`);
        node.devicesInitialized = false;
        throw err;
      } finally {
        node.releaseLock();
      }

      // convert list to map + refactor
      devices = devices.reduce((obj, device) => {
        // remove duplicate attribute name
        // eslint-disable-next-line no-param-reassign
        device.attributes = device.attributes.filter(
          (attribute, index, self) => index === self.findIndex(
            (t) => (t.name === attribute.name),
          ),
        );
        // convert to map + add default attributes
        // eslint-disable-next-line no-param-reassign
        device.attributes = device.attributes.reduce((obj_, attr) => {
          // eslint-disable-next-line no-param-reassign
          obj_[attr.name] = { ...attr, value: attr.currentValue, deviceId: device.id };
          return obj_;
        }, {});
        // eslint-disable-next-line no-param-reassign
        obj[device.id] = device;
        return obj;
      }, {});

      node.debug(`devices: ${JSON.stringify(devices)}`);
      node.devices = devices;
      node.devicesWarning = Object.keys(devices).reduce((obj_, id) => {
        // eslint-disable-next-line no-param-reassign
        obj_[id] = false;
        return obj_;
      }, {});
      node.devicesInitialized = true;
    };

    node.getHsm = async () => {
      const url = `${node.baseUrl}/hsm?access_token=${node.token}`;
      const options = { method: 'GET' };
      let hsm;
      try {
        await node.acquireLock();
        const response = await fetch(url, options);
        if (response.status >= 400) {
          throw new Error(await response.text());
        }
        hsm = await response.json();
      } catch (err) {
        node.warn(`Unable to fetch hsm: ${err}`);
        throw err;
      } finally {
        node.releaseLock();
      }

      node.debug(`hsm: ${JSON.stringify(hsm)}`);
      return hsm;
    };
    node.updateDevice = (event) => {
      if (!node.devices[event.deviceId] || node.devices[event.deviceId].attributes === undefined) {
        node.debug(`Untracking device event received: ${JSON.stringify(event)}`);
        return;
      }
      const attribute = node.devices[event.deviceId].attributes[event.name];
      attribute.value = castHubitatValue(node, attribute.dataType, event);
      attribute.currentValue = attribute.value; // deprecated since 0.0.18
    };

    function eventDispatcher(event) {
      if (node.autoRefresh && event.name === 'systemStart') {
        node.log('Resynchronize all hubitat\'s nodes');
        node.expiredDevices = node.devices;
        node.devices = {};
        node.devicesInitialized = false;
        node.hubitatEvent.emit('systemStart');
      }
      node.hubitatEvent.emit('event', event);
      if (event.deviceId) { // webhook: deviceId=null, websocket: deviceId=0
        node.updateDevice(event);
        node.hubitatEvent.emit(`device.${event.deviceId}`, event);
      } else if (event.name === 'mode') {
        node.hubitatEvent.emit('mode', event);
      } else if (event.name.startsWith('hsm')) {
        if (['hsmStatus', 'hsmAlert', 'hsmRules'].includes(event.name)) {
          node.hubitatEvent.emit('hsm', event);
        }
      } else if (event.deviceId === null) {
        // There are no specific condition to know if it's a location event
        // One of property seems to have a deviceId === null
        node.hubitatEvent.emit('location', event);
      }
    }

    if (this.useWebsocket) {
      node.closing = false;
      const reconnectDelays = [
        3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, // 3s * 10 = 30sec
        15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000,
        15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, 15000, // 15s * 20 = 5min
        60000, // 1min
      ];
      let reconnectAttempt = 0;

      const startWebsocket = () => {
        node.reconnectTimeout = null;
        node.pingTimeout = null;
        const wsScheme = ((this.usetls) ? 'wss' : 'ws');
        const socket = new WebSocket(`${wsScheme}://${node.host}:${this.port}/eventsocket`);
        socket.setMaxListeners(0);
        node.wsServer = socket; // keep for closing

        const reconnect = (cause) => {
          node.debug(`Websocket reconnection triggered by "${cause}" event`);
          clearTimeout(node.reconnectTimeout);
          const delay = (
            reconnectDelays[reconnectAttempt] || reconnectDelays[reconnectDelays.length - 1]
          );
          node.reconnectTimeout = setTimeout(() => { startWebsocket(); }, delay);
        };
        const heartbeat = () => {
          clearTimeout(this.pingTimeout);
          // Use `WebSocket#terminate()`, which immediately destroys the connection,
          // instead of `WebSocket#close()`, which waits for the close timer.
          // Delay should be equal to the interval at which your server
          // sends out pings plus a conservative assumption of the latency.
          this.pingTimeout = setTimeout(() => {
            socket.terminate(); // terminate seems to trigger a close event
          }, 120000 + 10000); // server sends ping with 2 min interval + 10 sec for latency
        };

        socket.on('open', () => {
          node.log('Websocket connected');
          node.wsStatusOk = true;
          node.wsFirstInitPending = false;
          node.hubitatEvent.emit('websocket-opened');
          reconnectAttempt = 0;
          heartbeat();
        });
        socket.on('ping', heartbeat);
        socket.on('close', () => {
          node.log('Websocket closed');
          node.wsStatusOk = false;
          node.wsFirstInitPending = false;
          node.hubitatEvent.emit('websocket-closed');
          clearTimeout(this.pingTimeout);
          if (!node.closing) {
            reconnect('close');
          }
        });
        socket.on('message', (data) => {
          try {
            const event = JSON.parse(data);
            if (event) {
              eventDispatcher(event);
            }
          } catch (err) {
            // ignore error
          }
        });
        socket.on('error', (err) => {
          node.error(`Websocket error: ${JSON.stringify(err)}`);
          node.wsStatusOk = false;
          node.wsFirstInitPending = false;
          node.hubitatEvent.emit('websocket-error', { error: err });
          reconnectAttempt += 1;
          reconnect('error');
        });
      };
      startWebsocket();
    }

    if (!this.useWebsocket && RED.settings.httpNodeRoot !== false) {
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
        eventDispatcher(content);
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
    }

    this.on('close', () => {
      if (node.useWebsocket) {
        node.closing = true;
        clearTimeout(node.reconnectTimeout);
        node.wsServer.close();
      } else { // webhook
        // eslint-disable-next-line no-underscore-dangle
        RED.httpNode._router.stack.forEach((route, i, routes) => {
          if (route.route && route.route.path === node.webhookPath && route.route.methods.post) {
            routes.splice(i, 1);
          }
        });
      }
    });
  }

  RED.nodes.registerType('hubitat config', HubitatConfigNode, {
    credentials: { token: { type: 'text' } },
  });

  RED.httpAdmin.get('/hubitat/js/*', RED.auth.needsPermission('hubitat.read'), (req, res) => {
    const options = {
      root: `${__dirname}/static/`,
      dotfiles: 'deny',
    };
    res.sendFile(req.params[0], options);
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
    let { httpNodeRoot } = RED.settings;
    if (httpNodeRoot.slice(-1) === '/') {
      httpNodeRoot = httpNodeRoot.slice(0, -1);
    }
    const nodeRedURL = encodeURIComponent(`${req.body.nodeRedServer}${httpNodeRoot}${req.body.webhookPath}`);
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
