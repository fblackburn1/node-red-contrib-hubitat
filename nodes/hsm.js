module.exports = function HubitatHsmModule(RED) {
  function HubitatHsmNode(config) {
    RED.nodes.createNode(this, config);

    this.hubitat = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.sendEvent = config.sendEvent;
    this.currentHsm = undefined;
    this.shape = this.sendEvent ? 'dot' : 'ring';
    this.alert = false;

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

    const callback = async (event) => {
      node.debug(`Event received: ${JSON.stringify(event)}`);
      if ((event.name === 'hsmAlert') && (['cancel', 'cancelRuleAlerts'].includes(event.value))) {
        node.alert = false;
      } else if (event.name === 'hsmAlert') {
        node.alert = true;
      } else if (event.name === 'hsmStatus') {
        node.currentHsm = event.value;
      } else {
        node.status({ fill: 'red', shape: node.shape, text: `Unknown event: ${event.name}` });
        return;
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
      const color = this.alert ? 'red' : 'blue';
      const status = this.alert ? `${node.currentHsm} - INTRUSION` : node.currentHsm;
      node.status({ fill: color, shape: node.shape, text: status });
    };
    this.hubitat.hubitatEvent.on('hsm', callback);

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
      this.hubitat.hubitatEvent.removeListener('hsm', callback);
    });
  }

  RED.nodes.registerType('hubitat hsm', HubitatHsmNode);
};
