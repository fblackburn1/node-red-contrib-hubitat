module.exports = function HubitatHsmModule(RED) {
  function HubitatHsmNode(config) {
    RED.nodes.createNode(this, config);

    this.hubitat = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.sendEvent = config.sendEvent;
    this.currentHsm = undefined;
    this.shape = this.sendEvent ? 'dot' : 'ring';
    this.currentStatusText = '';
    this.currentStatusFill = undefined;
    this.currentStatusWs = 'NOK';
    this.alert = false;

    const node = this;

    if (!node.hubitat) {
      node.error('Hubitat server not configured');
      return;
    }
    this.updateStatus = (fill = null, text = null) => {
      const status = { fill, shape: this.shape, text };
      node.currentStatusText = text;
      node.currentStatusFill = fill;

      if (fill === null) {
        delete status.shape;
        delete status.fill;
      }
      if (text === null) {
        delete status.text;
      }
      if (node.hubitat.useWebsocket) {
        if (fill === null) {
          status.fill = 'green';
          status.shape = this.shape;
        } else if (fill === 'blue') {
          status.fill = 'green';
        }
        if (node.currentStatusWs !== 'OK') {
          status.fill = 'red';
          status.text = 'WS ERROR';
        }
      }
      node.status(status);
    };

    async function initializeHsm() {
      return node.hubitat.getHsm().then((hsm) => {
        if (!hsm) { throw new Error(JSON.stringify(hsm)); }
        node.currentHsm = hsm.hsm;
        node.log(`Initialized. HSM: ${node.currentHsm}`);
        node.updateStatus('blue', node.currentHsm);
      }).catch((err) => {
        node.warn(`Unable to initialize mode: ${err.message}`);
        node.updateStatus('red', 'Uninitialized');
        throw err;
      });
    }

    const eventCallback = async (event) => {
      node.debug(`Event received: ${JSON.stringify(event)}`);
      if ((event.name === 'hsmAlert') && (['cancel', 'cancelRuleAlerts'].includes(event.value))) {
        node.alert = false;
      } else if (event.name === 'hsmAlert') {
        node.alert = true;
      } else if (event.name === 'hsmStatus') {
        node.currentHsm = event.value;
      } else {
        node.updateStatus('red', `Unknown event: ${event.name}`);
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
      node.updateStatus(color, status);
    };
    this.hubitat.hubitatEvent.on('hsm', eventCallback);

    const wsOpened = async () => {
      node.currentStatusWs = 'OK';
      node.updateStatus(node.currentStatusFill, node.currentStatusText);
    };
    this.hubitat.hubitatEvent.on('websocket-opened', wsOpened);
    const wsClosed = async () => {
      node.currentStatusWs = 'NOK';
      node.updateStatus(node.currentStatusFill, node.currentStatusText);
    };
    this.hubitat.hubitatEvent.on('websocket-closed', wsClosed);
    this.hubitat.hubitatEvent.on('websocket-error', wsClosed);

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
      this.hubitat.hubitatEvent.removeListener('hsm', eventCallback);
      this.hubitat.hubitatEvent.removeListener('websocket-opened', wsOpened);
      this.hubitat.hubitatEvent.removeListener('websocket-closed', wsClosed);
      this.hubitat.hubitatEvent.removeListener('websocket-error', wsClosed);
    });
  }

  RED.nodes.registerType('hubitat hsm', HubitatHsmNode);
};
