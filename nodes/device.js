/* eslint-disable no-param-reassign */
module.exports = function HubitatDeviceModule(RED) {
  function castHubitatValue(node, dataType, value) {
    switch (dataType) {
      case 'STRING':
        return value;
      case 'ENUM':
        return value;
      case 'NUMBER':
        return parseFloat(value);
      case 'BOOL':
        return value === 'true';
      default:
        node.warn(`Unable to cast to dataType. Open an issue to report back the following output: ${dataType}: ${JSON.stringify(value)}`);
        return value;
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
            node.status({ fill: 'blue', shape: 'dot', text: `${node.attribute}: ${attribute.value}` });
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
        node.status({ fill: 'red', shape: 'dot', text: 'Uninitialized' });
        throw err;
      });
    }

    this.hubitat.hubitatEvent.on('device', (async function (node, event) {
        if (node.deviceId && node.deviceId === event.deviceId) {
            node.debug(`Callback called: ${JSON.stringify(event)}`);
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
                attribute.deviceId = this.deviceId;
                attribute.currentValue = attribute.value; // deprecated since 0.0.18

                if ((node.attribute === event.name) || (!node.attribute)) {
                  if (node.attribute) {
                    node.status({ fill: 'blue', shape: 'dot', text: `${node.attribute}: ${attribute.value}` });
                    node.log(`${node.attribute}: ${attribute.value}`);
                  } else {
                    node.status({});
                    node.log('Attributes refreshed');
                  }
                  if (node.sendEvent) {
                    node.send({ payload: attribute, topic: node.name });
                  }
                }
                found = true;
              }
            });
            if (!found) {
              node.status({ fill: 'red', shape: 'dot', text: `Unknown event: ${event.name}` });
            }
        }
    }).bind(null, this)); 

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
        node.status({ fill: 'red', shape: 'dot', text: 'Undefined attribute' });
        return;
      }
      let foundAttribute;
      node.currentAttributes.forEach((attribute) => {
        if (attributeSearched === attribute.name) {
          msg.payload = attribute;
          msg.payload.deviceId = node.deviceId;
          msg.topic = node.name;
          send(msg);
          foundAttribute = attribute;
        }
      });
      if (foundAttribute === undefined) {
        node.status({ fill: 'red', shape: 'dot', text: `Invalid attribute: ${attributeSearched}` });
      } else if (!node.attribute) {
        node.status({});
      } else if (node.attribute === foundAttribute.name) {
        node.status({ fill: 'blue', shape: 'dot', text: `${node.attribute}: ${foundAttribute.value}` });
      }
      done();
    });

    node.on('close', () => {
      node.debug('Closed');
    });
  }

  RED.nodes.registerType('hubitat device', HubitatDeviceNode);
};
