module.exports = function HubitatModeModule(RED) {
  function HubitatModeNode(config) {
    RED.nodes.createNode(this, config);

    this.hubitat = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.sendEvent = config.sendEvent;
    this.currentMode = undefined;
    this.shape = this.sendEvent ? 'dot' : 'ring';
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
        node.status({ fill: 'blue', shape: node.shape, text: node.currentMode });
      }).catch((err) => {
        node.warn(`Unable to initialize mode: ${err.message}`);
        node.status({ fill: 'red', shape: node.shape, text: 'Uninitialized' });
        throw err;
      });
    }
    this.hubitat.hubitatEvent.on('mode', async (event) => {
      node.debug(`Event received: ${JSON.stringify(event)}`);
      node.currentMode = event.value;
      node.log(`Mode: ${node.currentMode}`);

      if (node.sendEvent) {
        const msg = {
          payload: {
            name: 'mode',
            value: node.currentMode,
            displayName: event.displayName,
            descriptionText: event.descriptionText,
          },
          topic: 'hubitat-mode',
        };
        node.send(msg);
      }
      node.status({ fill: 'blue', shape: node.shape, text: node.currentMode });
    });

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
  }

  RED.nodes.registerType('hubitat mode', HubitatModeNode);
};
