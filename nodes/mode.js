module.exports = function HubitatModeModule(RED) {
  function HubitatModeNode(config) {
    RED.nodes.createNode(this, config);

    this.hubitat = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.sendEvent = config.sendEvent;
    this.currentMode = undefined;
    this.deviceId = 0; // fake the deviceId to be able to register on callback

    const node = this;

    if (!node.hubitat) {
      node.error('Hubitat server not configured');
      return;
    }

    const callback = function callback(event) {
      node.debug(`Callback called: ${JSON.stringify(event)}`);
      if (this.currentMode === undefined) {
        this.status({ fill: 'red', shape: 'dot', text: 'Uninitialized' });
        node.warn('Uninitialized');
        return;
      }

      this.currentMode = event.value;

      const payload = {
        name: 'mode',
        value: this.currentMode,
        displayName: event.displayName,
        descriptionText: event.descriptionText,
      };

      if (this.sendEvent) {
        this.send({ payload, topic: 'hubitat-mode' });
      }

      this.status({ fill: 'blue', shape: 'dot', text: this.currentMode });
    };

    node.hubitat.registerCallback(node, node.deviceId, callback);

    node.hubitat.getMode().then((mode) => {
      node.currentMode = mode.filter((eachMode) => eachMode.active)[0].name;
      node.log(`Initialized. mode: ${node.currentMode}`);
      node.status({ fill: 'blue', shape: 'dot', text: node.currentMode });
    }).catch((err) => {
      node.warn(`Unable to initialize mode: ${err}`);
      node.status({ fill: 'red', shape: 'dot', text: 'Uninitialized' });
    });

    node.on('input', (msg, send, done) => {
      node.debug('Input received');
      const output = {
        ...msg,
        payload: { name: 'mode', value: node.currentMode },
        topic: 'hubitat-mode',
      };
      send(output);
      done();
    });

    node.on('close', () => {
      node.debug('Closed');
      node.hubitat.unregisterCallback(node, callback);
    });
  }

  RED.nodes.registerType('hubitat mode', HubitatModeNode);
};
