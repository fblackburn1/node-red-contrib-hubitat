const helper = require('node-red-node-test-helper');
const locationNode = require('../../nodes/location.js');

describe('Hubitat Location Node', () => {
  const defaultLocationNode = {
    id: 'n1',
    type: 'hubitat location',
    name: 'test location name',
    server: 'n0',
    sendEvent: true,
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
});
