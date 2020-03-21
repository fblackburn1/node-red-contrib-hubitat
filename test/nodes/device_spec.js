/* eslint-disable no-unused-vars */
const helper = require('node-red-node-test-helper');
const deviceNode = require('../../nodes/device.js');


describe('Hubitat Device Node', () => {
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
});
