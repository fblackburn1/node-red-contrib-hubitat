const helper = require('node-red-node-test-helper');
const modeNode = require('../../nodes/mode.js');

describe('Hubitat Mode Node', () => {
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
});
