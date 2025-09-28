/* nodes/switch-logic.js */
module.exports = function (RED) {
  function SwitchLogicNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.hubitat = RED.nodes.getNode(config.server);
    node.name = config.name || '';
    node.deviceId = Array.isArray(config.deviceId)
      ? config.deviceId
      : (config.deviceId ? [config.deviceId] : []);
    node.targetValue = config.targetValue || 'on';
    node.mode = config.mode || 'all';
    // if true, emit an immediate "true" event message on flip to true
    node.sendEvents = !!config.sendEvents;

    // runtime state
    const deviceStates = {};   // deviceId -> latest value (e.g. "on" / "off")
    let logicState = null;     // true/false
    let lastFlip = null;       // Date of last flip

    const deviceListeners = {}; // deviceId -> callback
    let systemStartCallback = null;

    function normalizeAttributeValue(device, attrName) {
      const attrs = device && device.attributes;
      if (!attrs) return undefined;

      if (Array.isArray(attrs)) {
        const found = attrs.find(a => a && (a.name === attrName));
        if (!found) return undefined;
        return found.value ?? found.currentValue ?? found;
      }

      const attr = attrs[attrName];
      if (attr === undefined) return undefined;
      if (attr && typeof attr === 'object') {
        return attr.value ?? attr.currentValue ?? attr;
      }
      return attr;
    }

    async function initializeFromCache() {
      if (!node.hubitat) return;
      try {
        if (typeof node.hubitat.devicesFetcher === 'function') {
          await node.hubitat.devicesFetcher();
        }
      } catch (err) {
        node.warn(`Unable to fetch devices cache: ${err && err.message ? err.message : err}`);
      }

      node.deviceId.forEach((id) => {
        const dev = node.hubitat && node.hubitat.devices && node.hubitat.devices[id];
        if (dev) {
          const val = normalizeAttributeValue(dev, 'switch');
          if (val !== undefined) {
            deviceStates[id] = val;
          }
        }
      });

      // set initial aggregated logic state (don't consider this a flip)
      const newState = computeLogicState();
      logicState = newState;
      updateStatus();
    }

    function computeLogicState() {
      if (!node.deviceId || node.deviceId.length === 0) return false;
      const desired = node.targetValue;
      const values = node.deviceId.map(id => deviceStates[id]);
      if (node.mode === 'all') {
        return values.length > 0 && values.every(v => v === desired);
      } else {
        return values.some(v => v === desired);
      }
    }

function updateStatus() {
  let stateText;
  if (logicState === null) {
    stateText = 'waiting for events';
  } else {
    const stamp = lastFlip ? lastFlip.toLocaleString() : '–';
    stateText = `${logicState ? 'TRUE' : 'FALSE'} ${stamp}`;
  }
  node.status({
    fill: logicState ? 'green' : 'grey',
    shape: node.sendEvents ? 'dot' : 'ring',
    text: stateText
  });
}


    function handleDeviceEvent(event) {
      if (!event || !event.deviceId) return;
      const deviceId = String(event.deviceId);
      if (event.name !== 'switch') return;

      const value = event.value;
      deviceStates[deviceId] = value;

      const newState = computeLogicState();
      if (newState !== logicState) {
        logicState = newState;
        lastFlip = new Date();
        updateStatus();
        if (logicState && node.sendEvents) {
          try {
            node.send({ payload: true });
          } catch (err) {
            node.warn(err && err.message ? err.message : err);
          }
        }
      } else {
        updateStatus();
      }
    }

    function attachListeners() {
      if (!node.hubitat || !node.hubitat.hubitatEvent) return;

      node.deviceId.forEach((id) => {
        const deviceId = String(id);
        const callback = (event) => {
          if (event && (event.deviceId === undefined) && event.id) {
            event.deviceId = event.id;
          }
          handleDeviceEvent(event);
        };

        const eventName = `device.${deviceId}`;
        deviceListeners[deviceId] = { eventName, callback };
        node.hubitat.hubitatEvent.on(eventName, callback);
      });

      systemStartCallback = async () => {
        await initializeFromCache();
      };
      node.hubitat.hubitatEvent.on('systemStart', systemStartCallback);
    }

    function detachListeners() {
      if (!node.hubitat || !node.hubitat.hubitatEvent) return;
      Object.keys(deviceListeners).forEach((deviceId) => {
        const { eventName, callback } = deviceListeners[deviceId] || {};
        if (eventName && callback) {
          node.hubitat.hubitatEvent.removeListener(eventName, callback);
        }
      });
      Object.keys(deviceListeners).forEach(k => delete deviceListeners[k]);
      if (systemStartCallback) {
        node.hubitat.hubitatEvent.removeListener('systemStart', systemStartCallback);
        systemStartCallback = null;
      }
    }

    (async () => {
      if (!node.hubitat) {
        node.error('Hubitat server not configured');
        updateStatus();
        return;
      }
      try {
        await initializeFromCache();
      } catch (err) {
        node.warn(`Initialization error: ${err && err.message ? err.message : err}`);
      }
      attachListeners();
    })();

    node.on('input', (msg, send, done) => {
      try {
        if (computeLogicState()) {
          send(msg);
        } else {
          send(null);
        }
      } catch (err) {
        node.error(err && err.message ? err.message : err);
      }
      if (done) done();
    });

    node.on('close', (removed, done) => {
      try {
        detachListeners();
      } catch (err) {
        node.warn(`Error detaching listeners: ${err && err.message ? err.message : err}`);
      }
      if (done) done();
    });

    updateStatus();
  }

  RED.nodes.registerType('hubitat switch logic', SwitchLogicNode);
};
