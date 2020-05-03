const helper = require('node-red-node-test-helper');
const configNode = require('../../nodes/config.js');
const eventNode = require('../../nodes/event.js');

describe('Hubitat Event Node', () => {
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
  const defaultEventNode = {
    id: 'n1',
    type: 'hubitat event',
    name: 'test event name',
    server: 'n0',
  };

  afterEach(() => {
    helper.unload();
  });

  it('should be loaded', (done) => {
    const flow = [defaultEventNode];
    helper.load(eventNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('name', 'test event name');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should send event when event received', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultEventNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = {
      name: 'systemStart',
      value: 'new-value',
      displayName: 'display name',
      descriptionText: 'description text',
    };
    helper.load([eventNode, configNode], flow, () => {
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
      n0.hubitatEvent.emit('event', hubitatEvent);
    });
  });
});
