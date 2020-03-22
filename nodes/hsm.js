module.exports = function HubitatHsmModule(RED) {
  function HubitatHsmNode(config) {
    // eslint-disable-next-line global-require
    const fetch = require('node-fetch');
    RED.nodes.createNode(this, config);

    this.hubitat = RED.nodes.getNode(config.server);
    this.name = config.name;
    this.sendEvent = config.sendEvent;
    this.currentHsm = undefined;
    this.command = config.command;
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
        node.log(`Initialized. hsm: ${JSON.stringify(hsm)}`);
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

    function convertAlarmState(value) {
      switch (value) {
        case 'stay':
        case 'armHome':
        case 'armedHome':
        case 'armhome':
        case 'armedhome':
        case 0:
          return 'armHome';
        case 'away':
        case 'armaway':
        case 'armAway':
        case 'armedaway':
        case 'armedAway':
        case 1:
          return 'armAway';
        case 'night':
        case 'armnight':
        case 'armNight':
        case 'armednight':
        case 'armedNight':
        case 2:
          return 'armNight';
        case 'off':
        case 'disarm':
        case 'disarmed':
        case 'allDisarmed':
        case 'alldisarmed':
        case 3:
          return 'disarm';
        default:
          return 'invalid';
      }
    }

    node.on('input', async (msg, send, done) => {
      let { command } = node;
      if (msg.command !== undefined) {
        command = msg.command;
      }
      if (!command) {
        if (node.currentHsm === undefined) {
          node.status({ fill: 'red', shape: 'ring', text: 'unitialized' });
          done('unitialized');
        } else {
          const output = {
            ...msg,
            payload: { name: 'hsmStatus', value: node.currentHsm },
          };
          send(output);
          node.status({ fill: 'blue', shape: node.shape, text: node.currentHsm });
          done();
        }
        return;
      }
      node.status({ fill: 'blue', shape: node.shape, text: 'requesting' });
      command = convertAlarmState(command);

      if (command === 'invalid') {
        node.status({ fill: 'red', shape: 'ring', text: 'invalid command' });
        done('invalid command');
        return;
      }

      const url = `${node.hubitat.baseUrl}/hsm/${command}?access_token=${node.hubitat.token}`;
      const options = { method: 'GET' };

      try {
        const response = await fetch(url, options);
        if (response.status >= 400) {
          node.status({ fill: 'red', shape: 'ring', text: 'response error' });
          done(await response.text());
          return;
        }
        node.currentHsm = output.response.hsm;
        const output = {
          ...msg,
          payload: { name: 'hsmStatus', value: node.currentHsm },
        };
        send(output);
        node.status({ fill: 'blue', shape: node.shape, text: node.currentHsm });
        done();
      } catch (err) {
        node.status({ fill: 'red', shape: 'ring', text: err.code });
        done(err);
      }
    });

    node.on('close', () => {
      node.debug('Closed');
      node.hubitat.unregisterCallback(node, callback);
    });
  }

  RED.nodes.registerType('hubitat hsm', HubitatHsmNode);
};
