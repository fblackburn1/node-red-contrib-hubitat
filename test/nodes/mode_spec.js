const helper = require('node-red-node-test-helper');
const configNode = require('../../nodes/config.js');
const modeNode = require('../../nodes/mode.js');

describe('Hubitat Mode Node', () => {
  const defaultConfigNode = {
    id: 'n0',
    type: 'hubitat config',
    name: 'test config name',
    usetls: false,
    host: 'localhost',
    port: 10234,
    token: '1234-abcd',
    appId: 1,
    nodeRedServer: 'localhost',
    webhookPath: '/hubitat/webhook',
  };
  const defaultModeNode = {
    id: 'n1',
    type: 'hubitat mode',
    name: 'test mode name',
    server: 'n0',
    sendEvent: true,
  };

  afterEach(() => {
    helper.unload();
  });

  it('should be loaded', (done) => {
    const flow = [defaultModeNode];
    helper.load(modeNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('name', 'test mode name');
        n1.should.have.property('sendEvent', true);
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should send event when event received', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultModeNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = {
      name: 'mode',
      value: 'new-value',
      displayName: 'My Hub',
      descriptionText: 'New Value',
    };
    helper.load([modeNode, configNode], flow, () => {
      const n0 = helper.getNode('n0');
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.currentMode = 'old-value';
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('payload', hubitatEvent);
          done();
        } catch (err) {
          done(err);
        }
      });
      n0.hubitatEvent.emit('mode', hubitatEvent);
    });
  });
});
