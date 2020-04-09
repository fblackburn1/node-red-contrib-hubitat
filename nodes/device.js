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

        device.attributes.forEach((attribute) => {
          attribute.value = attribute.currentValue;
          // delete attribute.currentValue;  // kept for compatibility
          if (node.attribute === attribute.name) {
            node.status({ fill: 'blue', shape: node.shape, text: `${node.attribute}: ${JSON.stringify(attribute.value)}` });
            node.log(`Initialized. ${node.attribute}: ${attribute.value}`);
          }
        });
        node.currentAttributes = device.attributes;

        if (!node.attribute) {
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

      let found = false;
      node.currentAttributes.forEach((attribute) => {
        if (event.name === attribute.name) {
          attribute.value = castHubitatValue(node, attribute.dataType, event.value);
          attribute.deviceId = node.deviceId;
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
          found = true;
        }
      });
      if (!found) {
        node.status({ fill: 'red', shape: node.shape, text: `Unknown event: ${event.name}` });
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
      if (attributeSearched === undefined) {
        node.status({ fill: 'red', shape: node.shape, text: 'Undefined attribute' });
        return;
      }
      let foundAttribute;
      node.currentAttributes.forEach((attribute) => {
        if (attributeSearched === attribute.name) {
          msg.payload = { ...attribute };
          msg.payload.deviceId = node.deviceId;
          msg.topic = node.name;
          send(msg);
          foundAttribute = attribute;
        }
      });
      if (foundAttribute === undefined) {
        node.status({ fill: 'red', shape: node.shape, text: `Invalid attribute: ${attributeSearched}` });
      } else if (!node.attribute) {
        node.status({});
      } else if (node.attribute === foundAttribute.name) {
        node.status({ fill: 'blue', shape: node.shape, text: `${node.attribute}: ${JSON.stringify(foundAttribute.value)}` });
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
