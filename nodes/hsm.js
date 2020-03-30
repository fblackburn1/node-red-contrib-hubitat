module.exports = function HubitatHsmModule(RED) {
  function HubitatHsmNode(config) {
    RED.nodes.createNode(this, config);

    this.hubitat = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.sendEvent = config.sendEvent;
    this.currentHsm = undefined;
    this.shape = this.sendEvent ? 'dot' : 'ring';

    const node = this;

    if (!node.hubitat) {
      node.error('Hubitat server not configured');
      return;
    }
    async function initializeHsm() {
      return node.hubitat.getHsm().then((hsm) => {
        if (!hsm) { throw new Error(JSON.stringify(hsm)); }
        node.currentHsm = hsm.hsm;
        node.log(`Initialized. HSM: ${node.currentHsm}`);
        node.status({ fill: 'blue', shape: node.shape, text: node.currentHsm });
      }).catch((err) => {
        node.warn(`Unable to initialize mode: ${err.message}`);
        node.status({ fill: 'red', shape: node.shape, text: 'Uninitialized' });
        throw err;
      });
    }

    this.hubitat.hubitatEvent.on('hsm', async (event) => {
      node.debug(`Callback called: ${JSON.stringify(event)}`);
      if ((event.name === 'hsmAlert') && ((event.value === 'cancel') || (event.value === 'cancelRuleAlerts'))) {
        const hsm = await node.hubitat.getHsm();
        if (!hsm) { throw new Error(JSON.stringify(hsm)); }
        node.currentHsm = hsm.hsm;
        // Alarm gets cancelled
      } else if (event.name === 'hsmAlert') {
        node.currentHsm = event.value;
      } else if (event.name === 'hsmStatus') {
        node.currentHsm = event.value;
      }
      node.log(`HSM: ${node.currentHsm}`);

      if (node.sendEvent) {
        const msg = {
          payload: {
            name: event.name,
            value: event.value,
            displayName: event.displayName,
            descriptionText: event.descriptionText,
          },
          topic: 'hubitat-hsm',
        };
        node.send(msg);
      }
      node.status({ fill: 'blue', shape: node.shape, text: node.currentHsm });
    });

    initializeHsm().catch(() => {});

    node.on('input', async (msg, send, done) => {
      node.debug('Input received');
      if (node.currentHsm === undefined) {
        try {
          await initializeHsm();
        } catch (err) {
          return;
        }
      }

      const output = {
        ...msg,
        payload: { name: 'hsmStatus', value: node.currentHsm },
        topic: 'hubitat-hsm',
      };
      send(output);
      done();
    });

    node.on('close', () => {
      node.debug('Closed');
    });
  }

  RED.nodes.registerType('hubitat hsm', HubitatHsmNode);
};
