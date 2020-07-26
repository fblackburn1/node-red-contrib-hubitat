/* eslint-disable no-param-reassign */
module.exports = function HubitatDeviceModule(RED) {
  function castHubitatValue(node, dataType, value) {
    function defaultAction() {
      node.warn(`Unable to cast to dataType. Open an issue to report back the following output: ${dataType}: ${value}`);
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

  function HubitatDeviceNode(config) {
    RED.nodes.createNode(this, config);

    this.hubitat = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.deviceId = config.deviceId;
    this.sendEvent = config.sendEvent;
    this.attribute = config.attribute;
    this.currentAttributes = undefined;
    this.shape = this.sendEvent ? 'dot' : 'ring';
    this.currentStatusText = '';
    this.currentStatusFill = undefined;
    this.currentStatusWs = 'NOK';
    this.wsState = '';
    const node = this;

    if (!node.hubitat) {
      node.error('Hubitat server not configured');
      return;
    }

    this.updateStatus = (fill = null, text = null) => {
      const status = { fill, shape: this.shape, text };
      node.currentStatusText = text;
      node.currentStatusFill = fill;

      if (fill === null) {
        delete status.shape;
        delete status.fill;
      }
      if (text === null) {
        delete status.text;
      }
      if (node.hubitat.useWebsocket) {
        if (fill === null) {
          status.fill = 'green';
          status.shape = this.shape;
        } else if (fill === 'blue') {
          status.fill = 'green';
        }
        if (node.currentStatusWs !== 'OK') {
          status.fill = 'red';
          status.text = 'WS ERROR';
        }
      }
      node.status(status);
    };

    async function initializeDevice() {
      return node.hubitat.initDevice(node.deviceId).then((device) => {
        node.currentAttributes = device.attributes;

        if (node.attribute) {
          const attribute = node.currentAttributes[node.attribute];
          if (!attribute) {
            throw new Error(`Selected attribute (${node.attribute}) is not handled by device`);
          }
          node.updateStatus('blue', `${node.attribute}: ${JSON.stringify(attribute.value)}`);
          node.log(`Initialized. ${node.attribute}: ${attribute.value}`);
        } else {
          node.updateStatus();
          node.log('Initialized');
        }
      }).catch((err) => {
        node.warn(`Unable to initialize device: ${err.message}`);
        node.updateStatus('red', 'Uninitialized');
        throw err;
      });
    }

    const eventCallback = async (event) => {
      node.debug(`Event received: ${JSON.stringify(event)}`);
      if (node.currentAttributes === undefined) {
        try {
          await initializeDevice();
        } catch (err) {
          return;
        }
      }
      const attribute = node.currentAttributes[event.name];
      if (!attribute) {
        node.updateStatus('red', `Unknown event: ${event.name}`);
        return;
      }
      attribute.value = castHubitatValue(node, attribute.dataType, event.value);
      attribute.currentValue = attribute.value; // deprecated since 0.0.18
      if ((node.attribute === event.name) || (!node.attribute)) {
        if (node.attribute) {
          node.updateStatus('blue', `${node.attribute}: ${JSON.stringify(attribute.value)}`);
          node.log(`${node.attribute}: ${attribute.value}`);
        } else {
          node.updateStatus();
          node.log('Attributes refreshed');
        }
        if (node.sendEvent) {
          const msg = { ...event, ...attribute };
          node.send({ payload: msg, topic: node.name });
        }
      }
    };
    this.hubitat.hubitatEvent.on(`device.${node.deviceId}`, eventCallback);

    const systemStartCallback = async () => {
      const previousAttributes = node.currentAttributes;
      try {
        await initializeDevice();
      } catch (err) {
        return;
      }
      Object.values(node.currentAttributes)
        .filter((attribute) => attribute.value !== previousAttributes[attribute.name].value)
        .forEach((attribute) => {
          node.log(`Fix "${attribute.name}" attribute desynchronization: "${previousAttributes[attribute.name].value}" --> "${attribute.value}"`);
          const event = {
            name: attribute.name,
            value: attribute.value,
            currentValue: attribute.value,
            descriptionText: 'Event triggered by systemStart and generated by Node-RED',
          };
          eventCallback(event);
        });
    };
    this.hubitat.hubitatEvent.on('systemStart', systemStartCallback);

    const wsOpened = async () => {
      node.currentStatusWs = 'OK';
      node.updateStatus(node.currentStatusFill, node.currentStatusText);
    };
    this.hubitat.hubitatEvent.on('websocket-opened', wsOpened);
    const wsClosed = async () => {
      node.currentStatusWs = 'NOK';
      node.updateStatus(node.currentStatusFill, node.currentStatusText);
    };
    this.hubitat.hubitatEvent.on('websocket-closed', wsClosed);
    this.hubitat.hubitatEvent.on('websocket-error', wsClosed);

    initializeDevice().catch(() => {});

    node.on('input', async (msg, send, done) => {
      node.debug('Input received');
      if (node.currentAttributes === undefined) {
        try {
          await initializeDevice();
        } catch (err) {
          return;
        }
      }

      const attributeSearched = msg.attribute || node.attribute;
      if (!attributeSearched) {
        msg.payload = { ...node.currentAttributes };
        msg.topic = node.name;
        send(msg);
        node.updateStatus();
        done();
        return;
      }

      const attribute = node.currentAttributes[attributeSearched];
      if (!attribute) {
        node.updateStatus('red', `Invalid attribute: ${attributeSearched}`);
        done();
        return;
      }

      msg.payload = { ...attribute };
      msg.topic = node.name;
      send(msg);
      if (!node.attribute) {
        node.updateStatus();
      } else if (node.attribute === attribute.name) {
        node.updateStatus('blue', `${node.attribute}: ${JSON.stringify(attribute.value)}`);
      }
      done();
    });

    node.on('close', () => {
      node.debug('Closed');
      this.hubitat.hubitatEvent.removeListener(`device.${node.deviceId}`, eventCallback);
      this.hubitat.hubitatEvent.removeListener('systemStart', systemStartCallback);
      this.hubitat.hubitatEvent.removeListener('websocket-opened', wsOpened);
      this.hubitat.hubitatEvent.removeListener('websocket-closed', wsClosed);
      this.hubitat.hubitatEvent.removeListener('websocket-error', wsClosed);
    });
  }

  RED.nodes.registerType('hubitat device', HubitatDeviceNode);
};
