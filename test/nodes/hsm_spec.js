const helper = require('node-red-node-test-helper');
const configNode = require('../../nodes/config.js');
const hsmNode = require('../../nodes/hsm.js');

describe('Hubitat HSM Node', () => {
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
  const defaultHsmNode = {
    id: 'n1',
    type: 'hubitat hsm',
    name: 'test hsm name',
    server: 'n0',
    sendEvent: true,
  };

  afterEach(() => {
    helper.unload();
  });

  it('should be loaded', (done) => {
    const flow = [defaultHsmNode];
    helper.load(hsmNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('name', 'test hsm name');
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
      { ...defaultHsmNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = {
      name: 'hsmStatus',
      value: 'armNight',
      displayName: 'Hubitat',
      descriptionText: null,
    };
    helper.load([hsmNode, configNode], flow, () => {
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.currentHsm = 'disarmed';
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('payload', hubitatEvent);
          done();
        } catch (err) {
          done(err);
        }
      });
      n1.hubitat.hubitatEvent.emit('hsm', hubitatEvent);
    });
  });
  it('should use dot shape icon when send event', (done) => {
    const flow = [{ ...defaultHsmNode, sendEvent: true }];
    helper.load(hsmNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('shape', 'dot');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should use ring shape icon when send event', (done) => {
    const flow = [{ ...defaultHsmNode, sendEvent: false }];
    helper.load(hsmNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('shape', 'ring');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
});
