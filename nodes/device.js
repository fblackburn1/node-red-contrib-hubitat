/* eslint-disable no-param-reassign */
module.exports = function HubitatDeviceModule(RED) {
  function castHubitatValue(node, dataType, value) {
    function defaultAction() {
      node.warn(`Unable to cast to dataType. Open an issue to report back the following output: ${dataType}: ${value}`);
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
        const vector3Regexp = new RegExp(/^\[([xyz]:.*),([xyz]:.*),([xyz]:.*)\]$/, 'i');
        const match = value.match(vector3Regexp);
        if (!match) {
          return defaultAction();
        }
        const result = {};
        for (let i = 1; i < 4; i += 1) {
          const [axis, point] = match[i].split(':', 2);
          result[axis] = parseFloat(point);
        }
        return result;
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
    const node = this;

    if (!node.hubitat) {
      node.error('Hubitat server not configured');
      return;
    }
    async function initializeDevice() {
      return node.hubitat.getDevice(node.deviceId).then((device) => {
        if (!device.attributes) { throw new Error(JSON.stringify(device)); }

        // delete attribute.currentValue;  // kept for compatibility
        node.currentAttributes = device.attributes.reduce((obj, item) => {
          obj[item.name] = { ...item, value: item.currentValue, deviceId: node.deviceId };
          return obj;
        }, {});

        if (node.attribute) {
          const attribute = node.currentAttributes[node.attribute];
          if (!attribute) {
            throw new Error(`Selected attribute (${node.attribute}) is not handled by device`);
          }
          node.status({ fill: 'blue', shape: node.shape, text: `${node.attribute}: ${JSON.stringify(attribute.value)}` });
          node.log(`Initialized. ${node.attribute}: ${attribute.value}`);
        } else {
          node.status({});
          node.log('Initialized');
        }
      }).catch((err) => {
        node.warn(`Unable to initialize device: ${err.message}`);
        node.status({ fill: 'red', shape: node.shape, text: 'Uninitialized' });
        throw err;
      });
    }

    const callback = async (event) => {
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
        node.status({ fill: 'red', shape: node.shape, text: `Unknown event: ${event.name}` });
      }
      attribute.value = castHubitatValue(node, attribute.dataType, event.value);
      attribute.currentValue = attribute.value; // deprecated since 0.0.18
      if ((node.attribute === event.name) || (!node.attribute)) {
        if (node.attribute) {
          node.status({ fill: 'blue', shape: node.shape, text: `${node.attribute}: ${JSON.stringify(attribute.value)}` });
          node.log(`${node.attribute}: ${attribute.value}`);
        } else {
          node.status({});
          node.log('Attributes refreshed');
        }
        if (node.sendEvent) {
          const msg = { ...attribute };
          node.send({ payload: msg, topic: node.name });
        }
      }
    };
    this.hubitat.hubitatEvent.on(`device.${node.deviceId}`, callback);

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
        node.status({});
        done();
        return;
      }

      const attribute = node.currentAttributes[attributeSearched];
      if (!attribute) {
        node.status({ fill: 'red', shape: node.shape, text: `Invalid attribute: ${attributeSearched}` });
        done();
        return;
      }

      msg.payload = { ...attribute };
      msg.topic = node.name;
      send(msg);
      if (!node.attribute) {
        node.status({});
      } else if (node.attribute === attribute.name) {
        node.status({ fill: 'blue', shape: node.shape, text: `${node.attribute}: ${JSON.stringify(attribute.value)}` });
      }
      done();
    });

    node.on('close', () => {
      node.debug('Closed');
      this.hubitat.hubitatEvent.removeListener(`device.${node.deviceId}`, callback);
    });
  }

  RED.nodes.registerType('hubitat device', HubitatDeviceNode);
};
