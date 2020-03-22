const helper = require('node-red-node-test-helper');
const hsmNode = require('../../nodes/hsm.js');

describe('Hubitat HSM Node', () => {
  const defaultHSMNode = {
    id: 'n1',
    type: 'hubitat hsm',
    name: 'test hsm name',
    server: 'n0',
    command: 'HSMcmd',
    sendEvent: true,
  };

  afterEach(() => {
    helper.unload();
  });

  it('should be loaded', (done) => {
    const flow = [defaultHSMNode];
    helper.load(hsmNode, flow, () => {
      const n1 = helper.getNode('n1');
      try {
        n1.should.have.property('name', 'test hsm name');
        n1.should.have.property('sendEvent', true);
        n1.should.have.property('command', 'HSMcmd');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
});
