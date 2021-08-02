const helper = require('node-red-node-test-helper');
const configNode = require('../../nodes/config');
const locationNode = require('../../nodes/location');

describe('Hubitat Location Node', () => {
  const defaultConfigNode = {
    id: 'n0',
    type: 'hubitat config',
    name: 'test config name',
    usetls: false,
    host: 'localhost',
    port: 10234,
    appId: 1,
    nodeRedServer: 'localhost',
    webhookPath: '/hubitat/webhook',
  };
  const defaultLocationNode = {
    id: 'n1',
    type: 'hubitat location',
    name: 'test location name',
    server: 'n0',
  };

  afterEach(() => {
    helper.unload();
  });

  it('should be loaded', (done) => {
    const flow = [defaultLocationNode];
    helper.load(locationNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('name', 'test location name');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should send event when event received', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultLocationNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = {
      name: 'systemStart',
      value: 'new-value',
      displayName: 'display name',
      descriptionText: 'description text',
    };
    helper.load([locationNode, configNode], flow, () => {
      const n0 = helper.getNode('n0');
      const n2 = helper.getNode('n2');
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('payload', hubitatEvent);
          done();
        } catch (err) {
          done(err);
        }
      });
      n0.hubitatEvent.emit('location', hubitatEvent);
    });
  });
});
