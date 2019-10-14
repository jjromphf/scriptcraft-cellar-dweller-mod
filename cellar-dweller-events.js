var EventDispatcher = require('event-dispatcher');

var CellarDwellerEventSystem = function() {
  EventDispatcher.call(this);
  // add all listeners here
  // add broadcast messaging here for dispatched events
}

CellarDwellerEventSystem.prototype = Object.create(EventDispatcher.prototype);
