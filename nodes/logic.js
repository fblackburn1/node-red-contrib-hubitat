/* eslint-disable no-param-reassign */
/* eslint-disable global-require */
module.exports = function HubitatLogicModule(RED) {
  const doneWithId = require('./utils/done-with-id');

  function HubitatLogicNode(config) {
    RED.nodes.createNode(this, config);
    this.hubitat = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.deviceType = config.deviceType;
    this.deviceId = config.deviceId;
    this.targetValue = config.targetValue;
    this.mode = config.mode;
    this.sendEvents = config.sendEvents;
    this.shape = this.sendEvents ? 'dot' : 'ring';
    this.currentStatusText = '';
    this.currentStatusFill = undefined;
    this.wsState = '';
    this.topic = this.name;
    const node = this;

    if (!node.hubitat) {
      node.error('Hubitat server not configured');
      return;
    }

    let logicState = null;
    let lastFlip = null;
    this.updateStatus = () => {
      let stateText;
      if (logicState === null) {
        stateText = 'waiting for events';
      } else {
        const modeText = node.mode || '';
        const targetText = node.targetValue || '';
        const resultText = logicState ? 'TRUE' : 'FALSE';
        const stamp = lastFlip ? lastFlip.toLocaleString() : '';
        stateText = `${modeText} ${targetText} ${resultText}${stamp ? ' ' + stamp : ''}`.trim();
      }
      node.status({
        fill: logicState ? 'green' : 'grey',
        shape: node.sendEvents ? 'dot' : 'ring',
        text: stateText
      });
    };

    async function initializeDevices() {
      try {
        await node.hubitat.devicesFetcher();
      } catch (err) {
        node.warn(`Unable to initialize devices: ${err.message}`);
        node.updateStatus('red', 'Uninitialized');
        throw err;
      }
    }

    function getDeviceState(deviceId) {
      const device = node.hubitat.devices[deviceId];
      if (!device) return null;
      // Map deviceType to attribute name
      const attrMap = {
        switch: 'switch',
        motion: 'motion',
        lock: 'lock',
        contact: 'contact',
        presence: 'presence'
      };
      const attr = attrMap[node.deviceType];
      if (!attr) return null;
      let attribute = null;
      if (Array.isArray(device.attributes)) {
        attribute = device.attributes.find(a => a && a.name === attr);
      } else {
        attribute = device.attributes[attr];
      }
      if (!attribute) return null;
      if (typeof attribute === 'object' && attribute.currentValue !== undefined) {
        return attribute.currentValue;
      }
      return attribute.value !== undefined ? attribute.value : attribute;
    }

    function matchesTargetValue(state) {
      if (state == null) return false;
      // For lock, handle 'unlocked with timeout' and 'unknown'
      if (node.deviceType === 'lock') {
        if (node.targetValue === 'unlocked with timeout') {
          return state === 'unlocked with timeout';
        }
        if (node.targetValue === 'unknown') {
          return state === 'unknown';
        }
      }
      return state === node.targetValue;
    }

    function computeLogicState() {
      if (!node.deviceId || node.deviceId.length === 0) return false;
      const values = node.deviceId.map(id => getDeviceState(id));
      if (node.mode === 'all') {
        return values.length > 0 && values.every(v => matchesTargetValue(v));
      } else {
        return values.some(v => matchesTargetValue(v));
      }
    }

    const eventCallback = async (event) => {
      node.debug(`Event received: ${JSON.stringify(event)}`);
      if (node.hubitat.devicesInitialized !== true) {
        try {
          await initializeDevices();
        } catch (err) {
          return;
        }
      }
      if (!node.deviceId.includes(event.deviceId)) return;
      // Update device state and compute logic
      const state = getDeviceState(event.deviceId);
      const newState = computeLogicState();
      if (newState !== logicState) {
        logicState = newState;
        lastFlip = new Date();
        node.updateStatus();
        if (logicState && node.sendEvents) {
          node.send({ payload: { ...event, state }, topic: node.topic });
        }
      } else {
        node.updateStatus();
      }
    };

    const systemStartCallback = async () => {
      try {
        await initializeDevices();
      } catch (err) {
        return;
      }
      node.updateStatus();
    };

    if (Array.isArray(node.deviceId)) {
      node.deviceId.forEach(id => {
        node.hubitat.hubitatEvent.on(`device.${id}`, eventCallback);
      });
      node.hubitat.hubitatEvent.on('systemStart', systemStartCallback);
    }

    const wsOpened = async () => {
      node.updateStatus(node.currentStatusFill, node.currentStatusText);
    };
    node.hubitat.hubitatEvent.on('websocket-opened', wsOpened);
    const wsClosed = async () => {
      node.updateStatus(node.currentStatusFill, node.currentStatusText);
    };
    node.hubitat.hubitatEvent.on('websocket-closed', wsClosed);
    node.hubitat.hubitatEvent.on('websocket-error', wsClosed);

    (async () => {
      try {
        await initializeDevices();
      } catch (err) {
        node.warn(`Initialization error: ${err && err.message ? err.message : err}`);
      }
      // Compute initial state and update status after deploy
      logicState = computeLogicState();
      node.updateStatus();
    })();

    node.on('input', async (msg, send, done) => {
      node.debug('Input received');
      if (node.hubitat.devicesInitialized !== true) {
        try {
          await initializeDevices();
        } catch (err) {
          return;
        }
      }
      const deviceIds = ((msg.deviceId !== undefined) ? msg.deviceId : node.deviceId);
      if (!deviceIds || deviceIds.length === 0) {
        const errorMsg = 'Undefined device ID(s)';
        node.updateStatus();
        doneWithId(node, done, errorMsg);
        return;
      }
      const states = deviceIds.map(id => getDeviceState(id));
      const newState = computeLogicState();
      if (newState !== logicState) {
        logicState = newState;
        lastFlip = new Date();
      }
      node.updateStatus();
      if (logicState) {
        send(msg);
      } else {
        send(null);
      }
      done();
    });

    node.on('close', () => {
      node.debug('Closed');
      if (Array.isArray(node.deviceId)) {
        node.deviceId.forEach(id => {
          node.hubitat.hubitatEvent.removeListener(`device.${id}`, eventCallback);
        });
        node.hubitat.hubitatEvent.removeListener('systemStart', systemStartCallback);
      }
      node.hubitat.hubitatEvent.removeListener('websocket-opened', wsOpened);
      node.hubitat.hubitatEvent.removeListener('websocket-closed', wsClosed);
      node.hubitat.hubitatEvent.removeListener('websocket-error', wsClosed);
    });
  }

  RED.nodes.registerType('hubitat logic', HubitatLogicNode);
};
