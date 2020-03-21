/* eslint-disable no-unused-vars */
const helper = require('node-red-node-test-helper');
const configNode = require('../../nodes/config.js');
const deviceNode = require('../../nodes/device.js');

describe('Hubitat Device Node', () => {
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
  const defaultDeviceNode = {
    id: 'n1',
    type: 'hubitat device',
    name: 'test device name',
    server: 'n0',
    deviceId: '42',
    attribute: 'testAttribute',
    sendEvent: true,
  };

  afterEach(() => {
    helper.unload();
  });

  it('should be loaded', (done) => {
    const flow = [defaultDeviceNode];
    helper.load(deviceNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('name', 'test device name');
        n1.should.have.property('deviceId', '42');
        n1.should.have.property('sendEvent', true);
        n1.should.have.property('attribute', 'testAttribute');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should send event when event received', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultDeviceNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = {
      deviceId: '42',
      name: 'testAttribute',
      value: 'new-value',
    };
    helper.load([deviceNode, configNode], flow, () => {
      const n0 = helper.getNode('n0');
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.currentAttributes = [{ name: 'testAttribute', value: 'old-value' }];
      n2.on('input', (msg) => {
        try {
          msg.should.have.property('payload', { ...hubitatEvent, currentValue: hubitatEvent.value });
          done();
        } catch (err) {
          done(err);
        }
      });
      n0.hubitatEvent.emit('device', hubitatEvent);
    });
  });
  it('should not send event when event received with wrong deviceId', (done) => {
    const flow = [
      defaultConfigNode,
      { ...defaultDeviceNode, wires: [['n2']] },
      { id: 'n2', type: 'helper' },
    ];
    const hubitatEvent = {
      deviceId: '999',
      name: 'testAttribute',
      value: 'new-value',
    };
    helper.load([deviceNode, configNode], flow, () => {
      const n0 = helper.getNode('n0');
      const n1 = helper.getNode('n1');
      const n2 = helper.getNode('n2');
      n1.currentAttributes = [{ name: 'testAttribute', value: 'old-value' }];
      let inError = false;
      n2.on('input', (msg) => {
        inError = true;
      });
      n0.hubitatEvent.emit('device', hubitatEvent);
      setTimeout(() => {
        if (inError) {
          done(new Error('device receive wrong event'));
        } else {
          try {
            n1.should.have.property('currentAttributes', [{ name: 'testAttribute', value: 'old-value' }]);
            done();
          } catch (err) {
            done(err);
          }
        }
      }, 20);
    });
  });
});
