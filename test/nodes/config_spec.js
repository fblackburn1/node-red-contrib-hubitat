/* eslint-disable no-unused-vars */
const helper = require('node-red-node-test-helper');
const configNode = require('../../nodes/config.js');

describe('Hubitat Config Node', () => {
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
    useWebsocket: false,
  };

  afterEach(() => {
    helper.unload();
  });

  it('should be loaded', (done) => {
    const flow = [defaultConfigNode];
    helper.load(configNode, flow, () => {
      const n0 = helper.getNode('n0');
      try {
        n0.should.have.property('name', 'test config name');
        n0.should.have.property('usetls', false);
        n0.should.have.property('host', 'localhost');
        n0.should.have.property('port', 10234);
        n0.should.have.property('appId', 1);
        n0.should.have.property('nodeRedServer', 'localhost');
        n0.should.have.property('webhookPath', '/hubitat/webhook');
        n0.should.have.property('useWebsocket', false);
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should not load websocket when not used', (done) => {
    const flow = [{ ...defaultConfigNode, useWebsocket: false }];
    helper.load(configNode, flow, () => {
      const n0 = helper.getNode('n0');
      try {
        n0.should.not.have.property('wsServer');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
});
