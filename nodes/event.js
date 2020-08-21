module.exports = function HubitatEventModule(RED) {
  function HubitatEventNode(config) {
    RED.nodes.createNode(this, config);

    this.hubitat = RED.nodes.getNode(config.server);
    this.name = config.name;
    const node = this;

    if (!node.hubitat) {
      node.error('Hubitat server not configured');
      return;
    }

    node.status({}); // clean status if toggle useWebsocket

    const callback = async (event) => {
      node.debug(`Event received: ${JSON.stringify(event)}`);
      node.log(`Event: ${event.name}`);

      const msg = {
        payload: { ...event },
        topic: 'hubitat-event',
      };
      node.send(msg);
    };
    this.hubitat.hubitatEvent.on('event', callback);

    const wsOpened = async () => {
      node.status({ fill: 'green', shape: 'dot', text: '' });
    };
    this.hubitat.hubitatEvent.on('websocket-opened', wsOpened);
    const wsClosed = async () => {
      node.status({ fill: 'red', shape: 'dot', text: 'WS ERROR' });
    };
    this.hubitat.hubitatEvent.on('websocket-closed', wsClosed);
    this.hubitat.hubitatEvent.on('websocket-error', wsClosed);

    if (node.hubitat.useWebsocket) {
      if (node.hubitat.wsFirstInitPending) {
        node.status({ fill: 'red', shape: 'dot', text: 'Initialization...' });
      } else if (node.hubitat.wsStatusOk) {
        wsOpened();
      } else {
        wsClosed();
      }
    }

    node.on('close', () => {
      node.debug('Closed');
      this.hubitat.hubitatEvent.removeListener('event', callback);
      this.hubitat.hubitatEvent.removeListener('websocket-opened', wsOpened);
      this.hubitat.hubitatEvent.removeListener('websocket-closed', wsClosed);
      this.hubitat.hubitatEvent.removeListener('websocket-error', wsClosed);
    });
  }

  RED.nodes.registerType('hubitat event', HubitatEventNode);
};
