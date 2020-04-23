# Changelog

## 0.0.32

* `command`: encode arguments to URL encoded format
* `command`: improve placeholder for COLOR_MAP

## 0.0.31

* add new `event` node to allow to receive all events
* add new `request` node to allow to make a generic request to hubitat
* `device`: rename the `Undefined` attribute to `All` and allow to input a message without attribute to output all atttributes
* `device`: bind extra event properties to the output messages (unit, descriptionText, type, etc..)
* `device`: fix status display for VECTOR3 dataType
* `config`: improve error message when configuring webhook
* fix a random behavior that can empty dropdowns for all dynamic listing

## 0.0.30

* `mode-setter` node: allow to override mode with the mode name (e.i. msg.mode = 'Away')
* `device` node: fix behavior that allow other nodes to change its internal properties
* add support for `DATE` dataType

## 0.0.29

* fix regression from 0.0.27 on partial node deployment
* increase maximum listener on same event to 500
* `device`: fix status when attribute is `VECTOR3` dataType

## 0.0.28

* add new `mode-setter` node to set mode
* add support for `VECTOR3` and `JSON_OBJECT` dataType
* fix disabled input argument when device has duplicate commands available (with and without argument)

## 0.0.27

* add new `location` node to receive global location events
* use different status icon shapes when `sendEvent` is enabled or not
* refactor event system to use `events` library from nodejs

## 0.0.26

* `command` node: fix regression that ignore arguments from message

## 0.0.25

* Fix randomly initialization errors when requesting too many devices simultaneously
  * The simultaneous initialization requests to Hubitat is now set to 4
* `device` node: on input message or event, if node is uninitialized, then try to initialize it
* `mode` node: on input message, if node is uninitialized, then try to initialize it
* `command` node: reset `arguments` dropdown when server is unavailable
* `device` node: reset `attributes` dropdown when server is unavailable
* `command` node: `command` field is now optional
* improve error handling when hub returns 500

## 0.0.24

* `command` node: fix override a command without arguments when node default has arguments
* `command` node: change node status when server return error

## 0.0.23

* add linter (eslint)
* use Node-RED logging system
    * If you want to have debug output, just set Node-RED log level to debug (`settings.js`)
* `config` node: Node-RED server field has now a default value (not only a placeholder)
* `config` node: readd (and fix) an helper that verify if webhookPath is already configured in another node
* sorting device is now case insensitive

## 0.0.22

* `config` node: fix unregister webhook endpoint

## 0.0.21

* `command` node: fix wrong condition from 0.0.19
* `config` node: remove an helper that verify if webhookPath is already configured in another node (added in 0.0.19)

## 0.0.20

* fix dependency issue

## 0.0.19
* `config` node: support multi hub
* `config` node: allow to customize the webhook path. This allow to:
    * distinguish endpoint when using many hubs
    * *secure* the path to avoid guessing attacks
* `config` node: small validation on `Node-RED Server` field to avoid typo with white space
* `device` node: fix bug that remove the status when requesting device attribute
* `command` node: fix bug when sending integer 0 as command arguments

## 0.0.18
* `device` node: add attribute configuration
* `device` node: add node status when an `attribute` is selected
* `device` node: add payload property: `value`
* `device` node: deprecate payload property: `currentValue`
* add CHANGELOG.md to follow changes

## 0.0.17
* new icons
* `config` node: add webhookd section to help configuration
* fix url issue that can prevent user to config their nodes

## 0.0.16
* populate name with the device label

## 0.0.15
* add `mode` node to get the current mode state (day, night, ...)
* improve documentation

## 0.0.14
* `command` node: allow to override command/arguments from message properties
