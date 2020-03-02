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

    const callback = function callback(event) {
      node.debug(`Callback called: ${JSON.stringify(event)}`);
      if (this.currentAttributes === undefined) {
        this.status({ fill: 'red', shape: 'dot', text: 'Uninitialized' });
        this.warn('Uninitialized');
        return;
      }

      let found = false;
      this.currentAttributes.forEach((attribute) => {
        if (event.name === attribute.name) {
          attribute.value = castHubitatValue(node, attribute.dataType, event.value);
          attribute.deviceId = this.deviceId;
          attribute.currentValue = attribute.value; // deprecated since 0.0.18

          if ((this.attribute === event.name) || (!this.attribute)) {
            if (this.attribute) {
              this.status({ fill: 'blue', shape: 'dot', text: `${this.attribute}: ${attribute.value}` });
            } else {
              this.status({});
            }
            if (this.sendEvent) {
              this.send({ payload: attribute, topic: this.name });
            }
          }
          found = true;
        }
      });

      if (!found) {
        this.status({ fill: 'red', shape: 'dot', text: `Unknown event: ${event.name}` });
      }
    };

    node.hubitat.registerCallback(node, node.deviceId, callback);

    node.hubitat.getDevice(node.deviceId).then((device) => {
      if (!device.attributes) {
        node.warn(`Unable to initialize device: ${JSON.stringify(device)}}`);
        node.status({ fill: 'red', shape: 'dot', text: 'Uninitialized' });
      }

      device.attributes.forEach((attribute) => {
        attribute.value = attribute.currentValue;
        // delete attribute.currentValue;  // kept for compatibility
        if (node.attribute === attribute.name) {
          node.status({ fill: 'blue', shape: 'dot', text: `${node.attribute}: ${attribute.value}` });
          node.log(`Initialized.  ${node.attribute}: ${attribute.value}`);
        }
      });
      node.currentAttributes = device.attributes;

      if (!node.attribute) {
        node.status({});
        node.log('Initialized');
      }
    }).catch((err) => {
      node.warn(`Unable to initialize device: ${err}`);
      node.status({ fill: 'red', shape: 'dot', text: 'Uninitialized' });
    });

    node.on('input', (msg, send, done) => {
      node.debug('Input received');
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
      node.hubitat.unregisterCallback(node, node.deviceId, callback);
    });
  }

  RED.nodes.registerType('hubitat device', HubitatDeviceNode);
};
