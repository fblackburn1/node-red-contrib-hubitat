# node-red-contrib-hubitat

This collection of nodes allow to facilitate the use of Hubitat's API

## Installation

```bash
cd ~/.node-red
npm install node-red-contrib-hubitat
```

## Quick Start

This package contains three nodes:

  * `command`: To send command to Hubitat
  * `device`: To keep a device state. It fetch the device state when deployed, then listen for
    webhook events.
  * `mode`: To keep the Hubitat mode (Day, Night, ...)  state. It fetch the mode when deployed, then listen for
  * `mode-setter`: To set the Hubitat mode (Day, Night, ...)
  * `location`: To receive global location events (ex: systemStart, sunrise, sunset)

  * `config`: To setup Hubitat connection information. It also listen on webhook from Hubitat
    to dispatch events to other nodes.

## Development

To run linter:

  * `npx eslint nodes/*.js`

To run unit tests:

  * `mocha test/nodes/*_spec.js`
