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
    async function initializeMode() {
      return node.hubitat.getMode().then((mode) => {
        if (!mode) { throw new Error(JSON.stringify(mode)); }
        node.currentMode = mode.filter((eachMode) => eachMode.active)[0].name;
        node.log(`Initialized. mode: ${node.currentMode}`);
        node.status({ fill: 'blue', shape: 'dot', text: node.currentMode });
      }).catch((err) => {
        node.warn(`Unable to initialize mode: ${err.message}`);
        node.status({ fill: 'red', shape: 'dot', text: 'Uninitialized' });
        throw err;
      });
    }

    const callback = function callback(event) {
      node.debug(`Callback called: ${JSON.stringify(event)}`);
      this.currentMode = event.value;
      node.log(`Mode: ${this.currentMode}`);

      if (this.sendEvent) {
        const msg = {
          payload: {
            name: 'mode',
            value: this.currentMode,
            displayName: event.displayName,
            descriptionText: event.descriptionText,
          },
          topic: 'hubitat-mode',
        };
        this.send(msg);
      }

      this.status({ fill: 'blue', shape: 'dot', text: this.currentMode });
    };

    node.hubitat.registerCallback(node, node.deviceId, callback);

    initializeMode().catch(() => {});

    node.on('input', async (msg, send, done) => {
      node.debug('Input received');
      if (node.currentMode === undefined) {
        try {
          await initializeMode();
        } catch (err) {
          return;
        }
      }

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
