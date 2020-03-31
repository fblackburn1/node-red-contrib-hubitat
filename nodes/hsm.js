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
      if ((event.name === 'hsmAlert') && (['cancel', 'cancelRuleAlerts'].includes(event.value))) {
        let hsm;
        try {
          hsm = await node.hubitat.getHsm();
          if (!hsm) {
            throw new Error(JSON.stringify(hsm));
          }
        } catch (err) {
          node.warn(`Unable to fetch hsm: ${err.message}`);
          node.status({ fill: 'red', shape: node.shape, text: 'Unknown' });
          return;
        }
        node.currentHsm = hsm.hsm;
      } else if (['hsmAlert', 'hsmStatus'].includes(event.name)) {
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
            value: node.currentHsm,
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
