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
      const successIcon = '\u2713'; // check mark
      node.status({ text: `[${successIcon}]` });
    };
    this.hubitat.hubitatEvent.on('websocket-opened', wsOpened);
    const wsClosed = async () => {
      const failIcon = '\u2717'; // cross mark
      node.status({ text: `[${failIcon}]` });
    };
    this.hubitat.hubitatEvent.on('websocket-closed', wsClosed);
    this.hubitat.hubitatEvent.on('websocket-error', wsClosed);

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
