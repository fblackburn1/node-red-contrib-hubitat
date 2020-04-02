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
* `hsm`: To keep the Hubitat Safety Monitor status (`Arm Home`, `Arm Away`, `Arm Home` and
  `Disarm`). It fetch the status when deployed, then listen for webhook events.
* `hsm-setter`: To set the Hubitat mode (Day, Night, ...)
* `mode`: To keep the Hubitat mode (Day, Night, ...)  state. It fetch the mode when deployed, then
  listen for
* `mode-setter`: To set the Hubitat mode (Day, Night, ...)
* `location`: To receive global location events (ex: systemStart, sunrise, sunset)

* `event`: A generic node to receive all events.
* `request`: A generic node to request any Hubitat's endpoints.

* `config`: To setup Hubitat connection information. It also listen on webhook from Hubitat
  to dispatch events to other nodes.

## Development

To run linters:

* `npm run-script linter`

To run unit tests:

* `npm test`
